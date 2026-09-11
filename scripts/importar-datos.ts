/**
 * Mete en la base los datos de un volcado JSON.
 *
 *   npm run datos:importar                                    (muestra que haria)
 *   npm run datos:importar -- --aplicar
 *   npm run datos:importar -- --archivo respaldos/caja-....json --aplicar
 *
 * Sirve para dos cosas con el mismo formato: mudar de motor (su pareja es
 * exportar-datos.ts) y restaurar un respaldo logico de PostgreSQL.
 *
 * Se niega a correr si la base de destino ya tiene datos. Importar sobre una
 * base con movimientos mezclaria dos historias contables, y eso no se deshace.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { cargarEnv } from './entorno';
import { prisma } from '../src/lib/db/prisma';

const POR_DEFECTO = path.resolve(process.cwd(), 'storage', 'traslado', 'datos.json');

/** Las fechas viajan como texto en JSON; Prisma las quiere como Date. */
const CAMPOS_FECHA = new Set([
  'createdAt', 'updatedAt', 'timestamp', 'fechaApertura', 'fechaCierre',
  'timestampCierre', 'expiraEn', 'ultimoUso', 'bloqueadoHasta',
]);

function revivirFechas<T extends Record<string, unknown>>(fila: T): T {
  const salida: Record<string, unknown> = { ...fila };
  for (const [clave, valor] of Object.entries(salida)) {
    if (CAMPOS_FECHA.has(clave) && typeof valor === 'string') {
      salida[clave] = new Date(valor);
    }
  }
  return salida as T;
}

export interface ResultadoImportacion {
  archivo: string;
  totales: Record<string, number>;
}

/**
 * Carga un volcado en la base a la que apunte DATABASE_URL.
 *
 * El orden de las tablas respeta las llaves foraneas: cada una va despues de
 * aquellas de las que depende.
 */
export async function importarDesdeArchivo(
  ruta: string,
  opciones: { aplicar: boolean; silencioso?: boolean } = { aplicar: false },
): Promise<ResultadoImportacion> {
  const crudo = await readFile(ruta, 'utf8').catch(() => {
    throw new Error(`No se encontro ${ruta}.`);
  });
  const datos = JSON.parse(crudo) as Record<string, unknown>;
  const registrar = (t: string) => {
    if (!opciones.silencioso) console.log(t);
  };

  if (opciones.aplicar) {
    const yaHay =
      (await prisma.cajero.count()) +
      (await prisma.chofer.count()) +
      (await prisma.abonoEfectivo.count());
    if (yaHay > 0) {
      throw new Error(
        `La base de destino ya tiene ${yaHay} registro(s). Importar encima mezclaria dos ` +
          'historias contables. Vacie el destino a conciencia si de verdad quiere reimportar.',
      );
    }
  }

  const plan: Array<[string, string, (filas: never[]) => Promise<unknown>]> = [
    ['cajeros', 'cajeros', (f) => prisma.cajero.createMany({ data: f })],
    ['choferes', 'choferes', (f) => prisma.chofer.createMany({ data: f })],
    ['cargasExcel', 'cargas de Excel', (f) => prisma.cargaExcel.createMany({ data: f })],
    ['turnos', 'turnos', (f) => prisma.turnoChofer.createMany({ data: f })],
    ['abonos', 'abonos', (f) => prisma.abonoEfectivo.createMany({ data: f })],
    ['ventasChoferExcel', 'ventas del Excel', (f) => prisma.ventaChoferExcel.createMany({ data: f })],
    ['arqueos', 'arqueos', (f) => prisma.arqueoCaja.createMany({ data: f })],
    ['cierres', 'cierres', (f) => prisma.cierreChofer.createMany({ data: f })],
    ['tiquetes', 'tiquetes', (f) => prisma.tiquete.createMany({ data: f })],
    ['eventos', 'eventos de auditoria', (f) => prisma.eventoAuditoria.createMany({ data: f })],
    // Las sesiones NO se trasladan: son credenciales vivas y no cuesta nada
    // volver a entrar con el PIN. Trasladarlas solo alargaria su vida util.
  ];

  const totales: Record<string, number> = {};
  for (const [clave, etiqueta, insertar] of plan) {
    const filas = ((datos[clave] as unknown[]) ?? []).map((f) =>
      revivirFechas(f as Record<string, unknown>),
    );
    totales[clave] = filas.length;
    registrar(`  ${etiqueta.padEnd(22)} ${String(filas.length).padStart(5)} fila(s)`);
    if (opciones.aplicar && filas.length > 0) {
      await insertar(filas as never[]);
    }
  }

  return { archivo: ruta, totales };
}

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

cargarEnv();

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const ruta = path.resolve(argumento('archivo') ?? POR_DEFECTO);
  const destino = process.env.DATABASE_URL ?? '';

  console.log(`Archivo: ${ruta}`);
  console.log(`Destino: ${destino.replace(/:[^:@/]+@/, ':****@')}\n`);

  await importarDesdeArchivo(ruta, { aplicar });

  if (!aplicar) {
    console.log('\nNo se escribio nada. Repita con --aplicar.');
    return;
  }

  console.log('\nImportado. Comprobacion:');
  console.log(`  cajeros:   ${await prisma.cajero.count()}`);
  console.log(`  choferes:  ${await prisma.chofer.count()}`);
  console.log(`  abonos:    ${await prisma.abonoEfectivo.count()}`);
  console.log(`  cierres:   ${await prisma.cierreChofer.count()}`);
  console.log(`  eventos:   ${await prisma.eventoAuditoria.count()}`);
}

// Solo corre como programa si lo invocaron directamente, no al importarlo.
if (process.argv[1] && path.resolve(process.argv[1]).includes('importar-datos')) {
  main()
    .catch((e) => {
      console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

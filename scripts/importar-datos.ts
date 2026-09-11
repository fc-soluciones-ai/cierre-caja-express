/**
 * Mete en la base nueva los datos que dejo exportar-datos.ts.
 *
 *   npm run datos:importar                (muestra que haria)
 *   npm run datos:importar -- --aplicar
 *
 * Se ejecuta DESPUES de cambiar el esquema a PostgreSQL y crear las tablas.
 *
 * Se niega a correr si la base de destino ya tiene datos. Importar sobre una
 * base con movimientos mezclaria dos historias contables, y eso no se deshace.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { prisma } from '../src/lib/db/prisma';

const ORIGEN = path.resolve(process.cwd(), 'storage', 'traslado', 'datos.json');
const APLICAR = process.argv.includes('--aplicar');

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

async function main(): Promise<void> {
  const crudo = await readFile(ORIGEN, 'utf8').catch(() => {
    throw new Error(`No se encontro ${ORIGEN}. Ejecute primero: npm run datos:exportar`);
  });
  const datos = JSON.parse(crudo) as Record<string, unknown>;

  const destino = process.env.DATABASE_URL ?? '';
  console.log(`Origen:  ${datos['origen']} (exportado ${datos['generado']})`);
  console.log(`Destino: ${destino.replace(/:[^:@/]+@/, ':****@')}\n`);

  const yaHay =
    (await prisma.cajero.count()) +
    (await prisma.chofer.count()) +
    (await prisma.abonoEfectivo.count());
  if (yaHay > 0 && APLICAR) {
    throw new Error(
      `La base de destino ya tiene ${yaHay} registro(s). Importar encima mezclaria dos historias. ` +
        'Vacie la base de destino a conciencia si de verdad quiere reimportar.',
    );
  }

  // El orden respeta las llaves foraneas: primero de quien dependen los demas.
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

  for (const [clave, etiqueta, insertar] of plan) {
    const filas = ((datos[clave] as unknown[]) ?? []).map((f) =>
      revivirFechas(f as Record<string, unknown>),
    );
    console.log(`  ${etiqueta.padEnd(22)} ${String(filas.length).padStart(5)} fila(s)`);
    if (APLICAR && filas.length > 0) {
      await insertar(filas as never[]);
    }
  }

  const sesiones = ((datos['sesiones'] as unknown[]) ?? []).length;
  if (sesiones > 0) {
    console.log(`\n  ${sesiones} sesion(es) abiertas NO se trasladan. Vuelva a entrar con su PIN.`);
  }

  if (!APLICAR) {
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

main()
  .catch((e) => {
    console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

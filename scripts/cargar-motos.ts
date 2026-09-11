/**
 * Da de alta la flota real a partir de un archivo de texto.
 *
 *   npm run db:motos                 (muestra que haria, sin escribir)
 *   npm run db:motos -- --aplicar
 *
 * El archivo es motos.txt en la raiz del proyecto, una moto por linea, con los
 * campos separados por punto y coma:
 *
 *   placa; marca; modelo; anio; kilometraje; comodin; repartidor
 *
 * Los dos ultimos son opcionales. En "comodin" se escribe la palabra COMODIN
 * para la moto de reemplazo, y solo puede haber una. En "repartidor" va el
 * nombre tal como aparece en el padron, o su codigo de Soft Restaurant.
 *
 * Ejemplo:
 *
 *   MOT-123; Honda; CB125; 2022; 18400; ; DAVID-R
 *   MOT-456; Bajaj; Boxer; 2021; 41500; ; 12
 *   MOT-789; Yamaha; YBR;   2023;  5200; COMODIN
 *
 * Por que un archivo y no la pantalla: dar de alta ocho motos a mano en una
 * pantalla tactil es lento y se presta a errores de tecleo. Con el archivo se
 * revisa la lista completa antes de escribir nada, y queda constancia de lo
 * que se cargo.
 *
 * El archivo no se versiona: son datos del negocio, no del programa.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { prisma } from '../src/lib/db/prisma';
import { asignarMoto, crearMoto, normalizarPlaca } from '../src/server/services/motos';

const ARCHIVO = path.resolve(process.cwd(), 'motos.txt');
const APLICAR = process.argv.includes('--aplicar');

interface Fila {
  linea: number;
  placa: string;
  marca: string;
  modelo: string;
  anio: number;
  kilometraje: number;
  esComodin: boolean;
  repartidor: string | null;
}

/** Acepta "18400", "18.400" y "18 400": nadie teclea el numero igual. */
function aKilometros(texto: string): number {
  const limpio = texto.replace(/[.\s]/g, '');
  const numero = Number(limpio);
  if (!Number.isInteger(numero) || numero < 0) {
    throw new Error(`kilometraje invalido: "${texto}"`);
  }
  return numero;
}

function leerArchivo(): Fila[] {
  if (!existsSync(ARCHIVO)) {
    throw new Error(
      `No existe ${ARCHIVO}.\n` +
        '  Cree el archivo con una moto por linea:\n' +
        '    placa; marca; modelo; anio; kilometraje; comodin; repartidor',
    );
  }

  const filas: Fila[] = [];

  readFileSync(ARCHIVO, 'utf8')
    .split(/\r?\n/)
    .forEach((cruda, indice) => {
      const linea = indice + 1;
      const texto = cruda.trim();
      if (!texto || texto.startsWith('#')) return;

      const campos = texto.split(';').map((c) => c.trim());
      const [placa, marca, modelo, anio, kilometraje, comodin, repartidor] = campos;

      if (!placa || !marca || !modelo || !anio || kilometraje === undefined) {
        throw new Error(
          `Linea ${linea}: faltan campos. Se esperaba ` +
            'placa; marca; modelo; anio; kilometraje',
        );
      }

      const anioNumero = Number(anio);
      if (!Number.isInteger(anioNumero) || anioNumero < 1980) {
        throw new Error(`Linea ${linea}: anio invalido "${anio}"`);
      }

      filas.push({
        linea,
        placa,
        marca,
        modelo,
        anio: anioNumero,
        kilometraje: aKilometros(kilometraje),
        esComodin: (comodin ?? '').toUpperCase() === 'COMODIN',
        repartidor: repartidor || null,
      });
    });

  if (filas.length === 0) throw new Error('El archivo no tiene ninguna moto.');

  const comodines = filas.filter((f) => f.esComodin);
  if (comodines.length > 1) {
    throw new Error(
      `Hay ${comodines.length} motos marcadas como comodin y solo puede haber una: ` +
        comodines.map((f) => f.placa).join(', '),
    );
  }

  const vistas = new Set<string>();
  for (const fila of filas) {
    const placa = normalizarPlaca(fila.placa);
    if (vistas.has(placa)) throw new Error(`Linea ${fila.linea}: la placa ${placa} esta repetida.`);
    vistas.add(placa);
  }

  return filas;
}

/** Busca al repartidor por nombre o por su codigo de Soft Restaurant. */
async function buscarChofer(
  referencia: string,
): Promise<{ id: string; nombre: string } | null> {
  const porCodigo = await prisma.chofer.findUnique({
    where: { idMeseroSoftRestaurant: referencia },
    select: { id: true, nombre: true },
  });
  if (porCodigo) return porCodigo;

  const candidatos = await prisma.chofer.findMany({
    where: { estado: 'ACTIVO' },
    select: { id: true, nombre: true },
  });
  const buscado = referencia.trim().toUpperCase();
  return (
    candidatos.find((c) => c.nombre.trim().toUpperCase() === buscado) ??
    candidatos.find((c) => c.nombre.trim().toUpperCase().startsWith(buscado)) ??
    null
  );
}

async function main(): Promise<void> {
  const filas = leerArchivo();

  const cajero = await prisma.cajero.findFirst({
    where: { rol: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (!cajero) throw new Error('No hay ningun cajero administrador en la base.');

  const existentes = new Set(
    (await prisma.motocicleta.findMany({ select: { placa: true } })).map((m) => m.placa),
  );

  console.log(`\n${filas.length} motos en ${path.basename(ARCHIVO)}\n`);

  const porHacer: Array<{ fila: Fila; chofer: { id: string; nombre: string } | null }> = [];
  let problemas = 0;

  /** Repartidores ya comprometidos, sea por el archivo o por la base. */
  const yaAsignados = new Map<string, string>();
  const vigentes = await prisma.asignacionMoto.findMany({
    where: { fechaFin: null },
    select: { choferId: true, placa: true },
  });
  for (const v of vigentes) yaAsignados.set(v.choferId, v.placa);

  for (const fila of filas) {
    const placa = normalizarPlaca(fila.placa);
    const yaEsta = existentes.has(placa);

    let chofer: { id: string; nombre: string } | null = null;
    let repetido = false;
    if (fila.repartidor) {
      chofer = await buscarChofer(fila.repartidor);
      if (!chofer) problemas += 1;
      // Un repartidor trae una sola moto. Si el archivo le pone dos, la
      // segunda le quitaria la primera sin decir nada.
      if (chofer && yaAsignados.has(chofer.id)) {
        repetido = true;
        problemas += 1;
      }
      if (chofer) yaAsignados.set(chofer.id, placa);
    }

    const destino = !fila.repartidor
      ? ''
      : !chofer
        ? `-> NO SE ENCONTRO A "${fila.repartidor}"`
        : repetido
          ? `-> ${chofer.nombre} YA TRAE ${yaAsignados.get(chofer.id)}`
          : `-> ${chofer.nombre}`;

    console.log(
      `${yaEsta ? 'ya existe' : 'se crea  '} ${placa.padEnd(10)} ` +
        `${`${fila.marca} ${fila.modelo}`.padEnd(18)} ${String(fila.anio).padEnd(6)} ` +
        `${fila.kilometraje.toLocaleString('es-CR').padStart(9)} km ` +
        `${fila.esComodin ? '[comodin] ' : ''}${destino}`,
    );

    if (!yaEsta) porHacer.push({ fila, chofer });
  }

  if (problemas > 0) {
    throw new Error(
      `\n${problemas} problema(s) con los repartidores del archivo. ` +
        'Corrija los nombres, los codigos o las repeticiones. ' +
        'Nada se ha escrito.',
    );
  }

  if (porHacer.length === 0) {
    console.log('\nNo hay nada nuevo que dar de alta.\n');
    return;
  }

  if (!APLICAR) {
    console.log(
      `\nSe darian de alta ${porHacer.length} moto(s). ` +
        'Nada se ha escrito.\n  Para aplicarlo:  npm run db:motos -- --aplicar\n',
    );
    return;
  }

  for (const { fila, chofer } of porHacer) {
    const creada = await crearMoto(
      {
        placa: fila.placa,
        marca: fila.marca,
        modelo: fila.modelo,
        anio: fila.anio,
        kilometrajeActual: fila.kilometraje,
        esComodin: fila.esComodin,
      },
      cajero.id,
    );
    console.log(`alta   ${creada.placa}`);

    if (chofer) {
      await asignarMoto(creada.placa, chofer.id, cajero.id, 'Carga inicial de la flota');
      console.log(`       asignada a ${chofer.nombre}`);
    }
  }

  console.log(`\n${porHacer.length} moto(s) dadas de alta.\n`);
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

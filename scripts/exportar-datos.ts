/**
 * Saca todos los datos a un archivo JSON, para mudarlos de motor.
 *
 *   npm run datos:exportar
 *
 * Se ejecuta ANTES de cambiar el esquema a PostgreSQL, mientras el cliente de
 * Prisma todavia habla SQLite. Su pareja es importar-datos.ts, que corre
 * despues, contra la base nueva.
 *
 * No es un respaldo: un respaldo es una copia binaria fiel y verificada (ver
 * docs/RESPALDOS.md). Esto es un traslado, y va en JSON justamente porque
 * tiene que poder leerse desde un motor distinto al que lo escribio.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { prisma } from '../src/lib/db/prisma';

const DESTINO = path.resolve(process.cwd(), 'storage', 'traslado');

async function main(): Promise<void> {
  const datos = {
    generado: new Date().toISOString(),
    origen: process.env.DATABASE_URL?.startsWith('file:') ? 'sqlite' : 'otro',
    // El orden importa al importar: cada tabla va despues de aquellas de las
    // que depende por llave foranea.
    cajeros: await prisma.cajero.findMany(),
    choferes: await prisma.chofer.findMany(),
    sesiones: await prisma.sesion.findMany(),
    cargasExcel: await prisma.cargaExcel.findMany(),
    turnos: await prisma.turnoChofer.findMany(),
    abonos: await prisma.abonoEfectivo.findMany(),
    ventasChoferExcel: await prisma.ventaChoferExcel.findMany(),
    arqueos: await prisma.arqueoCaja.findMany(),
    cierres: await prisma.cierreChofer.findMany(),
    tiquetes: await prisma.tiquete.findMany(),
    eventos: await prisma.eventoAuditoria.findMany(),
  };

  await mkdir(DESTINO, { recursive: true });
  const archivo = path.join(DESTINO, 'datos.json');
  await writeFile(archivo, JSON.stringify(datos, null, 2), 'utf8');

  console.log(`Exportado a: ${archivo}\n`);
  for (const [tabla, filas] of Object.entries(datos)) {
    if (Array.isArray(filas)) {
      console.log(`  ${tabla.padEnd(20)} ${String(filas.length).padStart(5)} fila(s)`);
    }
  }

  // El hash del PIN viaja tal cual: el cajero sigue entrando con el mismo que
  // ya tiene, sin que nadie tenga que conocerlo.
  console.log('\nLos PIN viajan como hash. Nadie necesita saberlos ni cambiarlos.');
  console.log('Este archivo tiene datos del negocio: la carpeta storage/ no se sube a git.');
}

main()
  .catch((e) => {
    console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Prueba del ciclo completo de respaldo y restauracion.
 *
 * Un respaldo que nadie restauro nunca no es un respaldo: es un archivo. Esta
 * prueba escribe datos, respalda, destruye los datos y restaura, y comprueba
 * que volvieron exactamente los mismos.
 *
 * Corre contra una base y una carpeta aparte, nunca contra las de trabajo.
 * Ejecutar con: npm run test:respaldo
 */

import { copyFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { prisma } from '../src/lib/db/prisma';
import { normalizarNombre } from '../src/lib/excel/columnas';
import {
  crearRespaldo,
  listarRespaldos,
  rutaBaseSqlite,
  verificarArchivoRespaldo,
} from '../src/server/services/respaldo';

let fallos = 0;

function comprobar(descripcion: string, real: unknown, esperado: unknown): void {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${descripcion}`);
  if (!ok) {
    console.log(`      esperado: ${JSON.stringify(esperado)}`);
    console.log(`      obtenido: ${JSON.stringify(real)}`);
  }
}

async function main(): Promise<void> {
  console.log(`Base de prueba: ${rutaBaseSqlite()}`);

  // --- Estado inicial conocido ---
  await prisma.eventoAuditoria.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();

  const cajero = await prisma.cajero.create({
    data: { nombre: 'Cajero de prueba', pin: 'hash' },
  });
  const marca = randomUUID().slice(0, 8);
  for (let i = 1; i <= 3; i += 1) {
    await prisma.chofer.create({
      data: {
        idMeseroSoftRestaurant: `${marca}-${i}`,
        nombre: `Repartidor ${i}`,
        nombreNormalizado: normalizarNombre(`Repartidor ${i}`),
      },
    });
  }

  const choferesAntes = await prisma.chofer.count();
  comprobar('hay datos antes de respaldar', choferesAntes, 3);

  // --- Respaldo ---
  console.log('\n--- Respaldo ---');
  const respaldo = await crearRespaldo({ etiqueta: 'prueba', sinRotacion: true });
  comprobar('integridad de la copia', respaldo.manifiesto.integridad, 'ok');
  comprobar('la copia trae los 3 repartidores', respaldo.manifiesto.conteos['choferes'], 3);
  comprobar('la copia trae el cajero', respaldo.manifiesto.conteos['cajeros'], 1);
  comprobar('el manifiesto lleva sha256', respaldo.manifiesto.sha256.length, 64);
  comprobar('la copia pesa mas que cero', respaldo.manifiesto.bytes > 0, true);
  comprobar('quedo registrada en la bitacora', await prisma.eventoAuditoria.count({ where: { tipo: 'RESPALDO' } }), 1);

  const inventario = await listarRespaldos();
  comprobar('aparece en el inventario', inventario.some((c) => c.ruta === respaldo.ruta), true);

  // --- Desastre ---
  console.log('\n--- Perdida de datos ---');
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();
  comprobar('la base quedo vacia', await prisma.chofer.count(), 0);

  // --- Restauracion ---
  console.log('\n--- Restauracion ---');
  const verificacion = await verificarArchivoRespaldo(respaldo.ruta);
  comprobar('la copia sigue integra antes de restaurar', verificacion.integridad, 'ok');

  await prisma.$disconnect();
  await copyFile(respaldo.ruta, rutaBaseSqlite());
  for (const sufijo of ['-journal', '-wal', '-shm']) {
    await rm(`${rutaBaseSqlite()}${sufijo}`, { force: true });
  }

  const choferesDespues = await prisma.chofer.findMany({ orderBy: { nombre: 'asc' } });
  comprobar('volvieron los 3 repartidores', choferesDespues.length, 3);
  comprobar(
    'con sus nombres intactos',
    choferesDespues.map((c) => c.nombre),
    ['Repartidor 1', 'Repartidor 2', 'Repartidor 3'],
  );
  comprobar(
    'y sus codigos de mesero',
    choferesDespues.map((c) => c.idMeseroSoftRestaurant),
    [`${marca}-1`, `${marca}-2`, `${marca}-3`],
  );
  comprobar('volvio el cajero', await prisma.cajero.count(), 1);
  comprobar('el cajero es el mismo', (await prisma.cajero.findFirst())?.id, cajero.id);

  // --- Deteccion de copia danada ---
  console.log('\n--- Deteccion de una copia danada ---');
  const copiaRota = `${respaldo.ruta}.rota.db`;
  await copyFile(respaldo.ruta, copiaRota);
  const { open } = await import('node:fs/promises');
  const manejador = await open(copiaRota, 'r+');
  // Se pisan bytes del interior del archivo, donde viven las paginas de datos.
  await manejador.write(Buffer.alloc(4096, 0x7a), 0, 4096, 8192);
  await manejador.close();

  let detectada = false;
  try {
    await verificarArchivoRespaldo(copiaRota);
  } catch {
    detectada = true;
  }
  comprobar('una copia corrupta se rechaza al verificar', detectada, true);
  await rm(copiaRota, { force: true });

  // --- Limpieza ---
  await rm(respaldo.ruta, { force: true });
  await rm(`${respaldo.ruta}.json`, { force: true });

  console.log(
    fallos === 0
      ? '\nTodas las comprobaciones pasaron.\n'
      : `\n${fallos} comprobacion(es) fallaron.\n`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));

/**
 * Restaura la base de datos desde un respaldo.
 *
 *   npm run db:restaurar -- --listar
 *   npm run db:restaurar -- --archivo caja-2026-09-10_2200.db --confirmar
 *
 * DETENGA LA APLICACION ANTES DE RESTAURAR. Si el servidor esta corriendo,
 * tiene la base abierta y seguira escribiendo sobre lo que se acaba de
 * restaurar.
 *
 * El script no puede comprobar por si mismo si la caja esta detenida, asi que
 * exige --confirmar de forma explicita. Antes de sobrescribir nada guarda un
 * respaldo del estado actual: si alguien restaura el archivo equivocado, lo de
 * hoy no se pierde.
 */

import { copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { prisma } from '../src/lib/db/prisma';
import { esErrorNegocio } from '../src/server/errores';
import {
  crearRespaldo,
  directorioRespaldos,
  listarRespaldos,
  rutaBaseSqlite,
  verificarArchivoRespaldo,
} from '../src/server/services/respaldo';

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(`--${nombre}`);
  if (indice === -1) return undefined;
  return process.argv[indice + 1];
}

/** Los archivos laterales de SQLite deben irse con la base que reemplazan. */
async function borrarArchivosLaterales(rutaBase: string): Promise<void> {
  for (const sufijo of ['-journal', '-wal', '-shm']) {
    await unlink(`${rutaBase}${sufijo}`).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const copias = await listarRespaldos();

  if (process.argv.includes('--listar') || copias.length === 0) {
    console.log(`Directorio: ${directorioRespaldos()}\n`);
    if (copias.length === 0) {
      console.log('No hay respaldos disponibles.');
      return;
    }
    for (const copia of copias) {
      console.log(
        `  ${copia.archivo.padEnd(32)} ${(copia.bytes / 1024 / 1024).toFixed(2)} MB` +
          `  ${copia.modificado.toLocaleString('es-CR')}`,
      );
    }
    console.log('\nPara restaurar:');
    console.log(`  npm run db:restaurar -- --archivo ${copias[0]?.archivo} --confirmar`);
    return;
  }

  const nombre = argumento('archivo');
  if (!nombre) {
    throw new Error('Indique el respaldo con --archivo <nombre>. Use --listar para verlos.');
  }

  const origen = path.resolve(directorioRespaldos(), path.basename(nombre));
  const destino = rutaBaseSqlite();

  console.log(`Respaldo a restaurar: ${origen}`);
  console.log(`Base que se reemplaza: ${destino}\n`);

  // Nunca se restaura una copia sin abrirla antes: el peor momento para
  // descubrir que el archivo esta corrupto es despues de pisar la base viva.
  const verificacion = await verificarArchivoRespaldo(origen);
  const filas = Object.values(verificacion.conteos).reduce((a, b) => a + b, 0);
  console.log(`Verificacion previa: integridad ${verificacion.integridad}, ${filas} filas`);
  console.log(`  ${JSON.stringify(verificacion.conteos)}\n`);

  if (!process.argv.includes('--confirmar')) {
    console.log('No se restauro nada. Agregue --confirmar para proceder.');
    console.log('Detenga la aplicacion antes de hacerlo.');
    return;
  }

  if (process.stdin.isTTY) {
    const lector = createInterface({ input: process.stdin, output: process.stdout });
    const respuesta = await new Promise<string>((resolver) =>
      lector.question('Escriba RESTAURAR para confirmar: ', (r) => {
        lector.close();
        resolver(r.trim());
      }),
    );
    if (respuesta !== 'RESTAURAR') {
      console.log('Cancelado. No se toco nada.');
      return;
    }
  }

  console.log('\nGuardando un respaldo del estado actual antes de reemplazarlo...');
  const seguridad = await crearRespaldo({
    etiqueta: 'previo-restauracion',
    sinRotacion: true,
  });
  console.log(`  ${seguridad.ruta}`);

  await prisma.$disconnect();

  await copyFile(origen, destino);
  await borrarArchivosLaterales(destino);

  console.log('\nRestauracion completada.');
  console.log('Verifique la base restaurada antes de abrir la caja:');
  console.log('  npm run test:esquema');
}

main()
  .catch((e) => {
    console.error(`\nLA RESTAURACION FALLO: ${esErrorNegocio(e) ? e.message : String(e)}`);
    console.error('La base actual no se modifico.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));

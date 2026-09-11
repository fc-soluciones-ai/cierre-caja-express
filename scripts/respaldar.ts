/**
 * Crea un respaldo verificado de la base de datos.
 *
 *   npm run db:respaldar
 *   npm run db:respaldar -- --etiqueta cierre-de-mes
 *   npm run db:respaldar -- --listar
 *
 * Pensado para correr desde el Programador de tareas de Windows. Devuelve
 * codigo de salida 1 si algo fallo, para que la tarea aparezca como fallida y
 * no en verde con un respaldo que no existe.
 */

import path from 'node:path';

import { cargarEnv } from './entorno';
import { prisma } from '../src/lib/db/prisma';
import { esErrorNegocio } from '../src/server/errores';
import {
  crearRespaldo,
  directorioRespaldos,
  listarRespaldos,
  respaldoLocalAplica,
  rutaBaseSqlite,
  verificarArchivoRespaldo,
} from '../src/server/services/respaldo';

function enMegas(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(`--${nombre}`);
  if (indice === -1) return undefined;
  return process.argv[indice + 1];
}

async function listar(): Promise<void> {
  const copias = await listarRespaldos();
  console.log(`Directorio: ${directorioRespaldos()}`);
  if (copias.length === 0) {
    console.log('No hay respaldos todavia.');
    return;
  }
  console.log(`${copias.length} respaldo(s), del mas reciente al mas antiguo:\n`);
  for (const copia of copias) {
    const filas = copia.manifiesto
      ? Object.values(copia.manifiesto.conteos).reduce((a, b) => a + b, 0)
      : null;
    console.log(
      `  ${copia.archivo.padEnd(32)} ${enMegas(copia.bytes).padStart(10)}` +
        `  ${copia.modificado.toLocaleString('es-CR')}` +
        (filas === null ? '  (sin manifiesto)' : `  ${filas} filas`),
    );
  }
}

cargarEnv();

async function main(): Promise<void> {
  if (process.argv.includes('--listar')) {
    await listar();
    return;
  }

  if (process.argv.includes('--verificar')) {
    const objetivo = argumento('verificar');
    const copias = await listarRespaldos();
    const ruta = objetivo
      ? path.resolve(directorioRespaldos(), objetivo)
      : copias[0]?.ruta;
    if (!ruta) throw new Error('No hay ningun respaldo que verificar.');

    const resultado = await verificarArchivoRespaldo(ruta);
    console.log(`Verificado: ${path.basename(ruta)}`);
    console.log(`  integridad: ${resultado.integridad}`);
    console.log(`  tamano:     ${enMegas(resultado.bytes)}`);
    console.log(`  sha256:     ${resultado.sha256}`);
    console.log(`  filas:      ${JSON.stringify(resultado.conteos)}`);
    return;
  }

  console.log(
    respaldoLocalAplica()
      ? `Base de origen: ${rutaBaseSqlite()} (copia binaria)`
      : 'Base de origen: PostgreSQL (respaldo logico en JSON)',
  );
  const resultado = await crearRespaldo({ etiqueta: argumento('etiqueta') });

  console.log(`\nRespaldo creado y verificado en ${resultado.duracionMs} ms`);
  console.log(`  archivo:  ${resultado.ruta}`);
  console.log(`  tamano:   ${enMegas(resultado.manifiesto.bytes)}`);
  console.log(`  sha256:   ${resultado.manifiesto.sha256}`);
  console.log(
    `  filas:    ${Object.values(resultado.manifiesto.conteos).reduce((a, b) => a + b, 0)}`,
  );

  if (resultado.eliminados.length > 0) {
    console.log(`  rotacion: se eliminaron ${resultado.eliminados.length} copia(s) vencida(s)`);
  }

  const copias = await listarRespaldos();
  console.log(`\nHay ${copias.length} respaldo(s) en ${directorioRespaldos()}`);
}

main()
  .catch((e) => {
    console.error(`\nEL RESPALDO FALLO: ${esErrorNegocio(e) ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

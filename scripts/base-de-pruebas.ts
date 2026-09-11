/**
 * Envoltorio que corre un script contra la base de PRUEBAS, nunca contra la
 * base de trabajo.
 *
 *   tsx scripts/base-de-pruebas.ts scripts/verificar-servicios.ts
 *
 * Varias comprobaciones borran todas las tablas antes de empezar. Correrlas
 * contra la base del negocio seria destruir la contabilidad de la pizzeria,
 * asi que la direccion de la base se deriva aqui y no se toma de package.json.
 *
 * Ademas la contrasena nunca aparece en un archivo versionado: sale de la
 * DATABASE_URL que ya esta en .env, que git ignora.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { urlDePruebas, sinClave } from './direccion-pruebas';
import { cargarEnv } from './entorno';

async function main(): Promise<void> {
  cargarEnv();

  const objetivo = process.argv[2];
  if (!objetivo) {
    throw new Error('Indique el script a ejecutar. Ej: scripts/verificar-servicios.ts');
  }

  const original = process.env.DATABASE_URL;
  const pruebas = urlDePruebas(original);

  if (original && pruebas === original) {
    throw new Error('La direccion de pruebas quedo igual a la de trabajo. No se ejecuta nada.');
  }

  // Se entrega por una variable que Prisma NO conoce. Escribir
  // process.env.DATABASE_URL no sirve: el cliente vuelve a leer .env por su
  // cuenta y usaria la base del negocio. Ver src/lib/db/prisma.ts.
  process.env.DATABASE_URL_PRUEBAS = pruebas;
  process.env.DATABASE_URL = pruebas;
  if (process.env.DIRECT_URL) {
    process.env.DIRECT_URL = urlDePruebas(process.env.DIRECT_URL);
  }

  console.log(`Base de pruebas: ${sinClave(pruebas)}\n`);

  // Los scripts ejecutan su main() al importarse, y para entonces la variable
  // de entorno ya apunta a la base correcta.
  await import(pathToFileURL(path.resolve(objetivo)).href);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});

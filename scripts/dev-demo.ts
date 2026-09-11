/**
 * Levanta la aplicacion contra la base de PRUEBAS, en otro puerto.
 *
 *   npm run demo
 *
 * Sirve para enseñar el sistema o para entrenar a alguien sin miedo: lo que se
 * teclee ahi no toca la contabilidad del negocio. Los datos de ejemplo los
 * pone "npm run demo:flota".
 */

import { spawn } from 'node:child_process';

import { urlDePruebas } from './direccion-pruebas';
import { cargarEnv } from './entorno';

const PUERTO = process.env.PUERTO_DEMO ?? '3100';

function main(): void {
  cargarEnv();

  const pruebas = urlDePruebas(process.env.DATABASE_URL);
  if (pruebas === process.env.DATABASE_URL) {
    throw new Error('La direccion de pruebas quedo igual a la de trabajo. No se levanta nada.');
  }

  console.log(`\nDemostracion en http://localhost:${PUERTO} (base de pruebas)\n`);

  const hijo = spawn('npx', ['next', 'dev', '-p', PUERTO], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      // Prisma relee .env por su cuenta; esta es la que si respeta.
      // Ver src/lib/db/prisma.ts.
      DATABASE_URL_PRUEBAS: pruebas,
      // Carpeta de compilacion propia: el servidor de trabajo usa .next y dos
      // instancias de Next sobre la misma carpeta se traban.
      CARPETA_BUILD: '.next-demo',
    },
  });

  hijo.on('exit', (codigo) => {
    process.exitCode = codigo ?? 0;
  });
}

main();

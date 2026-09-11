/**
 * Crea o actualiza las tablas de la base de PRUEBAS.
 *
 *   npm run db:push:pruebas
 *
 * Hay que correrlo una vez, y otra vez cada vez que cambie el esquema.
 */

import { execFileSync } from 'node:child_process';

import { sinClave, urlDePruebas } from './direccion-pruebas';
import { cargarEnv } from './entorno';

cargarEnv();

const pruebas = urlDePruebas(process.env.DATABASE_URL);
const directa = urlDePruebas(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

console.log(`Preparando: ${sinClave(pruebas)}\n`);

execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: pruebas, DIRECT_URL: directa },
});

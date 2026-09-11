/**
 * Lectura del archivo .env para los scripts de linea de comandos.
 *
 * El cliente de Prisma lo carga solo, pero lo hace al construirse: cualquier
 * script que necesite saber a que base apunta ANTES de abrir una conexion
 * tiene que leerlo por su cuenta.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Lee .env a process.env.
 *
 * El cliente de Prisma lo hace solo, pero para entonces ya es tarde: aqui hay
 * que conocer la direccion ANTES de importar nada que abra una conexion. Se
 * hace a mano para no sumar una dependencia por quince lineas.
 */
export function cargarEnv(ruta = path.resolve(process.cwd(), '.env')): void {
  let contenido: string;
  try {
    contenido = readFileSync(ruta, 'utf8');
  } catch {
    return; // Sin archivo, se usa lo que ya venga del entorno.
  }

  for (const linea of contenido.split('\n')) {
    const limpia = linea.trim();
    if (limpia === '' || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte === -1) continue;

    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    // Lo que ya este en el entorno manda: asi un comando puede apuntar a otra
    // base sin editar el archivo.
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

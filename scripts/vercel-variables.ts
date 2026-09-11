/**
 * Sube al proyecto de Vercel las variables de entorno que la aplicacion
 * necesita, leyendolas del .env local.
 *
 *   npm run vercel:variables            (muestra que haria)
 *   npm run vercel:variables -- --aplicar
 *
 * Los valores NUNCA se imprimen ni se pasan como argumento: van por la entrada
 * estandar al CLI de Vercel. Un valor en la linea de comandos queda en el
 * historial del shell, y esta la contrasena de la base de datos.
 *
 * Hay que volver a correrlo cada vez que cambie la contrasena de Supabase.
 */

import { execFileSync } from 'node:child_process';

import { cargarEnv } from './entorno';

cargarEnv();

const APLICAR = process.argv.includes('--aplicar');
const ENTORNOS = ['production', 'preview', 'development'] as const;

interface Variable {
  nombre: string;
  /** Valor fijo; si falta, se toma del .env local. */
  valor?: string;
  obligatoria: boolean;
  nota?: string;
}

const VARIABLES: Variable[] = [
  { nombre: 'DATABASE_URL', obligatoria: true, nota: 'conexion agrupada de Supabase' },
  { nombre: 'DIRECT_URL', obligatoria: true, nota: 'conexion directa, para migraciones' },
  { nombre: 'MONEDA', obligatoria: false, valor: 'CRC' },
  { nombre: 'HORA_CORTE_DIA_OPERATIVO', obligatoria: false, valor: '06:00' },
  { nombre: 'NOMBRE_NEGOCIO', obligatoria: false, valor: 'PIZZERIA EXPRESS' },
  {
    nombre: 'IMPRESORA_MODO',
    obligatoria: false,
    // Se fuerza a NONE aunque en local sea NETWORK: un servidor en internet no
    // puede alcanzar la impresora de la pizzeria. Copiar aqui la IP local solo
    // produciria esperas de varios segundos en cada cierre, y ningun tiquete.
    valor: 'NONE',
    nota: 'desde la nube no se alcanza la impresora del local',
  },
  { nombre: 'IMPRESORA_ANCHO_CARACTERES', obligatoria: false, valor: '48' },
];

function vercel(argumentos: string[], entrada?: string): string {
  return execFileSync('npx', ['vercel', ...argumentos], {
    input: entrada,
    stdio: entrada === undefined ? ['inherit', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    shell: true,
    encoding: 'utf8',
  });
}

/**
 * Comprueba la sesion ANTES de tocar nada.
 *
 * El CLI guarda las credenciales en una ruta que depende de la consola desde
 * la que se corra: en PowerShell puede no encontrar la sesion que si ve Git
 * Bash. Sin esta comprobacion, el fallo aparece a mitad de la subida y deja
 * el proyecto con unas variables nuevas y otras viejas.
 */
function exigirSesionDeVercel(): void {
  try {
    const quien = vercel(['whoami'], '').trim().split('\n').pop() ?? '';
    console.log(`Sesion de Vercel: ${quien}\n`);
  } catch {
    throw new Error(
      'El CLI de Vercel no encuentra su sesion en esta consola.\n' +
        '  Ejecute:  vercel login\n' +
        '  Si ya inicio sesion en otra consola, cierre esta y abra una nueva.',
    );
  }
}

function main(): void {
  console.log(APLICAR ? 'MODO ESCRITURA\n' : 'SIMULACION: no se sube nada. Agregue --aplicar.\n');

  const faltantes: string[] = [];

  for (const variable of VARIABLES) {
    const valor = variable.valor ?? process.env[variable.nombre];

    if (!valor) {
      if (variable.obligatoria) faltantes.push(variable.nombre);
      console.log(`  ${variable.nombre.padEnd(28)} SIN VALOR`);
      continue;
    }

    const origen = variable.valor ? 'fijo' : 'de .env';
    console.log(
      `  ${variable.nombre.padEnd(28)} ${origen.padEnd(8)}` +
        (variable.nota ? `  (${variable.nota})` : ''),
    );

    if (!APLICAR) continue;

    for (const entorno of ENTORNOS) {
      // --force reemplaza en un solo paso. Borrar y volver a agregar dejaba
      // la variable en el aire si el segundo paso fallaba, y con DATABASE_URL
      // eso significa una aplicacion en produccion sin base de datos.
      vercel(['env', 'add', variable.nombre, entorno, '--force', '--sensitive'], valor);
    }
  }

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables obligatorias en .env: ${faltantes.join(', ')}. ` +
        'Ejecute primero: npm run db:conectar',
    );
  }

  if (!APLICAR) {
    console.log('\nNo se subio nada. Repita con --aplicar.');
    return;
  }

  console.log('\nVariables subidas. El proximo despliegue las usara.');
  console.log('Los despliegues ya existentes NO las tienen: hay que volver a desplegar.');
}

try {
  main();
} catch (e) {
  console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}

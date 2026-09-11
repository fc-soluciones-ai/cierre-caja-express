/**
 * Configura la conexion a Supabase sin que la contrasena pase por ningun lado.
 *
 *   npm run db:conectar
 *   npm run db:conectar -- --ref otroproyecto
 *   npm run db:conectar -- --pooler --region us-east-1
 *
 * La contrasena se teclea en la terminal, no se muestra, no queda en el
 * historial del shell y no se imprime nunca. El script la codifica, la escribe
 * en .env (que git ignora) y prueba la conexion antes de dar nada por bueno.
 *
 * Existe porque pedirle a alguien que edite un archivo de configuracion a mano
 * y no mande la contrasena por chat es pedirle que haga de intermediario de un
 * secreto. Es mas seguro que la maquina lo haga sola.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';

import { Client } from 'pg';

const REF_POR_DEFECTO = 'pqjausfalubcgulkwprg';
const RUTA_ENV = path.resolve(process.cwd(), '.env');

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Lee de la terminal sin mostrar lo tecleado, igual que sudo. */
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolver) => {
    const salida = process.stdout;
    const lector = createInterface({ input: process.stdin, output: salida, terminal: true });
    let silenciado = false;
    const escribir = salida.write.bind(salida);
    (lector as unknown as { _writeToOutput: (t: string) => void })._writeToOutput = (t) => {
      if (!silenciado) escribir(t);
    };
    lector.question(pregunta, (r) => {
      lector.close();
      escribir('\n');
      resolver(r);
    });
    silenciado = true;
  });
}

interface Cadenas {
  app: string;
  directa: string;
  descripcion: string;
}

function construirCadenas(ref: string, clave: string, region?: string): Cadenas {
  // La contrasena se codifica: una arroba o un numeral sin codificar parten la
  // direccion en dos y el error que da es de los que no dicen nada util.
  const clav = encodeURIComponent(clave);

  if (region) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    return {
      app: `postgresql://postgres.${ref}:${clav}@${host}:6543/postgres?pgbouncer=true`,
      directa: `postgresql://postgres.${ref}:${clav}@${host}:5432/postgres`,
      descripcion: `agrupada (pooler, ${region})`,
    };
  }
  const host = `db.${ref}.supabase.co`;
  return {
    app: `postgresql://postgres:${clav}@${host}:5432/postgres`,
    directa: `postgresql://postgres:${clav}@${host}:5432/postgres`,
    descripcion: 'directa',
  };
}

/** Oculta la contrasena para poder mostrar la direccion sin filtrarla. */
function sinClave(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
}

/**
 * Regiones donde Supabase tiene agrupador, en el orden en que conviene
 * probarlas desde Centroamerica.
 *
 * Se prueban una por una porque el panel no expone la region por API y
 * preguntarsela al operador es una vuelta mas en la que se puede fallar. El
 * host resuelve en todas; la que autentica es la correcta.
 */
const REGIONES = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'sa-east-1', 'ca-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
];

async function probarConexion(url: string): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const cliente = new Client({ connectionString: url, connectionTimeoutMillis: 12_000 });
  try {
    await cliente.connect();
    const r = await cliente.query<{ v: string }>('SELECT version() AS v');
    return { ok: true, version: (r.rows[0]?.v ?? '').split(' ').slice(0, 2).join(' ') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await cliente.end().catch(() => undefined);
  }
}

/** Reemplaza o agrega una variable en .env, dejando el resto intacto. */
function ponerVariable(contenido: string, nombre: string, valor: string): string {
  const linea = `${nombre}="${valor}"`;
  const activa = new RegExp(`^${nombre}=.*$`, 'm');
  if (activa.test(contenido)) return contenido.replace(activa, linea);
  return `${contenido.trimEnd()}\n${linea}\n`;
}

/** Comenta la linea activa de una variable, para poder volver atras. */
function comentarVariable(contenido: string, nombre: string, nota: string): string {
  const activa = new RegExp(`^(${nombre}=.*)$`, 'm');
  return contenido.replace(activa, `# ${nota}\n# $1`);
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error('Necesita una terminal interactiva. Abralo en PowerShell o en la consola.');
  }

  const ref = argumento('ref') ?? REF_POR_DEFECTO;
  const region = process.argv.includes('--pooler')
    ? (argumento('region') ?? 'us-east-1')
    : undefined;

  console.log(`Proyecto de Supabase: ${ref}`);
  console.log(`Tipo de conexion:     ${region ? `agrupada (${region})` : 'directa'}\n`);

  const clave = await preguntarOculto('Contrasena de la base de datos: ');
  if (clave.trim() === '') throw new Error('No escribio nada. No se cambio el archivo.');

  let cadenas = construirCadenas(ref, clave, region);

  console.log(`\nProbando la conexion ${cadenas.descripcion}...`);
  console.log(`  ${sinClave(cadenas.directa)}`);
  let prueba = await probarConexion(cadenas.directa);

  // La conexion directa de Supabase va por IPv6 y muchos proveedores no lo
  // tienen. En vez de mandar al operador a buscar la region en el panel, se
  // prueban las del agrupador hasta dar con la suya.
  const esProblemaDeRed =
    !prueba.ok && /ENOTFOUND|ENETUNREACH|EAI_AGAIN|timeout/i.test(prueba.error);

  if (esProblemaDeRed && !region) {
    console.log('\n  No resuelve por red: su proveedor no tiene IPv6.');
    console.log('  Buscando su region en el agrupador, que si va por IPv4...\n');

    // Si alguna region contesta "contrasena incorrecta", esa ES la region: el
    // agrupador solo llega a comprobar credenciales cuando el proyecto existe
    // ahi. Ese error es mas util que el "no es" de las demas.
    let errorDeCredenciales: string | null = null;

    for (const candidata of REGIONES) {
      process.stdout.write(`  ${candidata.padEnd(16)}`);
      const intento = construirCadenas(ref, clave, candidata);
      const resultado = await probarConexion(intento.directa);
      if (resultado.ok) {
        console.log('conecta');
        cadenas = intento;
        prueba = resultado;
        break;
      }
      if (/password|authentication/i.test(resultado.error)) {
        console.log('es esta, pero la contrasena no');
        errorDeCredenciales = resultado.error;
        break;
      }
      console.log(/tenant|not found/i.test(resultado.error) ? 'no es' : 'falla');
    }

    if (!prueba.ok && errorDeCredenciales) {
      prueba = { ok: false, error: errorDeCredenciales };
    }
  }

  if (!prueba.ok) {
    console.error(`\nNo se pudo conectar:\n  ${prueba.error}\n`);
    if (/password|authentication/i.test(prueba.error)) {
      console.error('La contrasena no es la correcta. Puede generar una nueva en');
      console.error('Project Settings > Database > Reset database password.\n');
    } else {
      console.error('Si conoce la region de su proyecto, indiquela a mano:\n');
      console.error('  npm run db:conectar -- --pooler --region su-region\n');
    }
    console.error('No se toco el archivo .env. La caja sigue funcionando con la base local.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Conectado por conexion ${cadenas.descripcion}. ${prueba.version}\n`);

  const original = await readFile(RUTA_ENV, 'utf8');
  let nuevo = comentarVariable(original, 'DATABASE_URL', 'Base local anterior, por si hay que volver:');
  nuevo = ponerVariable(nuevo, 'DATABASE_URL', cadenas.app);
  nuevo = ponerVariable(nuevo, 'DIRECT_URL', cadenas.directa);

  await writeFile(`${RUTA_ENV}.anterior`, original, 'utf8');
  await writeFile(RUTA_ENV, nuevo, 'utf8');

  console.log('Archivo .env actualizado. La copia anterior quedo en .env.anterior');
  console.log('\nOJO: la aplicacion NO arranca todavia. El esquema sigue en SQLite y');
  console.log('hay que cambiarlo a PostgreSQL, crear las tablas y mudar los datos.');
  console.log('Avise para hacer ese paso; no hace falta que mande la contrasena.');
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});

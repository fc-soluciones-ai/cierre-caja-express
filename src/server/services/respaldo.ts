/**
 * Respaldo y verificacion de la base de datos.
 *
 * POR QUE NO SE COPIA EL ARCHIVO
 *
 * Copiar dev.db con el sistema en marcha puede producir una copia rota: si la
 * copia empieza a la mitad de una transaccion, el archivo resultante mezcla
 * paginas de dos estados distintos. Ademas SQLite guarda cambios recientes en
 * archivos laterales (-journal o -wal) que una copia ingenua se deja fuera.
 *
 * Por eso se usa VACUUM INTO, que le pide a SQLite escribir una base nueva y
 * consistente con el estado actual, sin bloquear la caja. Requiere SQLite 3.27
 * o superior; el cliente de Prisma trae 3.45.
 *
 * UN RESPALDO QUE NO SE VERIFICA NO ES UN RESPALDO
 *
 * Despues de crearlo se abre la copia, se le corre integrity_check y se cuentan
 * sus filas contra las del original. Un archivo corrupto que nadie abrio hasta
 * el dia del desastre es peor que no tener respaldo, porque da confianza falsa.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';

/** Tablas que se cuentan para comprobar que la copia trae los datos. */
const TABLAS_VERIFICADAS = [
  'cajeros',
  'choferes',
  'turnos_chofer',
  'abonos_efectivo',
  'cargas_excel',
  'ventas_chofer_excel',
  'cierres_chofer',
  'arqueos_caja',
  'tiquetes',
  'eventos_auditoria',
] as const;

export interface ManifiestoRespaldo {
  archivo: string;
  creado: string;
  bytes: number;
  sha256: string;
  origen: string;
  conteos: Record<string, number>;
  integridad: string;
}

export interface ResultadoRespaldo {
  ruta: string;
  manifiesto: ManifiestoRespaldo;
  duracionMs: number;
  /** Copias antiguas eliminadas por la politica de retencion. */
  eliminados: string[];
}

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

/**
 * Ruta del archivo SQLite a partir de DATABASE_URL.
 *
 * Prisma resuelve las rutas relativas contra la carpeta del esquema, no contra
 * el directorio de trabajo. Replicarlo aqui evita respaldar un archivo que no
 * es el que la aplicacion esta usando.
 */
export function rutaBaseSqlite(): string {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('file:')) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'Este respaldo solo funciona con SQLite. Con PostgreSQL use pg_dump: la copia de un archivo no aplica.',
    );
  }
  const destino = url.slice('file:'.length);
  return path.isAbsolute(destino)
    ? destino
    : path.resolve(process.cwd(), 'prisma', destino);
}

export function directorioRespaldos(): string {
  const configurado = process.env.RESPALDO_DIRECTORIO;
  return configurado && configurado.trim() !== ''
    ? path.resolve(configurado)
    : path.resolve(process.cwd(), 'respaldos');
}

function retencionDias(): number {
  const valor = Number(process.env.RESPALDO_RETENCION_DIAS ?? 30);
  return Number.isFinite(valor) && valor > 0 ? valor : 30;
}

function copiasMinimas(): number {
  const valor = Number(process.env.RESPALDO_COPIAS_MINIMAS ?? 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 10;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function marcaDeTiempo(fecha = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}` +
    `_${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`
  );
}

/** SQLite escapa una comilla simple duplicandola. */
function literalSql(texto: string): string {
  return `'${texto.replace(/'/g, "''")}'`;
}

async function sha256DeArchivo(ruta: string): Promise<string> {
  return createHash('sha256').update(await readFile(ruta)).digest('hex');
}

async function contarFilas(cliente: PrismaClient): Promise<Record<string, number>> {
  const conteos: Record<string, number> = {};
  for (const tabla of TABLAS_VERIFICADAS) {
    const filas = await cliente.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      `SELECT COUNT(*) AS n FROM "${tabla}"`,
    );
    conteos[tabla] = Number(filas[0]?.n ?? 0);
  }
  return conteos;
}

// ---------------------------------------------------------------------------
// Verificacion
// ---------------------------------------------------------------------------

export interface ResultadoVerificacion {
  integridad: string;
  conteos: Record<string, number>;
  bytes: number;
  sha256: string;
}

/**
 * Abre una copia y comprueba que se puede leer entera.
 *
 * Se usa un cliente aparte apuntado al archivo de la copia: el singleton sigue
 * conectado a la base viva y no debe tocarse.
 */
export async function verificarArchivoRespaldo(ruta: string): Promise<ResultadoVerificacion> {
  const cliente = new PrismaClient({
    datasources: { db: { url: `file:${path.resolve(ruta)}` } },
    log: ['error'],
  });

  try {
    const integridad = await cliente.$queryRawUnsafe<Array<{ integrity_check: string }>>(
      'PRAGMA integrity_check',
    );
    const resultado = integridad[0]?.integrity_check ?? 'sin respuesta';
    if (resultado !== 'ok') {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `La copia "${path.basename(ruta)}" no paso la comprobacion de integridad: ${resultado}`,
      );
    }

    const conteos = await contarFilas(cliente);
    const info = await stat(ruta);

    return {
      integridad: resultado,
      conteos,
      bytes: info.size,
      sha256: await sha256DeArchivo(ruta),
    };
  } finally {
    await cliente.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Creacion
// ---------------------------------------------------------------------------

export interface OpcionesRespaldo {
  /** Sufijo para distinguir un respaldo manual o previo a una restauracion. */
  etiqueta?: string;
  /** Quien lo pidio, si salio de la aplicacion y no de la tarea programada. */
  cajeroId?: string;
  /** Saltarse la limpieza de copias viejas. */
  sinRotacion?: boolean;
}

export async function crearRespaldo(
  opciones: OpcionesRespaldo = {},
): Promise<ResultadoRespaldo> {
  const inicio = Date.now();
  const origen = rutaBaseSqlite();
  const directorio = directorioRespaldos();
  await mkdir(directorio, { recursive: true });

  const sufijo = opciones.etiqueta ? `-${opciones.etiqueta.replace(/[^a-z0-9_-]/gi, '')}` : '';
  const nombre = `caja-${marcaDeTiempo()}${sufijo}.db`;
  const destino = path.join(directorio, nombre);

  // VACUUM INTO se niega a escribir sobre un archivo existente, que es
  // exactamente lo que se quiere: un respaldo nunca pisa a otro.
  await prisma.$executeRawUnsafe(`VACUUM INTO ${literalSql(destino)}`);

  const verificacion = await verificarArchivoRespaldo(destino);
  const conteosOrigen = await contarFilas(prisma as unknown as PrismaClient);

  // La copia puede traer alguna fila de mas si entro un abono mientras se
  // escribia; lo que no puede es traer menos.
  const faltantes = TABLAS_VERIFICADAS.filter(
    (tabla) => (verificacion.conteos[tabla] ?? 0) < (conteosOrigen[tabla] ?? 0),
  );
  if (faltantes.length > 0) {
    await unlink(destino).catch(() => undefined);
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      `La copia salio incompleta en: ${faltantes.join(', ')}. Se descarto y no se guardo nada.`,
    );
  }

  const manifiesto: ManifiestoRespaldo = {
    archivo: nombre,
    creado: new Date().toISOString(),
    bytes: verificacion.bytes,
    sha256: verificacion.sha256,
    origen,
    conteos: verificacion.conteos,
    integridad: verificacion.integridad,
  };
  await writeFile(`${destino}.json`, JSON.stringify(manifiesto, null, 2), 'utf8');

  const eliminados = opciones.sinRotacion ? [] : await rotarRespaldos();

  await prisma
    .$transaction(async (tx) => {
      await registrarEvento(tx, {
        tipo: 'RESPALDO',
        cajeroId: opciones.cajeroId ?? null,
        entidadTipo: 'Respaldo',
        entidadId: nombre,
        detalle: {
          bytes: manifiesto.bytes,
          filas: Object.values(manifiesto.conteos).reduce((a, b) => a + b, 0),
          eliminados: eliminados.length,
        },
      });
    })
    // El respaldo ya existe y esta verificado. Que no se pueda anotar en la
    // bitacora no lo invalida, y hacer fallar la tarea programada por eso
    // dejaria al negocio sin respaldos.
    .catch((e) => console.error('[respaldo] no se pudo registrar el evento:', e));

  return {
    ruta: destino,
    manifiesto,
    duracionMs: Date.now() - inicio,
    eliminados,
  };
}

// ---------------------------------------------------------------------------
// Inventario y retencion
// ---------------------------------------------------------------------------

export interface InfoRespaldo {
  archivo: string;
  ruta: string;
  bytes: number;
  modificado: Date;
  manifiesto: ManifiestoRespaldo | null;
}

export async function listarRespaldos(): Promise<InfoRespaldo[]> {
  const directorio = directorioRespaldos();
  let nombres: string[];
  try {
    nombres = await readdir(directorio);
  } catch {
    return [];
  }

  const copias: InfoRespaldo[] = [];
  for (const nombre of nombres.filter((n) => n.endsWith('.db'))) {
    const ruta = path.join(directorio, nombre);
    const info = await stat(ruta);
    let manifiesto: ManifiestoRespaldo | null = null;
    try {
      manifiesto = JSON.parse(await readFile(`${ruta}.json`, 'utf8')) as ManifiestoRespaldo;
    } catch {
      manifiesto = null;
    }
    copias.push({ archivo: nombre, ruta, bytes: info.size, modificado: info.mtime, manifiesto });
  }

  // Mas reciente primero.
  return copias.sort((a, b) => b.modificado.getTime() - a.modificado.getTime());
}

/**
 * Borra copias mas viejas que la retencion configurada, pero nunca baja de un
 * minimo de copias. Si la caja estuvo apagada un mes, la regla por antiguedad
 * sola borraria el ultimo respaldo que queda.
 */
export async function rotarRespaldos(): Promise<string[]> {
  const copias = await listarRespaldos();
  const minimas = copiasMinimas();
  if (copias.length <= minimas) return [];

  const limite = Date.now() - retencionDias() * 24 * 60 * 60 * 1000;
  const candidatas = copias.slice(minimas).filter((c) => c.modificado.getTime() < limite);

  const eliminados: string[] = [];
  for (const copia of candidatas) {
    try {
      await unlink(copia.ruta);
      await unlink(`${copia.ruta}.json`).catch(() => undefined);
      eliminados.push(copia.archivo);
    } catch (e) {
      console.error(`[respaldo] no se pudo borrar ${copia.archivo}:`, e);
    }
  }
  return eliminados;
}

/** Cuando fue el ultimo respaldo, para avisar si la caja lleva dias sin uno. */
export async function ultimoRespaldo(): Promise<InfoRespaldo | null> {
  const copias = await listarRespaldos();
  return copias[0] ?? null;
}

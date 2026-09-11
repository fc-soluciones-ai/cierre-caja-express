'use server';

/**
 * Acciones de la pantalla de importacion.
 *
 * El archivo se envia dos veces, una para previsualizar y otra para confirmar,
 * en vez de guardarse en el servidor entre los dos pasos. Un archivo temporal
 * habria que limpiarlo, protegerlo y decidir que hacer si la caja se reinicia
 * a media carga; releer 100 KB es mas barato que todo eso.
 */

import { revalidatePath } from 'next/cache';

import { ErrorNegocio, esErrorNegocio } from '@/server/errores';
import {
  importarLote,
  previsualizarLote,
  type ArchivoEntrante,
  type PrevisualizacionLote,
  type ResultadoCarga,
} from '@/server/services/cargas';
import { exigirCajero } from '@/server/services/sesion';
import { TIPO_CORTE, TIPO_REPORTE, type TipoCorte, type TipoReporte } from '@/types/enums';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  if (e instanceof Error && e.name === 'ErrorParseoExcel') {
    return { ok: false, mensaje: e.message };
  }
  if (e instanceof Error && e.name === 'ZodError') {
    return { ok: false, mensaje: 'Los datos enviados no son validos.' };
  }
  console.error('[importar]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado al leer los archivos.' };
}

/** Extensiones que Soft Restaurant produce. Cualquier otra cosa se rechaza. */
const EXTENSIONES = ['.xls', '.xlsx', '.xlsm'];

/** Tope por archivo. Un reporte de ventas por mesero nunca llega a esto. */
const MAXIMO_BYTES = 12 * 1024 * 1024;

async function leerFormulario(formData: FormData): Promise<ArchivoEntrante[]> {
  const archivos = formData.getAll('archivos').filter((a): a is File => a instanceof File);
  const metasCrudas = formData.get('metas');

  if (archivos.length === 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'No se recibio ningun archivo.');
  }

  let metas: Array<{ tipoCorte: string; tipoReporte: string }>;
  try {
    metas = JSON.parse(String(metasCrudas ?? '[]'));
  } catch {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La clasificacion de los archivos llego corrupta.');
  }
  if (metas.length !== archivos.length) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Falta clasificar alguno de los archivos.');
  }

  const entrantes: ArchivoEntrante[] = [];
  for (const [indice, archivo] of archivos.entries()) {
    const nombre = archivo.name;
    const extension = nombre.slice(nombre.lastIndexOf('.')).toLowerCase();
    if (!EXTENSIONES.includes(extension)) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `"${nombre}" no es un Excel de Soft Restaurant. Se esperaba ${EXTENSIONES.join(', ')}.`,
      );
    }
    if (archivo.size > MAXIMO_BYTES) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `"${nombre}" pesa demasiado para ser un reporte de ventas por mesero.`,
      );
    }

    const meta = metas[indice];
    const tipoCorte = meta?.tipoCorte as TipoCorte;
    const tipoReporte = meta?.tipoReporte as TipoReporte;
    if (!TIPO_CORTE.includes(tipoCorte) || !TIPO_REPORTE.includes(tipoReporte)) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `La clasificacion de "${nombre}" no es valida.`,
      );
    }

    entrantes.push({
      nombreArchivo: nombre,
      contenido: Buffer.from(await archivo.arrayBuffer()),
      tipoCorte,
      tipoReporte,
    });
  }

  return entrantes;
}

export async function accionPrevisualizarLote(
  formData: FormData,
): Promise<Resultado<PrevisualizacionLote>> {
  try {
    const cajero = await exigirCajero();
    const archivos = await leerFormulario(formData);
    return { ok: true, datos: await previsualizarLote(archivos, cajero.id) };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionImportarLote(
  formData: FormData,
): Promise<Resultado<ResultadoCarga[]>> {
  try {
    const cajero = await exigirCajero();
    const archivos = await leerFormulario(formData);
    const resultados = await importarLote(archivos, cajero.id);

    revalidatePath('/');
    revalidatePath('/cierre');

    return { ok: true, datos: resultados };
  } catch (e) {
    return comoResultado(e);
  }
}

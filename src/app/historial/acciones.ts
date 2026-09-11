'use server';

/**
 * Acciones del historial.
 *
 * Ninguna modifica un movimiento: solo leen, reimprimen o exportan. La
 * reimpresion si deja rastro, porque volver a sacar un comprobante de dinero
 * es en si mismo un hecho auditable.
 */

import { esErrorNegocio } from '@/server/errores';
import { exportarHistorialAExcel } from '@/server/services/exportar';
import {
  consultarHistorial,
  metricasHistorial,
  type FiltrosHistorial,
} from '@/server/services/historial';
import { previsualizarTiquete, reimprimirTiquete } from '@/server/services/impresion';
import { exigirCajero } from '@/server/services/sesion';
import type { TipoEvento } from '@/types/enums';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  console.error('[historial]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado.' };
}

/** Filtros tal como viajan desde el cliente, con fechas en texto ISO. */
export interface FiltrosSerializados {
  desde?: string;
  hasta?: string;
  choferId?: string;
  cajeroId?: string;
  tipos?: string[];
}

function deserializar(filtros: FiltrosSerializados): FiltrosHistorial {
  return {
    desde: filtros.desde ? new Date(filtros.desde) : undefined,
    hasta: filtros.hasta ? new Date(filtros.hasta) : undefined,
    choferId: filtros.choferId || undefined,
    cajeroId: filtros.cajeroId || undefined,
    tipos: filtros.tipos && filtros.tipos.length > 0 ? (filtros.tipos as TipoEvento[]) : undefined,
  };
}

export async function accionPrevisualizarTiquete(
  tiqueteId: string,
): Promise<Resultado<string>> {
  try {
    await exigirCajero();
    return { ok: true, datos: await previsualizarTiquete(tiqueteId) };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionReimprimir(
  tiqueteId: string,
): Promise<Resultado<{ impreso: boolean; error?: string }>> {
  try {
    const cajero = await exigirCajero();
    const resultado = await reimprimirTiquete(tiqueteId, {
      cajeroId: cajero.id,
      dispositivo: 'CAJA-WEB',
    });
    return { ok: true, datos: { impreso: resultado.impreso, error: resultado.error } };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionExportarExcel(
  filtros: FiltrosSerializados,
  descripcionFiltro: string,
): Promise<Resultado<{ nombreArchivo: string; base64: string }>> {
  try {
    await exigirCajero();
    const deserializados = deserializar(filtros);

    const [historial, metricas] = await Promise.all([
      // El reporte lleva todo lo que cae en el filtro, no solo la pagina que
      // se ve en pantalla.
      consultarHistorial({ ...deserializados, limite: 500 }),
      metricasHistorial(deserializados),
    ]);

    return {
      ok: true,
      datos: exportarHistorialAExcel({
        filas: historial.filas,
        metricas,
        descripcionFiltro,
      }),
    };
  } catch (e) {
    return comoResultado(e);
  }
}

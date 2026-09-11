'use server';

/**
 * Acciones de la pantalla de cierre.
 *
 * El cajero de la sesion sale de la cookie, nunca del cliente: el cierre es el
 * documento contable del turno y su firma no puede elegirla el navegador.
 */

import { revalidatePath } from 'next/cache';

import { esErrorNegocio } from '@/server/errores';
import { cerrarTurnos, previsualizarCierre, type ResultadoCierreLote } from '@/server/services/cierres';
import { exigirCajero } from '@/server/services/sesion';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  if (e instanceof Error && e.name === 'ZodError') {
    return { ok: false, mensaje: 'Los datos enviados no son validos.' };
  }
  console.error('[cierre]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado al cerrar. No se cerro nada.' };
}

export interface SolicitudCierre {
  choferId: string;
  efectivoEntregado: number;
  observacion?: string;
  permitirSinVentas?: boolean;
}

export async function accionCerrarTurnos(entrada: {
  diaOperativo: string;
  cierres: SolicitudCierre[];
  arqueo?: {
    efectivoRealContado: number;
    observacion?: string;
    claveIdempotencia: string;
  };
}): Promise<Resultado<ResultadoCierreLote>> {
  try {
    const cajero = await exigirCajero();
    const resultado = await cerrarTurnos({
      cajeroId: cajero.id,
      diaOperativo: entrada.diaOperativo,
      dispositivo: 'CAJA-WEB',
      cierres: entrada.cierres,
      arqueo: entrada.arqueo,
    });

    revalidatePath('/');
    revalidatePath('/cierre');

    return { ok: true, datos: resultado };
  } catch (e) {
    return comoResultado(e);
  }
}

/** Refresca la conciliacion de un chofer sin recargar la pantalla entera. */
export async function accionRecalcularCierre(
  choferId: string,
  diaOperativo: string,
): Promise<Resultado<Awaited<ReturnType<typeof previsualizarCierre>>>> {
  try {
    await exigirCajero();
    return { ok: true, datos: await previsualizarCierre(choferId, diaOperativo) };
  } catch (e) {
    return comoResultado(e);
  }
}

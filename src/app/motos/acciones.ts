'use server';

/**
 * Acciones de la flota.
 *
 * El cajero sale de la cookie de sesion, igual que en el resto del sistema:
 * un gasto de taller es dinero del negocio y queda firmado por quien lo
 * registro.
 */

import { revalidatePath } from 'next/cache';

import { esErrorNegocio } from '@/server/errores';
import {
  registrarMantenimiento,
  type ResultadoMantenimiento,
} from '@/server/services/mantenimiento';
import {
  asignarMoto,
  cambiarEstadoMoto,
  crearMoto,
  editarMoto,
  liberarMotoDeChofer,
  type EntradaMoto,
  type ResultadoAsignacion,
  type ResultadoCambioEstado,
} from '@/server/services/motos';
import { exigirCajero } from '@/server/services/sesion';
import type { CategoriaMantenimiento, EstadoMoto, TipoMantenimiento } from '@/types/enums';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  console.error('[flota]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado. Intente de nuevo.' };
}

function refrescar(): void {
  revalidatePath('/motos');
  revalidatePath('/motos/gastos');
  revalidatePath('/motos/reportes');
}

// ---------------------------------------------------------------------------
// Motos
// ---------------------------------------------------------------------------

export async function accionCrearMoto(
  entrada: EntradaMoto,
): Promise<Resultado<{ placa: string }>> {
  try {
    const cajero = await exigirCajero();
    const creada = await crearMoto(entrada, cajero.id);
    refrescar();
    return { ok: true, datos: creada };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEditarMoto(
  placa: string,
  cambios: Partial<Omit<EntradaMoto, 'placa'>>,
): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajero();
    await editarMoto(placa, cambios, cajero.id);
    refrescar();
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

/**
 * Cambia el estado de una moto y mueve la comodin en consecuencia.
 *
 * Devuelve lo que paso con el chofer afectado, incluida la advertencia de
 * cuando se queda sin moto. La pantalla tiene que mostrarla: es justo el caso
 * en que alguien debe tomar una decision a mano.
 */
export async function accionCambiarEstadoMoto(
  placa: string,
  estado: EstadoMoto,
  motivo?: string,
): Promise<Resultado<ResultadoCambioEstado>> {
  try {
    const cajero = await exigirCajero();
    const resultado = await cambiarEstadoMoto(placa, estado, cajero.id, motivo ?? '');
    refrescar();
    revalidatePath('/');
    return { ok: true, datos: resultado };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionAsignarMoto(
  placa: string,
  choferId: string,
  motivo?: string,
): Promise<Resultado<ResultadoAsignacion>> {
  try {
    const cajero = await exigirCajero();
    const resultado = await asignarMoto(placa, choferId, cajero.id, motivo ?? 'Asignacion manual');
    refrescar();
    return { ok: true, datos: resultado };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionLiberarMoto(choferId: string): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajero();
    await liberarMotoDeChofer(choferId, cajero.id);
    refrescar();
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export async function accionRegistrarGasto(entrada: {
  placa: string;
  tipo: TipoMantenimiento;
  categoria: CategoriaMantenimiento;
  costoTotal: number;
  kilometrajeEvento: number;
  descripcion?: string;
  tallerOProveedor?: string;
  claveIdempotencia: string;
}): Promise<Resultado<ResultadoMantenimiento>> {
  try {
    const cajero = await exigirCajero();
    const resultado = await registrarMantenimiento({ ...entrada, cajeroId: cajero.id });
    refrescar();
    return { ok: true, datos: resultado };
  } catch (e) {
    return comoResultado(e);
  }
}

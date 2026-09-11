'use server';

/**
 * Acciones de servidor del dashboard.
 *
 * Toda escritura pasa por aqui y saca el cajero de la cookie de sesion, nunca
 * del cliente: si el navegador pudiera decir quien firma un abono, la firma no
 * valdria nada.
 *
 * Las acciones devuelven un resultado en vez de lanzar. En una pantalla tactil
 * el operador necesita leer que paso y volver a intentarlo, no una pantalla de
 * error de Next.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { esErrorNegocio } from '@/server/errores';
import { registrarAbono } from '@/server/services/abonos';
import { cerrarSesion, iniciarSesion } from '@/server/services/sesion';
import { abrirTurnoManual, cancelarTurnoVacio } from '@/server/services/turnos';
import { exigirCajero } from '@/server/services/sesion';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  if (e instanceof Error && e.name === 'ZodError') {
    return { ok: false, mensaje: 'Los datos enviados no son validos.' };
  }
  console.error('[accion]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado. Intente de nuevo.' };
}

// ---------------------------------------------------------------------------
// Sesion
// ---------------------------------------------------------------------------

export async function accionEntrar(
  cajeroId: string,
  pin: string,
): Promise<Resultado<{ nombre: string }>> {
  try {
    const cajero = await iniciarSesion(cajeroId, pin, 'CAJA-WEB');
    return { ok: true, datos: { nombre: cajero.nombre } };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionSalir(): Promise<void> {
  await cerrarSesion();
  redirect('/entrar');
}

// ---------------------------------------------------------------------------
// Entrada y salida de turno
// ---------------------------------------------------------------------------

/** Marca la entrada de un repartidor para que aparezca en el dashboard. */
export async function accionEntrarATurno(
  choferId: string,
): Promise<Resultado<{ nombre: string; yaEstaba: boolean }>> {
  try {
    const cajero = await exigirCajero();
    const resultado = await abrirTurnoManual(choferId, cajero.id, 'CAJA-WEB');
    revalidatePath('/');
    revalidatePath('/cierre');
    return { ok: true, datos: { nombre: resultado.nombre, yaEstaba: resultado.yaEstaba } };
  } catch (e) {
    return comoResultado(e);
  }
}

/** Deshace una entrada marcada por error. Solo si el turno no recibio dinero. */
export async function accionQuitarDeTurno(choferId: string): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajero();
    await cancelarTurnoVacio(choferId, cajero.id, 'CAJA-WEB');
    revalidatePath('/');
    revalidatePath('/cierre');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

// ---------------------------------------------------------------------------
// Abono parcial
// ---------------------------------------------------------------------------

export interface AbonoConfirmado {
  abonoId: string;
  montoAbonado: number;
  saldoAcumuladoTurno: number;
  cantidadAbonosTurno: number;
  impreso: boolean;
  repetido: boolean;
}

/**
 * Registra un abono parcial.
 *
 * La clave de idempotencia la genera el cliente con crypto.randomUUID() y se
 * mantiene fija mientras el modal siga abierto: si el cajero toca Confirmar
 * dos veces, o la red repite el envio, el segundo intento devuelve el mismo
 * abono en vez de recibir el dinero otra vez.
 */
export async function accionAbonar(entrada: {
  choferId: string;
  montoAbonado: number;
  claveIdempotencia: string;
  nota?: string;
}): Promise<Resultado<AbonoConfirmado>> {
  try {
    const cajero = await exigirCajero();
    const abono = await registrarAbono({
      choferId: entrada.choferId,
      cajeroId: cajero.id,
      montoAbonado: entrada.montoAbonado,
      claveIdempotencia: entrada.claveIdempotencia,
      dispositivo: 'CAJA-WEB',
      nota: entrada.nota,
    });

    revalidatePath('/');

    return {
      ok: true,
      datos: {
        abonoId: abono.abonoId,
        montoAbonado: abono.montoAbonado,
        saldoAcumuladoTurno: abono.saldoAcumuladoTurno,
        cantidadAbonosTurno: abono.cantidadAbonosTurno,
        impreso: abono.impreso,
        repetido: abono.repetido,
      },
    };
  } catch (e) {
    return comoResultado(e);
  }
}

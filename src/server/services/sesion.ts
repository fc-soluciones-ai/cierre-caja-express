/**
 * Sesion del cajero.
 *
 * Todo movimiento de dinero queda firmado por quien lo hizo, asi que antes de
 * llegar al dashboard hay que decir quien esta en la caja. Es un PIN corto, no
 * una contrasena: se teclea decenas de veces por noche en una pantalla tactil.
 *
 * La derivacion del PIN vive en pin.ts.
 */

import { cookies } from 'next/headers';

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { verificarPin } from '@/server/services/pin';

const COOKIE_SESION = 'cajero_sesion';
const DURACION_SESION_SEGUNDOS = 60 * 60 * 16; // una jornada larga

export interface CajeroEnSesion {
  id: string;
  nombre: string;
  rol: string;
}

export async function iniciarSesion(
  cajeroId: string,
  pin: string,
  dispositivo?: string,
): Promise<CajeroEnSesion> {
  const cajero = await prisma.cajero.findUnique({ where: { id: cajeroId } });
  if (!cajero || cajero.estado !== 'ACTIVO') {
    throw new ErrorNegocio('CAJERO_NO_ENCONTRADO', 'El cajero no existe o esta inactivo.');
  }
  if (!verificarPin(pin, cajero.pin)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'PIN incorrecto.');
  }

  cookies().set(COOKIE_SESION, cajero.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_SEGUNDOS,
    secure: process.env.NODE_ENV === 'production',
  });

  await prisma.$transaction(async (tx) => {
    await registrarEvento(tx, {
      tipo: 'LOGIN',
      cajeroId: cajero.id,
      entidadTipo: 'Cajero',
      entidadId: cajero.id,
      dispositivo,
    });
  });

  return { id: cajero.id, nombre: cajero.nombre, rol: cajero.rol };
}

export function cerrarSesion(): void {
  cookies().delete(COOKIE_SESION);
}

/** Cajero de la sesion actual, o null si nadie abrio la caja. */
export async function cajeroDeSesion(): Promise<CajeroEnSesion | null> {
  const id = cookies().get(COOKIE_SESION)?.value;
  if (!id) return null;
  const cajero = await prisma.cajero.findUnique({
    where: { id },
    select: { id: true, nombre: true, rol: true, estado: true },
  });
  if (!cajero || cajero.estado !== 'ACTIVO') return null;
  return { id: cajero.id, nombre: cajero.nombre, rol: cajero.rol };
}

/** Igual que cajeroDeSesion pero falla si no hay nadie. Para las acciones. */
export async function exigirCajero(): Promise<CajeroEnSesion> {
  const cajero = await cajeroDeSesion();
  if (!cajero) {
    throw new ErrorNegocio(
      'CAJERO_NO_ENCONTRADO',
      'La sesion de caja expiro. Vuelva a entrar con su PIN.',
    );
  }
  return cajero;
}

/** Cajeros disponibles para la pantalla de entrada. */
export async function cajerosActivos(): Promise<Array<{ id: string; nombre: string }>> {
  return prisma.cajero.findMany({
    where: { estado: 'ACTIVO' },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
}

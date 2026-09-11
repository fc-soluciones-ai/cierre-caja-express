'use server';

/**
 * Acciones del CRUD de repartidores.
 *
 * La foto entra como archivo y se valida por sus bytes antes de tocar el
 * disco. Un repartidor nunca se borra: se desactiva, porque sus turnos y
 * cierres son historia contable.
 */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db/prisma';
import { esErrorNegocio, ErrorNegocio } from '@/server/errores';
import {
  crearChofer,
  desactivarChofer,
  editarChofer,
  reactivarChofer,
} from '@/server/services/choferes';
import { borrarFotoChofer, guardarFotoChofer } from '@/server/services/fotos';
import { exigirCajero } from '@/server/services/sesion';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  if (e instanceof Error && e.name === 'ZodError') {
    // Zod trae el detalle util en el primer problema.
    try {
      const problemas = JSON.parse(e.message) as Array<{ message: string }>;
      if (problemas[0]?.message) return { ok: false, mensaje: problemas[0].message };
    } catch {
      // Sigue al mensaje generico.
    }
    return { ok: false, mensaje: 'Los datos enviados no son validos.' };
  }
  console.error('[choferes]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado.' };
}

async function leerFoto(formData: FormData): Promise<Buffer | null> {
  const foto = formData.get('foto');
  if (!(foto instanceof File) || foto.size === 0) return null;
  return Buffer.from(await foto.arrayBuffer());
}

function texto(formData: FormData, campo: string): string | undefined {
  const valor = formData.get(campo);
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  return limpio === '' ? undefined : limpio;
}

export async function accionCrearChofer(
  formData: FormData,
): Promise<Resultado<{ id: string }>> {
  try {
    const cajero = await exigirCajero();

    const creado = await crearChofer(
      {
        idMeseroSoftRestaurant: texto(formData, 'idMeseroSoftRestaurant') ?? '',
        nombre: texto(formData, 'nombre') ?? '',
        telefono: texto(formData, 'telefono'),
      },
      cajero.id,
    );

    const foto = await leerFoto(formData);
    if (foto) {
      const url = await guardarFotoChofer(creado.id, foto);
      await prisma.chofer.update({ where: { id: creado.id }, data: { fotoUrl: url } });
    }

    revalidatePath('/');
    revalidatePath('/repartidores');
    return { ok: true, datos: creado };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEditarChofer(formData: FormData): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajero();
    const choferId = texto(formData, 'choferId');
    if (!choferId) throw new ErrorNegocio('DATOS_INVALIDOS', 'Falta el repartidor a editar.');

    await editarChofer(
      choferId,
      {
        idMeseroSoftRestaurant: texto(formData, 'idMeseroSoftRestaurant'),
        nombre: texto(formData, 'nombre'),
        telefono: texto(formData, 'telefono'),
      },
      cajero.id,
    );

    const foto = await leerFoto(formData);
    if (foto) {
      const anterior = await prisma.chofer.findUnique({
        where: { id: choferId },
        select: { fotoUrl: true },
      });
      const url = await guardarFotoChofer(choferId, foto);
      await prisma.chofer.update({ where: { id: choferId }, data: { fotoUrl: url } });
      // La anterior se borra despues de que la nueva quedo guardada, para no
      // dejar al repartidor sin foto si la escritura falla.
      await borrarFotoChofer(anterior?.fotoUrl ?? null);
    }

    revalidatePath('/');
    revalidatePath('/repartidores');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionCambiarEstadoChofer(
  choferId: string,
  activar: boolean,
): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajero();
    if (activar) await reactivarChofer(choferId, cajero.id);
    else await desactivarChofer(choferId, cajero.id);

    revalidatePath('/');
    revalidatePath('/repartidores');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

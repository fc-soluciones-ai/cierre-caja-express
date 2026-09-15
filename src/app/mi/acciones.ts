'use server';

/**
 * Lo unico que el repartidor puede escribir.
 *
 * Cada accion de aqui saca el id de SU sesion, nunca de lo que mande la
 * pantalla, y exige que sea una sesion de repartidor. Un token de caja no
 * sirve para estas, igual que uno de repartidor no sirve para las de caja.
 */

import { revalidatePath } from 'next/cache';

import { esErrorNegocio } from '@/server/errores';
import { agregarEvidencia, borrarEvidencia, type TipoEntidad } from '@/server/services/evidencia';
import { registrarMantenimiento } from '@/server/services/mantenimiento';
import { exigirRepartidor } from '@/server/services/sesion';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  console.error('[repartidor]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado. Intente de nuevo.' };
}

/**
 * Registra una carga de gasolina de su propia moto.
 *
 * La placa NO viene de la pantalla: se busca la moto que el repartidor trae
 * ahora mismo. Si viniera de afuera, alguien podria cargarle la gasolina a la
 * moto de otro.
 */
export async function accionCargarGasolina(entrada: {
  kilometraje: number;
  monto: number;
  estacion?: string;
  claveIdempotencia: string;
}): Promise<Resultado<{ id: string; placa: string; kilometraje: number }>> {
  try {
    const repartidor = await exigirRepartidor();

    const { prisma } = await import('@/lib/db/prisma');
    const asignacion = await prisma.asignacionMoto.findFirst({
      where: { choferId: repartidor.id, fechaFin: null },
      select: { placa: true },
    });

    if (!asignacion) {
      return {
        ok: false,
        mensaje: 'Hoy no tiene ninguna moto asignada, asi que no hay a cual cargarle la gasolina.',
      };
    }

    const resultado = await registrarMantenimiento({
      placa: asignacion.placa,
      tipo: 'PREVENTIVO',
      categoria: 'GASOLINA',
      costoTotal: entrada.monto,
      kilometrajeEvento: entrada.kilometraje,
      tallerOProveedor: entrada.estacion?.trim() || undefined,
      choferId: repartidor.id,
      claveIdempotencia: entrada.claveIdempotencia,
    });

    revalidatePath('/mi');
    revalidatePath('/motos');
    revalidatePath('/motos/reportes');

    return {
      ok: true,
      datos: {
        id: resultado.id,
        placa: resultado.placa,
        kilometraje: resultado.kilometrajeActualizado,
      },
    };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionSubirEvidenciaMia(
  formulario: FormData,
): Promise<Resultado<Awaited<ReturnType<typeof agregarEvidencia>>>> {
  try {
    const repartidor = await exigirRepartidor();

    const entidadTipo = String(formulario.get('entidadTipo') ?? '') as TipoEntidad;
    const entidadId = String(formulario.get('entidadId') ?? '');
    const tipo = String(formulario.get('tipo') ?? '');
    const descripcion = String(formulario.get('descripcion') ?? '');
    const archivo = formulario.get('archivo');

    if (!(archivo instanceof File) || archivo.size === 0) {
      return { ok: false, mensaje: 'Elija una foto.' };
    }

    const contenido = Buffer.from(await archivo.arrayBuffer());
    const resultado = await agregarEvidencia(
      { entidadTipo, entidadId, tipo, contenido, descripcion },
      { choferId: repartidor.id },
    );

    revalidatePath('/mi');
    return { ok: true, datos: resultado };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionBorrarEvidenciaMia(id: string): Promise<Resultado<null>> {
  try {
    const repartidor = await exigirRepartidor();
    await borrarEvidencia(id, { choferId: repartidor.id });
    revalidatePath('/mi');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

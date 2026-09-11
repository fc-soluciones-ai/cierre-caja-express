/**
 * CRUD de repartidores.
 *
 * Un chofer nunca se borra: se desactiva. Sus turnos, abonos y cierres son
 * historia contable y las llaves foraneas estan en Restrict justamente para
 * que un clic no pueda romperla.
 */

import { prisma } from '@/lib/db/prisma';
import { normalizarNombre } from '@/lib/excel/columnas';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { esquemaChofer, type EntradaChofer } from '@/server/validaciones';

export async function crearChofer(
  entrada: EntradaChofer,
  cajeroId: string,
): Promise<{ id: string }> {
  const datos = esquemaChofer.parse(entrada);

  return prisma.$transaction(async (tx) => {
    const existente = await tx.chofer.findUnique({
      where: { idMeseroSoftRestaurant: datos.idMeseroSoftRestaurant },
    });
    if (existente) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `El codigo de mesero ${datos.idMeseroSoftRestaurant} ya pertenece a ${existente.nombre}.`,
      );
    }

    const chofer = await tx.chofer.create({
      data: {
        idMeseroSoftRestaurant: datos.idMeseroSoftRestaurant,
        nombre: datos.nombre,
        nombreNormalizado: normalizarNombre(datos.nombre),
        fotoUrl: datos.fotoUrl ?? null,
        telefono: datos.telefono ?? null,
        estado: datos.estado ?? 'ACTIVO',
      },
    });

    await registrarEvento(tx, {
      tipo: 'CHOFER_CREADO',
      cajeroId,
      choferId: chofer.id,
      entidadTipo: 'Chofer',
      entidadId: chofer.id,
      detalle: { nombre: chofer.nombre, idMesero: chofer.idMeseroSoftRestaurant },
    });

    return { id: chofer.id };
  });
}

export async function editarChofer(
  choferId: string,
  entrada: Partial<EntradaChofer>,
  cajeroId: string,
): Promise<void> {
  const datos = esquemaChofer.partial().parse(entrada);

  await prisma.$transaction(async (tx) => {
    const actual = await tx.chofer.findUnique({ where: { id: choferId } });
    if (!actual) throw new ErrorNegocio('CHOFER_NO_ENCONTRADO', 'El repartidor no existe.');

    if (
      datos.idMeseroSoftRestaurant &&
      datos.idMeseroSoftRestaurant !== actual.idMeseroSoftRestaurant
    ) {
      const choque = await tx.chofer.findUnique({
        where: { idMeseroSoftRestaurant: datos.idMeseroSoftRestaurant },
      });
      if (choque) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          `El codigo de mesero ${datos.idMeseroSoftRestaurant} ya pertenece a ${choque.nombre}.`,
        );
      }
    }

    await tx.chofer.update({
      where: { id: choferId },
      data: {
        ...(datos.idMeseroSoftRestaurant
          ? { idMeseroSoftRestaurant: datos.idMeseroSoftRestaurant }
          : {}),
        ...(datos.nombre
          ? { nombre: datos.nombre, nombreNormalizado: normalizarNombre(datos.nombre) }
          : {}),
        ...(datos.fotoUrl !== undefined ? { fotoUrl: datos.fotoUrl } : {}),
        ...(datos.telefono !== undefined ? { telefono: datos.telefono } : {}),
        ...(datos.estado ? { estado: datos.estado } : {}),
      },
    });

    await registrarEvento(tx, {
      tipo: 'CHOFER_EDITADO',
      cajeroId,
      choferId,
      entidadTipo: 'Chofer',
      entidadId: choferId,
      detalle: { cambios: datos },
    });
  });
}

/**
 * Desactiva un repartidor. Se niega si tiene un turno abierto: desactivarlo
 * dejaria abonos colgando de un turno que ya nadie puede cerrar.
 */
export async function desactivarChofer(choferId: string, cajeroId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const chofer = await tx.chofer.findUnique({
      where: { id: choferId },
      include: { turnos: { where: { estado: 'ABIERTO' }, take: 1 } },
    });
    if (!chofer) throw new ErrorNegocio('CHOFER_NO_ENCONTRADO', 'El repartidor no existe.');

    if (chofer.turnos.length > 0) {
      throw new ErrorNegocio(
        'TURNO_YA_ABIERTO',
        `${chofer.nombre} tiene un turno abierto. Cierre su turno antes de desactivarlo.`,
      );
    }

    await tx.chofer.update({ where: { id: choferId }, data: { estado: 'INACTIVO' } });

    await registrarEvento(tx, {
      tipo: 'CHOFER_DESACTIVADO',
      cajeroId,
      choferId,
      entidadTipo: 'Chofer',
      entidadId: choferId,
      detalle: { nombre: chofer.nombre },
    });
  });
}

/** Vuelve a poner en servicio a un repartidor desactivado. */
export async function reactivarChofer(choferId: string, cajeroId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const chofer = await tx.chofer.findUnique({ where: { id: choferId } });
    if (!chofer) throw new ErrorNegocio('CHOFER_NO_ENCONTRADO', 'El repartidor no existe.');

    await tx.chofer.update({ where: { id: choferId }, data: { estado: 'ACTIVO' } });

    await registrarEvento(tx, {
      tipo: 'CHOFER_EDITADO',
      cajeroId,
      choferId,
      entidadTipo: 'Chofer',
      entidadId: choferId,
      detalle: { accion: 'REACTIVADO', nombre: chofer.nombre },
    });
  });
}

export async function listarChoferes(incluirInactivos = false) {
  return prisma.chofer.findMany({
    where: incluirInactivos ? {} : { estado: 'ACTIVO' },
    orderBy: [{ estado: 'asc' }, { nombre: 'asc' }],
  });
}

/** Ficha de repartidor para la pantalla de gestion. */
export interface ChoferConHistoria {
  id: string;
  idMeseroSoftRestaurant: string;
  nombre: string;
  fotoUrl: string | null;
  telefono: string | null;
  estado: string;
  tieneTurnoAbierto: boolean;
  turnosCerrados: number;
  /** Suma de faltantes y sobrantes de todos sus cierres, en centimos. */
  diferenciaAcumulada: number;
}

/**
 * Lista con lo que hace falta para decidir sobre cada repartidor: si esta en
 * turno (y por tanto no se puede desactivar) y como viene cuadrando.
 */
export async function listarChoferesConHistoria(): Promise<ChoferConHistoria[]> {
  const choferes = await prisma.chofer.findMany({
    orderBy: [{ estado: 'asc' }, { nombre: 'asc' }],
    include: {
      turnos: {
        select: {
          estado: true,
          cierre: { select: { diferencia: true } },
        },
      },
    },
  });

  return choferes.map((chofer) => {
    const cerrados = chofer.turnos.filter((t) => t.estado === 'CERRADO');
    return {
      id: chofer.id,
      idMeseroSoftRestaurant: chofer.idMeseroSoftRestaurant,
      nombre: chofer.nombre,
      fotoUrl: chofer.fotoUrl,
      telefono: chofer.telefono,
      estado: chofer.estado,
      tieneTurnoAbierto: chofer.turnos.some((t) => t.estado === 'ABIERTO'),
      turnosCerrados: cerrados.length,
      diferenciaAcumulada: cerrados.reduce((acc, t) => acc + (t.cierre?.diferencia ?? 0), 0),
    };
  });
}

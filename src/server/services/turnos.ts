/**
 * Turnos de chofer.
 *
 * "Estar en turno" es trabajar ESTA noche. Es distinto de "estar activo" en la
 * ficha del repartidor, que significa trabajar en el negocio. El dashboard
 * muestra solo a quien esta en turno, porque no todos trabajan todos los dias
 * y una pantalla con las quince tarjetas del padron no sirve de nada a la una
 * de la manana.
 *
 * Un turno se abre de dos maneras:
 *
 *   1. El cajero marca la entrada cuando el repartidor llega. Es el camino
 *      normal y el que decide quien aparece en pantalla.
 *   2. Solo, si llega un abono de alguien que no habia entrado. Es la red de
 *      seguridad: el dinero nunca se queda sin donde registrarse porque a
 *      alguien se le olvido marcar la entrada.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';

export type TurnoConChofer = Prisma.TurnoChoferGetPayload<{ include: { chofer: true } }>;

/**
 * Devuelve el turno abierto del chofer, creandolo si no existe.
 *
 * La unicidad la impone el indice unico sobre candadoTurnoAbierto, no este
 * codigo: si dos cajas abonan al mismo chofer en el mismo instante, una de las
 * dos recibe una violacion de unicidad y vuelve a leer el turno que gano.
 */
export async function obtenerOAbrirTurno(
  tx: Prisma.TransactionClient,
  choferId: string,
): Promise<TurnoConChofer> {
  const chofer = await tx.chofer.findUnique({ where: { id: choferId } });
  if (!chofer) {
    throw new ErrorNegocio('CHOFER_NO_ENCONTRADO', 'El repartidor no existe.');
  }
  if (chofer.estado !== 'ACTIVO') {
    throw new ErrorNegocio(
      'CHOFER_INACTIVO',
      `${chofer.nombre} esta inactivo. Reactivelo en Gestion de Choferes antes de recibirle dinero.`,
    );
  }

  const abierto = await tx.turnoChofer.findFirst({
    where: { choferId, estado: 'ABIERTO' },
    include: { chofer: true },
  });
  if (abierto) return abierto;

  try {
    return await tx.turnoChofer.create({
      data: { choferId, candadoTurnoAbierto: choferId },
      include: { chofer: true },
    });
  } catch {
    // Otra caja gano la carrera. El turno que creo esa caja es el bueno.
    const ganador = await tx.turnoChofer.findFirst({
      where: { choferId, estado: 'ABIERTO' },
      include: { chofer: true },
    });
    if (!ganador) {
      throw new ErrorNegocio(
        'TURNO_NO_ABIERTO',
        'No se pudo abrir el turno del repartidor. Intente de nuevo.',
      );
    }
    return ganador;
  }
}

/** Turno abierto del chofer, o error si no tiene. */
export async function exigirTurnoAbierto(
  tx: Prisma.TransactionClient,
  choferId: string,
): Promise<TurnoConChofer> {
  const turno = await tx.turnoChofer.findFirst({
    where: { choferId, estado: 'ABIERTO' },
    include: { chofer: true },
  });
  if (!turno) {
    throw new ErrorNegocio(
      'TURNO_NO_ABIERTO',
      'El repartidor no tiene un turno abierto. No hay nada que cerrar.',
    );
  }
  return turno;
}

/** Marca el turno como cerrado y libera el candado de unicidad. */
export async function marcarTurnoCerrado(
  tx: Prisma.TransactionClient,
  turnoId: string,
  momento: Date,
): Promise<void> {
  await tx.turnoChofer.update({
    where: { id: turnoId },
    data: { estado: 'CERRADO', fechaCierre: momento, candadoTurnoAbierto: null },
  });
}

/** Turnos abiertos, para la pantalla de cierre con seleccion multiple. */
export async function turnosAbiertos(): Promise<TurnoConChofer[]> {
  return prisma.turnoChofer.findMany({
    where: { estado: 'ABIERTO' },
    include: { chofer: true },
    orderBy: { chofer: { nombre: 'asc' } },
  });
}

// ---------------------------------------------------------------------------
// Entrada y salida de turno
// ---------------------------------------------------------------------------

/**
 * Repartidores que trabajan en el negocio pero todavia no entraron hoy.
 *
 * "Activo" en la ficha del repartidor significa que trabaja aqui; estar en
 * turno significa que trabaja ESTA noche. Son cosas distintas y el dashboard
 * solo muestra la segunda.
 */
export async function choferesDisponiblesParaTurno(): Promise<
  Array<{ id: string; nombre: string; idMeseroSoftRestaurant: string; fotoUrl: string | null }>
> {
  return prisma.chofer.findMany({
    where: { estado: 'ACTIVO', turnos: { none: { estado: 'ABIERTO' } } },
    select: { id: true, nombre: true, idMeseroSoftRestaurant: true, fotoUrl: true },
    orderBy: { nombre: 'asc' },
  });
}

/**
 * Marca la entrada de un repartidor, sin que medie dinero.
 *
 * El cajero lo usa al empezar la noche y cada vez que llega alguien en hora
 * pico. Que el turno exista desde la entrada tambien resuelve el caso del
 * repartidor que no abona nada y entrega todo junto al final: al cierre ya
 * tiene turno que cerrar.
 */
export async function abrirTurnoManual(
  choferId: string,
  cajeroId: string,
  dispositivo?: string,
): Promise<{ turnoId: string; nombre: string; yaEstaba: boolean }> {
  return prisma.$transaction(async (tx) => {
    const yaAbierto = await tx.turnoChofer.findFirst({
      where: { choferId, estado: 'ABIERTO' },
      include: { chofer: true },
    });
    if (yaAbierto) {
      return { turnoId: yaAbierto.id, nombre: yaAbierto.chofer.nombre, yaEstaba: true };
    }

    const turno = await obtenerOAbrirTurno(tx, choferId);

    await registrarEvento(tx, {
      tipo: 'TURNO_ABIERTO',
      cajeroId,
      choferId,
      entidadTipo: 'TurnoChofer',
      entidadId: turno.id,
      dispositivo,
      detalle: { nombre: turno.chofer.nombre, origen: 'ENTRADA_MANUAL' },
    });

    return { turnoId: turno.id, nombre: turno.chofer.nombre, yaEstaba: false };
  });
}

/**
 * Deshace una entrada marcada por error.
 *
 * Solo funciona si el turno no recibio dinero. En cuanto hay un abono, el
 * turno deja de ser un error de digitacion y pasa a ser un movimiento de caja:
 * se cierra por la pantalla de cierre, no se borra.
 */
export async function cancelarTurnoVacio(
  choferId: string,
  cajeroId: string,
  dispositivo?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const turno = await tx.turnoChofer.findFirst({
      where: { choferId, estado: 'ABIERTO' },
      include: { chofer: true, abonos: { select: { id: true } } },
    });
    if (!turno) {
      throw new ErrorNegocio('TURNO_NO_ABIERTO', 'Ese repartidor no esta en turno.');
    }
    if (turno.abonos.length > 0) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `${turno.chofer.nombre} ya entrego dinero en este turno. Cierrelo desde la pantalla de cierre en vez de quitarlo.`,
      );
    }

    await tx.turnoChofer.delete({ where: { id: turno.id } });

    await registrarEvento(tx, {
      tipo: 'TURNO_CANCELADO',
      cajeroId,
      choferId,
      entidadTipo: 'TurnoChofer',
      entidadId: turno.id,
      dispositivo,
      detalle: { nombre: turno.chofer.nombre, motivo: 'ENTRADA_MARCADA_POR_ERROR' },
    });
  });
}

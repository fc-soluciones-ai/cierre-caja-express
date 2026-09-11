/**
 * Saldos derivados.
 *
 * Ninguna de estas cifras esta almacenada: todas se calculan sumando los
 * movimientos. Es la contrapartida de la regla de no guardar acumulados, y lo
 * que hace que anular un abono corrija el widget de caja sin ningun trabajo
 * extra.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { diaOperativoDe, rangoDiaOperativo } from '@/lib/fechas';

type Cliente = Prisma.TransactionClient | typeof prisma;

/**
 * Suma de los abonos de un turno. Las filas de reverso llevan monto negativo,
 * asi que un abono anulado desaparece del saldo sin tratamiento especial.
 */
export async function saldoAbonosDeTurno(
  turnoChoferId: string,
  cliente: Cliente = prisma,
): Promise<{ total: number; cantidad: number }> {
  const [suma, cantidad] = await Promise.all([
    cliente.abonoEfectivo.aggregate({
      where: { turnoChoferId },
      _sum: { montoAbonado: true },
    }),
    // Solo se cuentan los abonos efectivos: los reversos y los anulados no
    // son entregas que el repartidor haya hecho.
    cliente.abonoEfectivo.count({
      where: { turnoChoferId, montoAbonado: { gt: 0 }, anuladoPorId: null },
    }),
  ]);
  return { total: suma._sum.montoAbonado ?? 0, cantidad };
}

/**
 * Efectivo que deberia haber en la caja para un dia operativo: todo lo que
 * entro por abonos parciales mas lo entregado en los cierres.
 */
export async function efectivoTeoricoEnCaja(
  dia: string = diaOperativoDe(),
  cliente: Cliente = prisma,
): Promise<{
  diaOperativo: string;
  totalAbonos: number;
  totalEntregasCierre: number;
  total: number;
}> {
  const { desde, hasta } = rangoDiaOperativo(dia);

  const [abonos, cierres] = await Promise.all([
    cliente.abonoEfectivo.aggregate({
      where: { timestamp: { gte: desde, lt: hasta } },
      _sum: { montoAbonado: true },
    }),
    cliente.cierreChofer.aggregate({
      where: { timestampCierre: { gte: desde, lt: hasta } },
      _sum: { efectivoEntregado: true },
    }),
  ]);

  const totalAbonos = abonos._sum.montoAbonado ?? 0;
  const totalEntregasCierre = cierres._sum.efectivoEntregado ?? 0;

  return {
    diaOperativo: dia,
    totalAbonos,
    totalEntregasCierre,
    total: totalAbonos + totalEntregasCierre,
  };
}

/** Datos que alimentan la grilla de choferes del dashboard. */
export interface ResumenChoferTurno {
  choferId: string;
  nombre: string;
  idMeseroSoftRestaurant: string;
  fotoUrl: string | null;
  turnoId: string;
  fechaApertura: Date;
  saldoAbonos: number;
  cantidadAbonos: number;
}

/**
 * Repartidores que estan en turno ahora mismo.
 *
 * Solo estos aparecen en el dashboard. Los que trabajan en el negocio pero no
 * entraron hoy salen de choferesDisponiblesParaTurno, en el modal de entrada.
 */
export async function resumenChoferesEnTurno(
  cliente: Cliente = prisma,
): Promise<ResumenChoferTurno[]> {
  const turnos = await cliente.turnoChofer.findMany({
    where: { estado: 'ABIERTO' },
    orderBy: { fechaApertura: 'asc' },
    include: {
      chofer: true,
      abonos: { select: { montoAbonado: true, anuladoPorId: true } },
    },
  });

  return turnos.map((turno) => ({
    choferId: turno.choferId,
    nombre: turno.chofer.nombre,
    idMeseroSoftRestaurant: turno.chofer.idMeseroSoftRestaurant,
    fotoUrl: turno.chofer.fotoUrl,
    turnoId: turno.id,
    fechaApertura: turno.fechaApertura,
    saldoAbonos: turno.abonos.reduce((acc, a) => acc + a.montoAbonado, 0),
    cantidadAbonos: turno.abonos.filter((a) => a.montoAbonado > 0 && a.anuladoPorId === null)
      .length,
  }));
}

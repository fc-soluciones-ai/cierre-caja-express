/**
 * Lo que un repartidor ve de si mismo.
 *
 * Todas las consultas de aqui filtran por el id que viene de SU sesion, nunca
 * por uno que llegue de la pantalla. Es la diferencia entre "solo ve lo suyo"
 * y "ve lo de cualquiera que sepa cambiar un numero en la direccion".
 *
 * No hay nada que escriba en este archivo, y es a proposito: el repartidor
 * consulta, no registra. El dinero lo recibe la caja y lo firma un usuario.
 */

import { diaOperativoDe, rangoDiaOperativo } from '@/lib/fechas';
import { prisma } from '@/lib/db/prisma';
import { alertasDeFlota, type AlertaMoto } from '@/server/services/mantenimiento';

export interface ResumenDelRepartidor {
  diaOperativo: string;
  /** Hay un turno abierto ahora mismo. */
  enTurno: boolean;
  /** Centimos entregados en el turno abierto, o cero si no hay turno. */
  entregadoEnTurno: number;
  cantidadAbonos: number;
  /** Centimos entregados en todo el dia operativo, turnos cerrados incluidos. */
  entregadoHoy: number;
  /** Cada entrega del turno, de la mas reciente a la mas vieja. */
  entregas: Array<{ id: string; monto: number; hora: Date; anulado: boolean }>;
  /** Lo que el POS dice que vendio hoy, si ya se importo el Excel. */
  ventas: { importe: number; efectivo: number; viajes: number } | null;
  /** Su moto de hoy, si trae alguna. */
  moto: {
    placa: string;
    marca: string;
    modelo: string;
    kilometraje: number;
    estado: string;
    prestada: boolean;
    alertas: AlertaMoto[];
  } | null;
}

export async function resumenDelRepartidor(
  choferId: string,
): Promise<ResumenDelRepartidor> {
  const dia = diaOperativoDe();
  const { desde, hasta } = rangoDiaOperativo(dia);

  const turnoAbierto = await prisma.turnoChofer.findFirst({
    where: { choferId, estado: 'ABIERTO' },
    include: {
      abonos: {
        orderBy: { timestamp: 'desc' },
        select: { id: true, montoAbonado: true, timestamp: true, anuladoPorId: true },
      },
    },
  });

  // El total del dia suma todos los turnos de la jornada, no solo el abierto:
  // si al repartidor ya le cerraron uno y volvio a salir, lo entregado antes
  // sigue siendo suyo.
  const delDia = await prisma.abonoEfectivo.aggregate({
    where: { turno: { choferId }, timestamp: { gte: desde, lt: hasta } },
    _sum: { montoAbonado: true },
  });

  const venta = await prisma.ventaChoferExcel.aggregate({
    where: { choferId, carga: { diaOperativo: dia } },
    _sum: { importeTotal: true, efectivo: true, viajes: true },
  });

  const asignacion = await prisma.asignacionMoto.findFirst({
    where: { choferId, fechaFin: null },
    include: { moto: true },
  });

  let moto: ResumenDelRepartidor['moto'] = null;
  if (asignacion) {
    const todas = await alertasDeFlota();
    moto = {
      placa: asignacion.moto.placa,
      marca: asignacion.moto.marca,
      modelo: asignacion.moto.modelo,
      kilometraje: asignacion.moto.kilometrajeActual,
      estado: asignacion.moto.estado,
      prestada: asignacion.tipo === 'COMODIN',
      alertas: todas.filter((a) => a.placa === asignacion.moto.placa),
    };
  }

  // Los abonos anulados se reconocen por tener un reverso enlazado; el reverso
  // en si es la fila de monto negativo y no se muestra como una entrega mas.
  const entregas = (turnoAbierto?.abonos ?? [])
    .filter((a) => a.montoAbonado > 0)
    .map((a) => ({
      id: a.id,
      monto: a.montoAbonado,
      hora: a.timestamp,
      anulado: a.anuladoPorId !== null,
    }));

  return {
    diaOperativo: dia,
    enTurno: Boolean(turnoAbierto),
    entregadoEnTurno: (turnoAbierto?.abonos ?? []).reduce((t, a) => t + a.montoAbonado, 0),
    cantidadAbonos: entregas.filter((e) => !e.anulado).length,
    entregadoHoy: delDia._sum.montoAbonado ?? 0,
    entregas,
    ventas:
      venta._sum.importeTotal === null
        ? null
        : {
            importe: venta._sum.importeTotal ?? 0,
            efectivo: venta._sum.efectivo ?? 0,
            viajes: venta._sum.viajes ?? 0,
          },
    moto,
  };
}

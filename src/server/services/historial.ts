/**
 * Modulo 5: historial, auditoria y reporteria.
 *
 * La fuente es eventos_auditoria, que es append-only. No hay una sola escritura
 * en este archivo: aqui solo se lee. Cualquier "correccion" del historial
 * tendria que ser un evento nuevo, nunca la edicion de uno viejo.
 *
 * Las metricas consolidadas NO salen de la bitacora sino de las tablas de
 * cierre, porque un evento guarda el monto de su movimiento y no el desglose
 * por medio de pago. Sumar eventos daria el efectivo, pero nunca la tarjeta ni
 * el SINPE.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { rangoDiaOperativo } from '@/lib/fechas';
import type { TipoEvento } from '@/types/enums';

export interface FiltrosHistorial {
  /** Inclusivo. */
  desde?: Date;
  /** Exclusivo. */
  hasta?: Date;
  choferId?: string;
  cajeroId?: string;
  tipos?: TipoEvento[];
  limite?: number;
  /** Id del ultimo evento de la pagina anterior. */
  cursor?: string;
}

export interface FilaHistorial {
  id: string;
  timestamp: Date;
  tipo: string;
  monto: number | null;
  cajeroNombre: string | null;
  choferNombre: string | null;
  entidadTipo: string | null;
  entidadId: string | null;
  dispositivo: string | null;
  detalle: Record<string, unknown> | null;
  /** Tiquete asociado, si el movimiento genero uno. */
  tiqueteId: string | null;
}

const LIMITE_POR_DEFECTO = 100;
const LIMITE_MAXIMO = 500;

function condiciones(filtros: FiltrosHistorial): Prisma.EventoAuditoriaWhereInput {
  const where: Prisma.EventoAuditoriaWhereInput = {};

  if (filtros.desde || filtros.hasta) {
    where.timestamp = {
      ...(filtros.desde ? { gte: filtros.desde } : {}),
      ...(filtros.hasta ? { lt: filtros.hasta } : {}),
    };
  }
  if (filtros.choferId) where.choferId = filtros.choferId;
  if (filtros.cajeroId) where.cajeroId = filtros.cajeroId;
  if (filtros.tipos && filtros.tipos.length > 0) where.tipo = { in: [...filtros.tipos] };

  return where;
}

/**
 * Resuelve de un tiron el tiquete de cada evento que tenga uno.
 *
 * Se hace en tres consultas agrupadas por tipo de entidad en vez de una por
 * fila: con cien eventos en pantalla, lo segundo serian cien viajes a la base
 * cada vez que el cajero cambia un filtro.
 */
async function tiquetesDeEventos(
  eventos: ReadonlyArray<{ entidadTipo: string | null; entidadId: string | null }>,
): Promise<Map<string, string>> {
  const porTipo = {
    AbonoEfectivo: [] as string[],
    CierreChofer: [] as string[],
    ArqueoCaja: [] as string[],
  };

  for (const evento of eventos) {
    if (!evento.entidadId) continue;
    if (evento.entidadTipo === 'AbonoEfectivo') porTipo.AbonoEfectivo.push(evento.entidadId);
    else if (evento.entidadTipo === 'CierreChofer') porTipo.CierreChofer.push(evento.entidadId);
    else if (evento.entidadTipo === 'ArqueoCaja') porTipo.ArqueoCaja.push(evento.entidadId);
  }

  const tiquetes = await prisma.tiquete.findMany({
    where: {
      OR: [
        { abonoId: { in: porTipo.AbonoEfectivo } },
        { cierreChoferId: { in: porTipo.CierreChofer } },
        { arqueoCajaId: { in: porTipo.ArqueoCaja } },
      ],
    },
    select: { id: true, abonoId: true, cierreChoferId: true, arqueoCajaId: true },
    orderBy: { createdAt: 'asc' },
  });

  const mapa = new Map<string, string>();
  for (const tiquete of tiquetes) {
    const clave = tiquete.abonoId ?? tiquete.cierreChoferId ?? tiquete.arqueoCajaId;
    if (clave && !mapa.has(clave)) mapa.set(clave, tiquete.id);
  }
  return mapa;
}

export async function consultarHistorial(
  filtros: FiltrosHistorial = {},
): Promise<{ filas: FilaHistorial[]; hayMas: boolean }> {
  const limite = Math.min(filtros.limite ?? LIMITE_POR_DEFECTO, LIMITE_MAXIMO);

  const eventos = await prisma.eventoAuditoria.findMany({
    where: condiciones(filtros),
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: limite + 1,
    ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    include: { cajero: { select: { nombre: true } } },
  });

  const hayMas = eventos.length > limite;
  const pagina = hayMas ? eventos.slice(0, limite) : eventos;

  const idsChofer = [...new Set(pagina.map((e) => e.choferId).filter((id): id is string => !!id))];
  const [choferes, tiquetes] = await Promise.all([
    idsChofer.length > 0
      ? prisma.chofer.findMany({
          where: { id: { in: idsChofer } },
          select: { id: true, nombre: true },
        })
      : Promise.resolve([]),
    tiquetesDeEventos(pagina),
  ]);
  const nombrePorChofer = new Map(choferes.map((c) => [c.id, c.nombre]));

  const filas: FilaHistorial[] = pagina.map((evento) => {
    let detalle: Record<string, unknown> | null = null;
    if (evento.detalle) {
      try {
        detalle = JSON.parse(evento.detalle) as Record<string, unknown>;
      } catch {
        detalle = { crudo: evento.detalle };
      }
    }

    return {
      id: evento.id,
      timestamp: evento.timestamp,
      tipo: evento.tipo,
      monto: evento.monto,
      cajeroNombre: evento.cajero?.nombre ?? null,
      choferNombre: evento.choferId ? (nombrePorChofer.get(evento.choferId) ?? null) : null,
      entidadTipo: evento.entidadTipo,
      entidadId: evento.entidadId,
      dispositivo: evento.dispositivo,
      detalle,
      tiqueteId: evento.entidadId ? (tiquetes.get(evento.entidadId) ?? null) : null,
    };
  });

  return { filas, hayMas };
}

// ---------------------------------------------------------------------------
// Metricas consolidadas
// ---------------------------------------------------------------------------

export interface MetricasHistorial {
  /** Efectivo que el POS dice que se vendio, segun los cierres del rango. */
  efectivoEsperado: number;
  tarjeta: number;
  sinpe: number;
  viajes: number;
  /** Efectivo que realmente entro a la caja. */
  abonosParciales: number;
  entregasEnCierre: number;
  /** Suma de las diferencias. Positiva = sobrante neto. */
  diferenciaNeta: number;
  faltantes: number;
  sobrantes: number;
  cantidadCierres: number;
  cantidadAbonos: number;
}

export async function metricasHistorial(
  filtros: Pick<FiltrosHistorial, 'desde' | 'hasta' | 'choferId'> = {},
): Promise<MetricasHistorial> {
  const rangoCierre: Prisma.CierreChoferWhereInput = {
    ...(filtros.desde || filtros.hasta
      ? {
          timestampCierre: {
            ...(filtros.desde ? { gte: filtros.desde } : {}),
            ...(filtros.hasta ? { lt: filtros.hasta } : {}),
          },
        }
      : {}),
    ...(filtros.choferId ? { turno: { choferId: filtros.choferId } } : {}),
  };

  const rangoAbono: Prisma.AbonoEfectivoWhereInput = {
    ...(filtros.desde || filtros.hasta
      ? {
          timestamp: {
            ...(filtros.desde ? { gte: filtros.desde } : {}),
            ...(filtros.hasta ? { lt: filtros.hasta } : {}),
          },
        }
      : {}),
    ...(filtros.choferId ? { turno: { choferId: filtros.choferId } } : {}),
  };

  const [cierres, abonos, cantidadAbonos] = await Promise.all([
    prisma.cierreChofer.findMany({
      where: rangoCierre,
      select: {
        efectivoEsperado: true,
        tarjetaEsperada: true,
        sinpeEsperado: true,
        viajesTotales: true,
        abonosParciales: true,
        efectivoEntregado: true,
        diferencia: true,
      },
    }),
    prisma.abonoEfectivo.aggregate({
      where: rangoAbono,
      _sum: { montoAbonado: true },
    }),
    prisma.abonoEfectivo.count({
      where: { ...rangoAbono, montoAbonado: { gt: 0 }, anuladoPorId: null },
    }),
  ]);

  const base: MetricasHistorial = {
    efectivoEsperado: 0,
    tarjeta: 0,
    sinpe: 0,
    viajes: 0,
    // Los abonos se toman del rango completo, no solo de los turnos ya
    // cerrados: en medio de la jornada hay dinero recibido sin cierre aun.
    abonosParciales: abonos._sum.montoAbonado ?? 0,
    entregasEnCierre: 0,
    diferenciaNeta: 0,
    faltantes: 0,
    sobrantes: 0,
    cantidadCierres: cierres.length,
    cantidadAbonos,
  };

  for (const cierre of cierres) {
    base.efectivoEsperado += cierre.efectivoEsperado;
    base.tarjeta += cierre.tarjetaEsperada;
    base.sinpe += cierre.sinpeEsperado;
    base.viajes += cierre.viajesTotales;
    base.entregasEnCierre += cierre.efectivoEntregado;
    base.diferenciaNeta += cierre.diferencia;
    if (cierre.diferencia < 0) base.faltantes += -cierre.diferencia;
    else base.sobrantes += cierre.diferencia;
  }

  return base;
}

/** Rango de un dia operativo, para el filtro rapido de "hoy". */
export function rangoDeDia(dia: string): { desde: Date; hasta: Date } {
  return rangoDiaOperativo(dia);
}

/** Repartidores y cajeros para poblar los selectores del filtro. */
export async function opcionesDeFiltro(): Promise<{
  choferes: Array<{ id: string; nombre: string }>;
  cajeros: Array<{ id: string; nombre: string }>;
}> {
  const [choferes, cajeros] = await Promise.all([
    prisma.chofer.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.cajero.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
  ]);
  return { choferes, cajeros };
}

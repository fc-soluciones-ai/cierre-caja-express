/**
 * Gastos y servicios de la flota: gasolina, taller, repuestos, seguro.
 *
 * El costo va en centimos enteros, igual que el resto del dinero del sistema.
 * El kilometraje va en kilometros enteros: un odometro no muestra fracciones y
 * un decimal aqui solo aportaria error de redondeo al costo por kilometro.
 */

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { normalizarPlaca } from '@/server/services/motos';
import type { CategoriaMantenimiento, TipoMantenimiento } from '@/types/enums';

/**
 * Cada cuantos kilometros toca cada servicio.
 *
 * Son los intervalos que pidio el negocio. Viven aqui y no en la base porque
 * cambian una vez cada varios anios; cuando cambien, se edita este objeto.
 */
export const INTERVALOS_KM: Partial<Record<CategoriaMantenimiento, number>> = {
  CAMBIO_ACEITE: 2_000,
  FRENOS: 10_000,
  LLANTAS: 10_000,
};

/** A partir de que porcentaje del intervalo se avisa que "ya casi". */
const UMBRAL_AVISO = 0.85;

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export interface EntradaMantenimiento {
  placa: string;
  tipo: TipoMantenimiento;
  categoria: CategoriaMantenimiento;
  /** Centimos. Cero es valido: una revision en garantia no cuesta nada. */
  costoTotal: number;
  /** Kilometros enteros del odometro al momento del evento. */
  kilometrajeEvento: number;
  descripcion?: string;
  tallerOProveedor?: string;
  comprobanteUrl?: string;
  cajeroId: string;
  claveIdempotencia?: string;
}

export interface ResultadoMantenimiento {
  id: string;
  placa: string;
  kilometrajeActualizado: number;
  repetido: boolean;
}

/**
 * Registra un gasto y actualiza el kilometraje de la moto.
 *
 * El kilometraje del evento NO puede ser menor al que ya tenia la moto. Es la
 * validacion que mas veces va a saltar y la que mas sirve: si alguien teclea
 * 2.000 donde iban 20.000, el costo por kilometro de esa moto queda absurdo y
 * la alerta de cambio de aceite se dispara para siempre.
 */
export async function registrarMantenimiento(
  entrada: EntradaMantenimiento,
): Promise<ResultadoMantenimiento> {
  const placa = normalizarPlaca(entrada.placa);

  if (!Number.isInteger(entrada.costoTotal) || entrada.costoTotal < 0) {
    throw new ErrorNegocio('MONTO_INVALIDO', 'El costo debe venir en centimos enteros, sin negativos.');
  }
  if (!Number.isInteger(entrada.kilometrajeEvento) || entrada.kilometrajeEvento < 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El kilometraje debe ser un numero entero de kilometros.');
  }

  if (entrada.claveIdempotencia) {
    const previo = await prisma.registroMantenimiento.findUnique({
      where: { claveIdempotencia: entrada.claveIdempotencia },
    });
    if (previo) {
      const moto = await prisma.motocicleta.findUnique({ where: { placa: previo.placa } });
      return {
        id: previo.id,
        placa: previo.placa,
        kilometrajeActualizado: moto?.kilometrajeActual ?? previo.kilometrajeEvento,
        repetido: true,
      };
    }
  }

  return prisma.$transaction(async (tx) => {
    const moto = await tx.motocicleta.findUnique({ where: { placa } });
    if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${placa}.`);

    if (entrada.kilometrajeEvento < moto.kilometrajeActual) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `La moto ${placa} ya marcaba ${moto.kilometrajeActual.toLocaleString('es-CR')} km. ` +
          'Revise el numero del odometro.',
      );
    }

    const registro = await tx.registroMantenimiento.create({
      data: {
        placa,
        tipo: entrada.tipo,
        categoria: entrada.categoria,
        costoTotal: entrada.costoTotal,
        kilometrajeEvento: entrada.kilometrajeEvento,
        descripcion: entrada.descripcion ?? null,
        tallerOProveedor: entrada.tallerOProveedor ?? null,
        comprobanteUrl: entrada.comprobanteUrl ?? null,
        cajeroId: entrada.cajeroId,
        claveIdempotencia: entrada.claveIdempotencia ?? null,
      },
    });

    await tx.motocicleta.update({
      where: { placa },
      data: { kilometrajeActual: entrada.kilometrajeEvento },
    });

    // Quien traia la moto queda anotado, para poder repartir el gasto por
    // chofer mas adelante sin tener que reconstruirlo de memoria.
    const asignacion = await tx.asignacionMoto.findFirst({
      where: { placa, fechaFin: null },
      select: { choferId: true },
    });

    await registrarEvento(tx, {
      tipo: 'MANTENIMIENTO',
      cajeroId: entrada.cajeroId,
      choferId: asignacion?.choferId ?? null,
      entidadTipo: 'RegistroMantenimiento',
      entidadId: registro.id,
      monto: entrada.costoTotal,
      detalle: {
        placa,
        categoria: entrada.categoria,
        tipo: entrada.tipo,
        kilometraje: entrada.kilometrajeEvento,
        proveedor: entrada.tallerOProveedor ?? null,
      },
    });

    return {
      id: registro.id,
      placa,
      kilometrajeActualizado: entrada.kilometrajeEvento,
      repetido: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Alertas por kilometraje
// ---------------------------------------------------------------------------

export interface AlertaMoto {
  placa: string;
  categoria: CategoriaMantenimiento;
  intervalo: number;
  /** Kilometraje del ultimo servicio de esa categoria, o null si nunca hubo. */
  ultimoKm: number | null;
  kmDesdeUltimo: number;
  /** Negativo cuando ya se paso. */
  kmRestantes: number;
  nivel: 'VENCIDO' | 'PROXIMO';
}

/**
 * Que servicios tiene pendientes cada moto.
 *
 * Si una moto nunca tuvo un servicio de una categoria, se cuenta desde cero:
 * una moto con 30.000 km y ningun cambio de aceite registrado esta vencida,
 * no exenta.
 */
export async function alertasDeFlota(): Promise<AlertaMoto[]> {
  const motos = await prisma.motocicleta.findMany({
    where: { estado: { not: 'FUERA_DE_SERVICIO' } },
    select: { placa: true, kilometrajeActual: true },
  });

  const alertas: AlertaMoto[] = [];

  for (const moto of motos) {
    for (const [categoria, intervalo] of Object.entries(INTERVALOS_KM)) {
      if (!intervalo) continue;

      const ultimo = await prisma.registroMantenimiento.findFirst({
        where: { placa: moto.placa, categoria },
        orderBy: { kilometrajeEvento: 'desc' },
        select: { kilometrajeEvento: true },
      });

      const ultimoKm = ultimo?.kilometrajeEvento ?? null;
      const kmDesdeUltimo = moto.kilometrajeActual - (ultimoKm ?? 0);
      const kmRestantes = intervalo - kmDesdeUltimo;

      if (kmRestantes <= 0) {
        alertas.push({
          placa: moto.placa,
          categoria: categoria as CategoriaMantenimiento,
          intervalo,
          ultimoKm,
          kmDesdeUltimo,
          kmRestantes,
          nivel: 'VENCIDO',
        });
      } else if (kmDesdeUltimo >= intervalo * UMBRAL_AVISO) {
        alertas.push({
          placa: moto.placa,
          categoria: categoria as CategoriaMantenimiento,
          intervalo,
          ultimoKm,
          kmDesdeUltimo,
          kmRestantes,
          nivel: 'PROXIMO',
        });
      }
    }
  }

  // Lo vencido primero, y dentro de eso lo mas atrasado.
  return alertas.sort((a, b) => a.kmRestantes - b.kmRestantes);
}

// ---------------------------------------------------------------------------
// Reporteria
// ---------------------------------------------------------------------------

export interface FiltrosFlota {
  placa?: string;
  desde?: Date;
  hasta?: Date;
  categoria?: CategoriaMantenimiento;
}

export interface ResumenPorMoto {
  placa: string;
  marca: string;
  modelo: string;
  estado: string;
  kilometrajeActual: number;
  /** Centimos, por categoria. */
  gastoPorCategoria: Record<string, number>;
  gastoTotal: number;
  cantidadRegistros: number;
  /**
   * Kilometros que cubren los registros del periodo: del odometro mas bajo al
   * mas alto. Con un solo registro no hay recorrido medible y vale cero.
   */
  kmRecorridos: number;
  /**
   * Centimos por kilometro. Null cuando no hay recorrido con el que dividir,
   * que es distinto de cero: cero significaria que rodar no cuesta nada.
   */
  costoPorKm: number | null;
}

/**
 * Gasto por moto en un periodo, con el costo por kilometro.
 *
 * El recorrido sale del rango de odometro que cubren los propios registros, no
 * del kilometraje actual de la moto: mezclar ambos daria un costo por
 * kilometro que reparte el gasto de un mes entre los kilometros de toda la
 * vida de la moto.
 */
export async function resumenDeFlota(filtros: FiltrosFlota = {}): Promise<ResumenPorMoto[]> {
  const placa = filtros.placa ? normalizarPlaca(filtros.placa) : undefined;

  const motos = await prisma.motocicleta.findMany({
    where: placa ? { placa } : {},
    orderBy: [{ esComodin: 'asc' }, { placa: 'asc' }],
  });

  const registros = await prisma.registroMantenimiento.findMany({
    where: {
      ...(placa ? { placa } : {}),
      ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            timestamp: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lt: filtros.hasta } : {}),
            },
          }
        : {}),
    },
    orderBy: { timestamp: 'asc' },
  });

  return motos.map((moto) => {
    const propios = registros.filter((r) => r.placa === moto.placa);

    const gastoPorCategoria: Record<string, number> = {};
    let gastoTotal = 0;
    for (const registro of propios) {
      gastoPorCategoria[registro.categoria] =
        (gastoPorCategoria[registro.categoria] ?? 0) + registro.costoTotal;
      gastoTotal += registro.costoTotal;
    }

    const kilometrajes = propios.map((r) => r.kilometrajeEvento);
    const kmRecorridos =
      kilometrajes.length > 1 ? Math.max(...kilometrajes) - Math.min(...kilometrajes) : 0;

    return {
      placa: moto.placa,
      marca: moto.marca,
      modelo: moto.modelo,
      estado: moto.estado,
      kilometrajeActual: moto.kilometrajeActual,
      gastoPorCategoria,
      gastoTotal,
      cantidadRegistros: propios.length,
      kmRecorridos,
      costoPorKm: kmRecorridos > 0 ? Math.round(gastoTotal / kmRecorridos) : null,
    };
  });
}

export interface LineaHistorial {
  id: string;
  placa: string;
  timestamp: Date;
  tipo: string;
  categoria: string;
  descripcion: string | null;
  costoTotal: number;
  kilometrajeEvento: number;
  tallerOProveedor: string | null;
  comprobanteUrl: string | null;
  cajeroNombre: string;
}

/** Historial de gastos, para la tabla de reporteria. */
export async function historialDeFlota(
  filtros: FiltrosFlota = {},
  limite = 200,
): Promise<LineaHistorial[]> {
  const placa = filtros.placa ? normalizarPlaca(filtros.placa) : undefined;

  const registros = await prisma.registroMantenimiento.findMany({
    where: {
      ...(placa ? { placa } : {}),
      ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            timestamp: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lt: filtros.hasta } : {}),
            },
          }
        : {}),
    },
    orderBy: { timestamp: 'desc' },
    take: Math.min(limite, 500),
    include: { cajero: { select: { nombre: true } } },
  });

  return registros.map((r) => ({
    id: r.id,
    placa: r.placa,
    timestamp: r.timestamp,
    tipo: r.tipo,
    categoria: r.categoria,
    descripcion: r.descripcion,
    costoTotal: r.costoTotal,
    kilometrajeEvento: r.kilometrajeEvento,
    tallerOProveedor: r.tallerOProveedor,
    comprobanteUrl: r.comprobanteUrl,
    cajeroNombre: r.cajero.nombre,
  }));
}

/**
 * Flota de motocicletas: alta, estado y asignacion a choferes.
 *
 * LA REGLA DEL COMODIN, Y LOS TRES HUECOS QUE TENIA
 *
 * El requerimiento dice: cuando una moto cae al taller, la comodin pasa al
 * chofer afectado. Eso deja tres preguntas sin responder, y un sistema que no
 * las responda falla justo la noche que hace falta.
 *
 *   1. Si ya hay otra moto en el taller, la comodin esta prestada. Aqui el
 *      cambio de estado NO se bloquea (la moto rota es un hecho, no una
 *      opcion), pero el chofer queda sin moto y el sistema lo dice en voz
 *      alta en vez de fingir que lo resolvio.
 *
 *   2. Cuando la moto vuelve OPERATIVA hay que deshacer el prestamo, o la
 *      comodin se queda pegada con ese chofer para siempre y no sirve para la
 *      siguiente averia. Volver a OPERATIVA devuelve al chofer su moto y
 *      libera la comodin.
 *
 *   3. La comodin tambien se puede averiar. No se reemplaza a si misma: se
 *      registra y el chofer que la tenia queda sin moto, otra vez en voz alta.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import type { EstadoMoto } from '@/types/enums';

/**
 * Normaliza una placa: mayusculas, sin espacios ni guiones.
 *
 * La misma moto se escribe "mot 1234", "MOT-1234" y "mot1234" segun quien la
 * teclee. Sin normalizar, una moto acaba duplicada en la flota y su historial
 * de gastos repartido entre dos fichas.
 */
export function normalizarPlaca(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export interface MotoConAsignacion {
  placa: string;
  marca: string;
  modelo: string;
  anio: number;
  kilometrajeActual: number;
  esComodin: boolean;
  estado: string;
  fotoUrl: string | null;
  notas: string | null;
  tipoAceite: string | null;
  intervaloAceiteKm: number | null;
  medidaLlantaDelantera: string | null;
  medidaLlantaTrasera: string | null;
  presionLlantasPsi: string | null;
  frenoDelantero: string | null;
  frenoTrasero: string | null;
  medidaCadena: string | null;
  vencimientoRtv: Date | null;
  vencimientoSeguro: Date | null;
  tieneGps: boolean;
  gpsProveedor: string | null;
  gpsIdentificador: string | null;
  gpsCorreo: string | null;
  gpsNotas: string | null;
  gpsRevisadoEn: Date | null;
  /** Chofer que la trae hoy, si alguno. */
  choferId: string | null;
  choferNombre: string | null;
  tipoAsignacion: string | null;
  desde: Date | null;
}

function aVista(
  moto: Prisma.MotocicletaGetPayload<{
    include: { asignaciones: { include: { chofer: true } } };
  }>,
): MotoConAsignacion {
  const vigente = moto.asignaciones.find((a) => a.fechaFin === null) ?? null;
  return {
    placa: moto.placa,
    marca: moto.marca,
    modelo: moto.modelo,
    anio: moto.anio,
    kilometrajeActual: moto.kilometrajeActual,
    esComodin: moto.esComodin,
    estado: moto.estado,
    fotoUrl: moto.fotoUrl,
    notas: moto.notas,
    tipoAceite: moto.tipoAceite,
    intervaloAceiteKm: moto.intervaloAceiteKm,
    medidaLlantaDelantera: moto.medidaLlantaDelantera,
    medidaLlantaTrasera: moto.medidaLlantaTrasera,
    presionLlantasPsi: moto.presionLlantasPsi,
    frenoDelantero: moto.frenoDelantero,
    frenoTrasero: moto.frenoTrasero,
    medidaCadena: moto.medidaCadena,
    vencimientoRtv: moto.vencimientoRtv,
    vencimientoSeguro: moto.vencimientoSeguro,
    tieneGps: moto.tieneGps,
    gpsProveedor: moto.gpsProveedor,
    gpsIdentificador: moto.gpsIdentificador,
    gpsCorreo: moto.gpsCorreo,
    gpsNotas: moto.gpsNotas,
    gpsRevisadoEn: moto.gpsRevisadoEn,
    choferId: vigente?.choferId ?? null,
    choferNombre: vigente?.chofer.nombre ?? null,
    tipoAsignacion: vigente?.tipo ?? null,
    desde: vigente?.fechaInicio ?? null,
  };
}

export async function listarFlota(): Promise<MotoConAsignacion[]> {
  const motos = await prisma.motocicleta.findMany({
    orderBy: [{ esComodin: 'asc' }, { placa: 'asc' }],
    include: { asignaciones: { where: { fechaFin: null }, include: { chofer: true } } },
  });
  return motos.map(aVista);
}

export async function obtenerMoto(placa: string): Promise<MotoConAsignacion> {
  const moto = await prisma.motocicleta.findUnique({
    where: { placa: normalizarPlaca(placa) },
    include: { asignaciones: { where: { fechaFin: null }, include: { chofer: true } } },
  });
  if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${placa}.`);
  return aVista(moto);
}

/** Choferes activos que hoy no traen ninguna moto. */
export async function choferesSinMoto(): Promise<Array<{ id: string; nombre: string }>> {
  return prisma.chofer.findMany({
    where: { estado: 'ACTIVO', asignaciones: { none: { fechaFin: null } } },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Alta y edicion
// ---------------------------------------------------------------------------

export interface EntradaMoto {
  placa: string;
  marca: string;
  modelo: string;
  anio: number;
  kilometrajeActual: number;
  esComodin?: boolean;
  fotoUrl?: string;
  notas?: string;
  /** Ficha tecnica. Toda opcional: se llena cuando alguien la averigua. */
  ficha?: FichaTecnica;
}

/**
 * Las medidas de repuesto y los vencimientos de papeles de una moto.
 *
 * Las medidas son texto porque son designaciones, no cantidades: "2.75-18" o
 * "428H - 120 L" no se suman ni se comparan, se leen en el mostrador.
 */
export interface FichaTecnica {
  tipoAceite?: string | null;
  /** Cada cuantos km toca el aceite en ESTA moto. Sin valor, el general. */
  intervaloAceiteKm?: number | null;
  medidaLlantaDelantera?: string | null;
  medidaLlantaTrasera?: string | null;
  presionLlantasPsi?: string | null;
  frenoDelantero?: string | null;
  frenoTrasero?: string | null;
  medidaCadena?: string | null;
  vencimientoRtv?: Date | null;
  vencimientoSeguro?: Date | null;
}

/** Deja el texto listo para guardar: sin espacios sobrantes, y vacio es null. */
function texto(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

/**
 * Convierte la ficha en columnas para Prisma.
 *
 * Omite lo que venga como undefined, para que editar la pestana de datos
 * generales no borre la ficha tecnica que ya estaba llena.
 */
function columnasDeFicha(ficha: FichaTecnica | undefined) {
  if (!ficha) return {};

  if (
    ficha.intervaloAceiteKm !== undefined &&
    ficha.intervaloAceiteKm !== null &&
    (!Number.isInteger(ficha.intervaloAceiteKm) || ficha.intervaloAceiteKm <= 0)
  ) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'El intervalo de cambio de aceite debe ser un numero entero de kilometros mayor que cero.',
    );
  }

  const columnas: Record<string, unknown> = {};
  const poner = (clave: string, valor: unknown) => {
    if (valor !== undefined) columnas[clave] = valor;
  };

  poner('tipoAceite', texto(ficha.tipoAceite));
  poner('intervaloAceiteKm', ficha.intervaloAceiteKm);
  poner('medidaLlantaDelantera', texto(ficha.medidaLlantaDelantera));
  poner('medidaLlantaTrasera', texto(ficha.medidaLlantaTrasera));
  poner('presionLlantasPsi', texto(ficha.presionLlantasPsi));
  poner('frenoDelantero', texto(ficha.frenoDelantero));
  poner('frenoTrasero', texto(ficha.frenoTrasero));
  poner('medidaCadena', texto(ficha.medidaCadena));
  poner('vencimientoRtv', ficha.vencimientoRtv);
  poner('vencimientoSeguro', ficha.vencimientoSeguro);

  return columnas;
}

export async function crearMoto(entrada: EntradaMoto, cajeroId: string): Promise<{ placa: string }> {
  const placa = normalizarPlaca(entrada.placa);
  if (placa.length < 3) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La placa no parece valida.');
  }
  if (entrada.kilometrajeActual < 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El kilometraje no puede ser negativo.');
  }

  return prisma.$transaction(async (tx) => {
    const existente = await tx.motocicleta.findUnique({ where: { placa } });
    if (existente) {
      throw new ErrorNegocio('DATOS_INVALIDOS', `La placa ${placa} ya esta registrada.`);
    }

    // Una sola comodin. Con dos, el reemplazo automatico tendria que elegir y
    // nadie definio con que criterio.
    if (entrada.esComodin) {
      const otra = await tx.motocicleta.findFirst({ where: { esComodin: true } });
      if (otra) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          `Ya hay una moto comodin: ${otra.placa}. Quitele esa marca antes de poner otra.`,
        );
      }
    }

    await tx.motocicleta.create({
      data: {
        placa,
        marca: entrada.marca.trim(),
        modelo: entrada.modelo.trim(),
        anio: entrada.anio,
        kilometrajeActual: Math.round(entrada.kilometrajeActual),
        esComodin: entrada.esComodin ?? false,
        fotoUrl: entrada.fotoUrl ?? null,
        notas: entrada.notas ?? null,
        ...columnasDeFicha(entrada.ficha),
      },
    });

    await registrarEvento(tx, {
      tipo: 'MOTO_CREADA',
      cajeroId,
      entidadTipo: 'Motocicleta',
      entidadId: placa,
      detalle: { marca: entrada.marca, modelo: entrada.modelo, esComodin: entrada.esComodin ?? false },
    });

    return { placa };
  });
}

export async function editarMoto(
  placa: string,
  cambios: Partial<Omit<EntradaMoto, 'placa'>>,
  cajeroId: string,
): Promise<void> {
  const clave = normalizarPlaca(placa);

  await prisma.$transaction(async (tx) => {
    const moto = await tx.motocicleta.findUnique({ where: { placa: clave } });
    if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${clave}.`);

    if (cambios.esComodin === true && !moto.esComodin) {
      const otra = await tx.motocicleta.findFirst({
        where: { esComodin: true, placa: { not: clave } },
      });
      if (otra) {
        throw new ErrorNegocio('DATOS_INVALIDOS', `Ya hay una moto comodin: ${otra.placa}.`);
      }
    }

    // El odometro no retrocede. Si alguien teclea 2.000 donde iban 20.000, el
    // costo por kilometro se dispara y nadie entiende por que.
    if (
      cambios.kilometrajeActual !== undefined &&
      cambios.kilometrajeActual < moto.kilometrajeActual
    ) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `El kilometraje no puede bajar: la moto ya marcaba ${moto.kilometrajeActual} km.`,
      );
    }

    await tx.motocicleta.update({
      where: { placa: clave },
      data: {
        ...(cambios.marca ? { marca: cambios.marca.trim() } : {}),
        ...(cambios.modelo ? { modelo: cambios.modelo.trim() } : {}),
        ...(cambios.anio ? { anio: cambios.anio } : {}),
        ...(cambios.kilometrajeActual !== undefined
          ? { kilometrajeActual: Math.round(cambios.kilometrajeActual) }
          : {}),
        ...(cambios.esComodin !== undefined ? { esComodin: cambios.esComodin } : {}),
        ...(cambios.fotoUrl !== undefined ? { fotoUrl: cambios.fotoUrl } : {}),
        ...(cambios.notas !== undefined ? { notas: cambios.notas } : {}),
        ...columnasDeFicha(cambios.ficha),
      },
    });

    await registrarEvento(tx, {
      tipo: 'MOTO_EDITADA',
      cajeroId,
      entidadTipo: 'Motocicleta',
      entidadId: clave,
      detalle: { cambios },
    });
  });
}

// ---------------------------------------------------------------------------
// Asignacion
// ---------------------------------------------------------------------------

/** Cierra la asignacion vigente de una moto, si la hay. Devuelve el chofer. */
async function liberarMoto(
  tx: Prisma.TransactionClient,
  placa: string,
  motivo: string,
): Promise<string | null> {
  const vigente = await tx.asignacionMoto.findFirst({ where: { placa, fechaFin: null } });
  if (!vigente) return null;

  await tx.asignacionMoto.update({
    where: { id: vigente.id },
    data: {
      fechaFin: new Date(),
      motivo: vigente.motivo ? `${vigente.motivo} | ${motivo}` : motivo,
      candadoChoferActivo: null,
      candadoMotoActiva: null,
    },
  });
  return vigente.choferId;
}

/** Cierra la asignacion vigente de un chofer, si la hay. Devuelve la placa. */
async function liberarChofer(
  tx: Prisma.TransactionClient,
  choferId: string,
  motivo: string,
): Promise<string | null> {
  const vigente = await tx.asignacionMoto.findFirst({ where: { choferId, fechaFin: null } });
  if (!vigente) return null;

  await tx.asignacionMoto.update({
    where: { id: vigente.id },
    data: {
      fechaFin: new Date(),
      motivo: vigente.motivo ? `${vigente.motivo} | ${motivo}` : motivo,
      candadoChoferActivo: null,
      candadoMotoActiva: null,
    },
  });
  return vigente.placa;
}

async function crearAsignacion(
  tx: Prisma.TransactionClient,
  datos: { placa: string; choferId: string; tipo: 'FIJA' | 'COMODIN'; motivo?: string },
): Promise<void> {
  await tx.asignacionMoto.create({
    data: {
      placa: datos.placa,
      choferId: datos.choferId,
      tipo: datos.tipo,
      motivo: datos.motivo ?? null,
      candadoChoferActivo: datos.choferId,
      candadoMotoActiva: datos.placa,
    },
  });
}

export interface ResultadoAsignacion {
  placa: string;
  choferNombre: string;
  /** Moto que el chofer traia antes, si se le quito. */
  motoAnterior: string | null;
  /** Chofer que traia esta moto antes, si se la quitamos. */
  choferDesplazado: string | null;
}

/** Asigna una moto a un chofer como su moto fija. */
export async function asignarMoto(
  placa: string,
  choferId: string,
  cajeroId: string,
  motivo = 'Asignacion manual',
): Promise<ResultadoAsignacion> {
  const clave = normalizarPlaca(placa);

  return prisma.$transaction(async (tx) => {
    const moto = await tx.motocicleta.findUnique({ where: { placa: clave } });
    if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${clave}.`);

    const chofer = await tx.chofer.findUnique({ where: { id: choferId } });
    if (!chofer) throw new ErrorNegocio('CHOFER_NO_ENCONTRADO', 'El repartidor no existe.');
    if (chofer.estado !== 'ACTIVO') {
      throw new ErrorNegocio('CHOFER_INACTIVO', `${chofer.nombre} esta inactivo.`);
    }
    if (moto.estado !== 'OPERATIVA') {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `La moto ${clave} esta ${moto.estado.replace(/_/g, ' ').toLowerCase()}. Pongala operativa antes de asignarla.`,
      );
    }

    const motoAnterior = await liberarChofer(tx, choferId, motivo);
    const desplazadoId = await liberarMoto(tx, clave, motivo);
    const desplazado = desplazadoId
      ? await tx.chofer.findUnique({ where: { id: desplazadoId }, select: { nombre: true } })
      : null;

    await crearAsignacion(tx, { placa: clave, choferId, tipo: 'FIJA', motivo });

    await registrarEvento(tx, {
      tipo: 'MOTO_ASIGNADA',
      cajeroId,
      choferId,
      entidadTipo: 'Motocicleta',
      entidadId: clave,
      detalle: { tipo: 'FIJA', motivo, motoAnterior, choferDesplazado: desplazado?.nombre ?? null },
    });

    return {
      placa: clave,
      choferNombre: chofer.nombre,
      motoAnterior,
      choferDesplazado: desplazado?.nombre ?? null,
    };
  });
}

/** Quita la moto a un chofer sin darle otra. */
export async function liberarMotoDeChofer(
  choferId: string,
  cajeroId: string,
  motivo = 'Liberacion manual',
): Promise<{ placa: string | null }> {
  return prisma.$transaction(async (tx) => {
    const placa = await liberarChofer(tx, choferId, motivo);
    if (placa) {
      await registrarEvento(tx, {
        tipo: 'MOTO_LIBERADA',
        cajeroId,
        choferId,
        entidadTipo: 'Motocicleta',
        entidadId: placa,
        detalle: { motivo },
      });
    }
    return { placa };
  });
}

// ---------------------------------------------------------------------------
// Cambio de estado y comodin
// ---------------------------------------------------------------------------

export interface ResultadoCambioEstado {
  placa: string;
  estadoAnterior: string;
  estado: EstadoMoto;
  /** Que paso con el chofer que la traia. */
  choferAfectado: string | null;
  comodinAsignada: string | null;
  /** Al volver a operativa, la moto que se le devolvio al chofer. */
  motoDevuelta: string | null;
  /** Por que el chofer quedo sin moto, cuando toco. */
  advertencia: string | null;
}

/**
 * Cambia el estado de una moto y mueve el comodin en consecuencia.
 *
 * Es la operacion central del modulo y toda ocurre en una transaccion: que la
 * moto quede en el taller pero el chofer sin reemplazo, o el reemplazo hecho a
 * medias, seria peor que no automatizar nada.
 */
export async function cambiarEstadoMoto(
  placa: string,
  estado: EstadoMoto,
  cajeroId: string,
  motivo = '',
): Promise<ResultadoCambioEstado> {
  const clave = normalizarPlaca(placa);

  return prisma.$transaction(async (tx) => {
    const moto = await tx.motocicleta.findUnique({
      where: { placa: clave },
      include: { asignaciones: { where: { fechaFin: null }, include: { chofer: true } } },
    });
    if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${clave}.`);

    const estadoAnterior = moto.estado;
    if (estadoAnterior === estado) {
      throw new ErrorNegocio('DATOS_INVALIDOS', `La moto ${clave} ya esta en ese estado.`);
    }

    const vigente = moto.asignaciones[0] ?? null;
    const resultado: ResultadoCambioEstado = {
      placa: clave,
      estadoAnterior,
      estado,
      choferAfectado: vigente?.chofer.nombre ?? null,
      comodinAsignada: null,
      motoDevuelta: null,
      advertencia: null,
    };

    await tx.motocicleta.update({ where: { placa: clave }, data: { estado } });

    if (estado === 'OPERATIVA') {
      await devolverMotoAlVolver(tx, clave, cajeroId, resultado, motivo);
    } else {
      await reemplazarPorComodin(tx, moto.esComodin, clave, vigente, cajeroId, resultado, motivo);
    }

    await registrarEvento(tx, {
      tipo: 'MOTO_ESTADO',
      cajeroId,
      choferId: vigente?.choferId ?? null,
      entidadTipo: 'Motocicleta',
      entidadId: clave,
      detalle: {
        estadoAnterior,
        estado,
        motivo,
        comodinAsignada: resultado.comodinAsignada,
        motoDevuelta: resultado.motoDevuelta,
        advertencia: resultado.advertencia,
      },
    });

    return resultado;
  });
}

/** La moto sale de circulacion: se busca reemplazo para su chofer. */
async function reemplazarPorComodin(
  tx: Prisma.TransactionClient,
  esComodin: boolean,
  clave: string,
  vigente: { choferId: string; chofer: { nombre: string } } | null,
  cajeroId: string,
  resultado: ResultadoCambioEstado,
  motivo: string,
): Promise<void> {
  const razon = `Moto ${clave} fuera de circulacion${motivo ? `: ${motivo}` : ''}`;

  // La comodin no se reemplaza a si misma.
  if (esComodin) {
    if (vigente) {
      await liberarMoto(tx, clave, razon);
      resultado.advertencia = `La comodin ${clave} salio de circulacion. ${vigente.chofer.nombre} queda sin moto.`;
    }
    return;
  }

  if (!vigente) return; // Nadie la traia: no hay a quien reemplazar.

  await liberarMoto(tx, clave, razon);

  const comodin = await tx.motocicleta.findFirst({
    where: { esComodin: true },
    include: { asignaciones: { where: { fechaFin: null }, include: { chofer: true } } },
  });

  if (!comodin) {
    resultado.advertencia = `No hay moto comodin en la flota. ${vigente.chofer.nombre} queda sin moto.`;
    return;
  }
  if (comodin.estado !== 'OPERATIVA') {
    resultado.advertencia = `La comodin ${comodin.placa} no esta operativa. ${vigente.chofer.nombre} queda sin moto.`;
    return;
  }
  // Ya prestada: no se le quita al primero para dársela al segundo, porque eso
  // solo traslada el problema y ademas deja a alguien tirado en la calle.
  const prestadaA = comodin.asignaciones[0];
  if (prestadaA) {
    resultado.advertencia =
      `La comodin ${comodin.placa} ya la trae ${prestadaA.chofer.nombre}. ` +
      `${vigente.chofer.nombre} queda sin moto.`;
    return;
  }

  await crearAsignacion(tx, {
    placa: comodin.placa,
    choferId: vigente.choferId,
    tipo: 'COMODIN',
    motivo: razon,
  });
  resultado.comodinAsignada = comodin.placa;

  await registrarEvento(tx, {
    tipo: 'MOTO_ASIGNADA',
    cajeroId,
    choferId: vigente.choferId,
    entidadTipo: 'Motocicleta',
    entidadId: comodin.placa,
    detalle: { tipo: 'COMODIN', reemplazaA: clave, motivo },
  });
}

/** La moto vuelve del taller: se le devuelve a su chofer y se suelta la comodin. */
async function devolverMotoAlVolver(
  tx: Prisma.TransactionClient,
  clave: string,
  cajeroId: string,
  resultado: ResultadoCambioEstado,
  motivo: string,
): Promise<void> {
  // Ya tiene chofer: no hay nada que devolver.
  const ocupada = await tx.asignacionMoto.findFirst({ where: { placa: clave, fechaFin: null } });
  if (ocupada) return;

  // El dueno natural es el ultimo chofer que la trajo de forma fija.
  const ultima = await tx.asignacionMoto.findFirst({
    where: { placa: clave, tipo: 'FIJA' },
    orderBy: { fechaInicio: 'desc' },
    include: { chofer: true },
  });
  if (!ultima || ultima.chofer.estado !== 'ACTIVO') return;

  const razon = `Moto ${clave} vuelve a circulacion${motivo ? `: ${motivo}` : ''}`;

  // Si estaba con la comodin, se la quitamos: para eso vuelve la suya.
  const prestada = await tx.asignacionMoto.findFirst({
    where: { choferId: ultima.choferId, fechaFin: null },
    include: { moto: true },
  });
  if (prestada) {
    if (!prestada.moto.esComodin) return; // Ya le dieron otra moto fija.
    await liberarChofer(tx, ultima.choferId, razon);
  }

  await crearAsignacion(tx, {
    placa: clave,
    choferId: ultima.choferId,
    tipo: 'FIJA',
    motivo: razon,
  });

  resultado.motoDevuelta = clave;
  resultado.choferAfectado = ultima.chofer.nombre;

  await registrarEvento(tx, {
    tipo: 'MOTO_ASIGNADA',
    cajeroId,
    choferId: ultima.choferId,
    entidadTipo: 'Motocicleta',
    entidadId: clave,
    detalle: { tipo: 'FIJA', motivo: razon, devolucionTrasTaller: true },
  });
}

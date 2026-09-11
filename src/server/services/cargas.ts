/**
 * Importacion de los reportes de Soft Restaurant.
 *
 * La carga es en dos pasos deliberadamente: primero se previsualiza y despues
 * se confirma. El operador ve a que repartidor se va a imputar cada linea
 * ANTES de que entre a la base, porque un mesero mal cruzado produce un
 * faltante que despues nadie sabe de donde salio.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { normalizarNombre } from '@/lib/excel/columnas';
import {
  consolidarArchivos,
  detectarRiesgoDeDobleConteo,
  type ArchivoClasificado,
  type ResultadoConsolidacion,
} from '@/lib/excel/consolidar';
import { parsearReporteSoftRestaurant, type VentaChoferParseada } from '@/lib/excel/parser';
import { diaOperativoDe } from '@/lib/fechas';
import { cuentaDelPos } from '@/server/config/cuentasDelPos';
import type { TipoCorte, TipoReporte } from '@/types/enums';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { esquemaCargaExcel, type EntradaCargaExcel } from '@/server/validaciones';

/** Una linea del Excel junto al chofer al que se cruzo, si se cruzo. */
export interface LineaPrevisualizada extends VentaChoferParseada {
  choferId: string | null;
  choferNombre: string | null;
  /**
   * Como se resolvio la linea.
   * EXCLUIDA es una cuenta del local, no un repartidor que falte: no es un
   * problema y no debe avisarse. Ver src/server/config/cuentasDelPos.ts.
   */
  cruce: 'ID_MESERO' | 'NOMBRE' | 'EXCLUIDA' | 'SIN_CRUZAR';
  /** Por que se excluyo, cuando cruce es EXCLUIDA. */
  motivoExclusion?: string;
}

export interface PrevisualizacionCarga {
  formato: string;
  nombreArchivo: string;
  hashArchivo: string;
  yaCargado: boolean;
  filasLeidas: number;
  filasIgnoradas: number;
  lineas: LineaPrevisualizada[];
  advertencias: string[];
}

/**
 * Cruza cada linea del Excel contra la tabla de choferes.
 * Prioridad: idmesero primero, nombre normalizado despues. El nombre es el
 * ultimo recurso porque cambia de escritura entre reportes.
 */
async function cruzarConChoferes(
  ventas: readonly VentaChoferParseada[],
  cliente: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<LineaPrevisualizada[]> {
  const choferes = await cliente.chofer.findMany({
    select: { id: true, nombre: true, idMeseroSoftRestaurant: true, nombreNormalizado: true },
  });
  const porId = new Map(choferes.map((c) => [c.idMeseroSoftRestaurant, c]));
  const porNombre = new Map(choferes.map((c) => [c.nombreNormalizado, c]));

  return ventas.map((venta) => {
    // Primero las cuentas del local: si alguien las llego a cargar como chofer
    // por error, igual deben tratarse como cuenta y no como repartidor.
    const cuenta = cuentaDelPos(venta.idMeseroExcel, venta.nombreNormalizado);
    if (cuenta) {
      return {
        ...venta,
        choferId: null,
        choferNombre: null,
        cruce: 'EXCLUIDA' as const,
        motivoExclusion: cuenta.motivo,
      };
    }

    const porIdMesero = venta.idMeseroExcel !== '' ? porId.get(venta.idMeseroExcel) : undefined;
    if (porIdMesero) {
      return {
        ...venta,
        choferId: porIdMesero.id,
        choferNombre: porIdMesero.nombre,
        cruce: 'ID_MESERO' as const,
      };
    }
    const porNombreExcel = porNombre.get(venta.nombreNormalizado);
    if (porNombreExcel) {
      return {
        ...venta,
        choferId: porNombreExcel.id,
        choferNombre: porNombreExcel.nombre,
        cruce: 'NOMBRE' as const,
      };
    }
    return { ...venta, choferId: null, choferNombre: null, cruce: 'SIN_CRUZAR' as const };
  });
}

/** Lee el archivo y muestra que haria, sin escribir nada. */
export async function previsualizarCarga(
  contenido: Buffer,
  entrada: EntradaCargaExcel,
): Promise<PrevisualizacionCarga> {
  const datos = esquemaCargaExcel.parse(entrada);
  const resultado = parsearReporteSoftRestaurant(contenido, {
    nombreArchivo: datos.nombreArchivo,
  });

  const existente = await prisma.cargaExcel.findUnique({
    where: { hashArchivo: resultado.hashArchivo },
    select: { nombreArchivo: true, timestamp: true },
  });

  const lineas = await cruzarConChoferes(resultado.ventas);
  const advertencias = [...resultado.advertencias];

  const sinCruzar = lineas.filter((l) => l.cruce === 'SIN_CRUZAR');
  if (sinCruzar.length > 0) {
    advertencias.push(
      `${sinCruzar.length} mesero(s) del reporte no existen como repartidor: ${sinCruzar
        .map((l) => l.nombreExcel || l.idMeseroExcel)
        .join(', ')}. Sus ventas quedaran sin imputar hasta que los cree o los vincule.`,
    );
  }
  if (existente) {
    advertencias.push(
      `Este archivo ya se cargo como "${existente.nombreArchivo}". Volver a cargarlo duplicaria las ventas.`,
    );
  }

  return {
    formato: resultado.formato,
    nombreArchivo: resultado.nombreArchivo,
    hashArchivo: resultado.hashArchivo,
    yaCargado: existente !== null,
    filasLeidas: resultado.filasLeidas,
    filasIgnoradas: resultado.filasIgnoradas,
    lineas,
    advertencias,
  };
}

export interface ResultadoCarga {
  cargaExcelId: string;
  formato: string;
  diaOperativo: string;
  lineasImportadas: number;
  /** Meseros que faltan del padron. Esto si es un problema. */
  lineasSinCruzar: number;
  /** Cuentas del local reconocidas. Se informan, no se alertan. */
  lineasExcluidas: number;
}

/**
 * Escribe UNA carga dentro de una transaccion ya abierta. La usan tanto la
 * importacion de un archivo suelto como la de un lote, para que el lote entre
 * completo o no entre nada.
 */
async function escribirCarga(
  tx: Prisma.TransactionClient,
  contenido: Buffer,
  datos: EntradaCargaExcel,
  diaOperativo: string,
): Promise<ResultadoCarga> {
  const resultado = parsearReporteSoftRestaurant(contenido, {
    nombreArchivo: datos.nombreArchivo,
  });

  const duplicado = await tx.cargaExcel.findUnique({
    where: { hashArchivo: resultado.hashArchivo },
    select: { nombreArchivo: true },
  });
  if (duplicado) {
    throw new ErrorNegocio(
      'ARCHIVO_YA_CARGADO',
      `El archivo "${datos.nombreArchivo}" ya fue importado como "${duplicado.nombreArchivo}". Cargarlo de nuevo duplicaria las ventas.`,
    );
  }

  const lineas = await cruzarConChoferes(resultado.ventas, tx);

  const carga = await tx.cargaExcel.create({
    data: {
      tipoCorte: datos.tipoCorte,
      tipoReporte: datos.tipoReporte,
      formatoDetectado: resultado.formato,
      hashArchivo: resultado.hashArchivo,
      nombreArchivo: resultado.nombreArchivo,
      cajeroId: datos.cajeroId,
      diaOperativo,
      filasLeidas: resultado.filasLeidas,
      filasIgnoradas: resultado.filasIgnoradas,
    },
  });

  await tx.ventaChoferExcel.createMany({
    data: lineas.map((linea) => ({
      cargaExcelId: carga.id,
      choferId: linea.choferId,
      // El unico compuesto es (carga, idMeseroExcel); si el reporte no trae
      // codigo se usa el nombre normalizado como identificador de la linea.
      idMeseroExcel: linea.idMeseroExcel !== '' ? linea.idMeseroExcel : linea.nombreNormalizado,
      nombreExcel: linea.nombreExcel,
      efectivo: linea.efectivo,
      tarjeta: linea.tarjeta,
      sinpe: linea.sinpe,
      importeTotal: linea.importeTotal,
      viajes: linea.viajes,
    })),
  });

  const sinCruzar = lineas.filter((l) => l.cruce === 'SIN_CRUZAR').length;
  const excluidas = lineas.filter((l) => l.cruce === 'EXCLUIDA').length;

  await registrarEvento(tx, {
    tipo: 'CARGA_EXCEL',
    cajeroId: datos.cajeroId,
    entidadTipo: 'CargaExcel',
    entidadId: carga.id,
    detalle: {
      nombreArchivo: resultado.nombreArchivo,
      formato: resultado.formato,
      tipoCorte: datos.tipoCorte,
      tipoReporte: datos.tipoReporte,
      diaOperativo,
      lineas: lineas.length,
      sinCruzar,
      excluidas,
    },
  });

  return {
    cargaExcelId: carga.id,
    formato: resultado.formato,
    diaOperativo,
    lineasImportadas: lineas.length,
    lineasSinCruzar: sinCruzar,
    lineasExcluidas: excluidas,
  };
}

/** Confirma la carga de un archivo y la escribe. Rechaza uno ya importado. */
export async function importarCarga(
  contenido: Buffer,
  entrada: EntradaCargaExcel,
): Promise<ResultadoCarga> {
  const datos = esquemaCargaExcel.parse(entrada);
  const diaOperativo = datos.diaOperativo ?? diaOperativoDe();
  return prisma.$transaction((tx) => escribirCarga(tx, contenido, datos, diaOperativo));
}

// ---------------------------------------------------------------------------
// Lote de archivos
// ---------------------------------------------------------------------------

/** Un archivo tal como llega de la pantalla de importacion. */
export interface ArchivoEntrante {
  nombreArchivo: string;
  contenido: Buffer;
  tipoCorte: TipoCorte;
  tipoReporte: TipoReporte;
}

export interface PrevisualizacionLote {
  archivos: PrevisualizacionCarga[];
  /** Suma por chofer de todo el lote, que es lo que se usara al cerrar. */
  consolidado: ResultadoConsolidacion;
  /** Avisos de doble conteo entre corte parcial y total. */
  riesgos: string[];
  advertencias: string[];
}

/**
 * Lee todo el lote y muestra el consolidado sin escribir nada.
 *
 * El cajero ve a que repartidor se imputa cada linea y cuanto suma el
 * conjunto ANTES de confirmar. Un mesero mal cruzado produce un faltante que
 * despues nadie sabe de donde salio.
 */
export async function previsualizarLote(
  archivos: readonly ArchivoEntrante[],
  cajeroId: string,
): Promise<PrevisualizacionLote> {
  const previsualizaciones: PrevisualizacionCarga[] = [];
  const clasificados: ArchivoClasificado[] = [];
  const advertencias: string[] = [];

  for (const [indice, archivo] of archivos.entries()) {
    const vista = await previsualizarCarga(archivo.contenido, {
      cajeroId,
      nombreArchivo: archivo.nombreArchivo,
      tipoCorte: archivo.tipoCorte,
      tipoReporte: archivo.tipoReporte,
    });
    previsualizaciones.push(vista);
    advertencias.push(...vista.advertencias);

    clasificados.push({
      cargaExcelId: `previa-${indice}`,
      tipoCorte: archivo.tipoCorte,
      tipoReporte: archivo.tipoReporte,
      resultado: parsearReporteSoftRestaurant(archivo.contenido, {
        nombreArchivo: archivo.nombreArchivo,
      }),
    });
  }

  const consolidado = consolidarArchivos(clasificados);

  return {
    archivos: previsualizaciones,
    consolidado,
    riesgos: detectarRiesgoDeDobleConteo(clasificados),
    advertencias: [...new Set([...advertencias, ...consolidado.advertencias])],
  };
}

/**
 * Importa todo el lote en UNA transaccion.
 *
 * Si el tercer archivo esta repetido, los dos primeros tampoco entran. Media
 * carga aplicada seria peor que ninguna: el cajero cerraria turnos contra un
 * esperado incompleto sin notarlo.
 */
export async function importarLote(
  archivos: readonly ArchivoEntrante[],
  cajeroId: string,
  diaOperativo?: string,
): Promise<ResultadoCarga[]> {
  if (archivos.length === 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'No se recibio ningun archivo.');
  }
  const dia = diaOperativo ?? diaOperativoDe();

  return prisma.$transaction(
    async (tx) => {
      const resultados: ResultadoCarga[] = [];
      for (const archivo of archivos) {
        const datos = esquemaCargaExcel.parse({
          cajeroId,
          nombreArchivo: archivo.nombreArchivo,
          tipoCorte: archivo.tipoCorte,
          tipoReporte: archivo.tipoReporte,
          diaOperativo: dia,
        });
        resultados.push(await escribirCarga(tx, archivo.contenido, datos, dia));
      }
      return resultados;
    },
    { timeout: 30_000 },
  );
}

/** Vincula a mano una linea que no se cruzo automaticamente. */
export async function vincularLineaAChofer(
  ventaChoferExcelId: string,
  choferId: string,
  cajeroId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const chofer = await tx.chofer.findUnique({ where: { id: choferId } });
    if (!chofer) throw new ErrorNegocio('CHOFER_NO_ENCONTRADO', 'El repartidor no existe.');

    const venta = await tx.ventaChoferExcel.update({
      where: { id: ventaChoferExcelId },
      data: { choferId },
    });

    await registrarEvento(tx, {
      tipo: 'CARGA_EXCEL',
      cajeroId,
      choferId,
      entidadTipo: 'VentaChoferExcel',
      entidadId: venta.id,
      detalle: { accion: 'VINCULACION_MANUAL', nombreExcel: venta.nombreExcel },
    });
  });
}

// ---------------------------------------------------------------------------
// Esperado consolidado
// ---------------------------------------------------------------------------

export interface EsperadoDeChofer {
  choferId: string;
  efectivoEsperado: number;
  tarjetaEsperada: number;
  sinpeEsperado: number;
  viajesTotales: number;
  cargas: Array<{
    id: string;
    nombreArchivo: string;
    tipoCorte: string;
    tipoReporte: string;
  }>;
}

/**
 * Suma lo que el POS dice que le corresponde a un chofer en un dia operativo,
 * consolidando todos los archivos cargados ese dia (Blanco, Negro, parciales).
 */
export async function esperadoDeChofer(
  choferId: string,
  diaOperativo: string,
  cliente: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<EsperadoDeChofer> {
  const ventas = await cliente.ventaChoferExcel.findMany({
    where: { choferId, carga: { diaOperativo } },
    include: {
      carga: {
        select: { id: true, nombreArchivo: true, tipoCorte: true, tipoReporte: true },
      },
    },
  });

  const cargasVistas = new Map<string, EsperadoDeChofer['cargas'][number]>();
  let efectivo = 0;
  let tarjeta = 0;
  let sinpe = 0;
  let viajes = 0;

  for (const venta of ventas) {
    efectivo += venta.efectivo;
    tarjeta += venta.tarjeta;
    sinpe += venta.sinpe;
    viajes += venta.viajes;
    cargasVistas.set(venta.carga.id, venta.carga);
  }

  return {
    choferId,
    efectivoEsperado: efectivo,
    tarjetaEsperada: tarjeta,
    sinpeEsperado: sinpe,
    viajesTotales: viajes,
    cargas: [...cargasVistas.values()],
  };
}

/** Normaliza un nombre igual que el parser, para el CRUD de choferes. */
export { normalizarNombre };

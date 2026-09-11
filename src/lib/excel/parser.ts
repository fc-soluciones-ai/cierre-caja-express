/**
 * Parser de los reportes de ventas por mesero de Soft Restaurant.
 *
 * Soporta los dos formatos que exporta el POS:
 *
 *   DETALLADO   (ventasmeserosdetallado.xls)
 *     Una fila por cheque. Hay que agrupar por mesero.
 *       Efectivo esperado = SUM(efectivo)
 *       Tarjeta esperada  = SUM(tarjeta)
 *       SINPE esperado    = SUM(otros)
 *       Viajes            = COUNT(numcheque) distintos
 *
 *   CONSOLIDADO (09-09-26.xls)
 *     Una fila por mesero, ya sumada.
 *       Viajes = nopersonas
 *
 * El formato se detecta por las columnas presentes, no por el nombre del
 * archivo: el operador renombra los archivos a diario.
 *
 * Todos los montos salen en centimos enteros. Ver src/lib/money/money.ts.
 */

import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';

import { parsearMontoTexto } from '@/lib/money/money';
import type { FormatoExcel } from '@/types/enums';
import {
  detectarEncabezado,
  indiceDe,
  normalizarNombre,
  normalizarTitulo,
  type MapaColumnas,
} from './columnas';

/** Totales de un chofer dentro de UN archivo. Montos en centimos. */
export interface VentaChoferParseada {
  /** Tal como viene en el Excel, sin normalizar. Vacio si el reporte no lo trae. */
  idMeseroExcel: string;
  nombreExcel: string;
  /** Nombre en mayusculas y sin acentos, para cruzar contra la tabla choferes. */
  nombreNormalizado: string;
  efectivo: number;
  tarjeta: number;
  sinpe: number;
  importeTotal: number;
  viajes: number;
}

export interface ResultadoParseo {
  formato: FormatoExcel;
  /** SHA-256 del binario. Bloquea que el mismo archivo se cargue dos veces. */
  hashArchivo: string;
  nombreArchivo: string;
  hoja: string;
  filaTitulos: number;
  filasLeidas: number;
  filasIgnoradas: number;
  ventas: VentaChoferParseada[];
  advertencias: string[];
}

export class ErrorParseoExcel extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorParseoExcel';
  }
}

/** Filas de resumen que Soft Restaurant agrega al final y no son un mesero. */
const ETIQUETAS_RESUMEN = new Set([
  'total',
  'totales',
  'grantotal',
  'granTotal',
  'sumatotal',
  'suma',
  'totalgeneral',
  'totaldia',
]);

function esFilaResumen(idMesero: string, nombre: string): boolean {
  const a = normalizarTitulo(idMesero);
  const b = normalizarTitulo(nombre);
  return ETIQUETAS_RESUMEN.has(a) || ETIQUETAS_RESUMEN.has(b);
}

function leerCelda(fila: readonly unknown[], indice: number | null): unknown {
  if (indice === null) return undefined;
  return fila[indice];
}

function leerTexto(fila: readonly unknown[], indice: number | null): string {
  const valor = leerCelda(fila, indice);
  if (valor === null || valor === undefined) return '';
  return String(valor).trim();
}

function leerMonto(fila: readonly unknown[], indice: number | null): number {
  return parsearMontoTexto(leerCelda(fila, indice));
}

function leerEntero(fila: readonly unknown[], indice: number | null): number {
  const valor = leerCelda(fila, indice);
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = Number(String(valor).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Acumulador interno mientras se recorre el archivo. */
interface Acumulador extends VentaChoferParseada {
  /** Cheques distintos vistos, solo para el formato DETALLADO. */
  cheques: Set<string>;
}

/**
 * Llave de agrupacion. Se prefiere el idmesero porque es estable; si el
 * reporte no lo trae se cae al nombre normalizado.
 */
function llaveDe(idMesero: string, nombreNormalizado: string): string {
  return idMesero !== '' ? `ID:${idMesero}` : `NOMBRE:${nombreNormalizado}`;
}

function decidirFormato(mapa: MapaColumnas): FormatoExcel {
  if (indiceDe(mapa, 'numcheque') !== null) return 'DETALLADO';
  if (indiceDe(mapa, 'nopersonas') !== null) return 'CONSOLIDADO';
  throw new ErrorParseoExcel(
    'No se pudo determinar el formato del reporte: falta la columna "numcheque" (detallado) y "nopersonas" (consolidado).',
  );
}

export interface OpcionesParseo {
  /** Nombre original del archivo, solo para trazabilidad. */
  nombreArchivo: string;
  /** Hoja a leer. Por defecto la primera. */
  nombreHoja?: string;
}

/**
 * Lee un .xls o .xlsx de Soft Restaurant y devuelve los totales por chofer.
 * No toca la base de datos: es una funcion pura sobre el binario, lo que
 * permite previsualizar la carga antes de confirmarla.
 */
export function parsearReporteSoftRestaurant(
  contenido: Buffer | Uint8Array,
  opciones: OpcionesParseo,
): ResultadoParseo {
  const buffer = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido);
  const hashArchivo = createHash('sha256').update(buffer).digest('hex');

  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: false });
  } catch (causa) {
    throw new ErrorParseoExcel(
      `El archivo no se pudo abrir como Excel: ${(causa as Error).message}`,
    );
  }

  const nombreHoja = opciones.nombreHoja ?? libro.SheetNames[0];
  if (!nombreHoja) {
    throw new ErrorParseoExcel('El archivo no contiene hojas.');
  }
  const hoja = libro.Sheets[nombreHoja];
  if (!hoja) {
    throw new ErrorParseoExcel(`La hoja "${nombreHoja}" no existe en el archivo.`);
  }

  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  });

  const encabezado = detectarEncabezado(filas);
  if (!encabezado) {
    throw new ErrorParseoExcel(
      'No se encontro la fila de titulos. Verifique que el archivo sea el reporte de ventas por mesero de Soft Restaurant.',
    );
  }

  const { filaTitulos, mapa } = encabezado;
  const formato = decidirFormato(mapa);

  const colIdMesero = indiceDe(mapa, 'idmesero');
  const colNombre = indiceDe(mapa, 'nombre');
  const colNumCheque = indiceDe(mapa, 'numcheque');
  const colEfectivo = indiceDe(mapa, 'efectivo');
  const colTarjeta = indiceDe(mapa, 'tarjeta');
  const colOtros = indiceDe(mapa, 'otros');
  const colTotal = indiceDe(mapa, 'total');
  const colImporte = indiceDe(mapa, 'importe');
  const colNoPersonas = indiceDe(mapa, 'nopersonas');

  const advertencias: string[] = [];
  if (colIdMesero === null) {
    advertencias.push(
      'El reporte no trae la columna "idmesero"; los choferes se cruzaran solo por nombre.',
    );
  }
  if (colEfectivo === null) {
    advertencias.push(
      'El reporte no trae la columna "efectivo"; el efectivo esperado quedara en cero.',
    );
  }
  if (colOtros === null) {
    advertencias.push('El reporte no trae la columna "otros"; el SINPE quedara en cero.');
  }

  const acumuladores = new Map<string, Acumulador>();
  let filasLeidas = 0;
  let filasIgnoradas = 0;

  for (let i = filaTitulos + 1; i < filas.length; i += 1) {
    const fila = filas[i];
    if (!fila) continue;

    const idMesero = leerTexto(fila, colIdMesero);
    const nombre = leerTexto(fila, colNombre);
    const nombreNormalizado = normalizarNombre(nombre);

    if (idMesero === '' && nombreNormalizado === '') {
      filasIgnoradas += 1;
      continue;
    }
    if (esFilaResumen(idMesero, nombre)) {
      filasIgnoradas += 1;
      continue;
    }

    const efectivo = leerMonto(fila, colEfectivo);
    const tarjeta = leerMonto(fila, colTarjeta);
    const sinpe = leerMonto(fila, colOtros);

    // El importe se toma de la columna declarada; si el reporte no la trae se
    // reconstruye sumando las formas de pago.
    const importeDeclarado =
      colImporte !== null
        ? leerMonto(fila, colImporte)
        : colTotal !== null
          ? leerMonto(fila, colTotal)
          : null;
    const importeTotal = importeDeclarado ?? efectivo + tarjeta + sinpe;

    const llave = llaveDe(idMesero, nombreNormalizado);
    let acc = acumuladores.get(llave);
    if (!acc) {
      acc = {
        idMeseroExcel: idMesero,
        nombreExcel: nombre,
        nombreNormalizado,
        efectivo: 0,
        tarjeta: 0,
        sinpe: 0,
        importeTotal: 0,
        viajes: 0,
        cheques: new Set<string>(),
      };
      acumuladores.set(llave, acc);
    }

    acc.efectivo += efectivo;
    acc.tarjeta += tarjeta;
    acc.sinpe += sinpe;
    acc.importeTotal += importeTotal;

    if (formato === 'DETALLADO') {
      // Un cheque puede aparecer en varias filas si se pago con dos medios.
      // Contar distintos evita inflar los viajes del chofer.
      const cheque = leerTexto(fila, colNumCheque);
      acc.cheques.add(cheque !== '' ? cheque : `__fila_${i}`);
    } else {
      acc.viajes += leerEntero(fila, colNoPersonas);
    }

    filasLeidas += 1;
  }

  if (acumuladores.size === 0) {
    throw new ErrorParseoExcel(
      'El archivo se leyo pero no contiene filas de meseros con datos.',
    );
  }

  const ventas: VentaChoferParseada[] = [...acumuladores.values()].map((acc) => ({
    idMeseroExcel: acc.idMeseroExcel,
    nombreExcel: acc.nombreExcel,
    nombreNormalizado: acc.nombreNormalizado,
    efectivo: acc.efectivo,
    tarjeta: acc.tarjeta,
    sinpe: acc.sinpe,
    importeTotal: acc.importeTotal,
    viajes: formato === 'DETALLADO' ? acc.cheques.size : acc.viajes,
  }));

  ventas.sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado, 'es'));

  return {
    formato,
    hashArchivo,
    nombreArchivo: opciones.nombreArchivo,
    hoja: nombreHoja,
    filaTitulos,
    filasLeidas,
    filasIgnoradas,
    ventas,
    advertencias,
  };
}

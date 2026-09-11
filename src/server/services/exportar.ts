/**
 * Exportacion del historial a Excel.
 *
 * Los montos salen como NUMEROS decimales, no como texto ya formateado: quien
 * abre el reporte va a querer sumar columnas en Excel, y una columna de texto
 * con separador de miles no se suma. El formato de moneda se aplica como
 * formato de celda.
 */

import * as XLSX from 'xlsx';

import { deCentimos, esClaveDeDinero } from '@/lib/money/money';
import { formatearFechaHora } from '@/lib/fechas';
import type { FilaHistorial, MetricasHistorial } from '@/server/services/historial';

/** Formato de celda para colones sin decimales. */
const FORMATO_MONEDA = '#,##0';

const NOMBRE_EVENTO: Record<string, string> = {
  ABONO: 'Abono parcial',
  ABONO_ANULADO: 'Abono anulado',
  CARGA_EXCEL: 'Carga de Excel',
  CIERRE_CHOFER: 'Cierre de turno',
  ARQUEO: 'Arqueo de caja',
  CHOFER_CREADO: 'Alta de repartidor',
  CHOFER_EDITADO: 'Edicion de repartidor',
  CHOFER_DESACTIVADO: 'Baja de repartidor',
  REIMPRESION: 'Reimpresion',
  LOGIN: 'Entrada a la caja',
};

function valorLegible(clave: string, valor: unknown): string {
  // Los montos del detalle vienen en centimos; el reporte los muestra en
  // colones para que coincidan con el resto de las columnas.
  if (typeof valor === 'number' && esClaveDeDinero(clave)) return String(deCentimos(valor));
  if (typeof valor === 'object' && valor !== null) return JSON.stringify(valor);
  return String(valor);
}

function resumirDetalle(detalle: Record<string, unknown> | null): string {
  if (!detalle) return '';
  return Object.entries(detalle)
    .filter(([, valor]) => valor !== null && valor !== undefined)
    .map(([clave, valor]) => `${clave}=${valorLegible(clave, valor)}`)
    .join('; ');
}

export interface ParametrosExportacion {
  filas: readonly FilaHistorial[];
  metricas: MetricasHistorial;
  descripcionFiltro: string;
}

/**
 * Genera el libro y lo devuelve en base64 para que la accion de servidor lo
 * mande al navegador sin escribir nada en disco.
 */
export function exportarHistorialAExcel(parametros: ParametrosExportacion): {
  nombreArchivo: string;
  base64: string;
} {
  const libro = XLSX.utils.book_new();

  // --- Hoja de resumen ---
  const m = parametros.metricas;
  const resumen: unknown[][] = [
    ['Cierre Caja Express - Reporte de historial'],
    ['Filtro aplicado', parametros.descripcionFiltro],
    ['Generado', formatearFechaHora(new Date())],
    [],
    ['Concepto', 'Monto', 'Cantidad'],
    ['Efectivo esperado segun el POS', deCentimos(m.efectivoEsperado), m.cantidadCierres],
    ['Tarjeta', deCentimos(m.tarjeta), ''],
    ['SINPE Movil', deCentimos(m.sinpe), ''],
    ['Viajes', '', m.viajes],
    [],
    ['Abonos parciales recibidos', deCentimos(m.abonosParciales), m.cantidadAbonos],
    ['Entregas en el cierre', deCentimos(m.entregasEnCierre), ''],
    ['Faltantes acumulados', deCentimos(m.faltantes), ''],
    ['Sobrantes acumulados', deCentimos(m.sobrantes), ''],
    ['Diferencia neta', deCentimos(m.diferenciaNeta), ''],
  ];
  const hojaResumen = XLSX.utils.aoa_to_sheet(resumen);
  hojaResumen['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 12 }];
  for (let fila = 5; fila < resumen.length; fila += 1) {
    const celda = hojaResumen[XLSX.utils.encode_cell({ r: fila, c: 1 })];
    if (celda && typeof celda.v === 'number') celda.z = FORMATO_MONEDA;
  }
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');

  // --- Hoja de movimientos ---
  const encabezados = [
    'Fecha y hora',
    'Evento',
    'Repartidor',
    'Cajero',
    'Monto',
    'Dispositivo',
    'Entidad',
    'Detalle',
  ];
  const movimientos: unknown[][] = [
    encabezados,
    ...parametros.filas.map((fila) => [
      formatearFechaHora(fila.timestamp),
      NOMBRE_EVENTO[fila.tipo] ?? fila.tipo,
      fila.choferNombre ?? '',
      fila.cajeroNombre ?? '',
      fila.monto === null ? '' : deCentimos(fila.monto),
      fila.dispositivo ?? '',
      fila.entidadTipo ?? '',
      resumirDetalle(fila.detalle),
    ]),
  ];
  const hojaMovimientos = XLSX.utils.aoa_to_sheet(movimientos);
  hojaMovimientos['!cols'] = [
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 60 },
  ];
  for (let fila = 1; fila < movimientos.length; fila += 1) {
    const celda = hojaMovimientos[XLSX.utils.encode_cell({ r: fila, c: 4 })];
    if (celda && typeof celda.v === 'number') celda.z = FORMATO_MONEDA;
  }
  XLSX.utils.book_append_sheet(libro, hojaMovimientos, 'Movimientos');

  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const marca = new Date().toISOString().slice(0, 10);

  return {
    nombreArchivo: `historial-caja-${marca}.xlsx`,
    base64: buffer.toString('base64'),
  };
}

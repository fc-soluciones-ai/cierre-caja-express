/**
 * Genera dos reportes de ventas por mesero con la forma que exporta Soft
 * Restaurant, usando los codigos reales del padron.
 *
 * Sirve para probar la importacion sin tener que sacar un reporte de verdad
 * del POS. Ejecutar con: npm run ejemplos
 */

import * as fs from 'node:fs';
import * as XLSX from 'xlsx';

import { CUENTAS_DEL_POS } from '../src/server/config/cuentasDelPos';
import { REPARTIDORES } from '../prisma/seed/repartidores';

function generar(archivo: string, titulo: string, filas: unknown[][]): void {
  const hoja = XLSX.utils.aoa_to_sheet([
    ['PIZZERIA EXPRESS S.A.'],
    [titulo],
    ['Del 10/09/2026 al 10/09/2026'],
    [],
    ['idmesero', 'nombre', 'importe', 'efectivo', 'tarjeta', 'otros', 'nopersonas'],
    ...filas,
    [],
    ['', 'TOTALES', '', '', '', '', ''],
  ]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
  XLSX.writeFile(libro, archivo, { bookType: 'xls' });
  console.log(`  ${archivo} (${fs.statSync(archivo).size} bytes)`);
}

/** Cifras inventadas pero verosimiles para una noche de reparto. */
const VENTAS_BLANCO: Record<string, [number, number, number, number]> = {
  // efectivo, tarjeta, otros (SINPE), viajes
  '10': [42_000, 12_500, 8_000, 11],
  '12': [31_000, 0, 5_500, 8],
  '13': [27_500, 9_000, 0, 7],
  '16': [38_000, 4_500, 6_000, 10],
  '23': [22_000, 0, 3_500, 6],
  '26': [35_500, 7_000, 4_000, 9],
  '35': [19_000, 0, 0, 5],
  '14': [8_500, 0, 0, 3],
  '25': [12_000, 3_000, 0, 4],
};

const VENTAS_NEGRO: Record<string, [number, number, number, number]> = {
  '10': [6_000, 0, 0, 2],
  '12': [4_500, 0, 0, 1],
  '16': [7_500, 0, 0, 2],
  '26': [3_000, 0, 0, 1],
};

const TODAS_LAS_LINEAS = [
  ...REPARTIDORES,
  // Las cuentas del local tambien salen en el reporte real. Van aqui para que
  // la prueba muestre como las trata la importacion.
  ...CUENTAS_DEL_POS.map((c) => ({ idMesero: c.idMesero, nombre: c.nombre })),
];

function filasDe(ventas: Record<string, [number, number, number, number]>): unknown[][] {
  return TODAS_LAS_LINEAS.filter((r) => ventas[r.idMesero]).map((r) => {
    const [efectivo, tarjeta, otros, viajes] = ventas[r.idMesero]!;
    return [
      r.idMesero,
      r.nombre,
      String(efectivo + tarjeta + otros),
      String(efectivo),
      String(tarjeta),
      String(otros),
      String(viajes),
    ];
  });
}

fs.mkdirSync('ejemplos', { recursive: true });
console.log('Reportes de ejemplo generados con los codigos del padron real:');
generar('ejemplos/blanco-ejemplo.xls', 'Ventas por mesero (facturado)', filasDe(VENTAS_BLANCO));
generar('ejemplos/negro-ejemplo.xls', 'Ventas por mesero (sin factura)', filasDe(VENTAS_NEGRO));

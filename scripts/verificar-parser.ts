/**
 * Verificacion del parser y la consolidacion sin depender de archivos reales.
 *
 * Genera dos .xls con la misma forma que exporta Soft Restaurant (filas de
 * preambulo antes de los titulos, montos como texto con separador de miles) y
 * comprueba los totales. Ejecutar con: npm run test:parser
 */

import * as XLSX from 'xlsx';

import { consolidarArchivos, detectarRiesgoDeDobleConteo } from '@/lib/excel/consolidar';
import { parsearReporteSoftRestaurant } from '@/lib/excel/parser';
import { formatearMoneda, parsearMontoTexto } from '@/lib/money/money';

let fallos = 0;

function comprobar(descripcion: string, real: unknown, esperado: unknown): void {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos += 1;
  const marca = ok ? 'OK  ' : 'FALLA';
  console.log(`${marca} ${descripcion}`);
  if (!ok) {
    console.log(`      esperado: ${JSON.stringify(esperado)}`);
    console.log(`      obtenido: ${JSON.stringify(real)}`);
  }
}

function aXls(filas: unknown[][]): Buffer {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xls' }) as Buffer;
}

// ---------------------------------------------------------------------------
// 1. Montos
// ---------------------------------------------------------------------------
console.log('\n--- Interpretacion de montos ---');
comprobar('12.500 (miles con punto)', parsearMontoTexto('12.500'), 1_250_000);
comprobar('1.234.567 (miles repetidos)', parsearMontoTexto('1.234.567'), 123_456_700);
comprobar('12.345,67 (decimal con coma)', parsearMontoTexto('12.345,67'), 1_234_567);
comprobar('12,345.67 (decimal con punto)', parsearMontoTexto('12,345.67'), 1_234_567);
comprobar('simbolo y espacios', parsearMontoTexto(' 8 500 '), 850_000);
comprobar('parentesis contable', parsearMontoTexto('(1.200)'), -120_000);
comprobar('celda vacia', parsearMontoTexto(''), 0);
comprobar('numero nativo', parsearMontoTexto(4500.5), 450_050);
comprobar('formato de pantalla', formatearMoneda(1_250_000), '₡12.500');
 comprobar('formato con centimos', formatearMoneda(1_234_567), '₡12.345,67');
 comprobar('formato negativo', formatearMoneda(-450_000), '-₡4.500');

// ---------------------------------------------------------------------------
// 2. Reporte DETALLADO: una fila por cheque
// ---------------------------------------------------------------------------
console.log('\n--- Reporte detallado (ventasmeserosdetallado.xls) ---');

const detallado = aXls([
  ['PIZZERIA EXPRESS S.A.'],
  ['Reporte de ventas por mesero detallado'],
  ['Del 09/09/2026 al 09/09/2026'],
  [],
  ['idmesero', 'nombre', 'numcheque', 'efectivo', 'tarjeta', 'otros', 'total'],
  ['12', 'Antonio Rojas', 'A-1001', '8.500', '0', '0', '8.500'],
  ['12', 'Antonio Rojas', 'A-1002', '0', '12.000', '0', '12.000'],
  ['12', 'Antonio Rojas', 'A-1003', '5.250', '0', '3.000', '8.250'],
  // Mismo cheque en dos filas por pago mixto: cuenta como UN viaje.
  ['12', 'Antonio Rojas', 'A-1004', '2.000', '0', '0', '2.000'],
  ['12', 'Antonio Rojas', 'A-1004', '0', '0', '1.500', '1.500'],
  ['7', 'María Fernández', 'A-1010', '15.000', '0', '0', '15.000'],
  ['7', 'María Fernández', 'A-1011', '0', '0', '9.750', '9.750'],
  [],
  ['', 'TOTAL', '', '30.750', '12.000', '14.250', '57.000'],
]);

const rDetallado = parsearReporteSoftRestaurant(detallado, {
  nombreArchivo: 'ventasmeserosdetallado.xls',
});

comprobar('formato detectado', rDetallado.formato, 'DETALLADO');
comprobar('fila de titulos (sin contar filas vacias)', rDetallado.filaTitulos, 3);
comprobar('choferes encontrados', rDetallado.ventas.length, 2);
comprobar('fila TOTAL descartada', rDetallado.filasIgnoradas, 1);

const tono = rDetallado.ventas.find((v) => v.idMeseroExcel === '12');
comprobar('Antonio: efectivo', tono?.efectivo, 1_575_000); // 8500+5250+2000
comprobar('Antonio: tarjeta', tono?.tarjeta, 1_200_000);
comprobar('Antonio: sinpe', tono?.sinpe, 450_000); // 3000+1500
comprobar('Antonio: viajes (cheques distintos)', tono?.viajes, 4);

const maria = rDetallado.ventas.find((v) => v.idMeseroExcel === '7');
comprobar('Maria: efectivo', maria?.efectivo, 1_500_000);
comprobar('Maria: sinpe', maria?.sinpe, 975_000);
comprobar('Maria: viajes', maria?.viajes, 2);
comprobar('Maria: nombre normalizado sin acentos', maria?.nombreNormalizado, 'MARIA FERNANDEZ');

// ---------------------------------------------------------------------------
// 3. Reporte CONSOLIDADO: una fila por mesero
// ---------------------------------------------------------------------------
console.log('\n--- Reporte consolidado (09-09-26.xls) ---');

const consolidado = aXls([
  ['PIZZERIA EXPRESS S.A.'],
  ['Ventas por mesero'],
  [],
  ['Id Mesero', 'Nombre', 'Importe', 'Efectivo', 'Tarjeta', 'Otros', 'No. Personas'],
  ['12', 'Antonio Rojas', '31.250', '15.750', '12.000', '3.500', '4'],
  ['7', 'María Fernández', '24.750', '15.000', '0', '9.750', '2'],
  ['', 'Totales', '56.000', '30.750', '12.000', '13.250', '6'],
]);

const rConsolidado = parsearReporteSoftRestaurant(consolidado, {
  nombreArchivo: '09-09-26.xls',
});

comprobar('formato detectado', rConsolidado.formato, 'CONSOLIDADO');
comprobar('titulos con espacios y puntos', rConsolidado.filaTitulos, 2);
comprobar('choferes encontrados', rConsolidado.ventas.length, 2);

const tonoC = rConsolidado.ventas.find((v) => v.idMeseroExcel === '12');
comprobar('Antonio: efectivo', tonoC?.efectivo, 1_575_000);
comprobar('Antonio: viajes desde nopersonas', tonoC?.viajes, 4);
comprobar('Antonio: importe declarado', tonoC?.importeTotal, 3_125_000);

// ---------------------------------------------------------------------------
// 4. Consolidacion Blanco + Negro
// ---------------------------------------------------------------------------
console.log('\n--- Consolidacion Blanco + Negro ---');

const negro = aXls([
  ['Ventas sin factura'],
  [],
  ['idmesero', 'nombre', 'importe', 'efectivo', 'tarjeta', 'otros', 'nopersonas'],
  ['12', 'Antonio Rojas', '6.000', '6.000', '0', '0', '1'],
  ['3', 'Kevin Solis', '9.000', '9.000', '0', '0', '2'],
]);

const rNegro = parsearReporteSoftRestaurant(negro, { nombreArchivo: 'negro-09-09.xls' });

const fusion = consolidarArchivos([
  { cargaExcelId: 'c1', tipoCorte: 'TOTAL', tipoReporte: 'BLANCO', resultado: rConsolidado },
  { cargaExcelId: 'c2', tipoCorte: 'TOTAL', tipoReporte: 'NEGRO', resultado: rNegro },
]);

comprobar('choferes consolidados', fusion.choferes.length, 3);

const tonoF = fusion.choferes.find((c) => c.idMeseroExcel === '12');
comprobar('Antonio: efectivo blanco+negro', tonoF?.efectivoEsperado, 2_175_000);
comprobar('Antonio: viajes blanco+negro', tonoF?.viajesTotales, 5);
comprobar('Antonio: trazabilidad de origenes', tonoF?.origenes.length, 2);
comprobar('total efectivo consolidado', fusion.totales.efectivo, 4_575_000);

// ---------------------------------------------------------------------------
// 5. Defensas
// ---------------------------------------------------------------------------
console.log('\n--- Defensas ---');

const duplicado = consolidarArchivos([
  { cargaExcelId: 'c1', tipoCorte: 'TOTAL', tipoReporte: 'BLANCO', resultado: rConsolidado },
  { cargaExcelId: 'c3', tipoCorte: 'TOTAL', tipoReporte: 'BLANCO', resultado: rConsolidado },
]);
comprobar('archivo identico no se suma dos veces', duplicado.totales.efectivo, 3_075_000);
comprobar('y lo advierte al operador', duplicado.advertencias.length >= 1, true);

const riesgo = detectarRiesgoDeDobleConteo([
  { cargaExcelId: 'c1', tipoCorte: 'PARCIAL', tipoReporte: 'BLANCO', resultado: rConsolidado },
  { cargaExcelId: 'c2', tipoCorte: 'TOTAL', tipoReporte: 'BLANCO', resultado: rNegro },
]);
comprobar('avisa parcial + total del mismo reporte', riesgo.length, 1);

let errorFormato = '';
try {
  parsearReporteSoftRestaurant(aXls([['a', 'b'], ['1', '2']]), { nombreArchivo: 'basura.xls' });
} catch (e) {
  errorFormato = (e as Error).name;
}
comprobar('archivo ajeno es rechazado', errorFormato, 'ErrorParseoExcel');

console.log(
  fallos === 0
    ? '\nTodas las comprobaciones pasaron.\n'
    : `\n${fallos} comprobacion(es) fallaron.\n`,
);
process.exit(fallos === 0 ? 0 : 1);

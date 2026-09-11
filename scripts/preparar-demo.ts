/**
 * Prepara una noche de práctica para probar el cierre.
 *
 *   npm run demo               (muestra el escenario, sin escribir)
 *   npm run demo -- --aplicar
 *
 * Deja repartidores en turno, con abonos parciales y el Excel del día ya
 * importado, para poder ir directo a la pantalla de cierre.
 *
 * BORRA LOS MOVIMIENTOS EXISTENTES. Es para practicar, no para producción: si
 * encuentra cierres ya asentados se detiene, porque eso ya es historia
 * contable del negocio y no datos de práctica.
 */

import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';

import { prisma } from '../src/lib/db/prisma';
import { diaOperativoDe } from '../src/lib/fechas';
import { formatearMoneda } from '../src/lib/money/money';
import { registrarAbono } from '../src/server/services/abonos';
import { importarLote } from '../src/server/services/cargas';
import { abrirTurnoManual } from '../src/server/services/turnos';

const APLICAR = process.argv.includes('--aplicar');

/**
 * Quién trabaja esta noche y cuánto entregó ya.
 * NESTOR entra sin abonar nada: es el repartidor que liquida todo al final,
 * el caso que antes no se podía cerrar.
 */
const NOCHE: ReadonlyArray<{ idMesero: string; abonos: number[] }> = [
  { idMesero: '10', abonos: [2_000_000, 1_500_000] }, // DAVID-R
  { idMesero: '12', abonos: [2_500_000] }, // PINITO-R
  { idMesero: '16', abonos: [3_000_000] }, // FERNANDO-R
  { idMesero: '35', abonos: [] }, // NESTOR
];

/** Ventas del POS, en colones. efectivo, tarjeta, otros (SINPE), viajes. */
const BLANCO: Record<string, [number, number, number, number]> = {
  '10': [42_000, 12_500, 8_000, 11],
  '12': [31_000, 0, 5_500, 8],
  '16': [38_000, 4_500, 6_000, 10],
  '35': [19_000, 0, 0, 5],
  // Estos dos no están en turno esta noche, pero sus ventas salen igual en el
  // reporte: el cierre solo debe ofrecer a los que entraron.
  '13': [27_500, 9_000, 0, 7],
  '26': [35_500, 7_000, 4_000, 9],
  // Cuenta del local: la importación la reconoce y no la reclama.
  '25': [12_000, 3_000, 0, 4],
};

const NEGRO: Record<string, [number, number, number, number]> = {
  '10': [6_000, 0, 0, 2],
  '12': [4_500, 0, 0, 1],
  '16': [7_500, 0, 0, 2],
};

function excel(
  titulo: string,
  ventas: Record<string, [number, number, number, number]>,
  nombres: Map<string, string>,
): Buffer {
  const filas = Object.entries(ventas).map(([id, [efectivo, tarjeta, otros, viajes]]) => [
    id,
    nombres.get(id) ?? id,
    String(efectivo + tarjeta + otros),
    String(efectivo),
    String(tarjeta),
    String(otros),
    String(viajes),
  ]);
  const hoja = XLSX.utils.aoa_to_sheet([
    ['PIZZERIA EXPRESS S.A.'],
    [titulo],
    [`Del ${diaOperativoDe()} al ${diaOperativoDe()}`],
    [],
    ['idmesero', 'nombre', 'importe', 'efectivo', 'tarjeta', 'otros', 'nopersonas'],
    ...filas,
  ]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xls' }) as Buffer;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script no se ejecuta en produccion.');
  }

  const cierresExistentes = await prisma.cierreChofer.count();
  if (cierresExistentes > 0) {
    throw new Error(
      `Hay ${cierresExistentes} cierre(s) asentado(s). Eso es historia contable, no datos de practica. ` +
        'Respalde y limpie a mano si de verdad quiere rehacer el escenario.',
    );
  }

  const cajero = await prisma.cajero.findFirst({ where: { rol: 'ADMIN' } });
  if (!cajero) throw new Error('No hay cajero ADMIN. Ejecute npm run db:seed.');

  const choferes = await prisma.chofer.findMany({ where: { estado: 'ACTIVO' } });
  const porCodigo = new Map(choferes.map((c) => [c.idMeseroSoftRestaurant, c]));
  const nombres = new Map(choferes.map((c) => [c.idMeseroSoftRestaurant, c.nombre]));
  // La cuenta del local no está en la tabla de choferes; su nombre sale de aquí.
  nombres.set('25', 'CLIENTE EXPRESS');

  const faltantes = NOCHE.filter((n) => !porCodigo.has(n.idMesero));
  if (faltantes.length > 0) {
    throw new Error(
      `Faltan repartidores del padron: ${faltantes.map((f) => f.idMesero).join(', ')}. ` +
        'Ejecute npm run db:repartidores -- --aplicar',
    );
  }

  // --- Plan ---
  console.log(`Dia operativo: ${diaOperativoDe()}\n`);
  console.log('EN TURNO           ABONOS DE LA NOCHE   ESPERADO    FALTA ENTREGAR');
  let totalAbonos = 0;
  let totalEsperado = 0;

  for (const entrada of NOCHE) {
    const chofer = porCodigo.get(entrada.idMesero)!;
    const abonado = entrada.abonos.reduce((a, b) => a + b, 0);
    const esperado =
      ((BLANCO[entrada.idMesero]?.[0] ?? 0) + (NEGRO[entrada.idMesero]?.[0] ?? 0)) * 100;
    totalAbonos += abonado;
    totalEsperado += esperado;
    console.log(
      chofer.nombre.padEnd(18),
      formatearMoneda(abonado).padStart(12),
      formatearMoneda(esperado).padStart(14),
      formatearMoneda(Math.max(0, esperado - abonado)).padStart(14),
    );
  }

  console.log('');
  console.log(`Total ya en caja por abonos:      ${formatearMoneda(totalAbonos)}`);
  console.log(`Total esperado segun el POS:      ${formatearMoneda(totalEsperado)}`);
  console.log(`Falta entregar en el cierre:      ${formatearMoneda(totalEsperado - totalAbonos)}`);
  console.log(`Caja teorica si todos cuadran:    ${formatearMoneda(totalEsperado)}`);

  if (!APLICAR) {
    console.log('\nNo se escribio nada. Repita con --aplicar.');
    return;
  }

  // --- Escritura ---
  console.log('\nPreparando...');
  await prisma.eventoAuditoria.deleteMany();
  await prisma.tiquete.deleteMany();
  await prisma.abonoEfectivo.deleteMany();
  await prisma.turnoChofer.deleteMany();
  await prisma.ventaChoferExcel.deleteMany();
  await prisma.cargaExcel.deleteMany();

  for (const entrada of NOCHE) {
    const chofer = porCodigo.get(entrada.idMesero)!;
    await abrirTurnoManual(chofer.id, cajero.id, 'CAJA-1');
    for (const monto of entrada.abonos) {
      await registrarAbono({
        choferId: chofer.id,
        cajeroId: cajero.id,
        montoAbonado: monto,
        dispositivo: 'CAJA-1',
        claveIdempotencia: randomUUID(),
      });
    }
  }

  await importarLote(
    [
      {
        nombreArchivo: `blanco-${diaOperativoDe()}.xls`,
        tipoCorte: 'TOTAL',
        tipoReporte: 'BLANCO',
        contenido: excel('Ventas por mesero (facturado)', BLANCO, nombres),
      },
      {
        nombreArchivo: `negro-${diaOperativoDe()}.xls`,
        tipoCorte: 'TOTAL',
        tipoReporte: 'NEGRO',
        contenido: excel('Ventas por mesero (sin factura)', NEGRO, nombres),
      },
    ],
    cajero.id,
    diaOperativoDe(),
  );

  console.log('Listo. Abra http://localhost:3000 y toque "Cierre multiple".');
}

main()
  .catch((e) => {
    console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

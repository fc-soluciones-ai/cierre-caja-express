/**
 * Prueba de integracion del flujo completo de una jornada.
 *
 * Recorre lo que hace una caja real: abonos parciales durante el turno, carga
 * del Excel de Soft Restaurant, cierre de dos repartidores y arqueo, y despues
 * comprueba que las cifras y la bitacora quedaron como corresponde.
 *
 * Usa la base apuntada por DATABASE_URL. Ejecutar con: npm run test:servicios
 * (el script de npm la manda a prueba.db para no tocar la base de trabajo).
 */

import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';

import { prisma } from '@/lib/db/prisma';
import { normalizarNombre } from '@/lib/excel/columnas';
import { diaOperativoDe } from '@/lib/fechas';
import { aTextoPlano, deserializar } from '@/lib/print/documento';
import { formatearMoneda } from '@/lib/money/money';
import { esErrorNegocio } from '@/server/errores';
import { anularAbono, registrarAbono } from '@/server/services/abonos';
import { registrarArqueo } from '@/server/services/arqueos';
import { efectivoTeoricoEnCaja, resumenChoferesEnTurno } from '@/server/services/caja';
import { importarCarga, previsualizarCarga } from '@/server/services/cargas';
import { cerrarTurnos, previsualizarCierre } from '@/server/services/cierres';
import { crearChofer, desactivarChofer } from '@/server/services/choferes';
import { hashearPin, motivoPinInvalido, verificarPin } from '@/server/services/pin';
import {
  abrirTurnoManual,
  cancelarTurnoVacio,
  choferesDisponiblesParaTurno,
} from '@/server/services/turnos';
import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

/**
 * Ordena las claves de los objetos antes de comparar.
 *
 * Dos motores devuelven un groupBy en distinto orden, y comparar el JSON tal
 * cual haria fallar la prueba por algo que no le importa a nadie.
 */
function normalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, v]) => [clave, normalizar(v)]),
    );
  }
  return valor;
}

function comprobar(descripcion: string, real: unknown, esperado: unknown): void {
  const ok = JSON.stringify(normalizar(real)) === JSON.stringify(normalizar(esperado));
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${descripcion}`);
  if (!ok) {
    console.log(`      esperado: ${JSON.stringify(esperado)}`);
    console.log(`      obtenido: ${JSON.stringify(real)}`);
  }
}

async function limpiar(): Promise<void> {
  // Las tablas de flota van primero: apuntan a choferes y borrarlas despues
  // hace fallar el borrado de choferes por llave foranea.
  await prisma.registroMantenimiento.deleteMany();
  await prisma.asignacionMoto.deleteMany();
  await prisma.motocicleta.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.tiquete.deleteMany();
  await prisma.cierreChofer.deleteMany();
  await prisma.arqueoCaja.deleteMany();
  await prisma.abonoEfectivo.deleteMany();
  await prisma.turnoChofer.deleteMany();
  await prisma.ventaChoferExcel.deleteMany();
  await prisma.cargaExcel.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();
}

function excelConsolidado(filas: Array<[string, string, number, number, number, number, number]>) {
  const hoja = XLSX.utils.aoa_to_sheet([
    ['PIZZERIA EXPRESS S.A.'],
    ['Ventas por mesero'],
    [],
    ['idmesero', 'nombre', 'importe', 'efectivo', 'tarjeta', 'otros', 'nopersonas'],
    ...filas,
  ]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Reporte');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xls' }) as Buffer;
}

async function main(): Promise<void> {
  exigirBaseDePruebas();

  await limpiar();
  const dia = diaOperativoDe();
  console.log(`\nDia operativo de la prueba: ${dia}\n`);

  const cajero = await prisma.cajero.create({
    data: { nombre: 'Karla (Caja 1)', pin: 'hash-de-prueba', rol: 'ADMIN' },
  });

  // -------------------------------------------------------------------------
  console.log('--- Alta de repartidores ---');
  const tono = await crearChofer(
    { idMeseroSoftRestaurant: '12', nombre: 'Antonio Rojas' },
    cajero.id,
  );
  const maria = await crearChofer(
    { idMeseroSoftRestaurant: '7', nombre: 'Maria Fernandez' },
    cajero.id,
  );

  let codigoRepetido = '';
  try {
    await crearChofer({ idMeseroSoftRestaurant: '12', nombre: 'Otro' }, cajero.id);
  } catch (e) {
    codigoRepetido = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('codigo de mesero duplicado rechazado', codigoRepetido, 'DATOS_INVALIDOS');
  comprobar('nombre normalizado para cruce', normalizarNombre('Maria Fernandez'), 'MARIA FERNANDEZ');

  // -------------------------------------------------------------------------
  console.log('\n--- Abonos parciales ---');
  const abono1 = await registrarAbono({
    choferId: tono.id,
    cajeroId: cajero.id,
    montoAbonado: 1_500_000, // 15 000
    dispositivo: 'CAJA-1',
  });
  comprobar('el turno se abre solo con el primer abono', abono1.turnoId.length > 0, true);
  comprobar('saldo tras el primer abono', abono1.saldoAcumuladoTurno, 1_500_000);

  const abono2 = await registrarAbono({
    choferId: tono.id,
    cajeroId: cajero.id,
    montoAbonado: 800_000, // 8 000
    dispositivo: 'CAJA-1',
  });
  comprobar('saldo acumulado del turno', abono2.saldoAcumuladoTurno, 2_300_000);
  comprobar('cantidad de abonos del turno', abono2.cantidadAbonosTurno, 2);

  // Doble toque en la pantalla tactil: misma clave, un solo movimiento.
  const clave = randomUUID();
  const primerEnvio = await registrarAbono({
    choferId: maria.id,
    cajeroId: cajero.id,
    montoAbonado: 1_000_000,
    claveIdempotencia: clave,
  });
  const segundoEnvio = await registrarAbono({
    choferId: maria.id,
    cajeroId: cajero.id,
    montoAbonado: 1_000_000,
    claveIdempotencia: clave,
  });
  comprobar('el doble toque no crea un segundo abono', segundoEnvio.abonoId, primerEnvio.abonoId);
  comprobar('y se reporta como repetido', segundoEnvio.repetido, true);
  comprobar('el saldo no se duplico', segundoEnvio.saldoAcumuladoTurno, 1_000_000);

  // Anulacion por reverso.
  const abonoErrado = await registrarAbono({
    choferId: maria.id,
    cajeroId: cajero.id,
    montoAbonado: 5_000_000,
    nota: 'Monto tecleado de mas',
  });
  comprobar('saldo con el abono errado', abonoErrado.saldoAcumuladoTurno, 6_000_000);
  const anulacion = await anularAbono({
    abonoId: abonoErrado.abonoId,
    cajeroId: cajero.id,
    motivo: 'Digitacion incorrecta',
  });
  comprobar('el reverso deja el saldo como estaba', anulacion.saldoAcumuladoTurno, 1_000_000);

  let dobleAnulacion = '';
  try {
    await anularAbono({ abonoId: abonoErrado.abonoId, cajeroId: cajero.id, motivo: 'otra vez' });
  } catch (e) {
    dobleAnulacion = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('no se puede anular dos veces', dobleAnulacion, 'ABONO_YA_ANULADO');

  // -------------------------------------------------------------------------
  console.log('\n--- Efectivo en caja ---');
  const caja = await efectivoTeoricoEnCaja(dia);
  comprobar('efectivo en caja tras los abonos', caja.total, 3_300_000);

  // El dashboard muestra solo a quien esta en turno, no a todo el padron.
  const resumen = await resumenChoferesEnTurno();
  comprobar('el dashboard lista solo a los que estan en turno', resumen.length, 2);
  comprobar(
    'saldo de Antonio en la grilla',
    resumen.find((r) => r.choferId === tono.id)?.saldoAbonos,
    2_300_000,
  );

  // Un repartidor del padron que todavia no entro hoy.
  const kevin = await crearChofer(
    { idMeseroSoftRestaurant: '3', nombre: 'Kevin Solis' },
    cajero.id,
  );
  const disponibles = await choferesDisponiblesParaTurno();
  comprobar(
    'el que no ha entrado queda para el modal de entrada',
    disponibles.map((c) => c.id).includes(kevin.id),
    true,
  );
  comprobar(
    'y no aparece en el dashboard',
    (await resumenChoferesEnTurno()).map((c) => c.choferId).includes(kevin.id),
    false,
  );

  // Entrada marcada a mano, sin dinero de por medio.
  const entrada = await abrirTurnoManual(kevin.id, cajero.id, 'CAJA-1');
  comprobar('la entrada manual abre el turno', entrada.yaEstaba, false);
  comprobar('ahora hay tres en turno', (await resumenChoferesEnTurno()).length, 3);
  comprobar(
    'marcar dos veces no duplica el turno',
    (await abrirTurnoManual(kevin.id, cajero.id)).yaEstaba,
    true,
  );

  // Entrada por error: se puede deshacer mientras no haya recibido dinero.
  await cancelarTurnoVacio(kevin.id, cajero.id);
  comprobar('quitar de turno lo saca de la grilla', (await resumenChoferesEnTurno()).length, 2);
  comprobar(
    'y vuelve a estar disponible para entrar',
    (await choferesDisponiblesParaTurno()).map((c) => c.id).includes(kevin.id),
    true,
  );

  let quitarConDinero = '';
  try {
    await cancelarTurnoVacio(tono.id, cajero.id);
  } catch (e) {
    quitarConDinero = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('no se puede quitar a quien ya entrego dinero', quitarConDinero, 'DATOS_INVALIDOS');

  // -------------------------------------------------------------------------
  console.log('\n--- Carga del Excel ---');
  const archivo = excelConsolidado([
    ['12', 'Antonio Rojas', 31_250, 25_000, 3_250, 3_000, 6],
    ['7', 'Maria Fernandez', 18_500, 12_000, 0, 6_500, 3],
    ['99', 'Repartidor Nuevo', 4_000, 4_000, 0, 0, 1],
    // Cuenta del local: aparece en el reporte pero nadie la liquida.
    ['25', 'CLIENTE EXPRESS', 9_000, 9_000, 0, 0, 2],
  ]);

  const vista = await previsualizarCarga(archivo, {
    cajeroId: cajero.id,
    nombreArchivo: 'blanco-hoy.xls',
    tipoCorte: 'TOTAL',
    tipoReporte: 'BLANCO',
  });
  comprobar('la previsualizacion cruza a los conocidos', vista.lineas.filter((l) => l.choferId).length, 2);
  comprobar('y avisa del mesero sin registrar', vista.lineas.filter((l) => l.cruce === 'SIN_CRUZAR').length, 1);
  comprobar(
    'la cuenta del local se reconoce como tal',
    vista.lineas.filter((l) => l.cruce === 'EXCLUIDA').length,
    1,
  );
  comprobar(
    'y no genera advertencia',
    vista.advertencias.some((a) => a.includes('CLIENTE EXPRESS')),
    false,
  );
  comprobar(
    'el aviso solo menciona al mesero que falta',
    vista.advertencias.some((a) => a.includes('Repartidor Nuevo')),
    true,
  );
  comprobar('la previsualizacion no escribio nada', await prisma.cargaExcel.count(), 0);

  const carga = await importarCarga(archivo, {
    cajeroId: cajero.id,
    nombreArchivo: 'blanco-hoy.xls',
    tipoCorte: 'TOTAL',
    tipoReporte: 'BLANCO',
  });
  comprobar('lineas importadas', carga.lineasImportadas, 4);
  comprobar('lineas sin imputar', carga.lineasSinCruzar, 1);
  comprobar('cuentas del local contadas aparte', carga.lineasExcluidas, 1);

  let recarga = '';
  try {
    await importarCarga(archivo, {
      cajeroId: cajero.id,
      nombreArchivo: 'blanco-hoy-copia.xls',
      tipoCorte: 'TOTAL',
      tipoReporte: 'BLANCO',
    });
  } catch (e) {
    recarga = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('el mismo archivo no se carga dos veces', recarga, 'ARCHIVO_YA_CARGADO');

  // Segundo archivo: ventas sin factura, se consolidan sobre las anteriores.
  const archivoNegro = excelConsolidado([['12', 'Antonio Rojas', 6_000, 6_000, 0, 0, 1]]);
  await importarCarga(archivoNegro, {
    cajeroId: cajero.id,
    nombreArchivo: 'negro-hoy.xls',
    tipoCorte: 'TOTAL',
    tipoReporte: 'NEGRO',
  });

  // -------------------------------------------------------------------------
  console.log('\n--- Conciliacion ---');
  const previaTono = await previsualizarCierre(tono.id, dia);
  comprobar('esperado de Antonio consolidando blanco y negro', previaTono.efectivoEsperado, 3_100_000);
  comprobar('viajes consolidados', previaTono.viajesTotales, 7);
  comprobar('abonos ya entregados', previaTono.abonosParciales, 2_300_000);
  comprobar('falta por entregar', previaTono.sugerenciaEntrega, 800_000);
  comprobar('conciliado contra dos archivos', previaTono.cargas.length, 2);

  // -------------------------------------------------------------------------
  console.log('\n--- Cierre grupal con arqueo ---');
  // Antonio entrega exacto; a Maria le falta 1 000 colones.
  const cierre = await cerrarTurnos({
    cajeroId: cajero.id,
    diaOperativo: dia,
    dispositivo: 'CAJA-1',
    cierres: [
      { choferId: tono.id, efectivoEntregado: 800_000 },
      { choferId: maria.id, efectivoEntregado: 100_000 },
    ],
    arqueo: {
      efectivoRealContado: 4_200_000,
      claveIdempotencia: randomUUID(),
    },
  });

  const cierreTono = cierre.cierres.find((c) => c.choferId === tono.id);
  const cierreMaria = cierre.cierres.find((c) => c.choferId === maria.id);
  comprobar('Antonio queda cuadrado', cierreTono?.clasificacion, 'CUADRADO');
  comprobar('Antonio: diferencia cero', cierreTono?.diferencia, 0);
  comprobar('Maria queda con faltante', cierreMaria?.clasificacion, 'FALTANTE');
  comprobar('Maria: faltante de 1 000', cierreMaria?.diferencia, -100_000);

  // Teorico = abonos (33 000) + entregas del cierre (9 000) = 42 000.
  comprobar('efectivo teorico del arqueo', cierre.arqueo?.efectivoTeoricoCaja, 4_200_000);
  comprobar('la caja cuadra', cierre.arqueo?.diferenciaCaja, 0);

  const turnosAbiertos = await prisma.turnoChofer.count({ where: { estado: 'ABIERTO' } });
  comprobar('no quedan turnos abiertos', turnosAbiertos, 0);

  let recierre = '';
  try {
    await cerrarTurnos({
      cajeroId: cajero.id,
      diaOperativo: dia,
      cierres: [{ choferId: tono.id, efectivoEntregado: 0 }],
    });
  } catch (e) {
    recierre = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('un turno cerrado no se puede volver a cerrar', recierre, 'TURNO_NO_ABIERTO');

  // -------------------------------------------------------------------------
  console.log('\n--- PIN del cajero ---');
  comprobar('rechaza el PIN de fabrica', motivoPinInvalido('1234') !== null, true);
  comprobar('rechaza digitos repetidos', motivoPinInvalido('1111') !== null, true);
  comprobar('rechaza consecutivos ascendentes', motivoPinInvalido('3456') !== null, true);
  comprobar('rechaza consecutivos descendentes', motivoPinInvalido('9876') !== null, true);
  comprobar('rechaza letras', motivoPinInvalido('12a4') !== null, true);
  comprobar('rechaza demasiado corto', motivoPinInvalido('123') !== null, true);
  comprobar('rechaza demasiado largo', motivoPinInvalido('1234567') !== null, true);
  comprobar('acepta uno razonable', motivoPinInvalido('7392'), null);
  comprobar('acepta uno de seis digitos', motivoPinInvalido('483920'), null);

  const hash = hashearPin('7392');
  comprobar('el hash no contiene el PIN', hash.includes('7392'), false);
  comprobar('el PIN correcto verifica', verificarPin('7392', hash), true);
  comprobar('un PIN distinto no verifica', verificarPin('7393', hash), false);
  comprobar(
    'dos hash del mismo PIN son distintos por la sal',
    hashearPin('7392') === hashearPin('7392'),
    false,
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Guardas ---');
  const sinVentas = await crearChofer(
    { idMeseroSoftRestaurant: '55', nombre: 'Luis Mora' },
    cajero.id,
  );
  await registrarAbono({ choferId: sinVentas.id, cajeroId: cajero.id, montoAbonado: 500_000 });

  let bloqueoSinVentas = '';
  try {
    await cerrarTurnos({
      cajeroId: cajero.id,
      diaOperativo: dia,
      cierres: [{ choferId: sinVentas.id, efectivoEntregado: 500_000 }],
    });
  } catch (e) {
    bloqueoSinVentas = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('no deja cerrar sin el Excel cargado', bloqueoSinVentas, 'SIN_VENTAS_PARA_CHOFER');

  const forzado = await cerrarTurnos({
    cajeroId: cajero.id,
    diaOperativo: dia,
    cierres: [{ choferId: sinVentas.id, efectivoEntregado: 500_000, permitirSinVentas: true }],
  });
  comprobar('pero permite el cierre forzado', forzado.cierres[0]?.clasificacion, 'SOBRANTE');

  let desactivacion = '';
  const otro = await crearChofer(
    { idMeseroSoftRestaurant: '77', nombre: 'Ana Vega' },
    cajero.id,
  );
  await registrarAbono({ choferId: otro.id, cajeroId: cajero.id, montoAbonado: 100_000 });
  try {
    await desactivarChofer(otro.id, cajero.id);
  } catch (e) {
    desactivacion = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('no se desactiva a alguien con turno abierto', desactivacion, 'TURNO_YA_ABIERTO');

  // El teorico acumula TODO el dia operativo: los abonos de Antonio (23 000),
  // Maria (10 000), Luis (5 000) y Ana (1 000), mas lo entregado en los tres
  // cierres (8 000 + 1 000 + 5 000). Total 53 000.
  const arqueoDescuadrado = await registrarArqueo({
    cajeroId: cajero.id,
    efectivoRealContado: 4_700_000,
    diaOperativo: dia,
  });
  comprobar('el teorico suma abonos y entregas del dia', arqueoDescuadrado.efectivoTeoricoCaja, 5_300_000);
  comprobar('arqueo independiente detecta el faltante', arqueoDescuadrado.clasificacion, 'FALTANTE');
  comprobar('faltante de caja', arqueoDescuadrado.diferenciaCaja, -600_000);

  let desgloseMalo = '';
  try {
    await registrarArqueo({
      cajeroId: cajero.id,
      efectivoRealContado: 1_000_000,
      desglose: { '500000': 1 },
      diaOperativo: dia,
    });
  } catch (e) {
    desgloseMalo = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('el desglose que no suma se rechaza', desgloseMalo, 'MONTO_INVALIDO');

  // -------------------------------------------------------------------------
  console.log('\n--- Auditoria ---');
  const eventos = await prisma.eventoAuditoria.groupBy({ by: ['tipo'], _count: true });
  const porTipo = Object.fromEntries(eventos.map((e) => [e.tipo, e._count]));
  comprobar('eventos de abono registrados', porTipo['ABONO'], 6);
  comprobar('eventos de anulacion', porTipo['ABONO_ANULADO'], 1);
  comprobar('eventos de cierre', porTipo['CIERRE_CHOFER'], 3);
  comprobar('eventos de carga de Excel', porTipo['CARGA_EXCEL'], 2);

  const tiquetes = await prisma.tiquete.groupBy({ by: ['tipo'], _count: true });
  comprobar(
    'se genero un tiquete por movimiento',
    Object.fromEntries(tiquetes.map((t) => [t.tipo, t._count])),
    { ABONO: 6, ARQUEO: 2, CIERRE_CHOFER: 3, CIERRE_GRUPAL: 1 },
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Tiquetes ---');
  const tiqueteCierre = await prisma.tiquete.findFirst({
    where: { cierreChoferId: cierreMaria?.cierreId },
  });
  if (!tiqueteCierre) {
    comprobar('existe el tiquete del cierre de Maria', false, true);
  } else {
    const texto = aTextoPlano(deserializar(tiqueteCierre.contenidoTexto));
    comprobar('el tiquete anuncia el faltante', texto.includes('FALTANTE 1.000'), true);
    comprobar('y no lleva el simbolo del colon', texto.includes('₡'), false);
    const anchoMaximo = Math.max(...texto.split('\n').map((l) => l.length));
    comprobar('ninguna linea excede el papel de 80 mm', anchoMaximo <= 48, true);
    console.log('\n' + '='.repeat(48));
    console.log(texto);
    console.log('='.repeat(48));
  }

  const tiqueteDeAbono = await prisma.tiquete.findFirst({
    where: { abonoId: abono2.abonoId },
  });
  if (tiqueteDeAbono) {
    const texto = aTextoPlano(deserializar(tiqueteDeAbono.contenidoTexto));
    comprobar(
      'el tiquete de abono muestra el monto recibido',
      texto.includes(formatearMoneda(800_000, { conSimbolo: false })),
      true,
    );
    console.log('\n' + '='.repeat(48));
    console.log(texto);
    console.log('='.repeat(48));
  }

  await limpiar();
  console.log(
    fallos === 0
      ? '\nTodas las comprobaciones pasaron.\n'
      : `\n${fallos} comprobacion(es) fallaron.\n`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Plantillas de los tiquetes termicos de 80 mm.
 *
 * Cada plantilla es una funcion pura: datos entran, documento sale. No toca la
 * base de datos ni la impresora, asi que se puede previsualizar en pantalla y
 * comprobar en una prueba sin hardware.
 *
 * Los montos van SIN simbolo de moneda porque el colon (U+20A1) no existe en
 * las paginas de codigos de las impresoras termicas. La moneda se declara una
 * vez en el encabezado.
 */

import { formatearFechaHora } from '@/lib/fechas';
import { clasificarDiferencia, formatearMoneda, MONEDA } from '@/lib/money/money';
import { ANCHO_80MM, type BloqueTiquete, type DocumentoTiquete } from './documento';

/** Nombre del negocio en el encabezado. Configurable sin tocar codigo. */
const NEGOCIO = process.env.NOMBRE_NEGOCIO ?? 'PIZZERIA EXPRESS';

/** Monto para tiquete: sin simbolo, con separador de miles. */
function m(centimos: number): string {
  return formatearMoneda(centimos, { conSimbolo: false });
}

function encabezado(titulo: string, subtitulo?: string): BloqueTiquete[] {
  const bloques: BloqueTiquete[] = [
    { t: 'subtitulo', texto: NEGOCIO },
    { t: 'titulo', texto: titulo },
  ];
  if (subtitulo) bloques.push({ t: 'subtitulo', texto: subtitulo });
  bloques.push({ t: 'centrado', texto: `Montos en ${MONEDA}` });
  bloques.push({ t: 'separador', caracter: '=' });
  return bloques;
}

function pie(documentoId: string, reimpresion: boolean): BloqueTiquete[] {
  const bloques: BloqueTiquete[] = [{ t: 'separador' }];
  if (reimpresion) {
    bloques.push({ t: 'centrado', texto: '*** REIMPRESION ***', negrita: true });
  }
  bloques.push({ t: 'centrado', texto: `Doc ${documentoId}` });
  return bloques;
}

// ---------------------------------------------------------------------------
// Abono parcial
// ---------------------------------------------------------------------------

export interface DatosTiqueteAbono {
  abonoId: string;
  chofer: { nombre: string; idMeseroSoftRestaurant: string };
  montoAbonado: number;
  /** Suma de todos los abonos del turno, incluido este. */
  saldoAcumuladoTurno: number;
  cantidadAbonosTurno: number;
  cajero: string;
  dispositivo?: string | null;
  timestamp: Date;
  reimpresion?: boolean;
}

/**
 * Comprobante que se entrega al repartidor cada vez que deja efectivo.
 * Es su respaldo, asi que lleva el acumulado del turno y una linea de firma:
 * sin eso, una discusion al cierre no tiene como resolverse.
 */
export function tiqueteAbono(datos: DatosTiqueteAbono): DocumentoTiquete {
  return {
    v: 1,
    ancho: ANCHO_80MM,
    abrirCajon: true,
    bloques: [
      ...encabezado('Abono de efectivo'),
      { t: 'par', etiqueta: 'Repartidor', valor: datos.chofer.nombre },
      { t: 'par', etiqueta: 'Codigo mesero', valor: datos.chofer.idMeseroSoftRestaurant },
      { t: 'par', etiqueta: 'Fecha y hora', valor: formatearFechaHora(datos.timestamp) },
      { t: 'par', etiqueta: 'Cajero', valor: datos.cajero },
      ...(datos.dispositivo
        ? [{ t: 'par' as const, etiqueta: 'Caja', valor: datos.dispositivo }]
        : []),
      { t: 'separador' },
      { t: 'parGrande', etiqueta: 'RECIBIDO', valor: m(datos.montoAbonado) },
      { t: 'separador' },
      {
        t: 'par',
        etiqueta: `Acumulado del turno (${datos.cantidadAbonosTurno} ${
          datos.cantidadAbonosTurno === 1 ? 'abono' : 'abonos'
        })`,
        valor: m(datos.saldoAcumuladoTurno),
      },
      { t: 'espacio', lineas: 1 },
      {
        t: 'centrado',
        texto: 'Este comprobante no es el cierre del turno. Conservelo hasta la liquidacion.',
      },
      { t: 'firma', etiqueta: 'Firma del repartidor' },
      ...pie(datos.abonoId, datos.reimpresion === true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Cierre de turno de un chofer
// ---------------------------------------------------------------------------

export interface DatosTiqueteCierre {
  cierreId: string;
  chofer: { nombre: string; idMeseroSoftRestaurant: string };
  turno: { fechaApertura: Date; fechaCierre: Date };
  efectivoEsperado: number;
  tarjetaEsperada: number;
  sinpeEsperado: number;
  viajesTotales: number;
  abonosParciales: number;
  cantidadAbonos: number;
  efectivoEntregado: number;
  diferencia: number;
  cajero: string;
  archivos: Array<{ nombreArchivo: string; tipoReporte: string; tipoCorte: string }>;
  observacion?: string | null;
  reimpresion?: boolean;
}

export function tiqueteCierreChofer(datos: DatosTiqueteCierre): DocumentoTiquete {
  const clasificacion = clasificarDiferencia(datos.diferencia);
  const totalRecibido = datos.abonosParciales + datos.efectivoEntregado;

  const bloques: BloqueTiquete[] = [
    ...encabezado('Cierre de turno'),
    { t: 'par', etiqueta: 'Repartidor', valor: datos.chofer.nombre },
    { t: 'par', etiqueta: 'Codigo mesero', valor: datos.chofer.idMeseroSoftRestaurant },
    { t: 'par', etiqueta: 'Apertura', valor: formatearFechaHora(datos.turno.fechaApertura) },
    { t: 'par', etiqueta: 'Cierre', valor: formatearFechaHora(datos.turno.fechaCierre) },
    { t: 'par', etiqueta: 'Cajero', valor: datos.cajero },

    { t: 'separador', caracter: '=' },
    { t: 'linea', texto: 'VENTAS SEGUN SISTEMA', negrita: true },
    { t: 'par', etiqueta: 'Viajes realizados', valor: String(datos.viajesTotales) },
    { t: 'par', etiqueta: 'Efectivo', valor: m(datos.efectivoEsperado) },
    { t: 'par', etiqueta: 'Tarjeta', valor: m(datos.tarjetaEsperada) },
    { t: 'par', etiqueta: 'SINPE Movil', valor: m(datos.sinpeEsperado) },
    {
      t: 'par',
      etiqueta: 'Venta total',
      valor: m(datos.efectivoEsperado + datos.tarjetaEsperada + datos.sinpeEsperado),
      negrita: true,
    },

    { t: 'separador' },
    { t: 'linea', texto: 'EFECTIVO ENTREGADO EN CAJA', negrita: true },
    {
      t: 'par',
      etiqueta: `Abonos parciales (${datos.cantidadAbonos})`,
      valor: m(datos.abonosParciales),
    },
    { t: 'par', etiqueta: 'Entrega en el cierre', valor: m(datos.efectivoEntregado) },
    { t: 'par', etiqueta: 'Total recibido', valor: m(totalRecibido), negrita: true },

    { t: 'separador', caracter: '=' },
    { t: 'par', etiqueta: 'Efectivo esperado', valor: m(datos.efectivoEsperado) },
    { t: 'par', etiqueta: 'Efectivo recibido', valor: m(totalRecibido) },
  ];

  if (clasificacion === 'CUADRADO') {
    bloques.push({ t: 'destacado', texto: 'Cuadrado' });
  } else {
    bloques.push({
      t: 'destacado',
      texto: `${clasificacion} ${m(Math.abs(datos.diferencia))}`,
    });
  }

  bloques.push({ t: 'separador' });

  if (datos.archivos.length > 0) {
    bloques.push({ t: 'linea', texto: 'Reportes conciliados:' });
    for (const archivo of datos.archivos) {
      bloques.push({
        t: 'linea',
        texto: `  ${archivo.nombreArchivo} (${archivo.tipoReporte}/${archivo.tipoCorte})`,
      });
    }
  }

  if (datos.observacion) {
    bloques.push({ t: 'espacio', lineas: 1 });
    bloques.push({ t: 'linea', texto: `Observacion: ${datos.observacion}` });
  }

  bloques.push({ t: 'firma', etiqueta: 'Firma del repartidor' });
  bloques.push({ t: 'firma', etiqueta: 'Firma del cajero' });
  bloques.push(...pie(datos.cierreId, datos.reimpresion === true));

  return { v: 1, ancho: ANCHO_80MM, abrirCajon: true, bloques };
}

// ---------------------------------------------------------------------------
// Arqueo de caja
// ---------------------------------------------------------------------------

export interface DatosTiqueteArqueo {
  arqueoId: string;
  efectivoTeoricoCaja: number;
  efectivoRealContado: number;
  diferenciaCaja: number;
  desglose?: Record<number, number> | null;
  cajero: string;
  timestamp: Date;
  diaOperativo: string;
  observacion?: string | null;
  reimpresion?: boolean;
}

export function tiqueteArqueo(datos: DatosTiqueteArqueo): DocumentoTiquete {
  const clasificacion = clasificarDiferencia(datos.diferenciaCaja);

  const bloques: BloqueTiquete[] = [
    ...encabezado('Arqueo de caja', `Dia operativo ${datos.diaOperativo}`),
    { t: 'par', etiqueta: 'Fecha y hora', valor: formatearFechaHora(datos.timestamp) },
    { t: 'par', etiqueta: 'Cajero', valor: datos.cajero },
    { t: 'separador' },
  ];

  if (datos.desglose) {
    bloques.push({ t: 'linea', texto: 'CONTEO FISICO', negrita: true });
    const entradas = Object.entries(datos.desglose)
      .map(([den, cant]) => [Number(den), cant] as const)
      .filter(([, cant]) => cant > 0)
      .sort((a, b) => b[0] - a[0]);
    for (const [denominacion, cantidad] of entradas) {
      bloques.push({
        t: 'par',
        etiqueta: `  ${m(denominacion)} x ${cantidad}`,
        valor: m(denominacion * cantidad),
      });
    }
    bloques.push({ t: 'separador' });
  }

  bloques.push({ t: 'par', etiqueta: 'Efectivo teorico', valor: m(datos.efectivoTeoricoCaja) });
  bloques.push({ t: 'par', etiqueta: 'Efectivo contado', valor: m(datos.efectivoRealContado) });

  if (clasificacion === 'CUADRADO') {
    bloques.push({ t: 'destacado', texto: 'Caja cuadrada' });
  } else {
    bloques.push({
      t: 'destacado',
      texto: `${clasificacion} ${m(Math.abs(datos.diferenciaCaja))}`,
    });
  }

  if (datos.observacion) {
    bloques.push({ t: 'espacio', lineas: 1 });
    bloques.push({ t: 'linea', texto: `Observacion: ${datos.observacion}` });
  }

  bloques.push({ t: 'firma', etiqueta: 'Firma del cajero' });
  bloques.push({ t: 'firma', etiqueta: 'Firma del supervisor' });
  bloques.push(...pie(datos.arqueoId, datos.reimpresion === true));

  return { v: 1, ancho: ANCHO_80MM, bloques };
}

// ---------------------------------------------------------------------------
// Cierre grupal
// ---------------------------------------------------------------------------

export interface DatosTiqueteCierreGrupal {
  referencia: string;
  diaOperativo: string;
  cajero: string;
  timestamp: Date;
  choferes: Array<{
    nombre: string;
    efectivoEsperado: number;
    totalRecibido: number;
    diferencia: number;
    viajes: number;
  }>;
  arqueo?: {
    efectivoTeoricoCaja: number;
    efectivoRealContado: number;
    diferenciaCaja: number;
  } | null;
  reimpresion?: boolean;
}

/**
 * Resumen de un cierre de varios repartidores a la vez. El detalle de cada uno
 * sale en su propio tiquete; este es el que se archiva con el arqueo.
 */
export function tiqueteCierreGrupal(datos: DatosTiqueteCierreGrupal): DocumentoTiquete {
  const totales = datos.choferes.reduce(
    (acc, c) => ({
      esperado: acc.esperado + c.efectivoEsperado,
      recibido: acc.recibido + c.totalRecibido,
      diferencia: acc.diferencia + c.diferencia,
      viajes: acc.viajes + c.viajes,
    }),
    { esperado: 0, recibido: 0, diferencia: 0, viajes: 0 },
  );

  const bloques: BloqueTiquete[] = [
    ...encabezado('Cierre grupal', `Dia operativo ${datos.diaOperativo}`),
    { t: 'par', etiqueta: 'Fecha y hora', valor: formatearFechaHora(datos.timestamp) },
    { t: 'par', etiqueta: 'Cajero', valor: datos.cajero },
    { t: 'par', etiqueta: 'Repartidores cerrados', valor: String(datos.choferes.length) },
    { t: 'separador', caracter: '=' },
  ];

  for (const chofer of datos.choferes) {
    const clasificacion = clasificarDiferencia(chofer.diferencia);
    bloques.push({ t: 'linea', texto: chofer.nombre, negrita: true });
    bloques.push({
      t: 'par',
      etiqueta: `  ${chofer.viajes} viajes | esperado`,
      valor: m(chofer.efectivoEsperado),
    });
    bloques.push({ t: 'par', etiqueta: '  Recibido', valor: m(chofer.totalRecibido) });
    if (clasificacion !== 'CUADRADO') {
      bloques.push({
        t: 'par',
        etiqueta: `  ${clasificacion}`,
        valor: m(Math.abs(chofer.diferencia)),
        negrita: true,
      });
    }
  }

  bloques.push({ t: 'separador', caracter: '=' });
  bloques.push({ t: 'par', etiqueta: 'Viajes del grupo', valor: String(totales.viajes) });
  bloques.push({ t: 'par', etiqueta: 'Efectivo esperado', valor: m(totales.esperado) });
  bloques.push({ t: 'par', etiqueta: 'Efectivo recibido', valor: m(totales.recibido) });

  const clasificacionGrupo = clasificarDiferencia(totales.diferencia);
  bloques.push(
    clasificacionGrupo === 'CUADRADO'
      ? { t: 'destacado', texto: 'Grupo cuadrado' }
      : { t: 'destacado', texto: `${clasificacionGrupo} ${m(Math.abs(totales.diferencia))}` },
  );

  if (datos.arqueo) {
    bloques.push({ t: 'separador' });
    bloques.push({ t: 'linea', texto: 'ARQUEO DE CAJA', negrita: true });
    bloques.push({
      t: 'par',
      etiqueta: 'Teorico',
      valor: m(datos.arqueo.efectivoTeoricoCaja),
    });
    bloques.push({
      t: 'par',
      etiqueta: 'Contado',
      valor: m(datos.arqueo.efectivoRealContado),
    });
    const clasificacionCaja = clasificarDiferencia(datos.arqueo.diferenciaCaja);
    bloques.push({
      t: 'par',
      etiqueta: clasificacionCaja === 'CUADRADO' ? 'Caja' : clasificacionCaja,
      valor:
        clasificacionCaja === 'CUADRADO'
          ? 'CUADRADA'
          : m(Math.abs(datos.arqueo.diferenciaCaja)),
      negrita: true,
    });
  }

  bloques.push({ t: 'firma', etiqueta: 'Firma del cajero' });
  bloques.push(...pie(datos.referencia, datos.reimpresion === true));

  return { v: 1, ancho: ANCHO_80MM, bloques };
}

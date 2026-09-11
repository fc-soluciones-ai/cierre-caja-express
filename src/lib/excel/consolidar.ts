/**
 * Consolidacion de varios archivos en un solo esperado por chofer.
 *
 * El operador puede subir en la misma jornada:
 *   - un reporte BLANCO (facturado) y uno NEGRO (no facturado);
 *   - varios cortes PARCIALES a lo largo del turno mas el corte TOTAL.
 *
 * Todos se suman por chofer. El cruce se hace por idmesero cuando existe y
 * por nombre normalizado cuando el reporte no lo trae, nunca por posicion.
 */

import type { TipoCorte, TipoReporte } from '@/types/enums';
import type { ResultadoParseo, VentaChoferParseada } from './parser';

/** Un archivo ya parseado, con la clasificacion que le puso el operador. */
export interface ArchivoClasificado {
  /** Identificador de la carga en base de datos, o un id temporal en preview. */
  cargaExcelId: string;
  tipoCorte: TipoCorte;
  tipoReporte: TipoReporte;
  resultado: ResultadoParseo;
}

/** Aporte de un archivo concreto al total de un chofer. Para auditoria. */
export interface AporteOrigen {
  cargaExcelId: string;
  nombreArchivo: string;
  tipoCorte: TipoCorte;
  tipoReporte: TipoReporte;
  efectivo: number;
  tarjeta: number;
  sinpe: number;
  viajes: number;
}

export interface EsperadoChofer {
  idMeseroExcel: string;
  nombreExcel: string;
  nombreNormalizado: string;
  /** Centimos. */
  efectivoEsperado: number;
  tarjetaEsperada: number;
  sinpeEsperado: number;
  importeTotal: number;
  viajesTotales: number;
  origenes: AporteOrigen[];
}

export interface ResultadoConsolidacion {
  choferes: EsperadoChofer[];
  totales: {
    efectivo: number;
    tarjeta: number;
    sinpe: number;
    importe: number;
    viajes: number;
  };
  advertencias: string[];
}

/**
 * Indice que permite encontrar un chofer ya acumulado por cualquiera de sus
 * dos llaves. Un mismo chofer puede entrar primero por nombre (archivo sin
 * idmesero) y despues por id: en ese caso se fusionan las entradas.
 */
class IndiceChoferes {
  private readonly porId = new Map<string, EsperadoChofer>();
  private readonly porNombre = new Map<string, EsperadoChofer>();
  private readonly orden: EsperadoChofer[] = [];

  obtenerOCrear(venta: VentaChoferParseada): EsperadoChofer {
    const porId = venta.idMeseroExcel !== '' ? this.porId.get(venta.idMeseroExcel) : undefined;
    const porNombre =
      venta.nombreNormalizado !== '' ? this.porNombre.get(venta.nombreNormalizado) : undefined;

    if (porId && porNombre && porId !== porNombre) {
      // El mismo chofer se habia creado dos veces (un archivo sin id, otro con
      // id). Se fusiona el registro huerfano dentro del que tiene id.
      this.fusionar(porId, porNombre);
      this.porNombre.set(venta.nombreNormalizado, porId);
      return porId;
    }

    const existente = porId ?? porNombre;
    if (existente) {
      if (existente.idMeseroExcel === '' && venta.idMeseroExcel !== '') {
        existente.idMeseroExcel = venta.idMeseroExcel;
        this.porId.set(venta.idMeseroExcel, existente);
      }
      if (venta.nombreNormalizado !== '' && !this.porNombre.has(venta.nombreNormalizado)) {
        this.porNombre.set(venta.nombreNormalizado, existente);
      }
      return existente;
    }

    const nuevo: EsperadoChofer = {
      idMeseroExcel: venta.idMeseroExcel,
      nombreExcel: venta.nombreExcel,
      nombreNormalizado: venta.nombreNormalizado,
      efectivoEsperado: 0,
      tarjetaEsperada: 0,
      sinpeEsperado: 0,
      importeTotal: 0,
      viajesTotales: 0,
      origenes: [],
    };
    if (venta.idMeseroExcel !== '') this.porId.set(venta.idMeseroExcel, nuevo);
    if (venta.nombreNormalizado !== '') this.porNombre.set(venta.nombreNormalizado, nuevo);
    this.orden.push(nuevo);
    return nuevo;
  }

  private fusionar(destino: EsperadoChofer, origen: EsperadoChofer): void {
    destino.efectivoEsperado += origen.efectivoEsperado;
    destino.tarjetaEsperada += origen.tarjetaEsperada;
    destino.sinpeEsperado += origen.sinpeEsperado;
    destino.importeTotal += origen.importeTotal;
    destino.viajesTotales += origen.viajesTotales;
    destino.origenes.push(...origen.origenes);
    const i = this.orden.indexOf(origen);
    if (i >= 0) this.orden.splice(i, 1);
  }

  listar(): EsperadoChofer[] {
    return this.orden;
  }
}

export function consolidarArchivos(
  archivos: readonly ArchivoClasificado[],
): ResultadoConsolidacion {
  const advertencias: string[] = [];
  const indice = new IndiceChoferes();

  const hashesVistos = new Map<string, string>();
  for (const archivo of archivos) {
    const previo = hashesVistos.get(archivo.resultado.hashArchivo);
    if (previo) {
      advertencias.push(
        `"${archivo.resultado.nombreArchivo}" tiene el mismo contenido que "${previo}". Se descarto para no duplicar ventas.`,
      );
      continue;
    }
    hashesVistos.set(archivo.resultado.hashArchivo, archivo.resultado.nombreArchivo);
    advertencias.push(...archivo.resultado.advertencias);

    for (const venta of archivo.resultado.ventas) {
      const chofer = indice.obtenerOCrear(venta);
      chofer.efectivoEsperado += venta.efectivo;
      chofer.tarjetaEsperada += venta.tarjeta;
      chofer.sinpeEsperado += venta.sinpe;
      chofer.importeTotal += venta.importeTotal;
      chofer.viajesTotales += venta.viajes;
      chofer.origenes.push({
        cargaExcelId: archivo.cargaExcelId,
        nombreArchivo: archivo.resultado.nombreArchivo,
        tipoCorte: archivo.tipoCorte,
        tipoReporte: archivo.tipoReporte,
        efectivo: venta.efectivo,
        tarjeta: venta.tarjeta,
        sinpe: venta.sinpe,
        viajes: venta.viajes,
      });
    }
  }

  const choferes = indice.listar();
  choferes.sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado, 'es'));

  const totales = choferes.reduce(
    (acc, c) => ({
      efectivo: acc.efectivo + c.efectivoEsperado,
      tarjeta: acc.tarjeta + c.tarjetaEsperada,
      sinpe: acc.sinpe + c.sinpeEsperado,
      importe: acc.importe + c.importeTotal,
      viajes: acc.viajes + c.viajesTotales,
    }),
    { efectivo: 0, tarjeta: 0, sinpe: 0, importe: 0, viajes: 0 },
  );

  return { choferes, totales, advertencias: [...new Set(advertencias)] };
}

/**
 * Advierte cuando un corte PARCIAL y el corte TOTAL del mismo tipo de reporte
 * se cargan juntos: sumarlos duplicaria las ventas del parcial.
 * No bloquea, porque hay operaciones donde el TOTAL solo cubre la segunda
 * mitad del turno; la decision es del cajero, pero debe verla.
 */
export function detectarRiesgoDeDobleConteo(
  archivos: readonly ArchivoClasificado[],
): string[] {
  const avisos: string[] = [];
  for (const tipoReporte of ['BLANCO', 'NEGRO'] as const) {
    const delTipo = archivos.filter((a) => a.tipoReporte === tipoReporte);
    const tieneTotal = delTipo.some((a) => a.tipoCorte === 'TOTAL');
    const parciales = delTipo.filter((a) => a.tipoCorte === 'PARCIAL');
    if (tieneTotal && parciales.length > 0) {
      avisos.push(
        `Hay un corte TOTAL y ${parciales.length} corte(s) PARCIAL(es) del reporte ${tipoReporte}. Si el TOTAL ya incluye lo del parcial, las ventas se estarian contando dos veces.`,
      );
    }
  }
  return avisos;
}

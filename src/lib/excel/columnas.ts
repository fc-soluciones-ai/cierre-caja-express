/**
 * Reconocimiento de columnas de los reportes de Soft Restaurant.
 *
 * Los .xls que exporta National Soft no son una tabla limpia: traen filas de
 * encabezado con el nombre del restaurante, el rango de fechas y a veces una
 * fila en blanco antes de los titulos reales. Ademas los titulos cambian de
 * redaccion entre versiones ("Id Mesero", "IDMESERO", "Clave mesero").
 *
 * Por eso no se asume una fila fija: se busca la fila de titulos y se mapea
 * cada columna a un campo canonico por lista de sinonimos.
 */

/** Campos canonicos que el sistema entiende. */
export type CampoCanonico =
  | 'idmesero'
  | 'nombre'
  | 'numcheque'
  | 'efectivo'
  | 'tarjeta'
  | 'otros'
  | 'total'
  | 'importe'
  | 'nopersonas';

/**
 * Sinonimos por campo, en orden de prioridad. Un titulo del Excel se asigna
 * al PRIMER campo que lo reclame, para que "mesero" caiga en idmesero y no
 * en nombre cuando ambos existen.
 */
const SINONIMOS: ReadonlyArray<readonly [CampoCanonico, readonly string[]]> = [
  ['idmesero', ['idmesero', 'idmeseros', 'idempleado', 'clavemesero', 'clave', 'idmesera', 'codigomesero', 'idusuario']],
  ['numcheque', ['numcheque', 'nocheque', 'numerocheque', 'numerodecheque', 'cheque', 'folio', 'numfolio', 'ticket', 'comprobante']],
  ['nopersonas', ['nopersonas', 'numpersonas', 'npersonas', 'personas', 'nopersona', 'comensales', 'numerodepersonas']],
  ['nombre', ['nombre', 'nombremesero', 'mesero', 'meseros', 'empleado', 'nombreempleado', 'descripcion']],
  ['efectivo', ['efectivo', 'contado', 'cash', 'pagoefectivo', 'totalefectivo']],
  ['tarjeta', ['tarjeta', 'tarjetas', 'tarjetacredito', 'tarjetadecredito', 'tdc', 'pagotarjeta', 'totaltarjeta']],
  ['otros', ['otros', 'otro', 'otrospagos', 'otrasformasdepago', 'otrasformas', 'sinpe', 'sinpemovil', 'transferencia']],
  ['importe', ['importe', 'importetotal', 'venta', 'ventas', 'ventatotal', 'subtotal']],
  ['total', ['total', 'totalcheque', 'totalgeneral', 'granTotal', 'totalventa']],
];

/** Quita acentos, espacios, signos y baja a minusculas. */
export function normalizarTitulo(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Normaliza un nombre de persona para cruzarlo entre sistemas. */
export function normalizarNombre(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mapa columna del Excel (indice) -> campo canonico. */
export type MapaColumnas = Map<number, CampoCanonico>;

/**
 * Intenta mapear una fila de titulos. Devuelve el mapa y cuantos campos
 * distintos reconocio, para poder elegir la mejor fila candidata.
 */
export function mapearFilaTitulos(fila: readonly unknown[]): {
  mapa: MapaColumnas;
  reconocidos: number;
} {
  const mapa: MapaColumnas = new Map();
  const yaAsignados = new Set<CampoCanonico>();

  const titulos = fila.map((celda) => normalizarTitulo(celda));

  for (const [campo, sinonimos] of SINONIMOS) {
    if (yaAsignados.has(campo)) continue;
    for (let col = 0; col < titulos.length; col += 1) {
      if (mapa.has(col)) continue;
      const titulo = titulos[col];
      if (!titulo) continue;
      if (sinonimos.some((s) => normalizarTitulo(s) === titulo)) {
        mapa.set(col, campo);
        yaAsignados.add(campo);
        break;
      }
    }
  }

  return { mapa, reconocidos: yaAsignados.size };
}

/**
 * Recorre las primeras filas de la hoja buscando la fila de titulos.
 * Devuelve el indice de esa fila y su mapa de columnas.
 *
 * Exige al menos 3 campos reconocidos para no confundir una fila de datos
 * o un subtitulo con los titulos reales.
 */
export function detectarEncabezado(
  filas: ReadonlyArray<readonly unknown[]>,
  maxFilasAExplorar = 30,
): { filaTitulos: number; mapa: MapaColumnas } | null {
  const limite = Math.min(filas.length, maxFilasAExplorar);
  let mejor: { filaTitulos: number; mapa: MapaColumnas; reconocidos: number } | null = null;

  for (let i = 0; i < limite; i += 1) {
    const fila = filas[i];
    if (!fila) continue;
    const { mapa, reconocidos } = mapearFilaTitulos(fila);
    if (reconocidos >= 3 && (mejor === null || reconocidos > mejor.reconocidos)) {
      mejor = { filaTitulos: i, mapa, reconocidos };
    }
  }

  if (!mejor) return null;
  return { filaTitulos: mejor.filaTitulos, mapa: mejor.mapa };
}

/** Invierte el mapa para consultar por campo. */
export function indiceDe(mapa: MapaColumnas, campo: CampoCanonico): number | null {
  for (const [col, c] of mapa) {
    if (c === campo) return col;
  }
  return null;
}

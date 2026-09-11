/**
 * Manejo de dinero.
 *
 * REGLA UNICA: dentro del sistema el dinero SIEMPRE viaja como entero en la
 * unidad menor de la moneda (centimos). No existe un solo `number` decimal
 * representando colones en la base de datos ni en la capa de servicio.
 * La conversion a decimal ocurre unicamente al formatear para pantalla o
 * tiquete, y al leer un Excel.
 *
 * El factor de conversion NO es un 100 reflejo: sale del exponente ISO 4217 de
 * la moneda configurada. CRC tiene exponente 2; si manana el sistema se usa en
 * un pais con moneda de cero decimales, el factor cambia solo aqui.
 */

/** Exponente ISO 4217 de las monedas que este sistema puede manejar. */
const EXPONENTE_ISO_4217: Record<string, number> = {
  CRC: 2, // colon costarricense
  USD: 2,
  MXN: 2,
  GTQ: 2,
  NIO: 2,
  PAB: 2,
  COP: 2,
  CLP: 0, // sin decimales
  JPY: 0,
  PYG: 0,
};

export const MONEDA = (process.env.MONEDA ?? 'CRC').toUpperCase();

export function exponenteDe(moneda: string = MONEDA): number {
  const exp = EXPONENTE_ISO_4217[moneda];
  if (exp === undefined) {
    throw new Error(
      `Moneda "${moneda}" sin exponente ISO 4217 conocido. Agreguela a EXPONENTE_ISO_4217 antes de usarla.`,
    );
  }
  return exp;
}

function factorDe(moneda: string = MONEDA): number {
  return 10 ** exponenteDe(moneda);
}

/** Simbolo para pantalla y tiquete. */
const SIMBOLO: Record<string, string> = {
  CRC: '₡', // colon
  USD: '$',
  MXN: '$',
  GTQ: 'Q',
  NIO: 'C$',
  PAB: 'B/.',
  COP: '$',
  CLP: '$',
  JPY: '¥',
  PYG: '₲',
};

// ---------------------------------------------------------------------------
// Conversiones
// ---------------------------------------------------------------------------

/**
 * Convierte un valor decimal (lo que trae un Excel o escribe un humano) a
 * centimos enteros. Lanza si el valor no es finito.
 */
export function aCentimos(valor: number, moneda: string = MONEDA): number {
  if (!Number.isFinite(valor)) {
    throw new Error(`Monto no numerico: ${String(valor)}`);
  }
  // Math.round sobre el producto es suficiente porque los importes de un POS
  // no superan el rango seguro de un double antes de redondear.
  return Math.round(valor * factorDe(moneda));
}

/** Convierte centimos a decimal. Usar SOLO para mostrar o exportar. */
export function deCentimos(centimos: number, moneda: string = MONEDA): number {
  return centimos / factorDe(moneda);
}

/**
 * Interpreta un monto escrito por un humano o exportado por Soft Restaurant.
 * Acepta "12.345,67", "12,345.67", "12345", "₡12 345,50", "(1.200)" y
 * "-1200". Devuelve centimos enteros. Devuelve 0 para vacio o guion.
 */
export function parsearMontoTexto(
  entrada: unknown,
  moneda: string = MONEDA,
): number {
  if (entrada === null || entrada === undefined) return 0;
  if (typeof entrada === 'number') return aCentimos(entrada, moneda);

  let texto = String(entrada).trim();
  if (texto === '' || texto === '-' || texto === '--') return 0;

  // Parentesis contables = negativo.
  let negativo = false;
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1);
  }
  if (texto.startsWith('-')) {
    negativo = true;
    texto = texto.slice(1);
  }

  // Quita simbolo de moneda, espacios (incluido el fino) y letras.
  texto = texto.replace(/[^\d.,]/g, '');
  if (texto === '') return 0;

  const comas = (texto.match(/,/g) ?? []).length;
  const puntos = (texto.match(/\./g) ?? []).length;
  const ultimaComa = texto.lastIndexOf(',');
  const ultimoPunto = texto.lastIndexOf('.');

  /** Deja un unico separador decimal (punto) y borra los de miles. */
  function separarEn(decimal: ',' | '.'): string {
    const miles = decimal === ',' ? '.' : ',';
    const sinMiles = texto.split(miles).join('');
    const corte = sinMiles.lastIndexOf(decimal);
    return `${sinMiles.slice(0, corte).split(decimal).join('')}.${sinMiles.slice(corte + 1)}`;
  }

  let normalizado: string;
  if (comas === 0 && puntos === 0) {
    normalizado = texto;
  } else if (comas > 0 && puntos > 0) {
    // Ambos presentes: el ultimo en aparecer es el separador decimal.
    normalizado = ultimaComa > ultimoPunto ? separarEn(',') : separarEn('.');
  } else {
    // Un solo tipo de separador. Repetido es miles ("1.234.567"). Una sola
    // vez seguida de exactamente tres digitos tambien es miles ("1.200"),
    // que es como Soft Restaurant exporta cuando la celda va como texto.
    const separador = comas > 0 ? ',' : '.';
    const repetido = comas > 1 || puntos > 1;
    const decimalesTrasSeparador = texto.length - 1 - texto.lastIndexOf(separador);
    if (repetido || decimalesTrasSeparador === 3) {
      normalizado = texto.split(separador).join('');
    } else {
      normalizado = texto.split(separador).join('.');
    }
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) {
    throw new Error(`No se pudo interpretar el monto: "${String(entrada)}"`);
  }
  return aCentimos(negativo ? -valor : valor, moneda);
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/** Inserta el punto de miles cada tres digitos. */
function agruparMiles(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formatea centimos para pantalla: "₡12.500" o "₡12.500,50".
 *
 * El agrupado se hace a mano en vez de con Intl porque el separador de miles
 * de "es-CR" cambia entre versiones de ICU (punto en unas, espacio fino en
 * otras) y un tiquete de caja no puede cambiar de aspecto al actualizar Node.
 *
 * Los decimales se omiten cuando el monto es exacto: en caja de colones nadie
 * cuenta centimos y el ruido visual estorba en pantalla tactil.
 */
export function formatearMoneda(
  centimos: number,
  opciones: { conSimbolo?: boolean; forzarDecimales?: boolean; moneda?: string } = {},
): string {
  const moneda = opciones.moneda ?? MONEDA;
  const exp = exponenteDe(moneda);
  const factor = factorDe(moneda);

  const negativo = centimos < 0;
  const absoluto = Math.abs(centimos);
  const exacto = absoluto % factor === 0;
  const conDecimales = exp > 0 && (!exacto || opciones.forzarDecimales === true);

  const entero = agruparMiles(String(Math.trunc(absoluto / factor)));
  const texto = conDecimales
    ? `${entero},${String(absoluto % factor).padStart(exp, '0')}`
    : entero;

  const simbolo = opciones.conSimbolo === false ? '' : (SIMBOLO[moneda] ?? '');
  return `${negativo ? '-' : ''}${simbolo}${texto}`;
}

/** Version sin separador de miles para tiquetes de ancho fijo si hiciera falta. */
export function formatearParaTiquete(centimos: number): string {
  return formatearMoneda(centimos, { conSimbolo: true });
}

// ---------------------------------------------------------------------------
// Conciliacion
// ---------------------------------------------------------------------------

/**
 * Reconoce, por el nombre de la clave, si un valor de la bitacora es dinero.
 *
 * El detalle de un evento se guarda como JSON libre con los montos en
 * centimos, que es como deben almacenarse. Mostrarlos crudos obligaria a
 * dividir entre cien mentalmente, asi que tanto la ficha en pantalla como el
 * reporte exportado deciden con esta misma regla.
 */
const CLAVES_DE_DINERO =
  /efectivo|monto|abono|entregad|esperad|teorico|contado|diferencia|saldo|importe|total/i;

export function esClaveDeDinero(clave: string): boolean {
  return CLAVES_DE_DINERO.test(clave);
}

export type ResultadoDiferencia = 'CUADRADO' | 'SOBRANTE' | 'FALTANTE';

/**
 * Diferencia de un cierre de chofer.
 * diferencia = (abonos parciales + efectivo entregado) - efectivo esperado
 * Positiva = sobrante, negativa = faltante.
 */
export function calcularDiferencia(
  abonosParciales: number,
  efectivoEntregado: number,
  efectivoEsperado: number,
): number {
  return abonosParciales + efectivoEntregado - efectivoEsperado;
}

export function clasificarDiferencia(diferencia: number): ResultadoDiferencia {
  if (diferencia === 0) return 'CUADRADO';
  return diferencia > 0 ? 'SOBRANTE' : 'FALTANTE';
}

// ---------------------------------------------------------------------------
// Arqueo fisico
// ---------------------------------------------------------------------------

/** Denominaciones circulantes de CRC, en centimos, de mayor a menor. */
export const DENOMINACIONES_CRC: readonly number[] = [
  2_000_000, // 20 000
  1_000_000, // 10 000
  500_000, //  5 000
  200_000, //  2 000
  100_000, //  1 000
  50_000, //    500
  10_000, //    100
  5_000, //     50
  2_500, //     25
  1_000, //     10
  500, //        5
];

/**
 * Suma un conteo fisico. La llave del objeto es la denominacion en centimos y
 * el valor la cantidad de piezas contadas.
 */
export function totalizarDesglose(desglose: Record<number, number>): number {
  return Object.entries(desglose).reduce((acc, [denominacion, cantidad]) => {
    const den = Number(denominacion);
    if (!Number.isInteger(den) || den <= 0) {
      throw new Error(`Denominacion invalida: ${denominacion}`);
    }
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      throw new Error(`Cantidad invalida para ${denominacion}: ${cantidad}`);
    }
    return acc + den * cantidad;
  }, 0);
}

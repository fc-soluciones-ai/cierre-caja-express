/**
 * Padron de repartidores del negocio.
 *
 * Sale del catalogo de empleados de Soft Restaurant, tomando las filas de tipo
 * REPARTIDOR que estan marcadas como activas, menos las cuentas genericas que
 * se listan mas abajo.
 *
 * EL CODIGO ES TEXTO, NO UN NUMERO. En el catalogo conviven "03" y "3" como
 * dos empleados distintos. Si alguna vez se guarda como numero, los ceros a la
 * izquierda desaparecen y las ventas de una persona se le imputan a otra. Por
 * eso el campo es String en la base y aqui van entre comillas.
 *
 * El nombre se copia EXACTO como lo tiene Soft Restaurant, con sus espacios y
 * guiones. Ademas de identificar a la persona en pantalla, es la llave de
 * respaldo cuando un reporte no trae la columna idmesero.
 */

export interface RepartidorDelPadron {
  /** Columna de codigo del catalogo de Soft Restaurant. */
  idMesero: string;
  nombre: string;
}

export const REPARTIDORES: readonly RepartidorDelPadron[] = [
  { idMesero: '10', nombre: 'DAVID-R' },
  { idMesero: '12', nombre: 'PINITO-R' },
  { idMesero: '13', nombre: 'YEISON -R' },
  { idMesero: '16', nombre: 'FERNANDO-R' },
  { idMesero: '23', nombre: 'ROMARIO EXP' },
  { idMesero: '26', nombre: 'TONO-R' },
  { idMesero: '35', nombre: 'NESTOR' },
];

/**
 * Las cuentas del POS que NO son repartidores (CLIENTE LLEVAR-R, CLIENTE
 * EXPRESS) viven en src/server/config/cuentasDelPos.ts, porque la aplicacion
 * las necesita en cada importacion y no solo al sembrar la base.
 */

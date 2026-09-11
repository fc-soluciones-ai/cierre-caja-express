/**
 * Cuentas del punto de venta que NO son repartidores.
 *
 * Soft Restaurant las clasifica como REPARTIDOR porque es el tipo que usa para
 * los pedidos que salen del local, pero detras no hay una persona: nadie
 * entrega efectivo por ellas al final del turno y no deben aparecer en el
 * dashboard ni en la pantalla de cierre.
 *
 * Sus ventas siguen apareciendo en el Excel, y la importacion las reconoce y
 * las deja pasar en silencio. La alternativa seria un aviso diario que el
 * cajero aprende a ignorar, y el dia que un repartidor de verdad falte del
 * padron el aviso ya no le diria nada.
 *
 * Si el negocio agrega otra cuenta de este tipo, se anota aqui. Cuando sean
 * muchas o cambien seguido, conviene moverlas a una tabla editable desde la
 * pantalla de choferes.
 */

import { normalizarNombre } from '@/lib/excel/columnas';

export interface CuentaDelPos {
  /** Codigo del catalogo de Soft Restaurant, como texto. */
  idMesero: string;
  nombre: string;
  motivo: string;
}

export const CUENTAS_DEL_POS: readonly CuentaDelPos[] = [
  {
    idMesero: '14',
    nombre: 'CLIENTE LLEVAR-R',
    motivo: 'Cuenta del POS para pedidos para llevar',
  },
  {
    idMesero: '25',
    nombre: 'CLIENTE EXPRESS',
    motivo: 'Cuenta del POS para pedidos express',
  },
];

const POR_CODIGO = new Map(CUENTAS_DEL_POS.map((c) => [c.idMesero, c]));
const POR_NOMBRE = new Map(
  CUENTAS_DEL_POS.map((c) => [normalizarNombre(c.nombre), c]),
);

/**
 * Reconoce una linea del Excel como cuenta del local.
 *
 * Se comprueba por codigo y tambien por nombre, porque hay reportes de Soft
 * Restaurant que no traen la columna idmesero.
 */
export function cuentaDelPos(
  idMesero: string,
  nombreNormalizado: string,
): CuentaDelPos | null {
  if (idMesero !== '') {
    const porCodigo = POR_CODIGO.get(idMesero);
    if (porCodigo) return porCodigo;
  }
  if (nombreNormalizado !== '') {
    const porNombre = POR_NOMBRE.get(nombreNormalizado);
    if (porNombre) return porNombre;
  }
  return null;
}

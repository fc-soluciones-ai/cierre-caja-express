/**
 * Valores validos de las columnas tipo "enum" del esquema.
 *
 * SQLite no soporta enums nativos en Prisma, asi que las columnas son String.
 * Este archivo es la unica definicion autorizada de los valores permitidos y
 * se usa tanto para validar con Zod como para tipar el codigo.
 */

export const ESTADO_CHOFER = ['ACTIVO', 'INACTIVO'] as const;
export type EstadoChofer = (typeof ESTADO_CHOFER)[number];

export const ESTADO_TURNO = ['ABIERTO', 'CERRADO'] as const;
export type EstadoTurno = (typeof ESTADO_TURNO)[number];

export const TIPO_CORTE = ['PARCIAL', 'TOTAL'] as const;
export type TipoCorte = (typeof TIPO_CORTE)[number];

/** BLANCO = venta facturada. NEGRO = venta no facturada. */
export const TIPO_REPORTE = ['BLANCO', 'NEGRO'] as const;
export type TipoReporte = (typeof TIPO_REPORTE)[number];

/**
 * Formato del archivo de Soft Restaurant:
 * - DETALLADO:   ventasmeserosdetallado.xls, una fila por cheque.
 * - CONSOLIDADO: 09-09-26.xls, una fila por mesero ya sumada.
 */
export const FORMATO_EXCEL = ['DETALLADO', 'CONSOLIDADO'] as const;
export type FormatoExcel = (typeof FORMATO_EXCEL)[number];

export const TIPO_TIQUETE = [
  'ABONO',
  'CIERRE_CHOFER',
  'ARQUEO',
  'CIERRE_GRUPAL',
] as const;
export type TipoTiquete = (typeof TIPO_TIQUETE)[number];

export const ESTADO_IMPRESION = ['PENDIENTE', 'IMPRESO', 'ERROR'] as const;
export type EstadoImpresion = (typeof ESTADO_IMPRESION)[number];

export const TIPO_EVENTO = [
  'ABONO',
  'ABONO_ANULADO',
  'CARGA_EXCEL',
  'CIERRE_CHOFER',
  'ARQUEO',
  'CHOFER_CREADO',
  'CHOFER_EDITADO',
  'CHOFER_DESACTIVADO',
  'TURNO_ABIERTO',
  'TURNO_CANCELADO',
  'REIMPRESION',
  'LOGIN',
  'LOGIN_FALLIDO',
  'CAJERO_BLOQUEADO',
  'RESPALDO',
] as const;
export type TipoEvento = (typeof TIPO_EVENTO)[number];

export const ROL_CAJERO = ['CAJERO', 'SUPERVISOR', 'ADMIN'] as const;
export type RolCajero = (typeof ROL_CAJERO)[number];

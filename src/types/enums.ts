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
  'PIN_CAMBIADO',
  'RESPALDO',
  'MOTO_CREADA',
  'MOTO_EDITADA',
  'MOTO_ESTADO',
  'MOTO_ASIGNADA',
  'MOTO_LIBERADA',
  'EVIDENCIA',
  'MANTENIMIENTO',
] as const;
export type TipoEvento = (typeof TIPO_EVENTO)[number];

export const ROL_CAJERO = ['CAJERO', 'SUPERVISOR', 'ADMIN'] as const;
export type RolCajero = (typeof ROL_CAJERO)[number];

/**
 * Estado de una motocicleta.
 *
 * EN_MANTENIMIENTO es temporal y se espera que vuelva; FUERA_DE_SERVICIO es
 * para la moto que no va a volver pronto, por accidente o por venta. Las dos
 * disparan el reemplazo por la comodin, pero conviene distinguirlas en los
 * reportes.
 */
export const ESTADO_MOTO = ['OPERATIVA', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO'] as const;
export type EstadoMoto = (typeof ESTADO_MOTO)[number];

export const TIPO_MANTENIMIENTO = ['PREVENTIVO', 'CORRECTIVO'] as const;
export type TipoMantenimiento = (typeof TIPO_MANTENIMIENTO)[number];

/** RTV es la revision tecnica vehicular de Costa Rica. */
export const CATEGORIA_MANTENIMIENTO = [
  'GASOLINA',
  'CAMBIO_ACEITE',
  'LLANTAS',
  'FRENOS',
  'REPUESTOS',
  'RTV',
  'SEGURO',
  'OTRO',
] as const;
export type CategoriaMantenimiento = (typeof CATEGORIA_MANTENIMIENTO)[number];

/** FIJA es la moto de siempre del chofer; COMODIN es el reemplazo temporal. */
export const TIPO_ASIGNACION = ['FIJA', 'COMODIN'] as const;
export type TipoAsignacion = (typeof TIPO_ASIGNACION)[number];

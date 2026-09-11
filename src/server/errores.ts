/**
 * Errores de negocio.
 *
 * Se distinguen de un fallo tecnico porque el cajero puede hacer algo al
 * respecto. La capa HTTP los traduce a un 4xx con el mensaje tal cual: en una
 * pantalla tactil el operador necesita leer que paso, no un codigo.
 */

export type CodigoErrorNegocio =
  | 'CHOFER_NO_ENCONTRADO'
  | 'CHOFER_INACTIVO'
  | 'TURNO_NO_ABIERTO'
  | 'TURNO_YA_ABIERTO'
  | 'TURNO_YA_CERRADO'
  | 'MONTO_INVALIDO'
  | 'ARCHIVO_YA_CARGADO'
  | 'SIN_VENTAS_PARA_CHOFER'
  | 'CAJERO_NO_ENCONTRADO'
  | 'ABONO_YA_ANULADO'
  | 'ABONO_DE_TURNO_CERRADO'
  | 'TIQUETE_NO_ENCONTRADO'
  | 'DATOS_INVALIDOS';

export class ErrorNegocio extends Error {
  readonly codigo: CodigoErrorNegocio;
  readonly detalle?: unknown;

  constructor(codigo: CodigoErrorNegocio, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export function esErrorNegocio(e: unknown): e is ErrorNegocio {
  return e instanceof ErrorNegocio;
}

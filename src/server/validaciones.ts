/**
 * Validacion de entrada de los servicios.
 *
 * Todo monto que entra al sistema pasa por aqui y se valida como entero en
 * centimos. Un decimal recibido desde el cliente se rechaza en vez de
 * redondearse en silencio: un redondeo callado en una caja es un faltante que
 * aparece tres dias despues sin explicacion.
 */

import { z } from 'zod';

import { ESTADO_CHOFER, TIPO_CORTE, TIPO_REPORTE } from '@/types/enums';

/** Tope de seguridad: un abono de mas de 10 millones de colones es un error de digitacion. */
const MAXIMO_RAZONABLE_CENTIMOS = 1_000_000_000;

const centimosPositivos = z
  .number()
  .int('El monto debe venir en centimos enteros, sin decimales.')
  .positive('El monto debe ser mayor que cero.')
  .max(MAXIMO_RAZONABLE_CENTIMOS, 'El monto excede el limite permitido en una operacion.');

const centimosNoNegativos = z
  .number()
  .int('El monto debe venir en centimos enteros, sin decimales.')
  .min(0, 'El monto no puede ser negativo.')
  .max(MAXIMO_RAZONABLE_CENTIMOS, 'El monto excede el limite permitido en una operacion.');

const idCuid = z.string().min(1, 'Identificador requerido.');

/**
 * Llave de idempotencia. Debe ser un UUID generado por el cliente con
 * crypto.randomUUID(). Un contador o una marca de tiempo colisionan entre
 * cajas y dejarian pasar el doble toque que esta llave existe para frenar.
 */
const claveIdempotencia = z
  .string()
  .uuid('La clave de idempotencia debe ser un UUID generado con crypto.randomUUID().');

export const esquemaAbono = z.object({
  choferId: idCuid,
  cajeroId: idCuid,
  montoAbonado: centimosPositivos,
  dispositivo: z.string().max(60).optional(),
  nota: z.string().max(300).optional(),
  claveIdempotencia: claveIdempotencia.optional(),
});
export type EntradaAbono = z.infer<typeof esquemaAbono>;

export const esquemaAnulacionAbono = z.object({
  abonoId: idCuid,
  cajeroId: idCuid,
  motivo: z.string().min(3, 'Indique el motivo de la anulacion.').max(300),
  dispositivo: z.string().max(60).optional(),
});
export type EntradaAnulacionAbono = z.infer<typeof esquemaAnulacionAbono>;

export const esquemaCargaExcel = z.object({
  cajeroId: idCuid,
  nombreArchivo: z.string().min(1),
  tipoCorte: z.enum(TIPO_CORTE),
  tipoReporte: z.enum(TIPO_REPORTE),
  diaOperativo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'El dia operativo debe tener formato yyyy-mm-dd.')
    .optional(),
});
export type EntradaCargaExcel = z.infer<typeof esquemaCargaExcel>;

export const esquemaCierreChofer = z.object({
  choferId: idCuid,
  efectivoEntregado: centimosNoNegativos,
  observacion: z.string().max(300).optional(),
  /**
   * Permite cerrar a un repartidor que no aparece en ningun Excel del dia.
   * Por defecto se bloquea: cerrar antes de importar el reporte registraria
   * todo lo entregado como sobrante y falsearia el arqueo.
   */
  permitirSinVentas: z.boolean().optional(),
});
export type EntradaCierreChofer = z.infer<typeof esquemaCierreChofer>;

export const esquemaCierreLote = z.object({
  cajeroId: idCuid,
  diaOperativo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'El dia operativo debe tener formato yyyy-mm-dd.')
    .optional(),
  cierres: z.array(esquemaCierreChofer).min(1, 'Seleccione al menos un repartidor.'),
  arqueo: z
    .object({
      efectivoRealContado: centimosNoNegativos,
      desglose: z.record(z.string(), z.number().int().min(0)).optional(),
      observacion: z.string().max(300).optional(),
      claveIdempotencia: claveIdempotencia.optional(),
    })
    .optional(),
  dispositivo: z.string().max(60).optional(),
});
export type EntradaCierreLote = z.infer<typeof esquemaCierreLote>;

export const esquemaArqueo = z.object({
  cajeroId: idCuid,
  efectivoRealContado: centimosNoNegativos,
  desglose: z.record(z.string(), z.number().int().min(0)).optional(),
  observacion: z.string().max(300).optional(),
  diaOperativo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  claveIdempotencia: claveIdempotencia.optional(),
});
export type EntradaArqueo = z.infer<typeof esquemaArqueo>;

export const esquemaChofer = z.object({
  idMeseroSoftRestaurant: z
    .string()
    .min(1, 'El codigo de mesero de Soft Restaurant es obligatorio.')
    .max(30),
  nombre: z.string().min(2, 'El nombre es obligatorio.').max(80),
  fotoUrl: z.string().max(300).optional(),
  telefono: z.string().max(30).optional(),
  estado: z.enum(ESTADO_CHOFER).optional(),
});
export type EntradaChofer = z.infer<typeof esquemaChofer>;

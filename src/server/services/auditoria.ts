/**
 * Bitacora de auditoria.
 *
 * Se escribe DENTRO de la misma transaccion que el movimiento que describe.
 * Si el movimiento se revierte, su evento tambien: nunca queda un asiento en
 * la bitacora que no corresponda a nada, ni un movimiento sin rastro.
 */

import type { Prisma } from '@prisma/client';

import type { TipoEvento } from '@/types/enums';

export interface EntradaEvento {
  tipo: TipoEvento;
  cajeroId?: string | null;
  choferId?: string | null;
  entidadTipo?: string;
  entidadId?: string;
  /** Centimos, si el evento mueve dinero. */
  monto?: number | null;
  detalle?: Record<string, unknown>;
  dispositivo?: string | null;
}

export async function registrarEvento(
  tx: Prisma.TransactionClient,
  entrada: EntradaEvento,
): Promise<void> {
  await tx.eventoAuditoria.create({
    data: {
      tipo: entrada.tipo,
      cajeroId: entrada.cajeroId ?? null,
      choferId: entrada.choferId ?? null,
      entidadTipo: entrada.entidadTipo ?? null,
      entidadId: entrada.entidadId ?? null,
      monto: entrada.monto ?? null,
      detalle: entrada.detalle ? JSON.stringify(entrada.detalle) : null,
      dispositivo: entrada.dispositivo ?? null,
    },
  });
}

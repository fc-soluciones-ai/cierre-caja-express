/**
 * Despacho y reimpresion de tiquetes.
 *
 * Un tiquete se crea dentro de la transaccion del movimiento que documenta y
 * nace en estado PENDIENTE. El envio a la impresora ocurre despues, fuera de
 * la transaccion, y solo actualiza el estado del tiquete.
 *
 * Consecuencia buscada: con la impresora apagada la caja sigue operando y
 * queda una cola de pendientes que se imprime cuando vuelve.
 */

import { prisma } from '@/lib/db/prisma';
import { aTextoPlano, deserializar, type DocumentoTiquete } from '@/lib/print/documento';
import { imprimirDocumento } from '@/lib/print/impresora';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';

export interface ResultadoDespacho {
  tiqueteId: string;
  impreso: boolean;
  error?: string;
}

/** Envia un tiquete ya guardado y registra como le fue. */
export async function despacharTiquete(
  tiqueteId: string,
  opciones: { copias?: number } = {},
): Promise<ResultadoDespacho> {
  if (tiqueteId === '') return { tiqueteId, impreso: false, error: 'Tiquete inexistente.' };

  const tiquete = await prisma.tiquete.findUnique({ where: { id: tiqueteId } });
  if (!tiquete) {
    return { tiqueteId, impreso: false, error: 'Tiquete inexistente.' };
  }

  let documento: DocumentoTiquete;
  try {
    documento = deserializar(tiquete.contenidoTexto);
  } catch (e) {
    await prisma.tiquete.update({
      where: { id: tiqueteId },
      data: { estadoImpresion: 'ERROR', ultimoError: (e as Error).message },
    });
    return { tiqueteId, impreso: false, error: (e as Error).message };
  }

  const resultado = await imprimirDocumento(documento, opciones);

  // En modo NONE no hay impresora y nada salio en papel. Marcarlo IMPRESO
  // dejaria a una caja mal configurada creyendo que entrego comprobantes que
  // nunca existieron, asi que el tiquete queda pendiente con el motivo.
  const sinImpresora = resultado.modo === 'NONE';

  await prisma.tiquete.update({
    where: { id: tiqueteId },
    data: {
      estadoImpresion: sinImpresora ? 'PENDIENTE' : resultado.ok ? 'IMPRESO' : 'ERROR',
      intentos: { increment: 1 },
      ultimoError: sinImpresora
        ? 'Impresora desactivada (IMPRESORA_MODO=NONE).'
        : resultado.ok
          ? null
          : (resultado.error ?? 'Error desconocido'),
    },
  });

  return {
    tiqueteId,
    impreso: resultado.ok && !sinImpresora,
    error: sinImpresora ? 'Impresora desactivada (IMPRESORA_MODO=NONE).' : resultado.error,
  };
}

/**
 * Reimprime un tiquete existente. El documento guardado se marca como
 * reimpresion en el papel para que no se confunda con el original, pero el
 * documento almacenado no se modifica.
 */
export async function reimprimirTiquete(
  tiqueteId: string,
  contexto: { cajeroId: string; dispositivo?: string },
): Promise<ResultadoDespacho> {
  const tiquete = await prisma.tiquete.findUnique({ where: { id: tiqueteId } });
  if (!tiquete) {
    throw new ErrorNegocio('TIQUETE_NO_ENCONTRADO', 'El tiquete indicado no existe.');
  }

  const documento = deserializar(tiquete.contenidoTexto);
  const marcado: DocumentoTiquete = {
    ...documento,
    abrirCajon: false,
    bloques: [
      { t: 'centrado', texto: '*** REIMPRESION ***', negrita: true },
      ...documento.bloques,
    ],
  };

  const resultado = await imprimirDocumento(marcado);

  // Misma regla que en el despacho: en modo NONE no salio papel, y decir lo
  // contrario haria que el cajero diera por entregado un comprobante que no
  // existe.
  const sinImpresora = resultado.modo === 'NONE';
  const error = sinImpresora
    ? 'Impresora desactivada (IMPRESORA_MODO=NONE).'
    : resultado.error;
  const impreso = resultado.ok && !sinImpresora;

  await prisma.$transaction(async (tx) => {
    await tx.tiquete.update({
      where: { id: tiqueteId },
      // Solo se cuenta una copia mas si de verdad salio una copia mas.
      data: {
        ...(impreso ? { copias: { increment: 1 } } : {}),
        intentos: { increment: 1 },
        ultimoError: impreso ? null : (error ?? 'Error desconocido'),
      },
    });
    await registrarEvento(tx, {
      tipo: 'REIMPRESION',
      cajeroId: contexto.cajeroId,
      entidadTipo: 'Tiquete',
      entidadId: tiqueteId,
      dispositivo: contexto.dispositivo,
      detalle: { tipoTiquete: tiquete.tipo, impreso },
    });
  });

  return { tiqueteId, impreso, error };
}

/** Vista previa en pantalla, con el mismo ancho que el papel. */
export async function previsualizarTiquete(tiqueteId: string): Promise<string> {
  const tiquete = await prisma.tiquete.findUnique({ where: { id: tiqueteId } });
  if (!tiquete) {
    throw new ErrorNegocio('TIQUETE_NO_ENCONTRADO', 'El tiquete indicado no existe.');
  }
  return aTextoPlano(deserializar(tiquete.contenidoTexto));
}

/** Reintenta los tiquetes que quedaron sin imprimir. */
export async function despacharPendientes(limite = 20): Promise<ResultadoDespacho[]> {
  const pendientes = await prisma.tiquete.findMany({
    where: { estadoImpresion: { in: ['PENDIENTE', 'ERROR'] }, intentos: { lt: 5 } },
    orderBy: { createdAt: 'asc' },
    take: limite,
    select: { id: true },
  });
  const resultados: ResultadoDespacho[] = [];
  for (const p of pendientes) {
    resultados.push(await despacharTiquete(p.id));
  }
  return resultados;
}

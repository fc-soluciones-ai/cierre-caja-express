/**
 * Envio a la impresora termica.
 *
 * Modo NETWORK: socket TCP crudo al puerto 9100 de la impresora. Es el camino
 * mas corto y no depende del driver de Windows ni de un dialogo de impresion
 * que bloquearia la pantalla tactil.
 *
 * Modo NONE: no imprime, solo devuelve exito. Sirve para desarrollo y para que
 * la caja siga operando si la impresora se cae: el tiquete queda guardado en
 * la tabla y se reimprime despues.
 *
 * REGLA: una falla de impresion NUNCA revierte un movimiento de dinero. El
 * dinero ya se recibio; el papel es secundario. Por eso imprimir ocurre
 * despues de confirmar la transaccion, y su resultado se guarda aparte.
 */

import { createConnection } from 'node:net';

import { aEscPos, type DocumentoTiquete } from './documento';

export type ModoImpresora = 'NETWORK' | 'NONE';

export interface ResultadoImpresion {
  ok: boolean;
  modo: ModoImpresora;
  error?: string;
}

interface ConfiguracionImpresora {
  modo: ModoImpresora;
  host: string;
  puerto: number;
  timeoutMs: number;
}

function leerConfiguracion(): ConfiguracionImpresora {
  const modoCrudo = (process.env.IMPRESORA_MODO ?? 'NONE').toUpperCase();
  const modo: ModoImpresora = modoCrudo === 'NETWORK' ? 'NETWORK' : 'NONE';
  return {
    modo,
    host: process.env.IMPRESORA_HOST ?? '127.0.0.1',
    puerto: Number(process.env.IMPRESORA_PUERTO ?? 9100),
    timeoutMs: Number(process.env.IMPRESORA_TIMEOUT_MS ?? 4000),
  };
}

function enviarPorSocket(
  bytes: Buffer,
  config: ConfiguracionImpresora,
): Promise<ResultadoImpresion> {
  return new Promise((resolver) => {
    let resuelto = false;
    const terminar = (resultado: ResultadoImpresion): void => {
      if (resuelto) return;
      resuelto = true;
      resolver(resultado);
    };

    const socket = createConnection({ host: config.host, port: config.puerto });
    socket.setTimeout(config.timeoutMs);

    socket.on('connect', () => {
      socket.write(bytes, () => socket.end());
    });
    socket.on('close', () => terminar({ ok: true, modo: 'NETWORK' }));
    socket.on('timeout', () => {
      socket.destroy();
      terminar({
        ok: false,
        modo: 'NETWORK',
        error: `La impresora ${config.host}:${config.puerto} no respondio en ${config.timeoutMs} ms.`,
      });
    });
    socket.on('error', (e) => {
      socket.destroy();
      terminar({ ok: false, modo: 'NETWORK', error: e.message });
    });
  });
}

/**
 * Imprime un documento. Nunca lanza: devuelve el resultado para que quien
 * llama decida, porque el dinero ya esta registrado y una excepcion aqui
 * tumbaria una operacion que fue correcta.
 */
export async function imprimirDocumento(
  documento: DocumentoTiquete,
  opciones: { copias?: number } = {},
): Promise<ResultadoImpresion> {
  const config = leerConfiguracion();
  const copias = Math.max(1, Math.min(opciones.copias ?? 1, 5));

  if (config.modo === 'NONE') {
    return { ok: true, modo: 'NONE' };
  }

  try {
    const unaCopia = aEscPos(documento);
    const bytes = copias === 1 ? unaCopia : Buffer.concat(Array<Buffer>(copias).fill(unaCopia));
    return await enviarPorSocket(bytes, config);
  } catch (e) {
    return { ok: false, modo: config.modo, error: (e as Error).message };
  }
}

/** Comprobacion de conectividad para la pantalla de configuracion. */
export async function probarImpresora(): Promise<ResultadoImpresion> {
  return imprimirDocumento({
    v: 1,
    ancho: 48,
    bloques: [
      { t: 'titulo', texto: 'Prueba' },
      { t: 'centrado', texto: 'La impresora responde correctamente.' },
      { t: 'centrado', texto: 'Acentos: aeiou ANOn' },
    ],
  });
}

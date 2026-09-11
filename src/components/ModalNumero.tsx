'use client';

/**
 * Captura de un numero con el teclado tactil, sin llamar al servidor.
 *
 * Sirve para dos cosas que se teclean igual pero significan distinto:
 *
 *   MONEDA     el valor entra en colones enteros y sale en centimos, que es
 *              como viaja el dinero en todo el sistema.
 *   KILOMETROS el valor entra y sale tal cual, en kilometros enteros.
 *
 * Es la misma pantalla porque para el cajero es el mismo gesto. Lo que cambia
 * es la unidad, y por eso la unidad se declara en vez de adivinarse.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Numpad } from '@/components/Numpad';
import { aCentimos, deCentimos, formatearMoneda } from '@/lib/money/money';

export type UnidadNumero = 'MONEDA' | 'KILOMETROS';

interface Props {
  titulo: string;
  subtitulo?: string;
  unidad?: UnidadNumero;
  /** Valor inicial, en la unidad de salida (centimos o kilometros). */
  valorInicial: number;
  /** Valor sugerido, en la unidad de salida. */
  sugerencia?: { etiqueta: string; valor: number } | null;
  /** Atajos que se SUMAN a lo tecleado, en la unidad visible. */
  atajos?: number[];
  /** Devuelve centimos o kilometros, segun la unidad. */
  onConfirmar: (valor: number) => void;
  onCancelar: () => void;
}

const MAXIMO_DIGITOS = 8;

export function ModalNumero({
  titulo,
  subtitulo,
  unidad = 'MONEDA',
  valorInicial,
  sugerencia = null,
  atajos,
  onConfirmar,
  onCancelar,
}: Props) {
  const esMoneda = unidad === 'MONEDA';

  /** De la unidad de salida a la que se teclea. */
  const aVisible = useCallback(
    (valor: number) => (esMoneda ? Math.round(deCentimos(valor)) : valor),
    [esMoneda],
  );
  /** De lo tecleado a la unidad de salida. */
  const aSalida = useCallback(
    (visible: number) => (esMoneda ? aCentimos(visible) : Math.round(visible)),
    [esMoneda],
  );

  const formatear = useCallback(
    (visible: number) =>
      esMoneda
        ? formatearMoneda(aCentimos(visible))
        : `${formatearMoneda(aCentimos(visible), { conSimbolo: false })} km`,
    [esMoneda],
  );

  const [digitos, setDigitos] = useState(
    valorInicial > 0 ? String(aVisible(valorInicial)) : '',
  );
  const visible = digitos === '' ? 0 : Number(digitos);

  // El atajo de Enter lee de la referencia y no del estado: teclear el valor y
  // confirmar de inmediato dejaria al oyente con el numero anterior.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const confirmar = useCallback(() => {
    onConfirmar(aSalida(visibleRef.current));
  }, [aSalida, onConfirmar]);

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelar();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCancelar]);

  const rapidos = atajos ?? (esMoneda ? [1000, 5000, 10000, 20000] : [10, 100, 500, 1000]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta flex w-full max-w-xl flex-col p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{titulo}</h2>
            {subtitulo ? <p className="mt-1 text-slate-400">{subtitulo}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={onCancelar}
          >
            ×
          </button>
        </header>

        <div className="mt-5 rounded-2xl border border-borde bg-fondo p-5 text-right">
          <p className="cifra text-cifraGrande text-entrada">{formatear(visible)}</p>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {sugerencia ? (
            <button
              type="button"
              className="h-14 rounded-xl border border-entrada bg-entrada/15 text-sm font-semibold text-entrada active:scale-95"
              onClick={() => setDigitos(String(aVisible(sugerencia.valor)))}
            >
              {sugerencia.etiqueta}
            </button>
          ) : (
            <div aria-hidden="true" />
          )}
          {rapidos.map((monto) => (
            <button
              key={monto}
              type="button"
              className="h-14 rounded-xl border border-borde bg-panelClaro text-sm font-semibold text-slate-200 active:scale-95"
              onClick={() =>
                setDigitos((actual) => {
                  const total = (actual === '' ? 0 : Number(actual)) + monto;
                  const texto = String(total);
                  return texto.length > MAXIMO_DIGITOS ? actual : texto;
                })
              }
            >
              +{formatearMoneda(aCentimos(monto), { conSimbolo: false })}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <Numpad
            onDigito={(d) =>
              setDigitos((actual) => {
                const siguiente = (actual + d).replace(/^0+(?=\d)/, '');
                return siguiente.length > MAXIMO_DIGITOS ? actual : siguiente;
              })
            }
            onBorrar={() => setDigitos((a) => a.slice(0, -1))}
            onLimpiar={() => setDigitos('')}
            onConfirmar={confirmar}
          />
        </div>

        <button
          type="button"
          className="boton-tactil mt-4 h-20 w-full bg-entrada text-xl text-slate-950"
          onClick={confirmar}
        >
          Aceptar {formatear(visible)}
        </button>
      </div>
    </div>
  );
}

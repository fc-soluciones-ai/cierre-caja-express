'use client';

/**
 * Captura de un monto con el teclado tactil, sin llamar al servidor.
 *
 * Lo usa la pantalla de cierre para el efectivo que entrega cada repartidor y
 * para el conteo del arqueo. A diferencia del modal de abono, aqui el monto
 * solo vuelve al formulario: nada se guarda hasta que el cajero confirma el
 * cierre completo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Numpad } from '@/components/Numpad';
import { aCentimos, deCentimos, formatearMoneda } from '@/lib/money/money';

interface Props {
  titulo: string;
  subtitulo?: string;
  /** Monto inicial en centimos. */
  valorInicial: number;
  /** Monto que cuadraria la operacion, si existe. */
  sugerencia?: { etiqueta: string; centimos: number } | null;
  onConfirmar: (centimos: number) => void;
  onCancelar: () => void;
}

const MONTOS_RAPIDOS = [1000, 5000, 10000, 20000];
const MAXIMO_DIGITOS = 8;

export function ModalMonto({
  titulo,
  subtitulo,
  valorInicial,
  sugerencia = null,
  onConfirmar,
  onCancelar,
}: Props) {
  const [digitos, setDigitos] = useState(
    valorInicial > 0 ? String(Math.round(deCentimos(valorInicial))) : '',
  );

  const colones = digitos === '' ? 0 : Number(digitos);

  // El atajo de Enter lee de la referencia y no del estado: teclear el monto y
  // confirmar de inmediato dejaria al oyente con el valor anterior.
  const colonesRef = useRef(colones);
  colonesRef.current = colones;

  const confirmar = useCallback(() => {
    onConfirmar(aCentimos(colonesRef.current));
  }, [onConfirmar]);

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelar();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCancelar]);

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
          <p className="cifra text-cifraGrande text-entrada">
            {formatearMoneda(aCentimos(colones))}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {sugerencia ? (
            <button
              type="button"
              className="h-14 rounded-xl border border-entrada bg-entrada/15 text-sm font-semibold text-entrada active:scale-95"
              onClick={() => setDigitos(String(Math.round(deCentimos(sugerencia.centimos))))}
            >
              {sugerencia.etiqueta}
            </button>
          ) : (
            <div aria-hidden="true" />
          )}
          {MONTOS_RAPIDOS.map((monto) => (
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
          Aceptar {formatearMoneda(aCentimos(colones))}
        </button>
      </div>
    </div>
  );
}

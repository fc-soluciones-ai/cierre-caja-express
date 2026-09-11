'use client';

/**
 * Teclado numerico tactil.
 *
 * Se usa igual para teclear un monto y para el PIN del cajero. Las teclas
 * miden 80 px de alto porque el operador escribe con el dedo, muchas veces con
 * guante, y una tecla de tamano de escritorio produce errores de digitacion
 * que despues aparecen como faltantes de caja.
 *
 * Acepta tambien el teclado fisico: varias cajas tienen uno conectado y
 * obligar al mouse seria mas lento.
 */

import { useEffect } from 'react';

interface Props {
  onDigito: (digito: string) => void;
  onBorrar: () => void;
  onLimpiar: () => void;
  onConfirmar?: () => void;
  /** Tecla extra de la esquina inferior izquierda. null deja el hueco vacio. */
  teclaExtra?: { etiqueta: string; valor: string } | null;
  deshabilitado?: boolean;
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Numpad({
  onDigito,
  onBorrar,
  onLimpiar,
  onConfirmar,
  teclaExtra = { etiqueta: '00', valor: '00' },
  deshabilitado = false,
}: Props) {
  useEffect(() => {
    if (deshabilitado) return;
    function alPresionar(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') {
        onDigito(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onBorrar();
      } else if (e.key === 'Delete' || e.key === 'Escape') {
        onLimpiar();
      } else if (e.key === 'Enter' && onConfirmar) {
        e.preventDefault();
        onConfirmar();
      }
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onDigito, onBorrar, onLimpiar, onConfirmar, deshabilitado]);

  const claseTecla =
    'h-20 rounded-2xl bg-panelClaro text-3xl font-bold text-slate-100 ' +
    'border border-borde transition active:scale-95 active:bg-borde ' +
    'disabled:opacity-40 cifra';

  return (
    <div className="grid grid-cols-3 gap-3">
      {TECLAS.map((tecla) => (
        <button
          key={tecla}
          type="button"
          className={claseTecla}
          disabled={deshabilitado}
          onClick={() => onDigito(tecla)}
        >
          {tecla}
        </button>
      ))}

      {teclaExtra ? (
        <button
          type="button"
          className={claseTecla}
          disabled={deshabilitado}
          onClick={() => onDigito(teclaExtra.valor)}
        >
          {teclaExtra.etiqueta}
        </button>
      ) : (
        <div aria-hidden="true" />
      )}

      <button
        type="button"
        className={claseTecla}
        disabled={deshabilitado}
        onClick={() => onDigito('0')}
      >
        0
      </button>

      <button
        type="button"
        aria-label="Borrar el ultimo digito"
        className={
          'h-20 rounded-2xl border border-borde bg-panelClaro text-2xl font-bold ' +
          'text-aviso transition active:scale-95 active:bg-borde disabled:opacity-40'
        }
        disabled={deshabilitado}
        onClick={onBorrar}
        onDoubleClick={onLimpiar}
      >
        Borrar
      </button>
    </div>
  );
}

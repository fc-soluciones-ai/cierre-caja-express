'use client';

/**
 * Modulo 2: recepcion de un abono parcial de efectivo.
 *
 * El cajero teclea COLONES ENTEROS, no centimos. Nadie entrega monedas de
 * centimo y obligar a teclear dos ceros por cada monto seria una fuente
 * constante de errores; la conversion a centimos ocurre en un solo lugar,
 * al confirmar.
 *
 * La clave de idempotencia se genera al abrir el modal y no cambia mientras
 * siga abierto. Ese es el detalle que evita cobrar dos veces cuando el dedo
 * rebota sobre Confirmar o la red repite el envio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionAbonar } from '@/app/acciones';
import { Numpad } from '@/components/Numpad';
import { aCentimos, formatearMoneda } from '@/lib/money/money';

interface Props {
  chofer: { id: string; nombre: string; saldoAbonos: number };
  alCerrar: () => void;
}

/** Atajos para los billetes que mas circulan en una noche. */
const MONTOS_RAPIDOS = [1000, 2000, 5000, 10000, 20000];

/** Tope de digitos: 7 permite hasta 9 999 999 colones en un solo abono. */
const MAXIMO_DIGITOS = 7;

export function ModalAbono({ chofer, alCerrar }: Props) {
  const router = useRouter();
  const [digitos, setDigitos] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{
    monto: number;
    saldo: number;
    impreso: boolean;
    repetido: boolean;
  } | null>(null);

  // Una sola clave por apertura del modal: es lo que hace idempotente al envio.
  const claveIdempotencia = useRef<string>(crypto.randomUUID());

  const colones = digitos === '' ? 0 : Number(digitos);
  const montoCentimos = aCentimos(colones);

  // El atajo de teclado lee el monto de estas referencias y no de las
  // variables de render. Si dependiera del estado, teclear el monto y pulsar
  // Enter de inmediato dejaria al oyente con el valor anterior todavia en
  // cero, y el Enter no haria nada. En una caja se teclea justo asi de rapido.
  const colonesRef = useRef(colones);
  colonesRef.current = colones;
  const enviandoRef = useRef(enviando);
  enviandoRef.current = enviando;

  const agregarDigito = useCallback((digito: string) => {
    setError(null);
    setDigitos((actual) => {
      const siguiente = (actual + digito).replace(/^0+(?=\d)/, '');
      return siguiente.length > MAXIMO_DIGITOS ? actual : siguiente;
    });
  }, []);

  const sumarRapido = useCallback((monto: number) => {
    setError(null);
    setDigitos((actual) => {
      const total = (actual === '' ? 0 : Number(actual)) + monto;
      const texto = String(total);
      return texto.length > MAXIMO_DIGITOS ? actual : texto;
    });
  }, []);

  const confirmar = useCallback(async () => {
    if (enviandoRef.current || colonesRef.current <= 0) return;
    setEnviando(true);
    setError(null);

    const respuesta = await accionAbonar({
      choferId: chofer.id,
      montoAbonado: aCentimos(colonesRef.current),
      claveIdempotencia: claveIdempotencia.current,
    });

    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      setEnviando(false);
      return;
    }

    setConfirmado({
      monto: respuesta.datos.montoAbonado,
      saldo: respuesta.datos.saldoAcumuladoTurno,
      impreso: respuesta.datos.impreso,
      repetido: respuesta.datos.repetido,
    });
    setEnviando(false);
    router.refresh();
  }, [chofer.id, router]);

  // Cerrar con Escape solo cuando no hay un envio en vuelo.
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enviando) alCerrar();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [alCerrar, enviando]);

  if (confirmado) {
    return (
      <Telon>
        <div className="tarjeta w-full max-w-lg p-8 text-center">
          <p className="text-6xl">✅</p>
          <h2 className="mt-4 text-2xl font-bold">Abono registrado</h2>
          <p className="mt-1 text-slate-400">{chofer.nombre}</p>

          <p className="cifra mt-6 text-cifraGrande text-entrada">
            {formatearMoneda(confirmado.monto)}
          </p>

          <p className="mt-4 text-lg text-slate-300">
            Acumulado del turno:{' '}
            <span className="cifra font-bold text-slate-100">
              {formatearMoneda(confirmado.saldo)}
            </span>
          </p>

          {confirmado.repetido ? (
            <p className="mt-4 rounded-xl bg-aviso/15 p-3 text-aviso">
              Este abono ya estaba registrado. No se cobro dos veces.
            </p>
          ) : confirmado.impreso ? (
            <p className="mt-4 text-sm text-slate-500">
              El tiquete salio por la impresora.
            </p>
          ) : (
            /* El dinero quedo registrado igual. Decir que el papel salio cuando
               no salio haria que el cajero no lo reimprimiera. */
            <p className="mt-4 rounded-xl bg-aviso/15 p-3 text-aviso">
              El abono quedo registrado, pero el tiquete no se imprimio.
              Reimprimalo desde el historial.
            </p>
          )}

          <button
            type="button"
            className="boton-tactil mt-8 w-full bg-entrada text-slate-950"
            onClick={alCerrar}
            autoFocus
          >
            Listo
          </button>
        </div>
      </Telon>
    );
  }

  return (
    <Telon>
      <div className="tarjeta flex w-full max-w-2xl flex-col p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Abonar dinero</p>
            <h2 className="text-2xl font-bold">{chofer.nombre}</h2>
            <p className="cifra mt-1 text-slate-400">
              Ya entrego {formatearMoneda(chofer.saldoAbonos)} en este turno
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
            disabled={enviando}
          >
            ×
          </button>
        </header>

        <div className="mt-5 rounded-2xl border border-borde bg-fondo p-5 text-right">
          <p className="cifra text-cifraGrande text-entrada">{formatearMoneda(montoCentimos)}</p>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-5 gap-2">
          {MONTOS_RAPIDOS.map((monto) => (
            <button
              key={monto}
              type="button"
              className="h-14 rounded-xl border border-borde bg-panelClaro text-base font-semibold text-slate-200 active:scale-95 disabled:opacity-40"
              disabled={enviando}
              onClick={() => sumarRapido(monto)}
            >
              +{formatearMoneda(aCentimos(monto), { conSimbolo: false })}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <Numpad
            onDigito={agregarDigito}
            onBorrar={() => setDigitos((a) => a.slice(0, -1))}
            onLimpiar={() => setDigitos('')}
            onConfirmar={confirmar}
            deshabilitado={enviando}
          />
        </div>

        <button
          type="button"
          className="boton-tactil mt-4 h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
          disabled={enviando || colones <= 0}
          onClick={confirmar}
        >
          {enviando ? 'Registrando...' : `Confirmar ${formatearMoneda(montoCentimos)}`}
        </button>
      </div>
    </Telon>
  );
}

function Telon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>
  );
}

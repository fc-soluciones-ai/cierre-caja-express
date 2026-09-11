'use client';

/**
 * Seleccion de cajero y PIN, con el mismo teclado que los abonos.
 *
 * El PIN se muestra como puntos y nunca viaja en la URL ni queda en el
 * historial del navegador: se envia por una accion de servidor.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionEntrar } from '@/app/acciones';
import { Numpad } from '@/components/Numpad';

interface Props {
  cajeros: Array<{ id: string; nombre: string }>;
}

const LARGO_MAXIMO_PIN = 6;

export function FormularioEntrada({ cajeros }: Props) {
  const router = useRouter();
  const [cajeroId, setCajeroId] = useState<string>(cajeros[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Igual que en el modal de abono: el atajo de Enter lee de referencias para
  // que teclear el PIN y confirmar de inmediato no choque con un estado viejo.
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const cajeroRef = useRef(cajeroId);
  cajeroRef.current = cajeroId;
  const enviandoRef = useRef(enviando);
  enviandoRef.current = enviando;

  const confirmar = useCallback(async () => {
    if (enviandoRef.current || pinRef.current.length < 4 || cajeroRef.current === '') return;
    setEnviando(true);
    setError(null);

    const respuesta = await accionEntrar(cajeroRef.current, pinRef.current);
    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      setPin('');
      setEnviando(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }, [router]);

  return (
    <div className="tarjeta p-6">
      <label className="block text-sm uppercase tracking-wide text-slate-500" htmlFor="cajero">
        Cajero
      </label>
      <select
        id="cajero"
        className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100"
        value={cajeroId}
        onChange={(e) => {
          setCajeroId(e.target.value);
          setPin('');
          setError(null);
        }}
        disabled={enviando}
      >
        {cajeros.map((cajero) => (
          <option key={cajero.id} value={cajero.id}>
            {cajero.nombre}
          </option>
        ))}
      </select>

      <div className="mt-5 flex h-20 items-center justify-center gap-4 rounded-2xl border border-borde bg-fondo">
        {Array.from({ length: LARGO_MAXIMO_PIN }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-entrada' : 'bg-borde'}`}
          />
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl bg-alerta/15 p-3 text-center text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        <Numpad
          onDigito={(d) => {
            setError(null);
            setPin((actual) => (actual.length >= LARGO_MAXIMO_PIN ? actual : actual + d));
          }}
          onBorrar={() => setPin((a) => a.slice(0, -1))}
          onLimpiar={() => setPin('')}
          onConfirmar={confirmar}
          teclaExtra={null}
          deshabilitado={enviando}
        />
      </div>

      <button
        type="button"
        className="boton-tactil mt-4 h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
        disabled={enviando || pin.length < 4}
        onClick={confirmar}
      >
        {enviando ? 'Verificando...' : 'Entrar'}
      </button>
    </div>
  );
}

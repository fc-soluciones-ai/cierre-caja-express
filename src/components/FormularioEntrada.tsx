'use client';

/**
 * Entrada al sistema, por una de dos puertas.
 *
 * La de caja abre el tablero y el dinero. La del repartidor abre una pantalla
 * de solo lectura con lo suyo. Son la misma pantalla porque el gesto es el
 * mismo (elegir quien soy y teclear el PIN) y porque tener dos direcciones
 * distintas obligaria a explicarle a cada quien cual es la suya.
 *
 * La pestana de repartidores no aparece si ninguno tiene PIN todavia.
 *
 * El PIN se muestra como puntos y nunca viaja en la URL ni queda en el
 * historial del navegador: se envia por una accion de servidor.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionEntrar, accionEntrarRepartidor } from '@/app/acciones';
import { Numpad } from '@/components/Numpad';

interface Props {
  cajeros: Array<{ id: string; nombre: string }>;
  /** Repartidores que ya tienen PIN. Vacio mientras nadie tenga acceso. */
  repartidores: Array<{ id: string; nombre: string }>;
}

const LARGO_MAXIMO_PIN = 6;

export function FormularioEntrada({ cajeros, repartidores }: Props) {
  const router = useRouter();
  const [puerta, setPuerta] = useState<'CAJA' | 'REPARTIDOR'>('CAJA');
  const [cajeroId, setCajeroId] = useState<string>(cajeros[0]?.id ?? '');
  const [repartidorId, setRepartidorId] = useState<string>(repartidores[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Igual que en el modal de abono: el atajo de Enter lee de referencias para
  // que teclear el PIN y confirmar de inmediato no choque con un estado viejo.
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const cajeroRef = useRef(cajeroId);
  cajeroRef.current = cajeroId;
  const repartidorRef = useRef(repartidorId);
  repartidorRef.current = repartidorId;
  const puertaRef = useRef(puerta);
  puertaRef.current = puerta;
  const enviandoRef = useRef(enviando);
  enviandoRef.current = enviando;

  const confirmar = useCallback(async () => {
    const esCaja = puertaRef.current === 'CAJA';
    const quien = esCaja ? cajeroRef.current : repartidorRef.current;
    if (enviandoRef.current || pinRef.current.length < 4 || quien === '') return;
    setEnviando(true);
    setError(null);

    const respuesta = esCaja
      ? await accionEntrar(quien, pinRef.current)
      : await accionEntrarRepartidor(quien, pinRef.current);

    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      setPin('');
      setEnviando(false);
      return;
    }
    router.replace(esCaja ? '/' : '/mi');
    router.refresh();
  }, [router]);

  const esCaja = puerta === 'CAJA';
  const gente = esCaja ? cajeros : repartidores;

  return (
    <div className="tarjeta p-6">
      {repartidores.length > 0 ? (
        <div className="mb-5 grid grid-cols-2 gap-2" role="tablist">
          <Puerta
            activa={esCaja}
            etiqueta="Caja"
            onClick={() => {
              setPuerta('CAJA');
              setPin('');
              setError(null);
            }}
            bloqueado={enviando}
          />
          <Puerta
            activa={!esCaja}
            etiqueta="Repartidor"
            onClick={() => {
              setPuerta('REPARTIDOR');
              setPin('');
              setError(null);
            }}
            bloqueado={enviando}
          />
        </div>
      ) : null}

      <label className="block text-sm uppercase tracking-wide text-slate-500" htmlFor="quien">
        {esCaja ? 'Usuario' : 'Repartidor'}
      </label>
      <select
        id="quien"
        className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100"
        value={esCaja ? cajeroId : repartidorId}
        onChange={(e) => {
          if (esCaja) setCajeroId(e.target.value);
          else setRepartidorId(e.target.value);
          setPin('');
          setError(null);
        }}
        disabled={enviando}
      >
        {gente.map((persona) => (
          <option key={persona.id} value={persona.id}>
            {persona.nombre}
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

function Puerta({
  activa,
  etiqueta,
  onClick,
  bloqueado,
}: {
  activa: boolean;
  etiqueta: string;
  onClick: () => void;
  bloqueado: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      disabled={bloqueado}
      className={`min-h-tactil rounded-2xl border text-lg font-bold transition active:scale-[0.98] ${
        activa
          ? 'border-entrada bg-entrada/15 text-entrada'
          : 'border-borde bg-panelClaro text-slate-400'
      }`}
    >
      {etiqueta}
    </button>
  );
}

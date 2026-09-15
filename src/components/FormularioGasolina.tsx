'use client';

/**
 * Carga de gasolina desde el telefono del repartidor.
 *
 * Tres datos y nada mas: el odometro, lo que pago, y de que bomba. La moto no
 * se elige porque es la suya, y la categoria tampoco porque solo puede cargar
 * gasolina. Cada pregunta que no se hace es una que no se puede contestar mal
 * parado en la bomba con la manguera en la mano.
 *
 * Los dos numeros se teclean en la botonera grande, no en un campo de texto:
 * el odometro gobierna las alertas de servicio de esa moto.
 */

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { accionCargarGasolina } from '@/app/mi/acciones';
import { ModalNumero } from '@/components/ModalNumero';
import { PanelEvidencia } from '@/components/PanelEvidencia';
import { formatearMoneda } from '@/lib/money/money';
import { TIPOS_DE_FOTO, type Evidencia } from '@/server/services/evidencia';
import type { ResumenDelRepartidor } from '@/server/services/repartidor';

interface Props {
  moto: ResumenDelRepartidor['moto'];
}

export function FormularioGasolina({ moto }: Props) {
  const router = useRouter();

  const [kilometraje, setKilometraje] = useState(0);
  const [monto, setMonto] = useState(0);
  const [estacion, setEstacion] = useState('');
  const [tecleando, setTecleando] = useState<'KM' | 'MONTO' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{ id: string; placa: string; km: number } | null>(null);
  const [fotos, setFotos] = useState<Evidencia[]>([]);

  // Una sola clave mientras la pantalla siga abierta: si el dedo rebota, no
  // se cobra dos veces el mismo tanque.
  const clave = useRef<string>(crypto.randomUUID());

  const guardar = useCallback(async () => {
    if (enviando || !moto || kilometraje <= 0 || monto <= 0) return;
    setEnviando(true);
    setError(null);

    const respuesta = await accionCargarGasolina({
      kilometraje,
      monto,
      estacion,
      claveIdempotencia: clave.current,
    });
    setEnviando(false);

    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      return;
    }

    setGuardado({
      id: respuesta.datos.id,
      placa: respuesta.datos.placa,
      km: respuesta.datos.kilometraje,
    });
    setFotos([]);
    router.refresh();
  }, [enviando, estacion, kilometraje, monto, moto, router]);

  if (!moto) {
    return (
      <main className="mx-auto max-w-lg p-5">
        <div className="tarjeta p-8 text-center">
          <p className="text-5xl">🏍️</p>
          <h1 className="mt-4 text-xl font-bold">Hoy no tiene moto asignada</h1>
          <p className="mt-2 text-slate-400">
            Sin moto no hay a cual cargarle la gasolina. Digale a la caja que le asigne una.
          </p>
          <Link href="/mi" className="boton-tactil mt-6 inline-flex bg-entrada px-8 text-slate-950">
            Volver
          </Link>
        </div>
      </main>
    );
  }

  if (tecleando === 'KM') {
    return (
      <ModalNumero
        titulo="Kilometraje del odometro"
        subtitulo={`${moto.placa} · marcaba ${moto.kilometraje.toLocaleString('es-CR')} km`}
        unidad="KILOMETROS"
        valorInicial={kilometraje || moto.kilometraje}
        sugerencia={{
          etiqueta: `Sin cambio ${moto.kilometraje.toLocaleString('es-CR')}`,
          valor: moto.kilometraje,
        }}
        onConfirmar={(valor) => {
          setKilometraje(valor);
          setTecleando(null);
        }}
        onCancelar={() => setTecleando(null)}
      />
    );
  }

  if (tecleando === 'MONTO') {
    return (
      <ModalNumero
        titulo="Cuanto pago"
        subtitulo="Gasolina"
        unidad="MONEDA"
        valorInicial={monto}
        onConfirmar={(valor) => {
          setMonto(valor);
          setTecleando(null);
        }}
        onCancelar={() => setTecleando(null)}
      />
    );
  }

  if (guardado) {
    return (
      <main className="mx-auto max-w-lg p-5">
        <div className="tarjeta p-6 text-center">
          <p className="text-6xl">✅</p>
          <h1 className="mt-4 text-2xl font-bold">Gasolina registrada</h1>
          <p className="cifra mt-1 text-slate-400">
            {guardado.placa} · odometro en {guardado.km.toLocaleString('es-CR')} km
          </p>

          <p className="mt-6 text-sm text-slate-400">
            Tomele la foto a la factura ahora, antes de guardarla en el bolsillo.
          </p>
          <div className="mt-3 text-left">
            <PanelEvidencia
              entidadTipo="GASTO"
              entidadId={guardado.id}
              tipos={TIPOS_DE_FOTO.GASTO}
              evidencia={fotos}
              canal="REPARTIDOR"
              alCambiar={() => setFotos([])}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="boton-tactil bg-entrada text-slate-950"
              onClick={() => {
                clave.current = crypto.randomUUID();
                setKilometraje(0);
                setMonto(0);
                setEstacion('');
                setGuardado(null);
                setFotos([]);
              }}
            >
              Cargar otra vez
            </button>
            <Link
              href="/mi"
              className="boton-tactil border border-borde bg-panelClaro text-slate-200"
            >
              Volver
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const listo = kilometraje > 0 && monto > 0;
  const odometroBajo = kilometraje > 0 && kilometraje < moto.kilometraje;

  return (
    <main className="mx-auto max-w-lg p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cargar gasolina</h1>
          <p className="cifra text-sm text-slate-400">
            {moto.placa} · {moto.marca} {moto.modelo}
          </p>
        </div>
        <Link
          href="/mi"
          className="rounded-xl border border-borde px-4 py-2 text-sm text-slate-400 active:scale-95"
        >
          Volver
        </Link>
      </header>

      <div className="mt-5 grid gap-4">
        <button
          type="button"
          onClick={() => setTecleando('KM')}
          className="tarjeta p-5 text-left active:scale-[0.99]"
        >
          <span className="text-xs uppercase tracking-wide text-slate-500">
            1. Kilometraje del odometro
          </span>
          <span className="cifra mt-2 block text-3xl font-bold">
            {kilometraje > 0 ? `${kilometraje.toLocaleString('es-CR')} km` : 'Toque para teclear'}
          </span>
          <span className="mt-2 block text-xs text-slate-500">
            La moto marcaba {moto.kilometraje.toLocaleString('es-CR')} km. No puede ser menos.
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTecleando('MONTO')}
          className="tarjeta p-5 text-left active:scale-[0.99]"
        >
          <span className="text-xs uppercase tracking-wide text-slate-500">2. Cuanto pago</span>
          <span className="cifra mt-2 block text-3xl font-bold text-entrada">
            {monto > 0 ? formatearMoneda(monto) : 'Toque para teclear'}
          </span>
        </button>

        <label className="tarjeta block p-5">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            3. En cual bomba (opcional)
          </span>
          <input
            type="text"
            value={estacion}
            onChange={(e) => setEstacion(e.target.value)}
            placeholder="Nombre de la gasolinera"
            disabled={enviando}
            className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
        </label>
      </div>

      {odometroBajo ? (
        <p className="mt-4 rounded-2xl bg-aviso/15 p-4 text-center text-aviso">
          El odometro no puede ir para atras. La moto ya marcaba{' '}
          {moto.kilometraje.toLocaleString('es-CR')} km.
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={guardar}
        disabled={!listo || enviando || odometroBajo}
        className="boton-tactil mt-5 h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
      >
        {enviando
          ? 'Guardando...'
          : listo
            ? `Guardar ${formatearMoneda(monto)}`
            : 'Falta el kilometraje o el monto'}
      </button>

      <p className="mt-4 text-center text-xs text-slate-600">
        Queda registrado a su nombre. La foto de la factura se pide despues de guardar.
      </p>
    </main>
  );
}

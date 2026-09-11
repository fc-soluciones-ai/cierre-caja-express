'use client';

/**
 * Registro tactil de un gasto de la flota.
 *
 * El orden de la pantalla sigue el orden real del mostrador: primero cual
 * moto, despues en que se gasto, despues cuanto marca el odometro y cuanto se
 * pago. El kilometraje va antes que el monto a proposito: es el dato que se
 * olvida si se pide de ultimo, y sin el no hay costo por kilometro.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { accionRegistrarGasto } from '@/app/motos/acciones';
import { ModalNumero } from '@/components/ModalNumero';
import { formatearMoneda } from '@/lib/money/money';
import type { MotoConAsignacion } from '@/server/services/motos';
import type { CategoriaMantenimiento, TipoMantenimiento } from '@/types/enums';

interface Props {
  flota: MotoConAsignacion[];
  placaInicial?: string;
}

/**
 * Las categorias, con el tipo que les corresponde por defecto.
 *
 * Preventivo es lo que se hace porque toca; correctivo, porque se rompio. La
 * gasolina es preventiva por convencion: no encaja en ninguna de las dos, pero
 * separarla en una tercera categoria complicaria los reportes sin dar nada.
 */
const CATEGORIAS: Array<{
  valor: CategoriaMantenimiento;
  etiqueta: string;
  icono: string;
  tipo: TipoMantenimiento;
}> = [
  { valor: 'GASOLINA', etiqueta: 'Gasolina', icono: '⛽', tipo: 'PREVENTIVO' },
  { valor: 'CAMBIO_ACEITE', etiqueta: 'Cambio de aceite', icono: '🛢️', tipo: 'PREVENTIVO' },
  { valor: 'LLANTAS', etiqueta: 'Llantas', icono: '🛞', tipo: 'PREVENTIVO' },
  { valor: 'FRENOS', etiqueta: 'Frenos', icono: '🛑', tipo: 'CORRECTIVO' },
  { valor: 'REPUESTOS', etiqueta: 'Repuestos', icono: '🛠️', tipo: 'CORRECTIVO' },
  { valor: 'RTV', etiqueta: 'Revision tecnica', icono: '📋', tipo: 'PREVENTIVO' },
  { valor: 'SEGURO', etiqueta: 'Seguro', icono: '🛡️', tipo: 'PREVENTIVO' },
  { valor: 'OTRO', etiqueta: 'Otro', icono: '📦', tipo: 'CORRECTIVO' },
];

type Editando = 'KILOMETRAJE' | 'MONTO' | null;

export function FormularioGasto({ flota, placaInicial }: Props) {
  const router = useRouter();

  const [placa, setPlaca] = useState(placaInicial ?? flota[0]?.placa ?? '');
  const [categoria, setCategoria] = useState<CategoriaMantenimiento | null>(null);
  const [kilometraje, setKilometraje] = useState(0);
  const [monto, setMonto] = useState(0);
  const [proveedor, setProveedor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [editando, setEditando] = useState<Editando>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<{ placa: string; km: number } | null>(null);

  // Una sola clave mientras el formulario siga abierto: es lo que evita
  // registrar dos veces el mismo tanque de gasolina si el dedo rebota.
  const claveIdempotencia = useRef<string>(crypto.randomUUID());

  const moto = useMemo(() => flota.find((m) => m.placa === placa) ?? null, [flota, placa]);
  const definicion = CATEGORIAS.find((c) => c.valor === categoria) ?? null;

  const confirmar = useCallback(async () => {
    if (enviando || !moto || !categoria || !definicion) return;
    setEnviando(true);
    setError(null);

    const respuesta = await accionRegistrarGasto({
      placa: moto.placa,
      tipo: definicion.tipo,
      categoria,
      costoTotal: monto,
      kilometrajeEvento: kilometraje,
      descripcion: descripcion.trim() || undefined,
      tallerOProveedor: proveedor.trim() || undefined,
      claveIdempotencia: claveIdempotencia.current,
    });

    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      setEnviando(false);
      return;
    }

    setConfirmado({ placa: respuesta.datos.placa, km: respuesta.datos.kilometrajeActualizado });
    setEnviando(false);
    router.refresh();
  }, [categoria, definicion, descripcion, enviando, kilometraje, monto, moto, proveedor, router]);

  if (confirmado) {
    return (
      <div className="tarjeta p-8 text-center">
        <p className="text-6xl">✅</p>
        <h2 className="mt-4 text-2xl font-bold">Gasto registrado</h2>
        <p className="cifra mt-1 text-slate-400">
          {confirmado.placa} · odometro en{' '}
          {formatearMoneda(confirmado.km * 100, { conSimbolo: false })} km
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="boton-tactil bg-entrada text-slate-950"
            onClick={() => {
              claveIdempotencia.current = crypto.randomUUID();
              setCategoria(null);
              setMonto(0);
              setKilometraje(0);
              setProveedor('');
              setDescripcion('');
              setConfirmado(null);
            }}
          >
            Registrar otro
          </button>
          <Link
            href="/motos"
            className="boton-tactil border border-borde bg-panelClaro text-slate-200"
          >
            Volver a la flota
          </Link>
        </div>
      </div>
    );
  }

  if (flota.length === 0) {
    return (
      <div className="tarjeta p-10 text-center">
        <p className="text-5xl">🏍️</p>
        <h2 className="mt-4 text-xl font-bold">No hay motos registradas</h2>
        <p className="mt-2 text-slate-400">Agregue la flota antes de registrar gastos.</p>
      </div>
    );
  }

  const listo = moto !== null && categoria !== null && kilometraje > 0;

  return (
    <div className="space-y-5">
      <section className="tarjeta p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">1. Cual moto</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {flota.map((m) => (
            <button
              key={m.placa}
              type="button"
              aria-pressed={m.placa === placa}
              aria-label={`${m.placa}, la trae ${m.choferNombre ?? 'nadie'}`}
              className={`min-h-tactil rounded-2xl border px-3 text-left transition active:scale-95 ${
                m.placa === placa
                  ? 'border-entrada bg-entrada/15'
                  : 'border-borde bg-panelClaro'
              }`}
              onClick={() => {
                setPlaca(m.placa);
                setError(null);
              }}
            >
              <span className="cifra block font-bold">{m.placa}</span>
              <span className="block truncate text-xs text-slate-400">
                {m.choferNombre ?? 'sin repartidor'}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="tarjeta p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">2. En que se gasto</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIAS.map((c) => (
            <button
              key={c.valor}
              type="button"
              aria-pressed={c.valor === categoria}
              aria-label={c.etiqueta}
              className={`flex h-24 flex-col items-center justify-center gap-1 rounded-2xl border transition active:scale-95 ${
                c.valor === categoria
                  ? 'border-entrada bg-entrada/15 text-entrada'
                  : 'border-borde bg-panelClaro text-slate-200'
              }`}
              onClick={() => {
                setCategoria(c.valor);
                setError(null);
              }}
            >
              <span className="text-3xl">{c.icono}</span>
              <span className="px-1 text-center text-sm font-semibold leading-tight">
                {c.etiqueta}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="tarjeta p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">3. Odometro e importe</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="flex min-h-tactil items-center justify-between gap-3 rounded-2xl border border-borde bg-panelClaro px-5 text-left active:scale-[0.98]"
            onClick={() => setEditando('KILOMETRAJE')}
          >
            <span className="text-sm uppercase tracking-wide text-slate-500">Kilometraje</span>
            <span className="cifra text-2xl font-bold">
              {kilometraje > 0
                ? `${formatearMoneda(kilometraje * 100, { conSimbolo: false })} km`
                : '—'}
            </span>
          </button>

          <button
            type="button"
            className="flex min-h-tactil items-center justify-between gap-3 rounded-2xl border border-borde bg-panelClaro px-5 text-left active:scale-[0.98]"
            onClick={() => setEditando('MONTO')}
          >
            <span className="text-sm uppercase tracking-wide text-slate-500">Importe</span>
            <span className="cifra text-2xl font-bold text-entrada">
              {formatearMoneda(monto)}
            </span>
          </button>
        </div>

        {moto ? (
          <p className="mt-3 text-sm text-slate-500">
            La moto marcaba{' '}
            {formatearMoneda(moto.kilometrajeActual * 100, { conSimbolo: false })} km. El odometro
            no puede retroceder.
          </p>
        ) : null}
      </section>

      <section className="tarjeta p-5">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">4. Detalle (opcional)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Taller o gasolinera"
            className="h-tactil rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Repuestos, marca de llanta..."
            className="h-tactil rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl bg-alerta/15 p-5 text-center text-lg text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="boton-tactil h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
        disabled={enviando || !listo}
        onClick={confirmar}
      >
        {enviando
          ? 'Guardando...'
          : !categoria
            ? 'Elija en que se gasto'
            : kilometraje === 0
              ? 'Falta el kilometraje'
              : `Guardar ${formatearMoneda(monto)}`}
      </button>

      {editando === 'KILOMETRAJE' && moto ? (
        <ModalNumero
          titulo="Kilometraje del odometro"
          subtitulo={`${moto.placa} · marcaba ${formatearMoneda(moto.kilometrajeActual * 100, { conSimbolo: false })} km`}
          unidad="KILOMETROS"
          valorInicial={kilometraje || moto.kilometrajeActual}
          sugerencia={{
            etiqueta: `Sin cambio ${formatearMoneda(moto.kilometrajeActual * 100, { conSimbolo: false })}`,
            valor: moto.kilometrajeActual,
          }}
          onConfirmar={(valor) => {
            setKilometraje(valor);
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      ) : null}

      {editando === 'MONTO' ? (
        <ModalNumero
          titulo="Importe pagado"
          subtitulo={definicion ? definicion.etiqueta : undefined}
          unidad="MONEDA"
          valorInicial={monto}
          onConfirmar={(valor) => {
            setMonto(valor);
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      ) : null}
    </div>
  );
}

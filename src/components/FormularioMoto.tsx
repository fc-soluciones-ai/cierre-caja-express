'use client';

/**
 * Alta y edicion de una moto.
 *
 * El kilometraje se teclea en la botonera grande y no en el campo de texto:
 * es el dato que mas se equivoca y el que despues gobierna las alertas de
 * servicio, asi que conviene verlo en grande antes de aceptarlo.
 *
 * En edicion el kilometraje no se toca. Se mueve solo al registrar gastos, y
 * dejarlo editable a mano abriria la puerta a bajarlo para esquivar una
 * alerta de servicio vencido.
 */

import { useState } from 'react';

import { ModalNumero } from '@/components/ModalNumero';
import type { MotoConAsignacion } from '@/server/services/motos';

export interface DatosMoto {
  placa: string;
  marca: string;
  modelo: string;
  anio: number;
  kilometrajeActual: number;
  esComodin: boolean;
  notas?: string;
}

interface Props {
  /** Moto a editar. Sin ella el formulario es de alta. */
  moto?: MotoConAsignacion | null;
  /** Ya existe una comodin en la flota, asi que no se puede marcar otra. */
  hayComodin: boolean;
  enProceso: boolean;
  error: string | null;
  alGuardar: (datos: DatosMoto) => void;
  alCerrar: () => void;
}

const ANIO_MAXIMO = new Date().getFullYear() + 1;

export function FormularioMoto({
  moto,
  hayComodin,
  enProceso,
  error,
  alGuardar,
  alCerrar,
}: Props) {
  const editando = Boolean(moto);

  const [placa, setPlaca] = useState(moto?.placa ?? '');
  const [marca, setMarca] = useState(moto?.marca ?? '');
  const [modelo, setModelo] = useState(moto?.modelo ?? '');
  const [anio, setAnio] = useState(String(moto?.anio ?? ''));
  const [kilometraje, setKilometraje] = useState(moto?.kilometrajeActual ?? 0);
  const [esComodin, setEsComodin] = useState(moto?.esComodin ?? false);
  const [notas, setNotas] = useState(moto?.notas ?? '');
  const [tecleandoKm, setTecleandoKm] = useState(false);

  // La comodin de la flota puede seguir marcada aunque ya exista una: es ella.
  const comodinBloqueada = hayComodin && !moto?.esComodin;

  const anioNumero = Number(anio);
  const anioValido = Number.isInteger(anioNumero) && anioNumero >= 1980 && anioNumero <= ANIO_MAXIMO;
  const completo =
    placa.trim().length > 0 && marca.trim().length > 0 && modelo.trim().length > 0 && anioValido;

  if (tecleandoKm) {
    return (
      <ModalNumero
        titulo="Kilometraje actual"
        subtitulo={placa.trim() || 'Moto nueva'}
        unidad="KILOMETROS"
        valorInicial={kilometraje}
        onConfirmar={(valor) => {
          setKilometraje(valor);
          setTecleandoKm(false);
        }}
        onCancelar={() => setTecleandoKm(false)}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <form
        className="tarjeta w-full max-w-lg p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!completo || enProceso) return;
          alGuardar({
            placa: placa.trim(),
            marca: marca.trim(),
            modelo: modelo.trim(),
            anio: anioNumero,
            kilometrajeActual: kilometraje,
            esComodin,
            notas: notas.trim() || undefined,
          });
        }}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">
              {editando ? 'Editar moto' : 'Nueva moto'}
            </p>
            <h2 className="text-2xl font-bold">
              {editando ? moto!.placa : 'Agregar a la flota'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
            disabled={enProceso}
          >
            ×
          </button>
        </header>

        <div className="mt-5 grid gap-4">
          <Campo etiqueta="Placa">
            <input
              type="text"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="MOT-123"
              autoFocus={!editando}
              disabled={editando || enProceso}
              className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-xl text-slate-100 outline-none focus:border-entrada disabled:opacity-50"
            />
            {editando ? (
              <span className="mt-1 block text-xs text-slate-500">
                La placa identifica la moto y no se cambia.
              </span>
            ) : null}
          </Campo>

          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Marca">
              <input
                type="text"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Honda"
                disabled={enProceso}
                className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
              />
            </Campo>
            <Campo etiqueta="Modelo">
              <input
                type="text"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="CB125"
                disabled={enProceso}
                className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Año">
              <input
                type="number"
                inputMode="numeric"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                placeholder="2022"
                min={1980}
                max={ANIO_MAXIMO}
                disabled={enProceso}
                className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
              />
            </Campo>
            <Campo etiqueta="Kilometraje">
              {editando ? (
                <p className="cifra flex h-tactil items-center rounded-2xl border border-borde bg-fondo px-4 text-lg text-slate-400">
                  {moto!.kilometrajeActual.toLocaleString('es-CR')} km
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setTecleandoKm(true)}
                  disabled={enProceso}
                  className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-left text-lg text-slate-100 active:scale-[0.98]"
                >
                  {kilometraje.toLocaleString('es-CR')} km
                </button>
              )}
            </Campo>
          </div>

          <Campo etiqueta="Notas (opcional)">
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Baul grande, llanta trasera nueva..."
              disabled={enProceso}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
            />
          </Campo>

          <button
            type="button"
            onClick={() => setEsComodin(!esComodin)}
            disabled={comodinBloqueada || enProceso}
            className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] disabled:opacity-40 ${
              esComodin ? 'border-aviso bg-aviso/15' : 'border-borde bg-panelClaro'
            }`}
          >
            <span className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  esComodin ? 'border-aviso bg-aviso text-slate-950' : 'border-borde'
                }`}
                aria-hidden="true"
              >
                {esComodin ? '✓' : ''}
              </span>
              <span>
                <span className="block font-bold">Es la moto comodin</span>
                <span className="mt-1 block text-sm text-slate-400">
                  {comodinBloqueada
                    ? 'Ya hay una comodin en la flota. Solo puede haber una.'
                    : 'Se presta sola cuando otra moto entra al taller.'}
                </span>
              </span>
            </span>
          </button>
        </div>

        {error ? (
          <p className="mt-5 rounded-2xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="boton-tactil border border-borde bg-panelClaro text-slate-300"
            onClick={alCerrar}
            disabled={enProceso}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="boton-tactil bg-entrada text-slate-950 disabled:opacity-40"
            disabled={!completo || enProceso}
          >
            {enProceso ? 'Guardando...' : editando ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

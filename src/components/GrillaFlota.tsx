'use client';

/**
 * Dashboard de la flota.
 *
 * El semaforo de cada tarjeta responde a la pregunta que el encargado hace de
 * lejos: cuales motos puedo mandar a la calle esta noche. Rojo es no, amarillo
 * es si pero hay que llevarla al taller pronto, verde es si.
 *
 * El estado de la moto pesa mas que el kilometraje: una moto en el taller es
 * roja aunque le acaben de cambiar el aceite.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { accionCambiarEstadoMoto } from '@/app/motos/acciones';
import { formatearMoneda } from '@/lib/money/money';
import type { AlertaMoto } from '@/server/services/mantenimiento';
import type { MotoConAsignacion } from '@/server/services/motos';
import type { EstadoMoto } from '@/types/enums';

interface Props {
  flota: MotoConAsignacion[];
  alertas: AlertaMoto[];
}

const NOMBRE_CATEGORIA: Record<string, string> = {
  CAMBIO_ACEITE: 'Cambio de aceite',
  FRENOS: 'Frenos',
  LLANTAS: 'Llantas',
  GASOLINA: 'Gasolina',
  REPUESTOS: 'Repuestos',
  RTV: 'Revision tecnica',
  SEGURO: 'Seguro',
  OTRO: 'Otro',
};

const NOMBRE_ESTADO: Record<string, string> = {
  OPERATIVA: 'Operativa',
  EN_MANTENIMIENTO: 'En el taller',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

function semaforoDe(moto: MotoConAsignacion, alertas: AlertaMoto[]): Semaforo {
  if (moto.estado !== 'OPERATIVA') return 'ROJO';
  if (alertas.some((a) => a.nivel === 'VENCIDO')) return 'ROJO';
  if (alertas.length > 0) return 'AMARILLO';
  return 'VERDE';
}

const COLOR: Record<Semaforo, { punto: string; borde: string; texto: string }> = {
  VERDE: { punto: 'bg-entrada', borde: 'border-borde', texto: 'text-entrada' },
  AMARILLO: { punto: 'bg-aviso', borde: 'border-aviso/50', texto: 'text-aviso' },
  ROJO: { punto: 'bg-alerta', borde: 'border-alerta/50', texto: 'text-alerta' },
};

export function GrillaFlota({ flota, alertas }: Props) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState<MotoConAsignacion | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enProceso, setEnProceso] = useState(false);

  const cambiarEstado = useCallback(
    async (placa: string, estado: EstadoMoto, motivo: string) => {
      setEnProceso(true);
      setError(null);
      const respuesta = await accionCambiarEstadoMoto(placa, estado, motivo);
      setEnProceso(false);

      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }

      const d = respuesta.datos;
      const partes: string[] = [`${d.placa}: ${NOMBRE_ESTADO[d.estado] ?? d.estado}.`];
      if (d.comodinAsignada) {
        partes.push(`Se le presto la comodin ${d.comodinAsignada} a ${d.choferAfectado}.`);
      }
      if (d.motoDevuelta) {
        partes.push(`${d.choferAfectado} recupera su moto.`);
      }
      setResultado(partes.join(' '));
      setAdvertencia(d.advertencia);
      setCambiando(null);
      router.refresh();
    },
    [router],
  );

  if (flota.length === 0) {
    return (
      <div className="tarjeta p-10 text-center">
        <p className="text-5xl">🏍️</p>
        <h2 className="mt-4 text-xl font-bold">No hay motos registradas</h2>
        <p className="mt-2 text-slate-400">
          Agregue las motos de la flota para llevar su kilometraje y sus gastos.
        </p>
      </div>
    );
  }

  return (
    <>
      {resultado ? (
        <div className="mb-5 rounded-2xl bg-entrada/15 p-4 text-entrada">{resultado}</div>
      ) : null}
      {advertencia ? (
        <div className="mb-5 rounded-2xl bg-aviso/15 p-4 text-aviso">⚠ {advertencia}</div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-2xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {flota.map((moto) => {
          const suyas = alertas.filter((a) => a.placa === moto.placa);
          const luz = semaforoDe(moto, suyas);
          const color = COLOR[luz];

          return (
            <article key={moto.placa} className={`tarjeta flex flex-col border p-5 ${color.borde}`}>
              <div className="flex items-start gap-4">
                <span
                  className={`mt-2 h-4 w-4 shrink-0 rounded-full ${color.punto}`}
                  aria-label={`Semaforo ${luz.toLowerCase()}`}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="cifra truncate text-2xl font-bold">{moto.placa}</h2>
                  <p className="truncate text-sm text-slate-400">
                    {moto.marca} {moto.modelo} · {moto.anio}
                  </p>
                </div>
                {moto.esComodin ? (
                  <span className="shrink-0 rounded-lg bg-panelClaro px-2 py-1 text-xs text-slate-300">
                    Comodin
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-fondo p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Kilometraje</p>
                  <p className="cifra mt-1 text-xl font-bold">
                    {formatearMoneda(moto.kilometrajeActual * 100, { conSimbolo: false })}
                  </p>
                </div>
                <div className="rounded-2xl bg-fondo p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                  <p className={`mt-1 text-sm font-bold ${color.texto}`}>
                    {NOMBRE_ESTADO[moto.estado] ?? moto.estado}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-fondo p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">La trae</p>
                <p className="mt-1 truncate font-bold">
                  {moto.choferNombre ?? <span className="text-slate-600">Nadie</span>}
                  {moto.tipoAsignacion === 'COMODIN' ? (
                    <span className="ml-2 text-xs font-normal text-aviso">(prestada)</span>
                  ) : null}
                </p>
              </div>

              {suyas.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {suyas.map((alerta) => (
                    <li
                      key={alerta.categoria}
                      className={`rounded-lg px-2 py-1 text-xs ${
                        alerta.nivel === 'VENCIDO'
                          ? 'bg-alerta/15 text-alerta'
                          : 'bg-aviso/15 text-aviso'
                      }`}
                    >
                      {NOMBRE_CATEGORIA[alerta.categoria] ?? alerta.categoria}:{' '}
                      {alerta.nivel === 'VENCIDO'
                        ? `vencido por ${Math.abs(alerta.kmRestantes).toLocaleString('es-CR')} km`
                        : `faltan ${alerta.kmRestantes.toLocaleString('es-CR')} km`}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 grid gap-3">
                <Link
                  href={`/motos/gastos?placa=${moto.placa}`}
                  className="boton-tactil bg-entrada text-slate-950"
                >
                  ⛽ Registrar gasto
                </Link>
                <button
                  type="button"
                  className="boton-tactil border border-borde bg-panelClaro text-slate-200"
                  onClick={() => {
                    setError(null);
                    setResultado(null);
                    setAdvertencia(null);
                    setCambiando(moto);
                  }}
                >
                  🔧 Cambiar estado
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {cambiando ? (
        <ModalEstado
          moto={cambiando}
          enProceso={enProceso}
          alCerrar={() => setCambiando(null)}
          alCambiar={cambiarEstado}
        />
      ) : null}
    </>
  );
}

function ModalEstado({
  moto,
  enProceso,
  alCerrar,
  alCambiar,
}: {
  moto: MotoConAsignacion;
  enProceso: boolean;
  alCerrar: () => void;
  alCambiar: (placa: string, estado: EstadoMoto, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  const opciones: Array<{ estado: EstadoMoto; etiqueta: string; nota: string }> = [
    {
      estado: 'EN_MANTENIMIENTO',
      etiqueta: '🔧 Mandar al taller',
      nota: moto.esComodin
        ? 'La comodin no se reemplaza a si misma.'
        : 'Se le presta la comodin al chofer, si esta libre.',
    },
    {
      estado: 'FUERA_DE_SERVICIO',
      etiqueta: '🚫 Fuera de servicio',
      nota: 'Para la que no vuelve pronto: accidente o venta.',
    },
    {
      estado: 'OPERATIVA',
      etiqueta: '✅ Volver a circulacion',
      nota: 'Se la devuelve a su chofer y libera la comodin.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta w-full max-w-lg p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Cambiar estado</p>
            <h2 className="cifra text-2xl font-bold">{moto.placa}</h2>
            <p className="mt-1 text-slate-400">
              {moto.choferNombre ? `La trae ${moto.choferNombre}` : 'Sin chofer asignado'}
            </p>
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

        <label className="mt-5 block">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Motivo (queda en el historial)
          </span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cadena rota, frenos, revision..."
            className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
        </label>

        <div className="mt-5 grid gap-3">
          {opciones
            .filter((o) => o.estado !== moto.estado)
            .map((opcion) => (
              <button
                key={opcion.estado}
                type="button"
                className="rounded-2xl border border-borde bg-panelClaro p-4 text-left transition active:scale-[0.98] disabled:opacity-40"
                disabled={enProceso}
                onClick={() => alCambiar(moto.placa, opcion.estado, motivo)}
              >
                <span className="block text-lg font-bold">{opcion.etiqueta}</span>
                <span className="mt-1 block text-sm text-slate-400">{opcion.nota}</span>
              </button>
            ))}
        </div>

        <button
          type="button"
          className="boton-tactil mt-5 w-full border border-borde bg-panelClaro text-slate-300"
          onClick={alCerrar}
          disabled={enProceso}
        >
          {enProceso ? 'Aplicando...' : 'Cancelar'}
        </button>
      </div>
    </div>
  );
}

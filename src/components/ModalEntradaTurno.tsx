'use client';

/**
 * Marcar la entrada de los repartidores que trabajan esta noche.
 *
 * El modal se queda abierto despues de cada toque a proposito: al empezar la
 * jornada el cajero marca a cuatro o cinco seguidos, y cerrarlo y reabrirlo
 * cada vez seria un castigo. Los que ya entraron se van tachando de la lista.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionEntrarATurno } from '@/app/acciones';

export interface ChoferDisponible {
  id: string;
  nombre: string;
  idMeseroSoftRestaurant: string;
  fotoUrl: string | null;
}

interface Props {
  disponibles: ChoferDisponible[];
  alCerrar: () => void;
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

export function ModalEntradaTurno({ disponibles, alCerrar }: Props) {
  const router = useRouter();
  const [entrados, setEntrados] = useState<Set<string>>(new Set());
  const [enProceso, setEnProceso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Escape') alCerrar();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [alCerrar]);

  const marcarEntrada = useCallback(
    async (chofer: ChoferDisponible) => {
      if (enProceso || entrados.has(chofer.id)) return;
      setEnProceso(chofer.id);
      setError(null);

      const respuesta = await accionEntrarATurno(chofer.id);
      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        setEnProceso(null);
        return;
      }

      setEntrados((actuales) => new Set(actuales).add(chofer.id));
      setEnProceso(null);
      router.refresh();
    },
    [enProceso, entrados, router],
  );

  const pendientes = disponibles.filter((c) => !entrados.has(c.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta flex w-full max-w-2xl flex-col p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Quien entra a turno</h2>
            <p className="mt-1 text-slate-400">
              Toque a cada repartidor que este trabajando. Puede volver a abrir esta lista
              cuando llegue alguien mas.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
          >
            ×
          </button>
        </header>

        {error ? (
          <p className="mt-4 rounded-xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
            {error}
          </p>
        ) : null}

        {entrados.size > 0 ? (
          <p className="mt-4 rounded-xl bg-entrada/15 p-3 text-center text-entrada">
            {entrados.size} repartidor{entrados.size === 1 ? '' : 'es'} en turno.
          </p>
        ) : null}

        <div className="mt-5 max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {pendientes.length === 0 ? (
            <p className="py-10 text-center text-slate-500">
              {disponibles.length === 0
                ? 'Todos los repartidores del padron ya estan en turno.'
                : 'Listo, ya no queda nadie por marcar.'}
            </p>
          ) : (
            pendientes.map((chofer) => (
              <button
                key={chofer.id}
                type="button"
                className="flex min-h-tactil w-full items-center gap-4 rounded-2xl border border-borde bg-panelClaro px-5 py-3 text-left transition active:scale-[0.98] disabled:opacity-40"
                disabled={enProceso !== null}
                onClick={() => marcarEntrada(chofer)}
              >
                {chofer.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chofer.fotoUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-fondo text-lg font-bold text-slate-300">
                    {iniciales(chofer.nombre)}
                  </div>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold">{chofer.nombre}</span>
                  <span className="block text-sm text-slate-500">
                    Mesero #{chofer.idMeseroSoftRestaurant}
                  </span>
                </span>

                <span className="shrink-0 rounded-xl bg-entrada px-5 py-3 font-bold text-slate-950">
                  {enProceso === chofer.id ? '...' : 'Entra'}
                </span>
              </button>
            ))
          )}
        </div>

        <button
          type="button"
          className="boton-tactil mt-5 w-full border border-borde bg-panelClaro text-slate-200"
          onClick={alCerrar}
        >
          Listo
        </button>
      </div>
    </div>
  );
}

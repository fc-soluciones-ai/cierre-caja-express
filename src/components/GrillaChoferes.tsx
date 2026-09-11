'use client';

/**
 * Grilla de repartidores en turno.
 *
 * Muestra SOLO a quien esta trabajando esta noche. No todos trabajan todos los
 * dias, y una pantalla con las quince tarjetas del padron obliga a buscar a la
 * una de la manana en vez de tocar.
 *
 * El estado del modal vive aqui y no dentro de cada tarjeta: asi solo puede
 * haber un abono abierto a la vez, que es justo lo que se quiere cuando hay
 * dos repartidores esperando en el mostrador.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionQuitarDeTurno } from '@/app/acciones';
import { ModalAbono } from '@/components/ModalAbono';
import { ModalEntradaTurno, type ChoferDisponible } from '@/components/ModalEntradaTurno';
import { formatearMoneda } from '@/lib/money/money';
import type { ResumenChoferTurno } from '@/server/services/caja';

interface Props {
  enTurno: ResumenChoferTurno[];
  disponibles: ChoferDisponible[];
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

function soloHora(fecha: Date): string {
  const d = new Date(fecha);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function GrillaChoferes({ enTurno, disponibles }: Props) {
  const router = useRouter();
  const [abonando, setAbonando] = useState<ResumenChoferTurno | null>(null);
  const [marcandoEntrada, setMarcandoEntrada] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quitarDeTurno = useCallback(
    async (chofer: ResumenChoferTurno) => {
      setQuitando(chofer.choferId);
      setError(null);
      const respuesta = await accionQuitarDeTurno(chofer.choferId);
      if (!respuesta.ok) setError(respuesta.mensaje);
      else router.refresh();
      setQuitando(null);
    },
    [router],
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold">
          {enTurno.length === 0
            ? 'Nadie en turno'
            : `${enTurno.length} repartidor${enTurno.length === 1 ? '' : 'es'} en turno`}
        </h2>
        <button
          type="button"
          className="boton-tactil bg-entrada px-8 text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
          disabled={disponibles.length === 0}
          onClick={() => {
            setError(null);
            setMarcandoEntrada(true);
          }}
        >
          {disponibles.length === 0 ? 'Todos ya entraron' : '＋ Entra un repartidor'}
        </button>
      </div>

      {error ? (
        <p className="mb-5 rounded-2xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      {enTurno.length === 0 ? (
        <div className="tarjeta p-10 text-center">
          <p className="text-5xl">🛵</p>
          <h3 className="mt-4 text-xl font-bold">Marque quien esta trabajando</h3>
          <p className="mt-2 text-slate-400">
            {disponibles.length === 0
              ? 'No hay repartidores en el padron. Registrelos en Gestion de repartidores.'
              : 'Toque "Entra un repartidor" y elija a los que llegaron. Solo ellos apareceran aqui.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {enTurno.map((chofer) => (
            <article key={chofer.choferId} className="tarjeta flex flex-col p-5">
              <div className="flex items-center gap-4">
                {chofer.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={chofer.fotoUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-panelClaro text-xl font-bold text-slate-300">
                    {iniciales(chofer.nombre)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xl font-bold">{chofer.nombre}</h3>
                  <p className="truncate text-sm text-slate-400">
                    Entro a las {soloHora(chofer.fechaApertura)} · {chofer.cantidadAbonos} abono
                    {chofer.cantidadAbonos === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-fondo p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Entregado en el turno
                </p>
                <p
                  className={`cifra mt-1 text-cifra ${
                    chofer.saldoAbonos > 0 ? 'text-entrada' : 'text-slate-600'
                  }`}
                >
                  {formatearMoneda(chofer.saldoAbonos)}
                </p>
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  className="boton-tactil bg-entrada text-slate-950"
                  onClick={() => setAbonando(chofer)}
                >
                  💵 Abonar dinero
                </button>
                <button
                  type="button"
                  className="boton-tactil border border-borde bg-panelClaro text-slate-200"
                  onClick={() => router.push(`/cierre?repartidor=${chofer.choferId}`)}
                >
                  📋 Cerrar turno
                </button>

                {/* Solo mientras no haya recibido dinero: despues el turno es un
                    movimiento de caja y se cierra, no se borra. */}
                {chofer.cantidadAbonos === 0 && chofer.saldoAbonos === 0 ? (
                  <button
                    type="button"
                    className="min-h-[3rem] rounded-xl text-sm text-slate-500 underline-offset-4 hover:underline disabled:opacity-40"
                    disabled={quitando === chofer.choferId}
                    onClick={() => quitarDeTurno(chofer)}
                  >
                    {quitando === chofer.choferId ? 'Quitando...' : 'No entro, quitar de turno'}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {marcandoEntrada ? (
        <ModalEntradaTurno
          disponibles={disponibles}
          alCerrar={() => setMarcandoEntrada(false)}
        />
      ) : null}

      {abonando ? (
        <ModalAbono
          chofer={{
            id: abonando.choferId,
            nombre: abonando.nombre,
            saldoAbonos: abonando.saldoAbonos,
          }}
          alCerrar={() => setAbonando(null)}
        />
      ) : null}
    </>
  );
}

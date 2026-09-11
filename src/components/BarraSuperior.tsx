'use client';

/**
 * Encabezado del dashboard: el widget de efectivo en caja y los accesos
 * rapidos.
 *
 * El total de caja va primero y en grande porque es la cifra que el
 * responsable mira de reojo cada pocos minutos sin acercarse a la pantalla.
 * No esta almacenada: es la suma de abonos y entregas del dia operativo.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { accionSalir } from '@/app/acciones';
import { formatearMoneda } from '@/lib/money/money';

interface Props {
  efectivoEnCaja: number;
  diaOperativo: string;
  cajero: string;
  choferesConTurno: number;
  /** Horas desde el ultimo respaldo. null si no hay ninguno. */
  horasSinRespaldo: number | null;
}

/**
 * A partir de aqui se avisa. Un respaldo que dejo de correr no da ninguna
 * senal por si mismo: el negocio se entera el dia que necesita restaurar, y
 * para entonces ya perdio meses.
 */
const HORAS_TOLERADAS_SIN_RESPALDO = 36;

const ACCESOS = [
  { href: '/importar', etiqueta: '📁 Importar Excel' },
  { href: '/cierre', etiqueta: '📋 Cierre multiple' },
  { href: '/historial', etiqueta: '📜 Historial' },
  { href: '/choferes', etiqueta: '👥 Choferes' },
  { href: '/motos', etiqueta: '🏍️ Motos' },
];

/** Cada cuanto se refresca la pantalla si nadie la toca. */
const REFRESCO_MS = 45_000;

export function BarraSuperior({
  efectivoEnCaja,
  diaOperativo,
  cajero,
  choferesConTurno,
  horasSinRespaldo,
}: Props) {
  const router = useRouter();

  const respaldoAtrasado =
    horasSinRespaldo === null || horasSinRespaldo > HORAS_TOLERADAS_SIN_RESPALDO;

  // Puede haber mas de una caja abonando al mismo tiempo. Sin este refresco,
  // el widget de una pantalla se quedaria mostrando un total viejo toda la
  // noche.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <header className="tarjeta mb-6 p-5">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Total efectivo en caja
          </p>
          <p className="cifra mt-1 text-cifraGrande text-entrada">
            {formatearMoneda(efectivoEnCaja)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Dia operativo {diaOperativo} · {choferesConTurno} repartidor
            {choferesConTurno === 1 ? '' : 'es'} con turno abierto
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-slate-500">En caja</p>
          <p className="text-lg font-bold">{cajero}</p>
          <button
            type="button"
            className="mt-2 rounded-xl border border-borde px-4 py-2 text-sm text-slate-400 active:scale-95"
            onClick={() => void accionSalir()}
          >
            Salir
          </button>
        </div>
      </div>

      {respaldoAtrasado ? (
        <p className="mt-4 rounded-2xl bg-aviso/15 p-4 text-aviso">
          ⚠{' '}
          {horasSinRespaldo === null
            ? 'Nunca se ha respaldado la base de datos.'
            : `El ultimo respaldo tiene ${Math.floor(horasSinRespaldo)} horas.`}{' '}
          Avise al encargado: sin respaldo, un fallo se lleva toda la historia del
          negocio.
        </p>
      ) : null}

      <nav className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {ACCESOS.map((acceso) => (
          <Link
            key={acceso.href}
            href={acceso.href}
            className="boton-tactil border border-borde bg-panelClaro text-slate-200"
          >
            {acceso.etiqueta}
          </Link>
        ))}
      </nav>
    </header>
  );
}

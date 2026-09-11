/**
 * Reporteria de la flota: gasto por moto y costo por kilometro.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelFlota } from '@/components/PanelFlota';
import { historialDeFlota, resumenDeFlota } from '@/server/services/mantenimiento';
import { listarFlota } from '@/server/services/motos';
import { cajeroDeSesion } from '@/server/services/sesion';
import type { CategoriaMantenimiento } from '@/types/enums';

export const dynamic = 'force-dynamic';

interface Parametros {
  placa?: string;
  desde?: string;
  hasta?: string;
  categoria?: string;
}

function inicioDelDia(texto: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m || !m[1] || !m[2] || !m[3]) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

/** Fin exclusivo: el dia siguiente a las 00:00, para que "hasta" incluya el dia. */
function finDelDia(texto: string): Date | undefined {
  const inicio = inicioDelDia(texto);
  if (!inicio) return undefined;
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return fin;
}

export default async function Reportes({ searchParams }: { searchParams: Parametros }) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const filtros = {
    placa: searchParams.placa || undefined,
    desde: searchParams.desde ? inicioDelDia(searchParams.desde) : undefined,
    hasta: searchParams.hasta ? finDelDia(searchParams.hasta) : undefined,
    categoria: (searchParams.categoria || undefined) as CategoriaMantenimiento | undefined,
  };

  const [resumen, historial, flota] = await Promise.all([
    resumenDeFlota(filtros),
    historialDeFlota(filtros, 200),
    listarFlota(),
  ]);

  const descripcion = [
    searchParams.placa ? `Moto ${searchParams.placa}` : 'Toda la flota',
    searchParams.desde || searchParams.hasta
      ? `del ${searchParams.desde ?? 'inicio'} al ${searchParams.hasta ?? 'hoy'}`
      : 'historia completa',
    searchParams.categoria ? `solo ${searchParams.categoria}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mx-auto max-w-7xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reportes de flota</h1>
          <p className="text-slate-400">Gasto por moto y costo por kilometro recorrido</p>
        </div>
        <Link
          href="/motos"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200 print:hidden"
        >
          Volver
        </Link>
      </div>

      <PanelFlota
        resumen={resumen}
        historial={historial}
        placas={flota.map((m) => m.placa)}
        filtros={{
          placa: searchParams.placa ?? '',
          desde: searchParams.desde ?? '',
          hasta: searchParams.hasta ?? '',
          categoria: searchParams.categoria ?? '',
        }}
        descripcion={descripcion}
      />
    </main>
  );
}

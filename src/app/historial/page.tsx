/**
 * Modulo 5: pantalla de historial y reporteria.
 *
 * Los filtros llegan por la URL para que una consulta se pueda guardar,
 * recargar y compartir. Sin fecha explicita se muestra el dia operativo en
 * curso, que es lo que el cajero mira el 95 % de las veces.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelHistorial } from '@/components/PanelHistorial';
import { diaOperativoDe, rangoDiaOperativo } from '@/lib/fechas';
import {
  consultarHistorial,
  metricasHistorial,
  opcionesDeFiltro,
} from '@/server/services/historial';
import { cajeroDeSesion } from '@/server/services/sesion';
import type { TipoEvento } from '@/types/enums';

export const dynamic = 'force-dynamic';

interface Parametros {
  desde?: string;
  hasta?: string;
  repartidor?: string;
  cajero?: string;
  tipo?: string;
}

/** Convierte "2026-09-10" en el instante local de inicio de ese dia. */
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

export default async function Historial({ searchParams }: { searchParams: Parametros }) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const diaOperativo = diaOperativoDe();
  const sinFiltroDeFecha = !searchParams.desde && !searchParams.hasta;

  const rangoPorDefecto = rangoDiaOperativo(diaOperativo);
  const desde = sinFiltroDeFecha
    ? rangoPorDefecto.desde
    : searchParams.desde
      ? inicioDelDia(searchParams.desde)
      : undefined;
  const hasta = sinFiltroDeFecha
    ? rangoPorDefecto.hasta
    : searchParams.hasta
      ? finDelDia(searchParams.hasta)
      : undefined;

  const filtros = {
    desde,
    hasta,
    choferId: searchParams.repartidor || undefined,
    cajeroId: searchParams.cajero || undefined,
    tipos: searchParams.tipo ? ([searchParams.tipo] as TipoEvento[]) : undefined,
  };

  const [historial, metricas, opciones] = await Promise.all([
    consultarHistorial({ ...filtros, limite: 100 }),
    metricasHistorial({ desde: filtros.desde, hasta: filtros.hasta, choferId: filtros.choferId }),
    opcionesDeFiltro(),
  ]);

  const nombreChofer = opciones.choferes.find((c) => c.id === filtros.choferId)?.nombre;
  const descripcionFiltro = [
    sinFiltroDeFecha
      ? `Dia operativo ${diaOperativo}`
      : `Del ${searchParams.desde ?? 'inicio'} al ${searchParams.hasta ?? 'hoy'}`,
    nombreChofer ? `Repartidor: ${nombreChofer}` : null,
    searchParams.tipo ? `Evento: ${searchParams.tipo}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mx-auto max-w-7xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Historial y reporteria</h1>
          <p className="text-slate-400">Bitacora inalterable de todo movimiento de dinero</p>
        </div>
        <Link
          href="/"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200 print:hidden"
        >
          Volver
        </Link>
      </div>

      <PanelHistorial
        filas={historial.filas}
        metricas={metricas}
        hayMas={historial.hayMas}
        opciones={opciones}
        filtrosActuales={{
          desde: searchParams.desde ?? '',
          hasta: searchParams.hasta ?? '',
          choferId: searchParams.repartidor ?? '',
          cajeroId: searchParams.cajero ?? '',
          tipo: searchParams.tipo ?? '',
        }}
        descripcionFiltro={descripcionFiltro}
      />
    </main>
  );
}

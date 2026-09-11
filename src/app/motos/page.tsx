/**
 * Dashboard de la flota de motocicletas.
 *
 * Se renderiza en el servidor en cada visita: el estado de una moto cambia
 * cuando alguien la manda al taller desde otra pantalla, y una version
 * cacheada mandaria a la calle una moto que ya no esta.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { GrillaFlota } from '@/components/GrillaFlota';
import { alertasDeFlota } from '@/server/services/mantenimiento';
import { listarFlota } from '@/server/services/motos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Motos() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const [flota, alertas] = await Promise.all([listarFlota(), alertasDeFlota()]);

  const operativas = flota.filter((m) => m.estado === 'OPERATIVA').length;
  const vencidas = alertas.filter((a) => a.nivel === 'VENCIDO').length;

  return (
    <main className="mx-auto max-w-[1600px] p-5">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Flota de motos</h1>
          <p className="text-slate-400">
            {operativas} de {flota.length} operativa{operativas === 1 ? '' : 's'}
            {vencidas > 0 ? ` · ${vencidas} servicio${vencidas === 1 ? '' : 's'} vencido${vencidas === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/motos/gastos"
            className="boton-tactil bg-entrada px-6 text-slate-950"
          >
            ⛽ Registrar gasto
          </Link>
          <Link
            href="/motos/reportes"
            className="boton-tactil border border-borde bg-panelClaro px-6 text-slate-200"
          >
            📊 Reportes
          </Link>
          <Link
            href="/"
            className="boton-tactil border border-borde bg-panelClaro px-6 text-slate-200"
          >
            Volver
          </Link>
        </div>
      </div>

      <GrillaFlota flota={flota} alertas={alertas} />
    </main>
  );
}

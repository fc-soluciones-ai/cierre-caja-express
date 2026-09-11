/**
 * Modulo 4: pantalla de gestion de repartidores.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelChoferes } from '@/components/PanelChoferes';
import { listarChoferesConHistoria } from '@/server/services/choferes';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Choferes() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const choferes = await listarChoferesConHistoria();

  return (
    <main className="mx-auto max-w-4xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion de choferes</h1>
          <p className="text-slate-400">
            {choferes.length} repartidor{choferes.length === 1 ? '' : 'es'} registrado
            {choferes.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200"
        >
          Volver
        </Link>
      </div>

      <PanelChoferes choferes={choferes} />
    </main>
  );
}

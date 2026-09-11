/**
 * Registro de gastos de la flota: gasolina, taller, repuestos, seguro.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { FormularioGasto } from '@/components/FormularioGasto';
import { listarFlota } from '@/server/services/motos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Gastos({ searchParams }: { searchParams: { placa?: string } }) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const flota = await listarFlota();

  return (
    <main className="mx-auto max-w-5xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Registrar gasto</h1>
          <p className="text-slate-400">Gasolina, taller, repuestos y seguros de la flota</p>
        </div>
        <Link
          href="/motos"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200"
        >
          Volver
        </Link>
      </div>

      <FormularioGasto flota={flota} placaInicial={searchParams.placa} />
    </main>
  );
}

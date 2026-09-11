/**
 * Modulo 3, segunda mitad: pantalla de cierre y conciliacion.
 *
 * Se renderiza en el servidor en cada visita: el esperado depende de que
 * archivos se hayan importado hace un minuto y los abonos pueden venir de otra
 * caja. Una version cacheada aqui haria cerrar contra cifras viejas.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PanelCierre } from '@/components/PanelCierre';
import { diaOperativoDe } from '@/lib/fechas';
import { efectivoTeoricoEnCaja } from '@/server/services/caja';
import { previsualizarCierre, type PrevisualizacionCierre } from '@/server/services/cierres';
import { cajeroDeSesion } from '@/server/services/sesion';
import { turnosAbiertos } from '@/server/services/turnos';

export const dynamic = 'force-dynamic';

export default async function Cierre({
  searchParams,
}: {
  searchParams: { repartidor?: string };
}) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const diaOperativo = diaOperativoDe();
  const [turnos, caja] = await Promise.all([
    turnosAbiertos(),
    efectivoTeoricoEnCaja(diaOperativo),
  ]);

  const previsualizaciones: PrevisualizacionCierre[] = await Promise.all(
    turnos.map((turno) => previsualizarCierre(turno.choferId, diaOperativo)),
  );

  return (
    <main className="mx-auto max-w-6xl p-5">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Cierre de turno</h1>
          <p className="text-slate-400">
            Dia operativo {diaOperativo} · en caja {cajero.nombre}
          </p>
        </div>
        <Link
          href="/"
          className="boton-tactil shrink-0 border border-borde bg-panelClaro px-6 text-slate-200"
        >
          Volver
        </Link>
      </div>

      <PanelCierre
        diaOperativo={diaOperativo}
        previsualizaciones={previsualizaciones}
        efectivoTeoricoCaja={caja.total}
        choferPreseleccionado={searchParams.repartidor}
      />
    </main>
  );
}

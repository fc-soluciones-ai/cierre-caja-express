/**
 * Modulo 1: dashboard operativo.
 *
 * Es la pantalla que queda encendida toda la noche en el monitor del
 * mostrador. Se renderiza en el servidor en cada visita porque las cifras que
 * muestra son sumas en vivo, no un cache: mostrar un total de caja viejo seria
 * peor que no mostrarlo.
 */

import { redirect } from 'next/navigation';

import { BarraSuperior } from '@/components/BarraSuperior';
import { GrillaChoferes } from '@/components/GrillaChoferes';
import { diaOperativoDe } from '@/lib/fechas';
import { efectivoTeoricoEnCaja, resumenChoferesEnTurno } from '@/server/services/caja';
import { ultimoRespaldo } from '@/server/services/respaldo';
import { cajeroDeSesion } from '@/server/services/sesion';
import { choferesDisponiblesParaTurno } from '@/server/services/turnos';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const diaOperativo = diaOperativoDe();
  const [caja, enTurno, disponibles, respaldo] = await Promise.all([
    efectivoTeoricoEnCaja(diaOperativo),
    resumenChoferesEnTurno(),
    choferesDisponiblesParaTurno(),
    ultimoRespaldo(),
  ]);

  const horasSinRespaldo = respaldo
    ? (Date.now() - respaldo.modificado.getTime()) / 3_600_000
    : null;

  return (
    <main className="mx-auto max-w-[1600px] p-5">
      <BarraSuperior
        efectivoEnCaja={caja.total}
        diaOperativo={diaOperativo}
        cajero={cajero.nombre}
        choferesConTurno={enTurno.length}
        horasSinRespaldo={horasSinRespaldo}
      />
      <GrillaChoferes enTurno={enTurno} disponibles={disponibles} />
    </main>
  );
}

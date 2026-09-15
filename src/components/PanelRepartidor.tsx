'use client';

/**
 * Lo que ve el repartidor en su telefono.
 *
 * Una sola columna y numeros grandes: esto se mira de pie, en la calle, con
 * una mano. Nada que tocar salvo salir; es una pantalla para consultar, no
 * para registrar. El dinero lo recibe la caja.
 *
 * Lo primero y mas grande es cuanto lleva entregado, porque es la pregunta
 * que el repartidor hace veinte veces por noche.
 */

import Link from 'next/link';

import { accionSalir } from '@/app/acciones';
import { formatearMoneda } from '@/lib/money/money';
import type { AlertaMoto } from '@/server/services/mantenimiento';
import type { ResumenDelRepartidor } from '@/server/services/repartidor';
import type { RepartidorEnSesion } from '@/server/services/sesion';

interface Props {
  repartidor: RepartidorEnSesion;
  resumen: ResumenDelRepartidor;
}

const NOMBRE_CATEGORIA: Record<string, string> = {
  CAMBIO_ACEITE: 'Cambio de aceite',
  FRENOS: 'Frenos',
  LLANTAS: 'Llantas',
  RTV: 'Revision tecnica',
  SEGURO: 'Marchamo y seguro',
};

const NOMBRE_ESTADO: Record<string, string> = {
  OPERATIVA: 'Operativa',
  EN_MANTENIMIENTO: 'En el taller',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

function textoDeAlerta(alerta: AlertaMoto): string {
  if (alerta.clase === 'KILOMETRAJE') {
    return alerta.nivel === 'VENCIDO'
      ? `vencido por ${Math.abs(alerta.kmRestantes).toLocaleString('es-CR')} km`
      : `faltan ${alerta.kmRestantes.toLocaleString('es-CR')} km`;
  }
  const fecha = alerta.vence.toLocaleDateString('es-CR');
  if (alerta.nivel === 'VENCIDO') return `vencio el ${fecha}`;
  if (alerta.diasRestantes === 0) return `vence hoy`;
  return `vence en ${alerta.diasRestantes} dia${alerta.diasRestantes === 1 ? '' : 's'}`;
}

export function PanelRepartidor({ repartidor, resumen }: Props) {
  const hora = (f: Date) =>
    new Date(f).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <main className="mx-auto max-w-lg p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Repartidor</p>
          <h1 className="text-2xl font-bold">{repartidor.nombre}</h1>
          <p className="text-sm text-slate-400">Mesero #{repartidor.codigo}</p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-borde px-4 py-2 text-sm text-slate-400 active:scale-95"
          onClick={() => void accionSalir()}
        >
          Salir
        </button>
      </header>

      <section className="tarjeta mt-5 p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          {resumen.enTurno ? 'Entregado en este turno' : 'Entregado hoy'}
        </p>
        <p className="cifra mt-2 text-5xl font-bold text-entrada">
          {formatearMoneda(resumen.enTurno ? resumen.entregadoEnTurno : resumen.entregadoHoy)}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          {resumen.enTurno
            ? `${resumen.cantidadAbonos} entrega${resumen.cantidadAbonos === 1 ? '' : 's'} · turno abierto`
            : 'No tiene turno abierto ahora'}
        </p>
        {resumen.enTurno && resumen.entregadoHoy !== resumen.entregadoEnTurno ? (
          <p className="mt-2 text-xs text-slate-500">
            En todo el dia lleva {formatearMoneda(resumen.entregadoHoy)}, contando turnos ya
            cerrados.
          </p>
        ) : null}
      </section>

      <Link
        href="/mi/gasolina"
        className="boton-tactil mt-4 flex w-full items-center justify-center bg-entrada text-lg text-slate-950"
      >
        ⛽ Cargar gasolina
      </Link>

      {resumen.ventas ? (
        <section className="tarjeta mt-4 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Lo que dice el sistema</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Dato etiqueta="Viajes" valor={String(resumen.ventas.viajes)} />
            <Dato etiqueta="Vendido" valor={formatearMoneda(resumen.ventas.importe)} />
            <Dato etiqueta="Efectivo" valor={formatearMoneda(resumen.ventas.efectivo)} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Sale del reporte de ventas del dia. Si todavia no lo han importado, no aparece.
          </p>
        </section>
      ) : null}

      {resumen.entregas.length > 0 ? (
        <section className="tarjeta mt-4 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sus entregas</p>
          <ul className="mt-3 divide-y divide-borde">
            {resumen.entregas.map((entrega) => (
              <li key={entrega.id} className="flex items-center justify-between py-3">
                <span className="text-slate-400">{hora(entrega.hora)}</span>
                <span
                  className={`cifra font-bold ${
                    entrega.anulado ? 'text-slate-600 line-through' : 'text-slate-100'
                  }`}
                >
                  {formatearMoneda(entrega.monto)}
                </span>
              </li>
            ))}
          </ul>
          {resumen.entregas.some((e) => e.anulado) ? (
            <p className="mt-3 text-xs text-slate-500">
              Lo tachado se anulo. No cuenta en el total.
            </p>
          ) : null}
        </section>
      ) : null}

      {resumen.moto ? (
        <section className="tarjeta mt-4 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Su moto</p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="cifra text-2xl font-bold">{resumen.moto.placa}</span>
            <span className="text-sm text-slate-400">
              {resumen.moto.marca} {resumen.moto.modelo}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-fondo p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Kilometraje</p>
              <p className="cifra mt-1 font-bold">
                {resumen.moto.kilometraje.toLocaleString('es-CR')} km
              </p>
            </div>
            <div className="rounded-2xl bg-fondo p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
              <p className="mt-1 font-bold">
                {NOMBRE_ESTADO[resumen.moto.estado] ?? resumen.moto.estado}
              </p>
            </div>
          </div>
          {resumen.moto.prestada ? (
            <p className="mt-3 rounded-2xl bg-aviso/15 p-3 text-sm text-aviso">
              Es la moto comodin, prestada mientras la suya esta en el taller.
            </p>
          ) : null}
          {resumen.moto.alertas.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {resumen.moto.alertas.map((alerta) => (
                <li
                  key={`${alerta.clase}-${alerta.categoria}`}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    alerta.nivel === 'VENCIDO'
                      ? 'bg-alerta/15 text-alerta'
                      : 'bg-aviso/15 text-aviso'
                  }`}
                >
                  {NOMBRE_CATEGORIA[alerta.categoria] ?? alerta.categoria}:{' '}
                  {textoDeAlerta(alerta)}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <section className="tarjeta mt-4 p-5 text-center text-slate-400">
          Hoy no tiene ninguna moto asignada.
        </section>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        Dia operativo {resumen.diaOperativo}. Esta pantalla es solo para consultar; el dinero se
        entrega en la caja.
      </p>
    </main>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-fondo p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="cifra mt-1 font-bold">{valor}</p>
    </div>
  );
}

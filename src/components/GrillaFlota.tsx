'use client';

/**
 * Dashboard de la flota.
 *
 * El semaforo de cada tarjeta responde a la pregunta que el encargado hace de
 * lejos: cuales motos puedo mandar a la calle esta noche. Rojo es no, amarillo
 * es si pero hay que llevarla al taller pronto, verde es si.
 *
 * El estado de la moto pesa mas que el kilometraje: una moto en el taller es
 * roja aunque le acaben de cambiar el aceite.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  accionAsignarMoto,
  accionCambiarEstadoMoto,
  accionCrearMoto,
  accionEditarMoto,
  accionLiberarMoto,
} from '@/app/motos/acciones';
import { FormularioMoto, type DatosMoto } from '@/components/FormularioMoto';
import type { AlertaMoto } from '@/server/services/mantenimiento';
import type { MotoConAsignacion } from '@/server/services/motos';
import type { EstadoMoto } from '@/types/enums';

interface Props {
  flota: MotoConAsignacion[];
  alertas: AlertaMoto[];
  /** Repartidores activos que hoy no traen ninguna moto. */
  choferesLibres: Array<{ id: string; nombre: string }>;
}

const NOMBRE_CATEGORIA: Record<string, string> = {
  CAMBIO_ACEITE: 'Cambio de aceite',
  FRENOS: 'Frenos',
  LLANTAS: 'Llantas',
  GASOLINA: 'Gasolina',
  REPUESTOS: 'Repuestos',
  RTV: 'Revision tecnica',
  SEGURO: 'Marchamo y seguro',
  OTRO: 'Otro',
};

const NOMBRE_ESTADO: Record<string, string> = {
  OPERATIVA: 'Operativa',
  EN_MANTENIMIENTO: 'En el taller',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

function semaforoDe(moto: MotoConAsignacion, alertas: AlertaMoto[]): Semaforo {
  if (moto.estado !== 'OPERATIVA') return 'ROJO';
  if (alertas.some((a) => a.nivel === 'VENCIDO')) return 'ROJO';
  if (alertas.length > 0) return 'AMARILLO';
  return 'VERDE';
}

const COLOR: Record<Semaforo, { punto: string; borde: string; texto: string }> = {
  VERDE: { punto: 'bg-entrada', borde: 'border-borde', texto: 'text-entrada' },
  AMARILLO: { punto: 'bg-aviso', borde: 'border-aviso/50', texto: 'text-aviso' },
  ROJO: { punto: 'bg-alerta', borde: 'border-alerta/50', texto: 'text-alerta' },
};

function enKilometros(km: number): string {
  return `${km.toLocaleString('es-CR')} km`;
}

/**
 * Como se lee una alerta en la tarjeta.
 *
 * Las de kilometraje hablan de kilometros y las de papeles hablan de dias.
 * Mezclar las dos unidades en una misma frase confundiria: "vencido por 30"
 * no dice si son kilometros o dias.
 */
function textoDeAlerta(alerta: AlertaMoto): string {
  if (alerta.clase === 'KILOMETRAJE') {
    return alerta.nivel === 'VENCIDO'
      ? `vencido por ${Math.abs(alerta.kmRestantes).toLocaleString('es-CR')} km`
      : `faltan ${alerta.kmRestantes.toLocaleString('es-CR')} km`;
  }

  const fecha = alerta.vence.toLocaleDateString('es-CR');
  if (alerta.nivel === 'VENCIDO') {
    const dias = Math.abs(alerta.diasRestantes);
    return `vencio el ${fecha}, hace ${dias} dia${dias === 1 ? '' : 's'}`;
  }
  if (alerta.diasRestantes === 0) return `vence hoy, ${fecha}`;
  return `vence el ${fecha}, en ${alerta.diasRestantes} dia${alerta.diasRestantes === 1 ? '' : 's'}`;
}

/**
 * Color del texto del estado.
 *
 * Va por el estado y no por el semaforo de la tarjeta: el semaforo mezcla el
 * estado con los servicios vencidos, y pintar "Operativa" en rojo porque le
 * falta el aceite se lee como si la moto no sirviera.
 */
const COLOR_ESTADO: Record<string, string> = {
  OPERATIVA: 'text-entrada',
  EN_MANTENIMIENTO: 'text-aviso',
  FUERA_DE_SERVICIO: 'text-alerta',
};

export function GrillaFlota({ flota, alertas, choferesLibres }: Props) {
  const router = useRouter();
  const [cambiando, setCambiando] = useState<MotoConAsignacion | null>(null);
  const [asignando, setAsignando] = useState<MotoConAsignacion | null>(null);
  const [editando, setEditando] = useState<MotoConAsignacion | null>(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enProceso, setEnProceso] = useState(false);

  const hayComodin = flota.some((m) => m.esComodin);

  /** Deja los avisos en blanco antes de abrir cualquier dialogo. */
  const limpiar = useCallback(() => {
    setError(null);
    setResultado(null);
    setAdvertencia(null);
  }, []);

  const cambiarEstado = useCallback(
    async (placa: string, estado: EstadoMoto, motivo: string) => {
      setEnProceso(true);
      setError(null);
      const respuesta = await accionCambiarEstadoMoto(placa, estado, motivo);
      setEnProceso(false);

      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }

      const d = respuesta.datos;
      const partes: string[] = [`${d.placa}: ${NOMBRE_ESTADO[d.estado] ?? d.estado}.`];
      if (d.comodinAsignada) {
        partes.push(`Se le presto la comodin ${d.comodinAsignada} a ${d.choferAfectado}.`);
      }
      if (d.motoDevuelta) {
        partes.push(`${d.choferAfectado} recupera su moto.`);
      }
      setResultado(partes.join(' '));
      setAdvertencia(d.advertencia);
      setCambiando(null);
      router.refresh();
    },
    [router],
  );

  const guardarMoto = useCallback(
    async (datos: DatosMoto) => {
      setEnProceso(true);
      setError(null);

      // Las dos ramas van por separado porque el alta devuelve la placa ya
      // normalizada y la edicion no devuelve nada.
      if (editando) {
        const respuesta = await accionEditarMoto(editando.placa, {
          marca: datos.marca,
          modelo: datos.modelo,
          anio: datos.anio,
          esComodin: datos.esComodin,
          notas: datos.notas ?? '',
          ficha: datos.ficha,
        });
        setEnProceso(false);
        if (!respuesta.ok) {
          setError(respuesta.mensaje);
          return;
        }
        setResultado(`${editando.placa} actualizada.`);
      } else {
        const respuesta = await accionCrearMoto(datos);
        setEnProceso(false);
        if (!respuesta.ok) {
          setError(respuesta.mensaje);
          return;
        }
        // Quien teclea "mot-555 b" tiene que ver que quedo como MOT555B.
        setResultado(`${respuesta.datos.placa} agregada a la flota.`);
      }

      setEditando(null);
      setCreando(false);
      router.refresh();
    },
    [editando, router],
  );

  const asignar = useCallback(
    async (placa: string, choferId: string) => {
      setEnProceso(true);
      setError(null);
      const respuesta = await accionAsignarMoto(placa, choferId);
      setEnProceso(false);

      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }

      const d = respuesta.datos;
      const partes = [`${d.placa} queda con ${d.choferNombre}.`];
      if (d.motoAnterior) partes.push(`Entrega la ${d.motoAnterior}.`);
      if (d.choferDesplazado) partes.push(`${d.choferDesplazado} se queda sin moto.`);
      setResultado(partes.join(' '));
      setAsignando(null);
      router.refresh();
    },
    [router],
  );

  const liberar = useCallback(
    async (moto: MotoConAsignacion) => {
      if (!moto.choferId) return;
      setEnProceso(true);
      setError(null);
      const respuesta = await accionLiberarMoto(moto.choferId);
      setEnProceso(false);

      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }

      setResultado(`${moto.placa} queda libre. ${moto.choferNombre} entrega la moto.`);
      setAsignando(null);
      router.refresh();
    },
    [router],
  );

  const botonNueva = (
    <button
      type="button"
      className="boton-tactil bg-entrada px-6 text-slate-950"
      onClick={() => {
        limpiar();
        setCreando(true);
      }}
    >
      ➕ Nueva moto
    </button>
  );

  const dialogos = (
    <>
      {creando || editando ? (
        <FormularioMoto
          moto={editando}
          hayComodin={hayComodin}
          enProceso={enProceso}
          error={error}
          alGuardar={guardarMoto}
          alCerrar={() => {
            setCreando(false);
            setEditando(null);
            setError(null);
          }}
        />
      ) : null}

      {cambiando ? (
        <ModalEstado
          moto={cambiando}
          enProceso={enProceso}
          alCerrar={() => setCambiando(null)}
          alCambiar={cambiarEstado}
        />
      ) : null}

      {asignando ? (
        <ModalAsignar
          moto={asignando}
          choferes={choferesLibres}
          enProceso={enProceso}
          alCerrar={() => setAsignando(null)}
          alAsignar={asignar}
          alLiberar={liberar}
        />
      ) : null}
    </>
  );

  if (flota.length === 0) {
    return (
      <>
        <div className="tarjeta p-10 text-center">
          <p className="text-5xl">🏍️</p>
          <h2 className="mt-4 text-xl font-bold">No hay motos registradas</h2>
          <p className="mt-2 text-slate-400">
            Agregue las motos de la flota para llevar su kilometraje y sus gastos.
          </p>
          <div className="mt-6 flex justify-center">{botonNueva}</div>
        </div>
        {dialogos}
      </>
    );
  }

  return (
    <>
      <div className="mb-5 flex justify-end">{botonNueva}</div>

      {resultado ? (
        <div className="mb-5 rounded-2xl bg-entrada/15 p-4 text-entrada">{resultado}</div>
      ) : null}
      {advertencia ? (
        <div className="mb-5 rounded-2xl bg-aviso/15 p-4 text-aviso">⚠ {advertencia}</div>
      ) : null}
      {error && !creando && !editando ? (
        <div className="mb-5 rounded-2xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {flota.map((moto) => {
          const suyas = alertas.filter((a) => a.placa === moto.placa);
          const luz = semaforoDe(moto, suyas);
          const color = COLOR[luz];

          return (
            <article key={moto.placa} className={`tarjeta flex flex-col border p-5 ${color.borde}`}>
              <div className="flex items-start gap-4">
                <span
                  className={`mt-2 h-4 w-4 shrink-0 rounded-full ${color.punto}`}
                  aria-label={`Semaforo ${luz.toLowerCase()}`}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="cifra truncate text-2xl font-bold">{moto.placa}</h2>
                  <p className="truncate text-sm text-slate-400">
                    {moto.marca} {moto.modelo} · {moto.anio}
                  </p>
                </div>
                {moto.esComodin ? (
                  <span className="shrink-0 rounded-lg bg-panelClaro px-2 py-1 text-xs text-slate-300">
                    Comodin
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Editar ${moto.placa}`}
                  className="h-10 w-10 shrink-0 rounded-full border border-borde text-slate-400 active:scale-95"
                  onClick={() => {
                    limpiar();
                    setEditando(moto);
                  }}
                >
                  ✎
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-fondo p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Kilometraje</p>
                  <p className="cifra mt-1 text-xl font-bold">
                    {enKilometros(moto.kilometrajeActual)}
                  </p>
                </div>
                <div className="rounded-2xl bg-fondo p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
                  <p
                    className={`mt-1 text-sm font-bold ${
                      COLOR_ESTADO[moto.estado] ?? 'text-slate-300'
                    }`}
                  >
                    {NOMBRE_ESTADO[moto.estado] ?? moto.estado}
                  </p>
                </div>
              </div>

              <button
                type="button"
                aria-label={`Cambiar quien trae la ${moto.placa}`}
                className="mt-3 w-full rounded-2xl bg-fondo p-3 text-left active:scale-[0.99]"
                onClick={() => {
                  limpiar();
                  setAsignando(moto);
                }}
              >
                <span className="block text-xs uppercase tracking-wide text-slate-500">
                  La trae · toque para cambiar
                </span>
                <span className="mt-1 block truncate font-bold">
                  {moto.choferNombre ?? <span className="text-slate-600">Nadie</span>}
                  {moto.tipoAsignacion === 'COMODIN' ? (
                    <span className="ml-2 text-xs font-normal text-aviso">(prestada)</span>
                  ) : null}
                </span>
              </button>

              {suyas.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {suyas.map((alerta) => (
                    <li
                      key={`${alerta.clase}-${alerta.categoria}`}
                      className={`rounded-lg px-2 py-1 text-xs ${
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

              <div className="mt-4 grid gap-3">
                <Link
                  href={`/motos/gastos?placa=${moto.placa}`}
                  className="boton-tactil bg-entrada text-slate-950"
                >
                  ⛽ Registrar gasto
                </Link>
                <button
                  type="button"
                  className="boton-tactil border border-borde bg-panelClaro text-slate-200"
                  onClick={() => {
                    limpiar();
                    setCambiando(moto);
                  }}
                >
                  🔧 Cambiar estado
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {dialogos}
    </>
  );
}

/**
 * Entrega de una moto a un repartidor.
 *
 * Solo se ofrecen los que hoy no traen nada. Quitarle la moto a otro para
 * darsela a este se hace desde la tarjeta del otro, para que quede claro a
 * quien se esta dejando a pie.
 */
function ModalAsignar({
  moto,
  choferes,
  enProceso,
  alCerrar,
  alAsignar,
  alLiberar,
}: {
  moto: MotoConAsignacion;
  choferes: Array<{ id: string; nombre: string }>;
  enProceso: boolean;
  alCerrar: () => void;
  alAsignar: (placa: string, choferId: string) => void;
  alLiberar: (moto: MotoConAsignacion) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta w-full max-w-lg p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Quien trae la moto</p>
            <h2 className="cifra text-2xl font-bold">{moto.placa}</h2>
            <p className="mt-1 text-slate-400">
              {moto.choferNombre ? `Hoy la trae ${moto.choferNombre}` : 'Hoy no la trae nadie'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
            disabled={enProceso}
          >
            ×
          </button>
        </header>

        {moto.choferId ? (
          <button
            type="button"
            className="boton-tactil mt-5 w-full border border-alerta/50 bg-alerta/10 text-alerta"
            disabled={enProceso}
            onClick={() => alLiberar(moto)}
          >
            Quitarle la moto a {moto.choferNombre}
          </button>
        ) : null}

        <p className="mt-5 text-xs uppercase tracking-wide text-slate-500">
          Repartidores sin moto
        </p>

        {choferes.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-fondo p-4 text-center text-slate-400">
            Todos los repartidores activos ya traen una moto.
          </p>
        ) : (
          <div className="mt-3 grid max-h-80 gap-3 overflow-y-auto">
            {choferes.map((chofer) => (
              <button
                key={chofer.id}
                type="button"
                className="boton-tactil border border-borde bg-panelClaro text-slate-200"
                disabled={enProceso}
                onClick={() => alAsignar(moto.placa, chofer.id)}
              >
                {chofer.nombre}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="boton-tactil mt-5 w-full border border-borde bg-panelClaro text-slate-300"
          onClick={alCerrar}
          disabled={enProceso}
        >
          {enProceso ? 'Aplicando...' : 'Cancelar'}
        </button>
      </div>
    </div>
  );
}

function ModalEstado({
  moto,
  enProceso,
  alCerrar,
  alCambiar,
}: {
  moto: MotoConAsignacion;
  enProceso: boolean;
  alCerrar: () => void;
  alCambiar: (placa: string, estado: EstadoMoto, motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState('');

  const opciones: Array<{ estado: EstadoMoto; etiqueta: string; nota: string }> = [
    {
      estado: 'EN_MANTENIMIENTO',
      etiqueta: '🔧 Mandar al taller',
      nota: moto.esComodin
        ? 'La comodin no se reemplaza a si misma.'
        : 'Se le presta la comodin al repartidor, si esta libre.',
    },
    {
      estado: 'FUERA_DE_SERVICIO',
      etiqueta: '🚫 Fuera de servicio',
      nota: 'Para la que no vuelve pronto: accidente o venta.',
    },
    {
      estado: 'OPERATIVA',
      etiqueta: '✅ Volver a circulacion',
      nota: 'Se la devuelve a su repartidor y libera la comodin.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta w-full max-w-lg p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Cambiar estado</p>
            <h2 className="cifra text-2xl font-bold">{moto.placa}</h2>
            <p className="mt-1 text-slate-400">
              {moto.choferNombre ? `La trae ${moto.choferNombre}` : 'Sin repartidor asignado'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
            disabled={enProceso}
          >
            ×
          </button>
        </header>

        <label className="mt-5 block">
          <span className="text-xs uppercase tracking-wide text-slate-500">
            Motivo (queda en el historial)
          </span>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cadena rota, frenos, revision..."
            className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
          />
        </label>

        <div className="mt-5 grid gap-3">
          {opciones
            .filter((o) => o.estado !== moto.estado)
            .map((opcion) => (
              <button
                key={opcion.estado}
                type="button"
                className="rounded-2xl border border-borde bg-panelClaro p-4 text-left transition active:scale-[0.98] disabled:opacity-40"
                disabled={enProceso}
                onClick={() => alCambiar(moto.placa, opcion.estado, motivo)}
              >
                <span className="block text-lg font-bold">{opcion.etiqueta}</span>
                <span className="mt-1 block text-sm text-slate-400">{opcion.nota}</span>
              </button>
            ))}
        </div>

        <button
          type="button"
          className="boton-tactil mt-5 w-full border border-borde bg-panelClaro text-slate-300"
          onClick={alCerrar}
          disabled={enProceso}
        >
          {enProceso ? 'Aplicando...' : 'Cancelar'}
        </button>
      </div>
    </div>
  );
}

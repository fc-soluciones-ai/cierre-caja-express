'use client';

/**
 * Modulo 5: historial, auditoria y reporteria.
 *
 * Los filtros viven en la URL, no en el estado del componente. Asi el cajero
 * puede dejar la pantalla abierta en "Tono, ultimos 4 dias" y recargar sin
 * perderla, y el supervisor puede pasarle el enlace exacto a otro.
 */

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  accionExportarExcel,
  accionPrevisualizarTiquete,
  accionReimprimir,
} from '@/app/historial/acciones';
import { formatearFechaHora } from '@/lib/fechas';
import { clasificarDiferencia, esClaveDeDinero, formatearMoneda } from '@/lib/money/money';
import type { FilaHistorial, MetricasHistorial } from '@/server/services/historial';

interface Props {
  filas: FilaHistorial[];
  metricas: MetricasHistorial;
  hayMas: boolean;
  opciones: {
    choferes: Array<{ id: string; nombre: string }>;
    cajeros: Array<{ id: string; nombre: string }>;
  };
  filtrosActuales: {
    desde: string;
    hasta: string;
    choferId: string;
    cajeroId: string;
    tipo: string;
  };
  descripcionFiltro: string;
}

const NOMBRE_EVENTO: Record<string, string> = {
  ABONO: 'Abono parcial',
  ABONO_ANULADO: 'Abono anulado',
  CARGA_EXCEL: 'Carga de Excel',
  CIERRE_CHOFER: 'Cierre de turno',
  ARQUEO: 'Arqueo de caja',
  CHOFER_CREADO: 'Alta de repartidor',
  CHOFER_EDITADO: 'Edicion de repartidor',
  CHOFER_DESACTIVADO: 'Baja de repartidor',
  REIMPRESION: 'Reimpresion',
  LOGIN: 'Entrada a la caja',
};

const COLOR_EVENTO: Record<string, string> = {
  ABONO: 'bg-entrada/15 text-entrada',
  ABONO_ANULADO: 'bg-alerta/15 text-alerta',
  CIERRE_CHOFER: 'bg-sky-500/15 text-sky-300',
  ARQUEO: 'bg-violet-500/15 text-violet-300',
  CARGA_EXCEL: 'bg-amber-500/15 text-aviso',
};

/** Los eventos que un cajero quiere filtrar a diario. */
const TIPOS_FILTRABLES = [
  { valor: '', texto: 'Todos los eventos' },
  { valor: 'ABONO', texto: 'Abonos' },
  { valor: 'CIERRE_CHOFER', texto: 'Cierres' },
  { valor: 'ARQUEO', texto: 'Arqueos' },
  { valor: 'CARGA_EXCEL', texto: 'Cargas de Excel' },
  { valor: 'ABONO_ANULADO', texto: 'Anulaciones' },
  { valor: 'REIMPRESION', texto: 'Reimpresiones' },
];

export function PanelHistorial({
  filas,
  metricas,
  hayMas,
  opciones,
  filtrosActuales,
  descripcionFiltro,
}: Props) {
  const router = useRouter();
  const rutaActual = usePathname();
  const parametros = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();

  const [detalle, setDetalle] = useState<FilaHistorial | null>(null);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiarFiltro = useCallback(
    (clave: string, valor: string) => {
      const nuevos = new URLSearchParams(parametros.toString());
      if (valor === '') nuevos.delete(clave);
      else nuevos.set(clave, valor);
      iniciarTransicion(() => router.replace(`${rutaActual}?${nuevos.toString()}`));
    },
    [parametros, rutaActual, router],
  );

  const atajoDias = useCallback(
    (dias: number) => {
      const hasta = new Date();
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      const nuevos = new URLSearchParams(parametros.toString());
      nuevos.set('desde', desde.toISOString().slice(0, 10));
      nuevos.delete('hasta');
      iniciarTransicion(() => router.replace(`${rutaActual}?${nuevos.toString()}`));
    },
    [parametros, rutaActual, router],
  );

  const exportar = useCallback(async () => {
    setExportando(true);
    setAviso(null);
    const respuesta = await accionExportarExcel(
      {
        desde: filtrosActuales.desde || undefined,
        hasta: filtrosActuales.hasta || undefined,
        choferId: filtrosActuales.choferId || undefined,
        cajeroId: filtrosActuales.cajeroId || undefined,
        tipos: filtrosActuales.tipo ? [filtrosActuales.tipo] : undefined,
      },
      descripcionFiltro,
    );

    if (!respuesta.ok) {
      setAviso(respuesta.mensaje);
      setExportando(false);
      return;
    }

    // El archivo llega en base64 y se arma en el navegador: asi no hay que
    // escribirlo en el disco de la caja ni limpiarlo despues.
    const binario = atob(respuesta.datos.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = respuesta.datos.nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
    setExportando(false);
  }, [descripcionFiltro, filtrosActuales]);

  return (
    <div className="space-y-5">
      <section className="tarjeta p-5 print:hidden">
        <div className="grid gap-4 lg:grid-cols-4">
          <CampoFiltro etiqueta="Desde">
            <input
              type="date"
              value={filtrosActuales.desde}
              onChange={(e) => cambiarFiltro('desde', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            />
          </CampoFiltro>

          <CampoFiltro etiqueta="Hasta">
            <input
              type="date"
              value={filtrosActuales.hasta}
              onChange={(e) => cambiarFiltro('hasta', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            />
          </CampoFiltro>

          <CampoFiltro etiqueta="Repartidor">
            <select
              value={filtrosActuales.choferId}
              onChange={(e) => cambiarFiltro('repartidor', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            >
              <option value="">Todos</option>
              {opciones.choferes.map((chofer) => (
                <option key={chofer.id} value={chofer.id}>
                  {chofer.nombre}
                </option>
              ))}
            </select>
          </CampoFiltro>

          <CampoFiltro etiqueta="Tipo de evento">
            <select
              value={filtrosActuales.tipo}
              onChange={(e) => cambiarFiltro('tipo', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            >
              {TIPOS_FILTRABLES.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.texto}
                </option>
              ))}
            </select>
          </CampoFiltro>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { texto: 'Hoy', dias: 0 },
            { texto: 'Ultimos 4 dias', dias: 4 },
            { texto: 'Ultimos 7 dias', dias: 7 },
            { texto: 'Ultimos 30 dias', dias: 30 },
          ].map((atajo) => (
            <button
              key={atajo.texto}
              type="button"
              className="h-12 rounded-xl border border-borde bg-panelClaro px-4 text-sm font-semibold text-slate-300 active:scale-95"
              onClick={() => atajoDias(atajo.dias)}
            >
              {atajo.texto}
            </button>
          ))}
          <Link
            href="/historial"
            className="flex h-12 items-center rounded-xl border border-borde px-4 text-sm text-slate-400"
          >
            Limpiar filtros
          </Link>
        </div>
      </section>

      <section className="tarjeta p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Metricas del periodo</h2>
          <p className="text-sm text-slate-400">{descripcionFiltro}</p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metrica etiqueta="Efectivo esperado" valor={formatearMoneda(metricas.efectivoEsperado)} />
          <Metrica etiqueta="Tarjeta" valor={formatearMoneda(metricas.tarjeta)} apagado />
          <Metrica etiqueta="SINPE Movil" valor={formatearMoneda(metricas.sinpe)} apagado />
          <Metrica etiqueta="Viajes" valor={String(metricas.viajes)} />
          <Metrica
            etiqueta={`Abonos recibidos (${metricas.cantidadAbonos})`}
            valor={formatearMoneda(metricas.abonosParciales)}
            color="text-entrada"
          />
          <Metrica
            etiqueta="Entregas en cierre"
            valor={formatearMoneda(metricas.entregasEnCierre)}
            color="text-entrada"
          />
          <Metrica
            etiqueta="Faltantes acumulados"
            valor={formatearMoneda(metricas.faltantes)}
            color={metricas.faltantes > 0 ? 'text-alerta' : undefined}
          />
          <Metrica
            etiqueta="Sobrantes acumulados"
            valor={formatearMoneda(metricas.sobrantes)}
            color={metricas.sobrantes > 0 ? 'text-aviso' : undefined}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3 print:hidden">
          <button
            type="button"
            className="boton-tactil border border-borde bg-panelClaro px-6 text-slate-200 disabled:opacity-40"
            disabled={exportando}
            onClick={exportar}
          >
            {exportando ? 'Generando...' : '📊 Exportar a Excel'}
          </button>
          <button
            type="button"
            className="boton-tactil border border-borde bg-panelClaro px-6 text-slate-200"
            onClick={() => window.print()}
          >
            🖨 Imprimir o guardar en PDF
          </button>
        </div>

        {aviso ? <p className="mt-4 text-alerta">{aviso}</p> : null}
      </section>

      <section className="tarjeta p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Movimientos</h2>
          <p className="text-sm text-slate-400">
            {pendiente ? 'Actualizando...' : `${filas.length} registro${filas.length === 1 ? '' : 's'}`}
            {hayMas ? ' (se muestran los mas recientes)' : ''}
          </p>
        </div>

        {filas.length === 0 ? (
          <p className="mt-8 text-center text-slate-500">
            No hay movimientos que coincidan con el filtro.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Fecha y hora</th>
                  <th className="pb-2">Evento</th>
                  <th className="pb-2">Repartidor</th>
                  <th className="pb-2">Usuario</th>
                  <th className="pb-2 text-right">Monto</th>
                  <th className="pb-2 print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.map((fila) => (
                  <tr key={fila.id}>
                    <td className="cifra whitespace-nowrap py-3 text-slate-300">
                      {formatearFechaHora(new Date(fila.timestamp))}
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                          COLOR_EVENTO[fila.tipo] ?? 'bg-panelClaro text-slate-300'
                        }`}
                      >
                        {NOMBRE_EVENTO[fila.tipo] ?? fila.tipo}
                      </span>
                    </td>
                    <td className="py-3">{fila.choferNombre ?? '—'}</td>
                    <td className="py-3 text-slate-400">{fila.cajeroNombre ?? '—'}</td>
                    <td className="cifra py-3 text-right font-bold">
                      {fila.monto === null ? '—' : <Monto tipo={fila.tipo} monto={fila.monto} />}
                    </td>
                    <td className="py-3 text-right print:hidden">
                      <button
                        type="button"
                        className="h-12 rounded-xl border border-borde px-4 text-sm text-slate-300 active:scale-95"
                        onClick={() => setDetalle(fila)}
                      >
                        Ver ficha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detalle ? <FichaDetalle fila={detalle} alCerrar={() => setDetalle(null)} /> : null}
    </div>
  );
}

/**
 * El signo del monto depende del evento: en un cierre es la diferencia, donde
 * negativo es faltante; en un abono es dinero que entra.
 */
function Monto({ tipo, monto }: { tipo: string; monto: number }) {
  if (tipo === 'CIERRE_CHOFER' || tipo === 'ARQUEO') {
    const clasificacion = clasificarDiferencia(monto);
    if (clasificacion === 'CUADRADO') return <span className="text-slate-400">Cuadrado</span>;
    // El signo se escribe con el guion ASCII, igual que formatearMoneda: el
    // menos tipografico no existe en la pagina de codigos de la impresora y
    // dos signos distintos en la misma columna se leen como dos cosas.
    return (
      <span className={clasificacion === 'FALTANTE' ? 'text-alerta' : 'text-aviso'}>
        {clasificacion === 'FALTANTE' ? '-' : '+'}
        {formatearMoneda(Math.abs(monto))}
      </span>
    );
  }
  return (
    <span className={monto < 0 ? 'text-alerta' : 'text-slate-100'}>
      {formatearMoneda(monto)}
    </span>
  );
}

function CampoFiltro({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Metrica({
  etiqueta,
  valor,
  apagado = false,
  color,
}: {
  etiqueta: string;
  valor: string;
  apagado?: boolean;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-borde bg-fondo p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p
        className={`cifra mt-1 text-2xl font-bold ${
          color ?? (apagado ? 'text-slate-400' : 'text-slate-100')
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

function FichaDetalle({ fila, alCerrar }: { fila: FilaHistorial; alCerrar: () => void }) {
  const [tiquete, setTiquete] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const verTiquete = useCallback(async () => {
    if (!fila.tiqueteId) return;
    setCargando(true);
    const respuesta = await accionPrevisualizarTiquete(fila.tiqueteId);
    if (respuesta.ok) setTiquete(respuesta.datos);
    else setMensaje(respuesta.mensaje);
    setCargando(false);
  }, [fila.tiqueteId]);

  const reimprimir = useCallback(async () => {
    if (!fila.tiqueteId) return;
    setCargando(true);
    setMensaje(null);
    const respuesta = await accionReimprimir(fila.tiqueteId);
    if (!respuesta.ok) setMensaje(respuesta.mensaje);
    else if (respuesta.datos.impreso) setMensaje('El tiquete salio por la impresora.');
    else setMensaje(respuesta.datos.error ?? 'No se pudo imprimir.');
    setCargando(false);
  }, [fila.tiqueteId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta w-full max-w-2xl p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Ficha del movimiento</p>
            <h2 className="text-2xl font-bold">{NOMBRE_EVENTO[fila.tipo] ?? fila.tipo}</h2>
            <p className="cifra mt-1 text-slate-400">
              {formatearFechaHora(new Date(fila.timestamp))}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
          >
            ×
          </button>
        </header>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Dato etiqueta="Repartidor" valor={fila.choferNombre ?? '—'} />
          <Dato etiqueta="Usuario" valor={fila.cajeroNombre ?? '—'} />
          <Dato
            etiqueta="Monto"
            valor={fila.monto === null ? '—' : formatearMoneda(fila.monto)}
          />
          <Dato etiqueta="Dispositivo" valor={fila.dispositivo ?? '—'} />
          <Dato etiqueta="Entidad" valor={fila.entidadTipo ?? '—'} />
          <Dato etiqueta="Referencia" valor={fila.entidadId ?? '—'} />
        </dl>

        {fila.detalle ? (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Detalle registrado</p>
            <dl className="mt-2 divide-y divide-borde rounded-2xl border border-borde bg-fondo">
              {Object.entries(fila.detalle).map(([clave, valor]) => (
                <div key={clave} className="flex justify-between gap-4 px-4 py-2">
                  <dt className="text-slate-400">{clave}</dt>
                  <dd className="cifra text-right text-slate-200">
                    {formatearValorDeDetalle(clave, valor)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {tiquete ? (
          <pre className="mt-5 overflow-x-auto rounded-2xl border border-borde bg-fondo p-4 text-xs leading-tight text-slate-300">
            {tiquete}
          </pre>
        ) : null}

        {mensaje ? (
          <p className="mt-4 rounded-xl bg-panelClaro p-3 text-center text-slate-200">{mensaje}</p>
        ) : null}

        {fila.tiqueteId ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="boton-tactil border border-borde bg-panelClaro text-slate-200 disabled:opacity-40"
              disabled={cargando}
              onClick={verTiquete}
            >
              👁 Ver tiquete
            </button>
            <button
              type="button"
              className="boton-tactil bg-entrada text-slate-950 disabled:opacity-40"
              disabled={cargando}
              onClick={reimprimir}
            >
              🖨 Reimprimir tiquete
            </button>
          </div>
        ) : (
          <p className="mt-5 text-center text-sm text-slate-500">
            Este movimiento no genero un tiquete.
          </p>
        )}
      </div>
    </div>
  );
}

/** Los montos de la bitacora vienen en centimos. Ver esClaveDeDinero. */
function formatearValorDeDetalle(clave: string, valor: unknown): string {
  if (typeof valor === 'number' && esClaveDeDinero(clave)) {
    return formatearMoneda(valor);
  }
  if (typeof valor === 'object' && valor !== null) {
    return Array.isArray(valor) ? `${valor.length} elemento(s)` : JSON.stringify(valor);
  }
  return String(valor);
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-borde bg-fondo p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd className="mt-1 break-words text-slate-100">{valor}</dd>
    </div>
  );
}

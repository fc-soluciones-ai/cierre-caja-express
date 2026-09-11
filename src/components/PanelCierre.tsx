'use client';

/**
 * Modulo 3, segunda mitad: cierre y conciliacion.
 *
 * La diferencia se calcula en vivo mientras el cajero teclea, con la misma
 * formula que usa el servidor:
 *
 *   diferencia = (abonos parciales + efectivo entregado) - efectivo esperado
 *
 * El calculo del cliente es SOLO para que el cajero vea el faltante antes de
 * confirmar. El numero que queda asentado lo vuelve a calcular el servidor
 * contra los abonos reales del turno, porque entre que se pinta esta pantalla
 * y se pulsa Confirmar otra caja puede haber recibido un abono mas.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { accionCerrarTurnos } from '@/app/cierre/acciones';
import { ModalMonto } from '@/components/ModalMonto';
import { calcularDiferencia, clasificarDiferencia, formatearMoneda } from '@/lib/money/money';
import type { ResultadoCierreLote } from '@/server/services/cierres';
import type { PrevisualizacionCierre } from '@/server/services/cierres';

interface Props {
  diaOperativo: string;
  previsualizaciones: PrevisualizacionCierre[];
  efectivoTeoricoCaja: number;
  choferPreseleccionado?: string;
}

type MonedaEnEdicion =
  | { tipo: 'CHOFER'; choferId: string }
  | { tipo: 'ARQUEO' }
  | null;

export function PanelCierre({
  diaOperativo,
  previsualizaciones,
  efectivoTeoricoCaja,
  choferPreseleccionado,
}: Props) {
  const router = useRouter();

  const [seleccionados, setSeleccionados] = useState<Set<string>>(
    () => new Set(choferPreseleccionado ? [choferPreseleccionado] : []),
  );
  const [entregas, setEntregas] = useState<Record<string, number>>(() =>
    Object.fromEntries(previsualizaciones.map((p) => [p.choferId, p.sugerenciaEntrega])),
  );
  const [conArqueo, setConArqueo] = useState(true);
  const [contado, setContado] = useState(0);
  const [editando, setEditando] = useState<MonedaEnEdicion>(null);
  const [permitirSinVentas, setPermitirSinVentas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCierreLote | null>(null);

  const alternar = useCallback((choferId: string) => {
    setError(null);
    setSeleccionados((actuales) => {
      const nuevos = new Set(actuales);
      if (nuevos.has(choferId)) nuevos.delete(choferId);
      else nuevos.add(choferId);
      return nuevos;
    });
  }, []);

  const seleccionarTodos = useCallback(() => {
    setError(null);
    setSeleccionados((actuales) =>
      actuales.size === previsualizaciones.length
        ? new Set()
        : new Set(previsualizaciones.map((p) => p.choferId)),
    );
  }, [previsualizaciones]);

  const filas = useMemo(
    () =>
      previsualizaciones.map((p) => {
        const entregado = entregas[p.choferId] ?? 0;
        const diferencia = calcularDiferencia(
          p.abonosParciales,
          entregado,
          p.efectivoEsperado,
        );
        return {
          ...p,
          entregado,
          diferencia,
          clasificacion: clasificarDiferencia(diferencia),
          seleccionado: seleccionados.has(p.choferId),
        };
      }),
    [entregas, previsualizaciones, seleccionados],
  );

  const totales = useMemo(() => {
    const activos = filas.filter((f) => f.seleccionado);
    return {
      cantidad: activos.length,
      esperado: activos.reduce((a, f) => a + f.efectivoEsperado, 0),
      abonos: activos.reduce((a, f) => a + f.abonosParciales, 0),
      entregado: activos.reduce((a, f) => a + f.entregado, 0),
      diferencia: activos.reduce((a, f) => a + f.diferencia, 0),
      // Lo que habra en la gaveta despues de recibir las entregas de este cierre.
      teoricoTrasCierre: efectivoTeoricoCaja + activos.reduce((a, f) => a + f.entregado, 0),
      hayCierreSinVentas: activos.some((f) => !f.tieneVentasCargadas),
    };
  }, [efectivoTeoricoCaja, filas]);

  const confirmar = useCallback(async () => {
    if (enviando || totales.cantidad === 0) return;
    setEnviando(true);
    setError(null);

    const respuesta = await accionCerrarTurnos({
      diaOperativo,
      cierres: filas
        .filter((f) => f.seleccionado)
        .map((f) => ({
          choferId: f.choferId,
          efectivoEntregado: f.entregado,
          permitirSinVentas: permitirSinVentas || undefined,
        })),
      arqueo: conArqueo
        ? {
            efectivoRealContado: contado,
            // Una sola clave por confirmacion: si el dedo rebota, el segundo
            // envio se rechaza en vez de asentar dos arqueos.
            claveIdempotencia: crypto.randomUUID(),
          }
        : undefined,
    });

    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      setEnviando(false);
      return;
    }

    setResultado(respuesta.datos);
    setEnviando(false);
    router.refresh();
  }, [conArqueo, contado, diaOperativo, enviando, filas, permitirSinVentas, router, totales.cantidad]);

  if (resultado) {
    return <ResumenCierre resultado={resultado} />;
  }

  if (previsualizaciones.length === 0) {
    return (
      <div className="tarjeta p-10 text-center">
        <p className="text-5xl">🌙</p>
        <h2 className="mt-4 text-xl font-bold">No hay turnos abiertos</h2>
        <p className="mt-2 text-slate-400">
          Todos los repartidores estan cerrados. Un turno se abre solo cuando alguien entrega su
          primer abono.
        </p>
        <Link href="/" className="boton-tactil mx-auto mt-8 max-w-xs bg-entrada text-slate-950">
          Volver al dashboard
        </Link>
      </div>
    );
  }

  const enEdicion = editando;

  return (
    <div className="space-y-5">
      <div className="tarjeta p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Repartidores con turno abierto</h2>
            <p className="text-sm text-slate-400">
              {totales.cantidad} de {previsualizaciones.length} seleccionado
              {totales.cantidad === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            className="boton-tactil border border-borde bg-panelClaro px-6 text-slate-200"
            onClick={seleccionarTodos}
          >
            {totales.cantidad === previsualizaciones.length
              ? 'Quitar todos'
              : 'Seleccionar todos'}
          </button>
        </div>

        <ul className="mt-5 space-y-3">
          {filas.map((fila) => (
            <li
              key={fila.choferId}
              className={`rounded-2xl border p-4 transition ${
                fila.seleccionado
                  ? 'border-entrada bg-entrada/5'
                  : 'border-borde bg-fondo opacity-70'
              }`}
            >
              <div className="flex flex-wrap items-start gap-4">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={fila.seleccionado}
                  aria-label={`Seleccionar a ${fila.choferNombre}`}
                  className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 text-2xl transition active:scale-95 ${
                    fila.seleccionado
                      ? 'border-entrada bg-entrada text-slate-950'
                      : 'border-borde text-transparent'
                  }`}
                  onClick={() => alternar(fila.choferId)}
                >
                  ✓
                </button>

                <div className="min-w-[12rem] flex-1">
                  <p className="text-xl font-bold">{fila.choferNombre}</p>
                  <p className="text-sm text-slate-400">
                    {fila.viajesTotales} viaje{fila.viajesTotales === 1 ? '' : 's'} ·{' '}
                    {fila.cantidadAbonos} abono{fila.cantidadAbonos === 1 ? '' : 's'}
                  </p>
                  {!fila.tieneVentasCargadas ? (
                    <p className="mt-2 rounded-lg bg-aviso/15 px-2 py-1 text-xs text-aviso">
                      Sin ventas cargadas para este dia
                    </p>
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <Dato etiqueta="Esperado" valor={formatearMoneda(fila.efectivoEsperado)} />
                  <Dato etiqueta="Abonos" valor={formatearMoneda(fila.abonosParciales)} />
                  <Dato etiqueta="Tarjeta" valor={formatearMoneda(fila.tarjetaEsperada)} apagado />
                  <Dato etiqueta="SINPE" valor={formatearMoneda(fila.sinpeEsperado)} apagado />
                </dl>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className="flex min-h-tactil items-center justify-between gap-3 rounded-2xl border border-borde bg-panelClaro px-5 text-left active:scale-[0.98]"
                  onClick={() => setEditando({ tipo: 'CHOFER', choferId: fila.choferId })}
                >
                  <span className="text-sm uppercase tracking-wide text-slate-500">
                    Entrega en el cierre
                  </span>
                  <span className="cifra text-2xl font-bold">
                    {formatearMoneda(fila.entregado)}
                  </span>
                </button>

                <div
                  className={`flex min-h-tactil items-center justify-between gap-3 rounded-2xl px-5 ${
                    fila.clasificacion === 'CUADRADO'
                      ? 'bg-panelClaro'
                      : fila.clasificacion === 'FALTANTE'
                        ? 'bg-alerta/20'
                        : 'bg-aviso/20'
                  }`}
                >
                  <span className="text-sm uppercase tracking-wide text-slate-400">
                    {fila.clasificacion === 'CUADRADO' ? 'Cuadrado' : `🚨 ${fila.clasificacion}`}
                  </span>
                  <span
                    className={`cifra text-2xl font-bold ${
                      fila.clasificacion === 'CUADRADO'
                        ? 'text-slate-300'
                        : fila.clasificacion === 'FALTANTE'
                          ? 'text-alerta'
                          : 'text-aviso'
                    }`}
                  >
                    {formatearMoneda(Math.abs(fila.diferencia))}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="tarjeta p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Arqueo de caja</h2>
            <p className="text-sm text-slate-400">
              Cuente la gaveta despues de recibir las entregas de este cierre.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={conArqueo}
            className={`boton-tactil border px-6 ${
              conArqueo
                ? 'border-entrada bg-entrada/20 text-entrada'
                : 'border-borde bg-panelClaro text-slate-300'
            }`}
            onClick={() => setConArqueo((a) => !a)}
          >
            {conArqueo ? 'Incluir arqueo' : 'Sin arqueo'}
          </button>
        </div>

        {conArqueo ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-borde bg-fondo p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Teorico en caja</p>
              <p className="cifra mt-1 text-2xl font-bold">
                {formatearMoneda(totales.teoricoTrasCierre)}
              </p>
            </div>

            <button
              type="button"
              className="rounded-2xl border border-borde bg-panelClaro p-4 text-left active:scale-[0.98]"
              onClick={() => setEditando({ tipo: 'ARQUEO' })}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">Contado a mano</p>
              <p className="cifra mt-1 text-2xl font-bold text-entrada">
                {formatearMoneda(contado)}
              </p>
            </button>

            <DiferenciaCaja teorico={totales.teoricoTrasCierre} contado={contado} />
          </div>
        ) : null}
      </div>

      {totales.hayCierreSinVentas ? (
        <div className="tarjeta border-aviso/50 p-5">
          <p className="text-aviso">
            ⚠ Hay repartidores seleccionados sin ventas cargadas para el dia {diaOperativo}. Si
            cierra ahora, todo lo que entregaron quedara como sobrante.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/importar"
              className="boton-tactil border border-borde bg-panelClaro px-6 text-slate-200"
            >
              Importar el Excel primero
            </Link>
            <button
              type="button"
              className={`boton-tactil border px-6 ${
                permitirSinVentas
                  ? 'border-aviso bg-aviso/20 text-aviso'
                  : 'border-borde bg-panelClaro text-slate-300'
              }`}
              onClick={() => setPermitirSinVentas((a) => !a)}
            >
              {permitirSinVentas ? 'Cierre forzado activado' : 'Cerrar sin Excel de todos modos'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-alerta/15 p-5 text-center text-lg text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tarjeta sticky bottom-0 p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Dato etiqueta="Esperado" valor={formatearMoneda(totales.esperado)} grande />
          <Dato
            etiqueta="Recibido"
            valor={formatearMoneda(totales.abonos + totales.entregado)}
            grande
          />
          <Dato etiqueta="Repartidores" valor={String(totales.cantidad)} grande />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Diferencia total</p>
            <p
              className={`cifra text-2xl font-bold ${
                totales.diferencia === 0
                  ? 'text-slate-300'
                  : totales.diferencia < 0
                    ? 'text-alerta'
                    : 'text-aviso'
              }`}
            >
              {totales.diferencia === 0
                ? formatearMoneda(0)
                : `${clasificarDiferencia(totales.diferencia)} ${formatearMoneda(Math.abs(totales.diferencia))}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="boton-tactil mt-4 h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
          disabled={enviando || totales.cantidad === 0}
          onClick={confirmar}
        >
          {enviando
            ? 'Cerrando...'
            : totales.cantidad === 0
              ? 'Seleccione al menos un repartidor'
              : `Confirmar cierre de ${totales.cantidad} repartidor${totales.cantidad === 1 ? '' : 'es'}`}
        </button>
      </div>

      {enEdicion?.tipo === 'CHOFER'
        ? (() => {
            const fila = filas.find((f) => f.choferId === enEdicion.choferId);
            if (!fila) return null;
            return (
              <ModalMonto
                titulo="Efectivo entregado"
                subtitulo={`${fila.choferNombre} · esperado ${formatearMoneda(fila.efectivoEsperado)}`}
                valorInicial={fila.entregado}
                sugerencia={{
                  etiqueta: `Cuadra ${formatearMoneda(fila.sugerenciaEntrega, { conSimbolo: false })}`,
                  centimos: fila.sugerenciaEntrega,
                }}
                onConfirmar={(centimos) => {
                  setEntregas((actuales) => ({ ...actuales, [fila.choferId]: centimos }));
                  setSeleccionados((actuales) => new Set(actuales).add(fila.choferId));
                  setEditando(null);
                }}
                onCancelar={() => setEditando(null)}
              />
            );
          })()
        : null}

      {enEdicion?.tipo === 'ARQUEO' ? (
        <ModalMonto
          titulo="Efectivo contado en la gaveta"
          subtitulo={`Teorico ${formatearMoneda(totales.teoricoTrasCierre)}`}
          valorInicial={contado}
          sugerencia={{
            etiqueta: `Teorico ${formatearMoneda(totales.teoricoTrasCierre, { conSimbolo: false })}`,
            centimos: totales.teoricoTrasCierre,
          }}
          onConfirmar={(centimos) => {
            setContado(centimos);
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      ) : null}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  apagado = false,
  grande = false,
}: {
  etiqueta: string;
  valor: string;
  apagado?: boolean;
  grande?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd
        className={`cifra font-bold ${grande ? 'text-2xl' : 'text-base'} ${
          apagado ? 'text-slate-500' : 'text-slate-100'
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

function DiferenciaCaja({ teorico, contado }: { teorico: number; contado: number }) {
  const diferencia = contado - teorico;
  const clasificacion = clasificarDiferencia(diferencia);
  return (
    <div
      className={`rounded-2xl p-4 ${
        clasificacion === 'CUADRADO'
          ? 'bg-panelClaro'
          : clasificacion === 'FALTANTE'
            ? 'bg-alerta/20'
            : 'bg-aviso/20'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {clasificacion === 'CUADRADO' ? 'Caja cuadrada' : `🚨 ${clasificacion} en caja`}
      </p>
      <p
        className={`cifra mt-1 text-2xl font-bold ${
          clasificacion === 'CUADRADO'
            ? 'text-slate-300'
            : clasificacion === 'FALTANTE'
              ? 'text-alerta'
              : 'text-aviso'
        }`}
      >
        {formatearMoneda(Math.abs(diferencia))}
      </p>
    </div>
  );
}

function ResumenCierre({ resultado }: { resultado: ResultadoCierreLote }) {
  return (
    <div className="tarjeta p-8">
      <div className="text-center">
        <p className="text-6xl">✅</p>
        <h2 className="mt-4 text-2xl font-bold">
          {resultado.cierres.length} turno{resultado.cierres.length === 1 ? '' : 's'} cerrado
          {resultado.cierres.length === 1 ? '' : 's'}
        </h2>
        <p className="mt-1 text-slate-400">Dia operativo {resultado.diaOperativo}</p>
      </div>

      <ul className="mt-6 space-y-2">
        {resultado.cierres.map((cierre) => (
          <li
            key={cierre.cierreId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-fondo p-4"
          >
            <span className="font-bold">{cierre.choferNombre}</span>
            <span className="text-sm text-slate-400">
              {cierre.viajesTotales} viajes · recibido {formatearMoneda(cierre.totalRecibido)}
            </span>
            <span
              className={`cifra font-bold ${
                cierre.clasificacion === 'CUADRADO'
                  ? 'text-entrada'
                  : cierre.clasificacion === 'FALTANTE'
                    ? 'text-alerta'
                    : 'text-aviso'
              }`}
            >
              {cierre.clasificacion === 'CUADRADO'
                ? 'Cuadrado'
                : `${cierre.clasificacion} ${formatearMoneda(Math.abs(cierre.diferencia))}`}
            </span>
          </li>
        ))}
      </ul>

      {resultado.arqueo ? (
        <div className="mt-4 rounded-2xl border border-borde bg-fondo p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Arqueo de caja</p>
          <p className="mt-1">
            Teorico {formatearMoneda(resultado.arqueo.efectivoTeoricoCaja)} · contado{' '}
            {formatearMoneda(resultado.arqueo.efectivoRealContado)} ·{' '}
            <span
              className={
                resultado.arqueo.diferenciaCaja === 0
                  ? 'text-entrada'
                  : resultado.arqueo.diferenciaCaja < 0
                    ? 'text-alerta'
                    : 'text-aviso'
              }
            >
              {resultado.arqueo.diferenciaCaja === 0
                ? 'cuadrada'
                : `${clasificarDiferencia(resultado.arqueo.diferenciaCaja)} ${formatearMoneda(
                    Math.abs(resultado.arqueo.diferenciaCaja),
                  )}`}
            </span>
          </p>
        </div>
      ) : null}

      {resultado.impresion.impresos === resultado.impresion.total ? (
        <p className="mt-6 text-center text-sm text-slate-500">
          Los {resultado.impresion.total} tiquetes salieron por la impresora.
        </p>
      ) : (
        /* El cierre quedo asentado igual. Anunciar tiquetes que no salieron
           haria que nadie los reimprimiera. */
        <p className="mt-6 rounded-xl bg-aviso/15 p-4 text-center text-aviso">
          Salieron {resultado.impresion.impresos} de {resultado.impresion.total} tiquetes. El
          cierre quedo asentado; reimprima los que falten desde el historial.
        </p>
      )}

      <Link href="/" className="boton-tactil mx-auto mt-6 max-w-sm bg-entrada text-slate-950">
        Volver al dashboard
      </Link>
    </div>
  );
}

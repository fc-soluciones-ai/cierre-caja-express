'use client';

/**
 * Modulo 3, primera mitad: importacion de los reportes de Soft Restaurant.
 *
 * El flujo es en dos pasos a proposito. Primero se lee el archivo y se muestra
 * a que repartidor se imputa cada linea; solo despues se escribe. Un mesero mal
 * cruzado produce un faltante que aparece al cierre y que nadie sabe explicar,
 * asi que el cajero tiene que poder verlo antes.
 */

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { accionImportarLote, accionPrevisualizarLote } from '@/app/importar/acciones';
import { formatearMoneda } from '@/lib/money/money';
import type { PrevisualizacionLote, ResultadoCarga } from '@/server/services/cargas';
import type { TipoCorte, TipoReporte } from '@/types/enums';

interface ArchivoLocal {
  archivo: File;
  tipoCorte: TipoCorte;
  tipoReporte: TipoReporte;
}

function construirFormulario(archivos: readonly ArchivoLocal[]): FormData {
  const formulario = new FormData();
  for (const item of archivos) formulario.append('archivos', item.archivo);
  formulario.append(
    'metas',
    JSON.stringify(
      archivos.map((a) => ({ tipoCorte: a.tipoCorte, tipoReporte: a.tipoReporte })),
    ),
  );
  return formulario;
}

export function ImportadorExcel() {
  const router = useRouter();
  const entradaArchivos = useRef<HTMLInputElement>(null);

  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [vista, setVista] = useState<PrevisualizacionLote | null>(null);
  const [importado, setImportado] = useState<ResultadoCarga[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const agregar = useCallback((nuevos: FileList | null) => {
    if (!nuevos || nuevos.length === 0) return;
    setError(null);
    setVista(null);
    setImportado(null);
    setArchivos((actuales) => {
      const yaEstan = new Set(actuales.map((a) => `${a.archivo.name}:${a.archivo.size}`));
      const agregados = [...nuevos]
        .filter((f) => !yaEstan.has(`${f.name}:${f.size}`))
        .map<ArchivoLocal>((archivo) => ({
          archivo,
          // El caso corriente es el reporte facturado del cierre del dia.
          tipoCorte: 'TOTAL',
          tipoReporte: 'BLANCO',
        }));
      return [...actuales, ...agregados];
    });
  }, []);

  const clasificar = useCallback(
    (indice: number, cambio: Partial<Pick<ArchivoLocal, 'tipoCorte' | 'tipoReporte'>>) => {
      setVista(null);
      setArchivos((actuales) =>
        actuales.map((a, i) => (i === indice ? { ...a, ...cambio } : a)),
      );
    },
    [],
  );

  const quitar = useCallback((indice: number) => {
    setVista(null);
    setArchivos((actuales) => actuales.filter((_, i) => i !== indice));
  }, []);

  const previsualizar = useCallback(async () => {
    if (archivos.length === 0 || trabajando) return;
    setTrabajando(true);
    setError(null);
    const respuesta = await accionPrevisualizarLote(construirFormulario(archivos));
    if (respuesta.ok) setVista(respuesta.datos);
    else setError(respuesta.mensaje);
    setTrabajando(false);
  }, [archivos, trabajando]);

  const importar = useCallback(async () => {
    if (archivos.length === 0 || trabajando) return;
    setTrabajando(true);
    setError(null);
    const respuesta = await accionImportarLote(construirFormulario(archivos));
    if (respuesta.ok) {
      setImportado(respuesta.datos);
      setArchivos([]);
      setVista(null);
      router.refresh();
    } else {
      setError(respuesta.mensaje);
    }
    setTrabajando(false);
  }, [archivos, router, trabajando]);

  if (importado) {
    const totalLineas = importado.reduce((a, r) => a + r.lineasImportadas, 0);
    const sinCruzar = importado.reduce((a, r) => a + r.lineasSinCruzar, 0);
    const excluidas = importado.reduce((a, r) => a + r.lineasExcluidas, 0);
    return (
      <div className="tarjeta p-8 text-center">
        <p className="text-6xl">✅</p>
        <h2 className="mt-4 text-2xl font-bold">Ventas importadas</h2>
        <p className="mt-2 text-slate-400">
          {importado.length} archivo{importado.length === 1 ? '' : 's'} · {totalLineas} linea
          {totalLineas === 1 ? '' : 's'} de mesero
        </p>
        {sinCruzar > 0 ? (
          <p className="mt-4 rounded-xl bg-aviso/15 p-4 text-aviso">
            {sinCruzar} linea{sinCruzar === 1 ? '' : 's'} quedaron sin imputar porque el mesero
            no existe como repartidor. Creelo en Gestion de Choferes y vuelva a importar el
            reporte.
          </p>
        ) : null}
        {excluidas > 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            {excluidas} linea{excluidas === 1 ? '' : 's'} son cuentas del local y no se liquidan
            a nadie.
          </p>
        ) : null}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link href="/cierre" className="boton-tactil bg-entrada text-slate-950">
            Ir a cerrar turnos
          </Link>
          <button
            type="button"
            className="boton-tactil border border-borde bg-panelClaro text-slate-200"
            onClick={() => setImportado(null)}
          >
            Importar otro archivo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div
        className={`tarjeta border-2 border-dashed p-10 text-center transition ${
          arrastrando ? 'border-entrada bg-entrada/10' : 'border-borde'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          agregar(e.dataTransfer.files);
        }}
      >
        <p className="text-5xl">📁</p>
        <p className="mt-4 text-xl font-bold">Arrastre aqui los reportes de Soft Restaurant</p>
        <p className="mt-2 text-slate-400">
          Puede soltar varios a la vez: el reporte facturado, el no facturado y los cortes
          parciales del dia.
        </p>
        <input
          ref={entradaArchivos}
          type="file"
          accept=".xls,.xlsx,.xlsm"
          multiple
          className="hidden"
          onChange={(e) => {
            agregar(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="boton-tactil mx-auto mt-6 bg-entrada px-10 text-slate-950"
          onClick={() => entradaArchivos.current?.click()}
        >
          Buscar archivos
        </button>
      </div>

      {error ? (
        <p className="rounded-2xl bg-alerta/15 p-5 text-center text-lg text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      {archivos.length > 0 ? (
        <div className="tarjeta p-5">
          <h2 className="text-lg font-bold">Archivos por importar</h2>
          <p className="mt-1 text-sm text-slate-400">
            Clasifique cada archivo. El tipo de reporte y el tipo de corte no se adivinan del
            nombre porque el operador los renombra a diario.
          </p>

          <ul className="mt-4 space-y-3">
            {archivos.map((item, indice) => (
              <li
                key={`${item.archivo.name}-${indice}`}
                className="rounded-2xl border border-borde bg-fondo p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{item.archivo.name}</p>
                    <p className="text-sm text-slate-500">
                      {(item.archivo.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Quitar ${item.archivo.name}`}
                    className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
                    onClick={() => quitar(indice)}
                  >
                    ×
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Selector
                    etiqueta="Tipo de reporte"
                    opciones={[
                      { valor: 'BLANCO', texto: 'Blanco (facturado)' },
                      { valor: 'NEGRO', texto: 'Negro (sin factura)' },
                    ]}
                    valor={item.tipoReporte}
                    onCambio={(v) => clasificar(indice, { tipoReporte: v as TipoReporte })}
                  />
                  <Selector
                    etiqueta="Tipo de corte"
                    opciones={[
                      { valor: 'TOTAL', texto: 'Total del dia' },
                      { valor: 'PARCIAL', texto: 'Corte parcial' },
                    ]}
                    valor={item.tipoCorte}
                    onCambio={(v) => clasificar(indice, { tipoCorte: v as TipoCorte })}
                  />
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="boton-tactil mt-5 w-full border border-borde bg-panelClaro text-slate-100 disabled:opacity-40"
            disabled={trabajando}
            onClick={previsualizar}
          >
            {trabajando ? 'Leyendo...' : '👁 Revisar antes de importar'}
          </button>
        </div>
      ) : null}

      {vista ? <Previsualizacion vista={vista} trabajando={trabajando} alImportar={importar} /> : null}
    </div>
  );
}

function Selector({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: Array<{ valor: string; texto: string }>;
  valor: string;
  onCambio: (valor: string) => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {opciones.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            className={`h-14 rounded-xl border px-3 text-sm font-semibold transition active:scale-95 ${
              valor === opcion.valor
                ? 'border-entrada bg-entrada/20 text-entrada'
                : 'border-borde bg-panelClaro text-slate-300'
            }`}
            onClick={() => onCambio(opcion.valor)}
          >
            {opcion.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

function Previsualizacion({
  vista,
  trabajando,
  alImportar,
}: {
  vista: PrevisualizacionLote;
  trabajando: boolean;
  alImportar: () => void;
}) {
  const yaCargado = vista.archivos.some((a) => a.yaCargado);
  const sinCruzar = vista.archivos.flatMap((a) =>
    a.lineas.filter((l) => l.cruce === 'SIN_CRUZAR'),
  );
  const excluidas = vista.archivos.flatMap((a) =>
    a.lineas.filter((l) => l.cruce === 'EXCLUIDA'),
  );

  return (
    <div className="tarjeta p-5">
      <h2 className="text-lg font-bold">Asi quedarian las ventas del dia</h2>

      {vista.riesgos.length > 0 || vista.advertencias.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {[...vista.riesgos, ...vista.advertencias].map((aviso) => (
            <li key={aviso} className="rounded-xl bg-aviso/15 p-3 text-sm text-aviso">
              ⚠ {aviso}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2">Mesero en el Excel</th>
              <th className="pb-2">Se imputa a</th>
              <th className="pb-2 text-right">Efectivo</th>
              <th className="pb-2 text-right">Tarjeta</th>
              <th className="pb-2 text-right">SINPE</th>
              <th className="pb-2 text-right">Viajes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {vista.consolidado.choferes.map((chofer) => {
              const cruzado = vista.archivos
                .flatMap((a) => a.lineas)
                .find(
                  (l) =>
                    (chofer.idMeseroExcel !== '' && l.idMeseroExcel === chofer.idMeseroExcel) ||
                    l.nombreNormalizado === chofer.nombreNormalizado,
                );
              return (
                <tr key={chofer.nombreNormalizado || chofer.idMeseroExcel}>
                  <td className="py-3">
                    <span className="font-semibold">{chofer.nombreExcel}</span>
                    <span className="ml-2 text-slate-500">#{chofer.idMeseroExcel || '—'}</span>
                  </td>
                  <td className="py-3">
                    {cruzado?.choferNombre ? (
                      <span className="text-entrada">{cruzado.choferNombre}</span>
                    ) : cruzado?.cruce === 'EXCLUIDA' ? (
                      // Cuenta del local: se informa en gris, no en rojo. No
                      // falta nadie y no hay nada que corregir.
                      <span className="text-slate-500" title={cruzado.motivoExclusion}>
                        Cuenta del local
                      </span>
                    ) : (
                      <span className="text-alerta">Sin repartidor registrado</span>
                    )}
                  </td>
                  <td className="cifra py-3 text-right">
                    {formatearMoneda(chofer.efectivoEsperado)}
                  </td>
                  <td className="cifra py-3 text-right text-slate-400">
                    {formatearMoneda(chofer.tarjetaEsperada)}
                  </td>
                  <td className="cifra py-3 text-right text-slate-400">
                    {formatearMoneda(chofer.sinpeEsperado)}
                  </td>
                  <td className="cifra py-3 text-right">{chofer.viajesTotales}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-borde font-bold">
              <td className="pt-3" colSpan={2}>
                Total del dia
              </td>
              <td className="cifra pt-3 text-right text-entrada">
                {formatearMoneda(vista.consolidado.totales.efectivo)}
              </td>
              <td className="cifra pt-3 text-right">
                {formatearMoneda(vista.consolidado.totales.tarjeta)}
              </td>
              <td className="cifra pt-3 text-right">
                {formatearMoneda(vista.consolidado.totales.sinpe)}
              </td>
              <td className="cifra pt-3 text-right">{vista.consolidado.totales.viajes}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {sinCruzar.length > 0 ? (
        <p className="mt-4 rounded-xl bg-alerta/15 p-4 text-alerta">
          Estas ventas no se imputaran a nadie hasta que el mesero exista como repartidor:{' '}
          {sinCruzar.map((l) => l.nombreExcel || l.idMeseroExcel).join(', ')}.
        </p>
      ) : null}

      {excluidas.length > 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Cuentas del local, no se liquidan a nadie:{' '}
          {[...new Set(excluidas.map((l) => l.nombreExcel || l.idMeseroExcel))].join(', ')}.
        </p>
      ) : null}

      <button
        type="button"
        className="boton-tactil mt-5 h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
        disabled={trabajando || yaCargado}
        onClick={alImportar}
      >
        {trabajando
          ? 'Importando...'
          : yaCargado
            ? 'Uno de los archivos ya fue importado'
            : 'Confirmar importacion'}
      </button>
    </div>
  );
}

'use client';

/**
 * Reporteria de la flota: cuanto cuesta cada moto y en que.
 *
 * Los filtros viven en la URL, igual que en el historial de caja, para que una
 * consulta util se pueda recargar y pasar a otra persona como enlace.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { formatearFechaHora } from '@/lib/fechas';
import { formatearMoneda } from '@/lib/money/money';
import type { LineaHistorial, ResumenPorMoto } from '@/server/services/mantenimiento';

interface Props {
  resumen: ResumenPorMoto[];
  historial: LineaHistorial[];
  placas: string[];
  filtros: { placa: string; desde: string; hasta: string; categoria: string };
  descripcion: string;
}

const NOMBRE_CATEGORIA: Record<string, string> = {
  GASOLINA: 'Gasolina',
  CAMBIO_ACEITE: 'Aceite',
  LLANTAS: 'Llantas',
  FRENOS: 'Frenos',
  REPUESTOS: 'Repuestos',
  RTV: 'Revision tecnica',
  SEGURO: 'Seguro',
  OTRO: 'Otro',
};

const COLUMNAS = ['GASOLINA', 'CAMBIO_ACEITE', 'LLANTAS', 'FRENOS', 'REPUESTOS'] as const;

function km(valor: number): string {
  return formatearMoneda(valor * 100, { conSimbolo: false });
}

export function PanelFlota({ resumen, historial, placas, filtros, descripcion }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const cambiarFiltro = useCallback(
    (clave: string, valor: string) => {
      const nuevos = new URLSearchParams(parametros.toString());
      if (valor === '') nuevos.delete(clave);
      else nuevos.set(clave, valor);
      router.replace(`${ruta}?${nuevos.toString()}`);
    },
    [parametros, ruta, router],
  );

  const totales = resumen.reduce(
    (acc, m) => ({
      gasto: acc.gasto + m.gastoTotal,
      registros: acc.registros + m.cantidadRegistros,
      km: acc.km + m.kmRecorridos,
    }),
    { gasto: 0, registros: 0, km: 0 },
  );

  return (
    <div className="space-y-5">
      <section className="tarjeta p-5 print:hidden">
        <div className="grid gap-4 lg:grid-cols-4">
          <Campo etiqueta="Moto">
            <select
              value={filtros.placa}
              onChange={(e) => cambiarFiltro('placa', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            >
              <option value="">Todas</option>
              {placas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Desde">
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => cambiarFiltro('desde', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            />
          </Campo>

          <Campo etiqueta="Hasta">
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => cambiarFiltro('hasta', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            />
          </Campo>

          <Campo etiqueta="Categoria">
            <select
              value={filtros.categoria}
              onChange={(e) => cambiarFiltro('categoria', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            >
              <option value="">Todas</option>
              {Object.entries(NOMBRE_CATEGORIA).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/motos/reportes"
            className="flex h-12 items-center rounded-xl border border-borde px-4 text-sm text-slate-400"
          >
            Limpiar filtros
          </Link>
          <button
            type="button"
            className="h-12 rounded-xl border border-borde bg-panelClaro px-4 text-sm font-semibold text-slate-300 active:scale-95"
            onClick={() => window.print()}
          >
            🖨 Imprimir o guardar en PDF
          </button>
        </div>
      </section>

      <section className="tarjeta p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Gasto por moto</h2>
          <p className="text-sm text-slate-400">{descripcion}</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Moto</th>
                {COLUMNAS.map((c) => (
                  <th key={c} className="pb-2 text-right">
                    {NOMBRE_CATEGORIA[c]}
                  </th>
                ))}
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2 text-right">Km</th>
                <th className="pb-2 text-right">Costo por km</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {resumen.map((moto) => (
                <tr key={moto.placa}>
                  <td className="py-3">
                    <span className="cifra font-bold">{moto.placa}</span>
                    <span className="ml-2 text-sm text-slate-500">
                      {moto.marca} {moto.modelo}
                    </span>
                  </td>
                  {COLUMNAS.map((c) => (
                    <td key={c} className="cifra py-3 text-right text-slate-400">
                      {moto.gastoPorCategoria[c]
                        ? formatearMoneda(moto.gastoPorCategoria[c]!)
                        : '—'}
                    </td>
                  ))}
                  <td className="cifra py-3 text-right font-bold">
                    {formatearMoneda(moto.gastoTotal)}
                  </td>
                  <td className="cifra py-3 text-right text-slate-400">
                    {moto.kmRecorridos > 0 ? km(moto.kmRecorridos) : '—'}
                  </td>
                  <td className="cifra py-3 text-right font-bold text-entrada">
                    {moto.costoPorKm === null ? (
                      <span className="font-normal text-slate-600">sin datos</span>
                    ) : (
                      formatearMoneda(moto.costoPorKm)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-borde font-bold">
                <td className="pt-3" colSpan={COLUMNAS.length + 1}>
                  Total de la flota
                </td>
                <td className="cifra pt-3 text-right text-entrada">
                  {formatearMoneda(totales.gasto)}
                </td>
                <td className="cifra pt-3 text-right">{km(totales.km)}</td>
                <td className="cifra pt-3 text-right">
                  {totales.km > 0 ? formatearMoneda(Math.round(totales.gasto / totales.km)) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-4 text-sm text-slate-500">
          El costo por kilometro se calcula sobre los kilometros que cubren los registros del
          periodo, no sobre el kilometraje total de la moto. Con un solo registro no hay recorrido
          que medir y la columna dice "sin datos".
        </p>
      </section>

      <section className="tarjeta p-5">
        <h2 className="text-lg font-bold">Movimientos</h2>
        {historial.length === 0 ? (
          <p className="mt-8 text-center text-slate-500">
            No hay gastos que coincidan con el filtro.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">Moto</th>
                  <th className="pb-2">Categoria</th>
                  <th className="pb-2">Proveedor</th>
                  <th className="pb-2 text-right">Odometro</th>
                  <th className="pb-2 text-right">Costo</th>
                  <th className="pb-2">Cajero</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {historial.map((linea) => (
                  <tr key={linea.id}>
                    <td className="cifra whitespace-nowrap py-3 text-slate-300">
                      {formatearFechaHora(new Date(linea.timestamp))}
                    </td>
                    <td className="cifra py-3 font-bold">{linea.placa}</td>
                    <td className="py-3">
                      <span className="rounded-lg bg-panelClaro px-2 py-1 text-xs font-semibold">
                        {NOMBRE_CATEGORIA[linea.categoria] ?? linea.categoria}
                      </span>
                    </td>
                    <td className="py-3 text-slate-400">
                      {linea.tallerOProveedor ?? linea.descripcion ?? '—'}
                    </td>
                    <td className="cifra py-3 text-right text-slate-400">
                      {km(linea.kilometrajeEvento)}
                    </td>
                    <td className="cifra py-3 text-right font-bold">
                      {formatearMoneda(linea.costoTotal)}
                    </td>
                    <td className="py-3 text-slate-400">{linea.cajeroNombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

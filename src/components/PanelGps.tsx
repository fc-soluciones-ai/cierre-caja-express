'use client';

/**
 * Datos del rastreador y su evidencia fotografica.
 *
 * Lo que se vigila aqui no es que la moto TENGA un GPS, sino que alguien haya
 * comprobado hace poco que sigue conectado y con corriente. Un rastreador
 * desenchufado se ve igual que uno funcionando hasta el dia que se roban la
 * moto. Por eso cada foto que se sube mueve la fecha de revision.
 *
 * Las fotos se suben de inmediato, no al guardar el formulario: son archivos,
 * no campos, y guardarlas junto al resto obligaria a acarrear megabytes en el
 * estado del componente mientras alguien termina de teclear.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  accionBorrarEvidenciaGps,
  accionSubirEvidenciaGps,
} from '@/app/motos/acciones';
import type { EvidenciaGps, TipoEvidencia } from '@/server/services/gps';

const TIPOS: Array<{ valor: TipoEvidencia; etiqueta: string; icono: string; nota: string }> = [
  {
    valor: 'CONEXION',
    etiqueta: 'Conectado',
    icono: '🔌',
    nota: 'El equipo en su sitio, con el arnes puesto.',
  },
  {
    valor: 'CORRIENTE',
    etiqueta: 'Con corriente',
    icono: '💡',
    nota: 'La luz encendida, o la pantalla del proveedor reportando.',
  },
  { valor: 'OTRO', etiqueta: 'Otra', icono: '📷', nota: 'Cualquier otra cosa que valga anotar.' },
];

export interface DatosGpsFormulario {
  tieneGps: boolean;
  proveedor: string;
  identificador: string;
  notas: string;
}

interface Props {
  /** La moto ya existe. Sin eso no se pueden adjuntar fotos. */
  placa: string | null;
  revisadoEn: Date | null;
  evidencia: EvidenciaGps[];
  valores: DatosGpsFormulario;
  alCambiar: (v: DatosGpsFormulario) => void;
  bloqueado: boolean;
}

function haceCuanto(fecha: Date): string {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}

export function PanelGps({
  placa,
  revisadoEn,
  evidencia,
  valores,
  alCambiar,
  bloqueado,
}: Props) {
  const router = useRouter();
  const archivoRef = useRef<HTMLInputElement>(null);

  const [tipo, setTipo] = useState<TipoEvidencia>('CONEXION');
  const [descripcion, setDescripcion] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (parcial: Partial<DatosGpsFormulario>) =>
    alCambiar({ ...valores, ...parcial });

  const subir = useCallback(
    async (archivo: File) => {
      if (!placa) return;
      setSubiendo(true);
      setError(null);
      setAviso(null);

      const cuerpo = new FormData();
      cuerpo.set('placa', placa);
      cuerpo.set('tipo', tipo);
      cuerpo.set('descripcion', descripcion);
      cuerpo.set('archivo', archivo);

      const respuesta = await accionSubirEvidenciaGps(cuerpo);
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = '';

      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }

      setDescripcion('');
      setAviso(
        respuesta.datos.sustituidas > 0
          ? `Foto guardada. Se solto la mas vieja para no acumular.`
          : 'Foto guardada. La revision queda al dia.',
      );
      router.refresh();
    },
    [descripcion, placa, router, tipo],
  );

  const borrar = useCallback(
    async (id: string) => {
      setSubiendo(true);
      setError(null);
      const respuesta = await accionBorrarEvidenciaGps(id);
      setSubiendo(false);
      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }
      setAviso('Foto borrada.');
      router.refresh();
    },
    [router],
  );

  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={() => cambiar({ tieneGps: !valores.tieneGps })}
        disabled={bloqueado}
        className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] disabled:opacity-40 ${
          valores.tieneGps ? 'border-entrada bg-entrada/15' : 'border-borde bg-panelClaro'
        }`}
      >
        <span className="flex items-center gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
              valores.tieneGps ? 'border-entrada bg-entrada text-slate-950' : 'border-borde'
            }`}
            aria-hidden="true"
          >
            {valores.tieneGps ? '✓' : ''}
          </span>
          <span>
            <span className="block font-bold">Esta moto lleva GPS</span>
            <span className="mt-1 block text-sm text-slate-400">
              Marquelo para llevar los datos del equipo y la evidencia de que funciona.
            </span>
          </span>
        </span>
      </button>

      {valores.tieneGps ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Proveedor">
              <input
                type="text"
                value={valores.proveedor}
                onChange={(e) => cambiar({ proveedor: e.target.value })}
                placeholder="Nombre de la empresa"
                disabled={bloqueado}
                className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
              />
            </Campo>
            <Campo etiqueta="IMEI o numero de unidad">
              <input
                type="text"
                value={valores.identificador}
                onChange={(e) => cambiar({ identificador: e.target.value })}
                placeholder="El que hay que dictar por telefono"
                disabled={bloqueado}
                className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
              />
            </Campo>
          </div>

          <Campo etiqueta="Notas del equipo">
            <input
              type="text"
              value={valores.notas}
              onChange={(e) => cambiar({ notas: e.target.value })}
              placeholder="Va detras del faro, corriente del fusible de luces..."
              disabled={bloqueado}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
            />
          </Campo>

          <div
            className={`rounded-2xl p-3 text-sm ${
              revisadoEn ? 'bg-fondo text-slate-300' : 'bg-aviso/15 text-aviso'
            }`}
          >
            {revisadoEn ? (
              <>
                Ultima revision: <strong>{haceCuanto(revisadoEn)}</strong>,{' '}
                {new Date(revisadoEn).toLocaleDateString('es-CR')}
              </>
            ) : (
              'Nadie ha comprobado todavia que este equipo este conectado.'
            )}
          </div>

          {!placa ? (
            <p className="rounded-2xl bg-fondo p-4 text-center text-sm text-slate-400">
              Guarde la moto primero. Despues podra adjuntarle las fotos.
            </p>
          ) : (
            <div className="rounded-2xl border border-borde p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Agregar evidencia</p>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    aria-pressed={tipo === t.valor}
                    onClick={() => setTipo(t.valor)}
                    disabled={subiendo || bloqueado}
                    className={`min-h-tactil rounded-2xl border px-2 py-2 text-center text-sm transition active:scale-95 ${
                      tipo === t.valor
                        ? 'border-entrada bg-entrada/15 text-entrada'
                        : 'border-borde bg-panelClaro text-slate-300'
                    }`}
                  >
                    <span className="block text-xl">{t.icono}</span>
                    <span className="block font-bold">{t.etiqueta}</span>
                  </button>
                ))}
              </div>

              <p className="mt-2 text-xs text-slate-500">
                {TIPOS.find((t) => t.valor === tipo)?.nota}
              </p>

              <input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalle (opcional)"
                disabled={subiendo || bloqueado}
                className="mt-3 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
              />

              <input
                ref={archivoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  if (archivo) void subir(archivo);
                }}
              />
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                disabled={subiendo || bloqueado}
                className="boton-tactil mt-3 w-full bg-entrada text-slate-950 disabled:opacity-40"
              >
                {subiendo ? 'Subiendo...' : '📷 Tomar o elegir foto'}
              </button>

              <p className="mt-2 text-center text-xs text-slate-500">
                JPG, PNG o WEBP, hasta 3 MB. Se conservan las 6 mas recientes.
              </p>
            </div>
          )}

          {aviso ? (
            <p className="rounded-2xl bg-entrada/15 p-3 text-center text-sm text-entrada">{aviso}</p>
          ) : null}
          {error ? (
            <p className="rounded-2xl bg-alerta/15 p-3 text-center text-sm text-alerta" role="alert">
              {error}
            </p>
          ) : null}

          {evidencia.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Evidencia guardada ({evidencia.length})
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {evidencia.map((foto) => (
                  <figure key={foto.id} className="overflow-hidden rounded-2xl bg-fondo">
                    <a
                      href={`/api/gps/${foto.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/gps/${foto.id}`}
                        alt={`${foto.tipo} de ${foto.placa}`}
                        className="h-28 w-full object-cover"
                      />
                    </a>
                    <figcaption className="p-2 text-xs text-slate-400">
                      <span className="block font-bold text-slate-300">
                        {TIPOS.find((t) => t.valor === foto.tipo)?.etiqueta ?? foto.tipo}
                      </span>
                      <span className="block">
                        {new Date(foto.tomadaEn).toLocaleDateString('es-CR')} ·{' '}
                        {foto.cajeroNombre}
                      </span>
                      {foto.descripcion ? (
                        <span className="mt-1 block italic">{foto.descripcion}</span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void borrar(foto.id)}
                        disabled={subiendo || bloqueado}
                        className="mt-2 w-full rounded-lg border border-borde py-1 text-alerta active:scale-95"
                      >
                        Borrar
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

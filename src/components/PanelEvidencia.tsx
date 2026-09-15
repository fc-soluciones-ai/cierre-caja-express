'use client';

/**
 * Adjuntar y ver fotos de evidencia de cualquier registro.
 *
 * El mismo bloque sirve para el GPS, para la moto y para un gasto de taller.
 * Lo unico que cambia es a que se adjunta y que opciones se ofrecen; el resto
 * (encoger, subir, mostrar, borrar) es identico, y repetirlo tres veces habria
 * dado tres sitios donde arreglar el mismo problema.
 *
 * Las fotos se suben de inmediato, no al guardar el formulario que las rodea:
 * son archivos, no campos, y acarrear megabytes en el estado del componente
 * mientras alguien termina de teclear no tiene sentido.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionBorrarEvidencia, accionSubirEvidencia } from '@/app/motos/acciones';
import { accionBorrarEvidenciaMia, accionSubirEvidenciaMia } from '@/app/mi/acciones';
import { encogerImagen } from '@/lib/imagen';
import type { Evidencia, TipoEntidad } from '@/server/services/evidencia';

interface Props {
  entidadTipo: TipoEntidad;
  /** Null cuando el registro todavia no existe: no hay a que pegar la foto. */
  entidadId: string | null;
  tipos: ReadonlyArray<{ valor: string; etiqueta: string; icono: string; nota: string }>;
  evidencia: Evidencia[];
  bloqueado?: boolean;
  /** Que decir cuando el registro aun no existe. */
  avisoSinRegistro?: string;
  /** Se llama despues de subir o borrar, por si el padre debe refrescarse. */
  alCambiar?: () => void;
  /**
   * Por cual puerta se sube.
   *
   * La foto queda firmada por quien la subio, y las acciones de caja exigen
   * sesion de caja. Un repartidor tiene que pasar por las suyas o le rebotan.
   */
  canal?: 'CAJA' | 'REPARTIDOR';
}

export function PanelEvidencia({
  entidadTipo,
  entidadId,
  tipos,
  evidencia,
  bloqueado = false,
  avisoSinRegistro = 'Guarde primero. Despues podra adjuntar las fotos.',
  alCambiar,
  canal = 'CAJA',
}: Props) {
  const router = useRouter();
  const archivoRef = useRef<HTMLInputElement>(null);

  const [tipo, setTipo] = useState(tipos[0]?.valor ?? 'OTRO');
  const [descripcion, setDescripcion] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  /**
   * Lo subido en esta pantalla, que todavia no vino del servidor.
   *
   * Cuando el registro ya existia, router.refresh() acaba trayendolo en la
   * lista de arriba y el de aqui sobra; se descarta por id. Cuando el registro
   * se acaba de crear en el navegador (un gasto recien guardado), la lista de
   * arriba nunca lo va a traer, y sin esto la foto no se veria nunca.
   */
  const [recien, setRecien] = useState<Evidencia[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subir = useCallback(
    async (archivo: File) => {
      if (!entidadId) return;
      setTrabajando(true);
      setError(null);
      setAviso(null);

      // La camara entrega megabytes para una miniatura. Se encoge antes.
      const encogida = await encogerImagen(archivo);

      const cuerpo = new FormData();
      cuerpo.set('entidadTipo', entidadTipo);
      cuerpo.set('entidadId', entidadId);
      cuerpo.set('tipo', tipo);
      cuerpo.set('descripcion', descripcion);
      cuerpo.set('archivo', encogida, encogida.name);

      const respuesta =
        canal === 'CAJA'
          ? await accionSubirEvidencia(cuerpo)
          : await accionSubirEvidenciaMia(cuerpo);
      setTrabajando(false);
      if (archivoRef.current) archivoRef.current.value = '';

      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }

      setDescripcion('');
      setRecien((previas) => [respuesta.datos.foto, ...previas]);
      setAviso(
        respuesta.datos.sustituidas > 0
          ? 'Foto guardada. Se solto la mas vieja para no acumular.'
          : 'Foto guardada.',
      );
      alCambiar?.();
      router.refresh();
    },
    [alCambiar, canal, descripcion, entidadId, entidadTipo, router, tipo],
  );

  const borrar = useCallback(
    async (id: string) => {
      setTrabajando(true);
      setError(null);
      const respuesta =
        canal === 'CAJA'
          ? await accionBorrarEvidencia(id)
          : await accionBorrarEvidenciaMia(id);
      setTrabajando(false);
      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }
      setRecien((previas) => previas.filter((f) => f.id !== id));
      setAviso('Foto borrada.');
      alCambiar?.();
      router.refresh();
    },
    [alCambiar, canal, router],
  );

  const nombreDeTipo = (valor: string) =>
    tipos.find((t) => t.valor === valor)?.etiqueta ?? valor;

  const vistos = new Set(evidencia.map((f) => f.id));
  const todas = [...recien.filter((f) => !vistos.has(f.id)), ...evidencia];

  return (
    <div className="grid gap-3">
      {!entidadId ? (
        <p className="rounded-2xl bg-fondo p-4 text-center text-sm text-slate-400">
          {avisoSinRegistro}
        </p>
      ) : (
        <div className="rounded-2xl border border-borde p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Agregar evidencia</p>

          <div className={`mt-3 grid gap-2 ${tipos.length > 3 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            {tipos.map((t) => (
              <button
                key={t.valor}
                type="button"
                aria-pressed={tipo === t.valor}
                onClick={() => setTipo(t.valor)}
                disabled={trabajando || bloqueado}
                className={`min-h-tactil rounded-2xl border px-1 py-2 text-center text-xs transition active:scale-95 ${
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
            {tipos.find((t) => t.valor === tipo)?.nota}
          </p>

          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalle (opcional)"
            disabled={trabajando || bloqueado}
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
            disabled={trabajando || bloqueado}
            className="boton-tactil mt-3 w-full bg-entrada text-slate-950 disabled:opacity-40"
          >
            {trabajando ? 'Subiendo...' : '📷 Tomar o elegir foto'}
          </button>

          <p className="mt-2 text-center text-xs text-slate-500">
            Se encoge sola antes de subirla.
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

      {todas.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Evidencia guardada ({todas.length})
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {todas.map((foto) => (
              <figure key={foto.id} className="overflow-hidden rounded-2xl bg-fondo">
                <a href={`/api/evidencia/${foto.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/evidencia/${foto.id}`}
                    alt={`${nombreDeTipo(foto.tipo)}, ${new Date(foto.tomadaEn).toLocaleDateString('es-CR')}`}
                    className="h-28 w-full object-cover"
                  />
                </a>
                <figcaption className="p-2 text-xs text-slate-400">
                  <span className="block font-bold text-slate-300">
                    {nombreDeTipo(foto.tipo)}
                  </span>
                  <span className="block">
                    {new Date(foto.tomadaEn).toLocaleDateString('es-CR')} · {foto.cajeroNombre}
                  </span>
                  {foto.descripcion ? (
                    <span className="mt-1 block italic">{foto.descripcion}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void borrar(foto.id)}
                    disabled={trabajando || bloqueado}
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
    </div>
  );
}

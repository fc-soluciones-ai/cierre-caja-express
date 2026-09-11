'use client';

/**
 * Modulo 4: gestion de repartidores.
 *
 * Un repartidor no se borra nunca, se desactiva. Sus turnos, abonos y cierres
 * son historia contable, y las llaves foraneas estan en Restrict justamente
 * para que un clic no pueda romperla.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  accionCambiarEstadoChofer,
  accionCrearChofer,
  accionEditarChofer,
} from '@/app/choferes/acciones';
import { clasificarDiferencia, formatearMoneda } from '@/lib/money/money';
import type { ChoferConHistoria } from '@/server/services/choferes';

interface Props {
  choferes: ChoferConHistoria[];
}

type Formulario = { modo: 'CREAR' } | { modo: 'EDITAR'; chofer: ChoferConHistoria } | null;

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

export function PanelChoferes({ choferes }: Props) {
  const router = useRouter();
  const [formulario, setFormulario] = useState<Formulario>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cambiarEstado = useCallback(
    async (chofer: ChoferConHistoria) => {
      setTrabajando(chofer.id);
      setError(null);
      const respuesta = await accionCambiarEstadoChofer(
        chofer.id,
        chofer.estado !== 'ACTIVO',
      );
      if (!respuesta.ok) setError(respuesta.mensaje);
      else router.refresh();
      setTrabajando(null);
    },
    [router],
  );

  const activos = choferes.filter((c) => c.estado === 'ACTIVO');
  const inactivos = choferes.filter((c) => c.estado !== 'ACTIVO');

  return (
    <div className="space-y-5">
      <button
        type="button"
        className="boton-tactil w-full bg-entrada text-lg text-slate-950"
        onClick={() => {
          setError(null);
          setFormulario({ modo: 'CREAR' });
        }}
      >
        ＋ Agregar repartidor
      </button>

      {error ? (
        <p className="rounded-2xl bg-alerta/15 p-5 text-center text-lg text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <Seccion titulo={`En servicio (${activos.length})`}>
        {activos.map((chofer) => (
          <Ficha
            key={chofer.id}
            chofer={chofer}
            trabajando={trabajando === chofer.id}
            alEditar={() => {
              setError(null);
              setFormulario({ modo: 'EDITAR', chofer });
            }}
            alCambiarEstado={() => cambiarEstado(chofer)}
          />
        ))}
      </Seccion>

      {inactivos.length > 0 ? (
        <Seccion titulo={`Fuera de servicio (${inactivos.length})`}>
          {inactivos.map((chofer) => (
            <Ficha
              key={chofer.id}
              chofer={chofer}
              trabajando={trabajando === chofer.id}
              alEditar={() => {
                setError(null);
                setFormulario({ modo: 'EDITAR', chofer });
              }}
              alCambiarEstado={() => cambiarEstado(chofer)}
            />
          ))}
        </Seccion>
      ) : null}

      {formulario ? (
        <ModalChofer
          formulario={formulario}
          alCerrar={() => setFormulario(null)}
          alGuardar={() => {
            setFormulario(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="tarjeta p-5">
      <h2 className="text-lg font-bold">{titulo}</h2>
      <ul className="mt-4 space-y-3">{children}</ul>
    </section>
  );
}

function Ficha({
  chofer,
  trabajando,
  alEditar,
  alCambiarEstado,
}: {
  chofer: ChoferConHistoria;
  trabajando: boolean;
  alEditar: () => void;
  alCambiarEstado: () => void;
}) {
  const activo = chofer.estado === 'ACTIVO';
  const clasificacion = clasificarDiferencia(chofer.diferenciaAcumulada);

  return (
    <li
      className={`rounded-2xl border border-borde bg-fondo p-4 ${activo ? '' : 'opacity-60'}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        {chofer.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={chofer.fotoUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-panelClaro text-xl font-bold text-slate-300">
            {iniciales(chofer.nombre)}
          </div>
        )}

        <div className="min-w-[10rem] flex-1">
          <p className="text-xl font-bold">{chofer.nombre}</p>
          <p className="text-sm text-slate-400">
            Mesero #{chofer.idMeseroSoftRestaurant}
            {chofer.telefono ? ` · ${chofer.telefono}` : ''}
          </p>
          {chofer.tieneTurnoAbierto ? (
            <p className="mt-1 inline-block rounded-lg bg-entrada/15 px-2 py-1 text-xs text-entrada">
              Turno abierto
            </p>
          ) : null}
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {chofer.turnosCerrados} turno{chofer.turnosCerrados === 1 ? '' : 's'} cerrado
            {chofer.turnosCerrados === 1 ? '' : 's'}
          </p>
          <p
            className={`cifra font-bold ${
              clasificacion === 'CUADRADO'
                ? 'text-slate-400'
                : clasificacion === 'FALTANTE'
                  ? 'text-alerta'
                  : 'text-aviso'
            }`}
          >
            {clasificacion === 'CUADRADO'
              ? 'Sin diferencias'
              : `${clasificacion} ${formatearMoneda(Math.abs(chofer.diferenciaAcumulada))}`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="boton-tactil border border-borde bg-panelClaro text-slate-200"
          onClick={alEditar}
        >
          ✎ Editar
        </button>
        <button
          type="button"
          className={`boton-tactil border ${
            activo
              ? 'border-alerta/50 bg-alerta/10 text-alerta'
              : 'border-entrada/50 bg-entrada/10 text-entrada'
          } disabled:opacity-40`}
          disabled={trabajando || (activo && chofer.tieneTurnoAbierto)}
          onClick={alCambiarEstado}
          title={
            activo && chofer.tieneTurnoAbierto
              ? 'Cierre su turno antes de desactivarlo'
              : undefined
          }
        >
          {trabajando ? '...' : activo ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>
    </li>
  );
}

function ModalChofer({
  formulario,
  alCerrar,
  alGuardar,
}: {
  formulario: NonNullable<Formulario>;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const chofer = formulario.modo === 'EDITAR' ? formulario.chofer : null;
  const entradaFoto = useRef<HTMLInputElement>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(chofer?.fotoUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = useCallback(
    async (evento: React.FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      if (enviando) return;
      setEnviando(true);
      setError(null);

      const datos = new FormData(evento.currentTarget);
      const respuesta =
        formulario.modo === 'CREAR'
          ? await accionCrearChofer(datos)
          : await accionEditarChofer(datos);

      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        setEnviando(false);
        return;
      }
      setEnviando(false);
      alGuardar();
    },
    [alGuardar, enviando, formulario.modo],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <form onSubmit={enviar} className="tarjeta w-full max-w-xl p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold">
            {formulario.modo === 'CREAR' ? 'Nuevo repartidor' : 'Editar repartidor'}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
            disabled={enviando}
          >
            ×
          </button>
        </header>

        {chofer ? <input type="hidden" name="choferId" value={chofer.id} /> : null}

        <div className="mt-5 flex items-center gap-5">
          {vistaPrevia ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vistaPrevia} alt="" className="h-24 w-24 rounded-2xl object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-panelClaro text-3xl">
              📷
            </div>
          )}
          <div className="flex-1">
            <input
              ref={entradaFoto}
              type="file"
              name="foto"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) setVistaPrevia(URL.createObjectURL(archivo));
              }}
            />
            <button
              type="button"
              className="boton-tactil w-full border border-borde bg-panelClaro text-slate-200"
              onClick={() => entradaFoto.current?.click()}
            >
              {vistaPrevia ? 'Cambiar foto' : 'Subir foto'}
            </button>
            <p className="mt-2 text-xs text-slate-500">JPG, PNG o WEBP, hasta 4 MB.</p>
          </div>
        </div>

        <Campo
          etiqueta="Nombre completo"
          nombre="nombre"
          valorInicial={chofer?.nombre ?? ''}
          requerido
        />
        <Campo
          etiqueta="Codigo de mesero en Soft Restaurant"
          nombre="idMeseroSoftRestaurant"
          valorInicial={chofer?.idMeseroSoftRestaurant ?? ''}
          ayuda="Es la llave que cruza los reportes de venta con este repartidor."
          requerido
        />
        <Campo
          etiqueta="Telefono (opcional)"
          nombre="telefono"
          valorInicial={chofer?.telefono ?? ''}
          tipo="tel"
        />

        {error ? (
          <p className="mt-4 rounded-xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="boton-tactil mt-6 h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
          disabled={enviando}
        >
          {enviando ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </div>
  );
}

function Campo({
  etiqueta,
  nombre,
  valorInicial,
  ayuda,
  tipo = 'text',
  requerido = false,
}: {
  etiqueta: string;
  nombre: string;
  valorInicial: string;
  ayuda?: string;
  tipo?: string;
  requerido?: boolean;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</span>
      <input
        type={tipo}
        name={nombre}
        defaultValue={valorInicial}
        required={requerido}
        autoComplete="off"
        className="mt-2 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
      />
      {ayuda ? <span className="mt-1 block text-xs text-slate-500">{ayuda}</span> : null}
    </label>
  );
}

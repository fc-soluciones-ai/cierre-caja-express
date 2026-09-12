'use client';

/**
 * Alta y edicion de una moto, en dos pestanas.
 *
 * Datos generales es lo que hace falta para que la moto exista y ruede. Ficha
 * tecnica es lo que alguien necesita saber parado frente al mostrador del
 * repuesto: que aceite lleva, que medida de llanta, que paso de cadena.
 *
 * La ficha va aparte y toda opcional a proposito. Si se pidiera de entrada,
 * nadie registraria ninguna moto: esas medidas hay que ir a buscarlas. Se
 * registra la moto hoy con la placa y el odometro, y la ficha se llena el dia
 * que se va al taller.
 *
 * El kilometraje se teclea en la botonera grande y no en un campo de texto:
 * es el dato que mas se equivoca y el que despues gobierna las alertas. En
 * edicion no se toca, porque se mueve solo al registrar gastos y dejarlo a
 * mano permitiria bajarlo para esquivar un servicio vencido.
 */

import { useState } from 'react';

import { ModalNumero } from '@/components/ModalNumero';
import type { MotoConAsignacion } from '@/server/services/motos';

export interface DatosMoto {
  placa: string;
  marca: string;
  modelo: string;
  anio: number;
  kilometrajeActual: number;
  esComodin: boolean;
  notas?: string;
  ficha: {
    tipoAceite: string | null;
    intervaloAceiteKm: number | null;
    medidaLlantaDelantera: string | null;
    medidaLlantaTrasera: string | null;
    presionLlantasPsi: string | null;
    frenoDelantero: string | null;
    frenoTrasero: string | null;
    medidaCadena: string | null;
    vencimientoRtv: Date | null;
    vencimientoSeguro: Date | null;
  };
}

interface Props {
  /** Moto a editar. Sin ella el formulario es de alta. */
  moto?: MotoConAsignacion | null;
  /** Ya existe una comodin en la flota, asi que no se puede marcar otra. */
  hayComodin: boolean;
  enProceso: boolean;
  error: string | null;
  alGuardar: (datos: DatosMoto) => void;
  alCerrar: () => void;
}

const ANIO_MAXIMO = new Date().getFullYear() + 1;

/** Intervalo de aceite que se propone cuando la moto no trae uno propio. */
const INTERVALO_ACEITE_POR_DEFECTO = 2_000;

const TIPOS_DE_FRENO = ['Disco', 'Tambor'] as const;

/** El input de fecha habla en aaaa-mm-dd y en hora local, no en UTC. */
function aTextoDeFecha(fecha: Date | null): string {
  if (!fecha) return '';
  const d = new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Convierte aaaa-mm-dd en una fecha local al mediodia.
 *
 * Al mediodia y no a medianoche para que ningun cambio de huso mueva el
 * vencimiento al dia anterior.
 */
function aFecha(texto: string): Date | null {
  if (!texto) return null;
  const [anio, mes, dia] = texto.split('-').map(Number);
  if (!anio || !mes || !dia) return null;
  return new Date(anio, mes - 1, dia, 12, 0, 0, 0);
}

export function FormularioMoto({
  moto,
  hayComodin,
  enProceso,
  error,
  alGuardar,
  alCerrar,
}: Props) {
  const editando = Boolean(moto);

  const [pestana, setPestana] = useState<'GENERAL' | 'TECNICA'>('GENERAL');

  const [placa, setPlaca] = useState(moto?.placa ?? '');
  const [marca, setMarca] = useState(moto?.marca ?? '');
  const [modelo, setModelo] = useState(moto?.modelo ?? '');
  const [anio, setAnio] = useState(String(moto?.anio ?? ''));
  const [kilometraje, setKilometraje] = useState(moto?.kilometrajeActual ?? 0);
  const [esComodin, setEsComodin] = useState(moto?.esComodin ?? false);
  const [notas, setNotas] = useState(moto?.notas ?? '');

  const [tipoAceite, setTipoAceite] = useState(moto?.tipoAceite ?? '');
  const [intervaloAceite, setIntervaloAceite] = useState(
    moto?.intervaloAceiteKm ?? INTERVALO_ACEITE_POR_DEFECTO,
  );
  const [llantaDelantera, setLlantaDelantera] = useState(moto?.medidaLlantaDelantera ?? '');
  const [llantaTrasera, setLlantaTrasera] = useState(moto?.medidaLlantaTrasera ?? '');
  const [presion, setPresion] = useState(moto?.presionLlantasPsi ?? '');
  const [frenoDelantero, setFrenoDelantero] = useState(moto?.frenoDelantero ?? '');
  const [frenoTrasero, setFrenoTrasero] = useState(moto?.frenoTrasero ?? '');
  const [cadena, setCadena] = useState(moto?.medidaCadena ?? '');
  const [rtv, setRtv] = useState(aTextoDeFecha(moto?.vencimientoRtv ?? null));
  const [seguro, setSeguro] = useState(aTextoDeFecha(moto?.vencimientoSeguro ?? null));

  const [tecleando, setTecleando] = useState<'KM' | 'INTERVALO' | null>(null);

  // La comodin de la flota puede seguir marcada aunque ya exista una: es ella.
  const comodinBloqueada = hayComodin && !moto?.esComodin;

  const anioNumero = Number(anio);
  const anioValido = Number.isInteger(anioNumero) && anioNumero >= 1980 && anioNumero <= ANIO_MAXIMO;
  const completo =
    placa.trim().length > 0 && marca.trim().length > 0 && modelo.trim().length > 0 && anioValido;

  if (tecleando === 'KM') {
    return (
      <ModalNumero
        titulo="Kilometraje actual"
        subtitulo={placa.trim() || 'Moto nueva'}
        unidad="KILOMETROS"
        valorInicial={kilometraje}
        onConfirmar={(valor) => {
          setKilometraje(valor);
          setTecleando(null);
        }}
        onCancelar={() => setTecleando(null)}
      />
    );
  }

  if (tecleando === 'INTERVALO') {
    return (
      <ModalNumero
        titulo="Cambio de aceite cada"
        subtitulo={`${placa.trim() || 'Moto nueva'} · lo normal son 2.000 km`}
        unidad="KILOMETROS"
        valorInicial={intervaloAceite}
        onConfirmar={(valor) => {
          setIntervaloAceite(valor);
          setTecleando(null);
        }}
        onCancelar={() => setTecleando(null)}
      />
    );
  }

  const enviar = () => {
    if (!completo || enProceso) return;
    alGuardar({
      placa: placa.trim(),
      marca: marca.trim(),
      modelo: modelo.trim(),
      anio: anioNumero,
      kilometrajeActual: kilometraje,
      esComodin,
      notas: notas.trim() || undefined,
      ficha: {
        tipoAceite: tipoAceite.trim() || null,
        intervaloAceiteKm: intervaloAceite > 0 ? intervaloAceite : null,
        medidaLlantaDelantera: llantaDelantera.trim() || null,
        medidaLlantaTrasera: llantaTrasera.trim() || null,
        presionLlantasPsi: presion.trim() || null,
        frenoDelantero: frenoDelantero || null,
        frenoTrasero: frenoTrasero || null,
        medidaCadena: cadena.trim() || null,
        vencimientoRtv: aFecha(rtv),
        vencimientoSeguro: aFecha(seguro),
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <form
        className="tarjeta flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <header className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">
              {editando ? 'Editar moto' : 'Nueva moto'}
            </p>
            <h2 className="text-2xl font-bold">
              {editando ? moto!.placa : 'Agregar a la flota'}
            </h2>
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

        <div className="flex gap-2 px-6 pb-4" role="tablist">
          <Pestana
            activa={pestana === 'GENERAL'}
            onClick={() => setPestana('GENERAL')}
            etiqueta="📋 Datos generales"
          />
          <Pestana
            activa={pestana === 'TECNICA'}
            onClick={() => setPestana('TECNICA')}
            etiqueta="🛠️ Ficha tecnica"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {pestana === 'GENERAL' ? (
            <div className="grid gap-4">
              <Campo etiqueta="Placa">
                <input
                  type="text"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  placeholder="MOT-123"
                  autoFocus={!editando}
                  disabled={editando || enProceso}
                  className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-xl text-slate-100 outline-none focus:border-entrada disabled:opacity-50"
                />
                {editando ? (
                  <span className="mt-1 block text-xs text-slate-500">
                    La placa identifica la moto y no se cambia.
                  </span>
                ) : null}
              </Campo>

              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Marca">
                  <Texto valor={marca} alCambiar={setMarca} ejemplo="Honda" bloqueado={enProceso} />
                </Campo>
                <Campo etiqueta="Modelo">
                  <Texto valor={modelo} alCambiar={setModelo} ejemplo="CB125" bloqueado={enProceso} />
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Año">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={anio}
                    onChange={(e) => setAnio(e.target.value)}
                    placeholder="2024"
                    min={1980}
                    max={ANIO_MAXIMO}
                    disabled={enProceso}
                    className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
                  />
                </Campo>
                <Campo etiqueta="Kilometraje">
                  {editando ? (
                    <p className="cifra flex h-tactil items-center rounded-2xl border border-borde bg-fondo px-4 text-lg text-slate-400">
                      {moto!.kilometrajeActual.toLocaleString('es-CR')} km
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTecleando('KM')}
                      disabled={enProceso}
                      className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-left text-lg text-slate-100 active:scale-[0.98]"
                    >
                      {kilometraje.toLocaleString('es-CR')} km
                    </button>
                  )}
                </Campo>
              </div>

              <button
                type="button"
                onClick={() => setEsComodin(!esComodin)}
                disabled={comodinBloqueada || enProceso}
                className={`rounded-2xl border p-4 text-left transition active:scale-[0.98] disabled:opacity-40 ${
                  esComodin ? 'border-aviso bg-aviso/15' : 'border-borde bg-panelClaro'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                      esComodin ? 'border-aviso bg-aviso text-slate-950' : 'border-borde'
                    }`}
                    aria-hidden="true"
                  >
                    {esComodin ? '✓' : ''}
                  </span>
                  <span>
                    <span className="block font-bold">Es la moto comodin</span>
                    <span className="mt-1 block text-sm text-slate-400">
                      {comodinBloqueada
                        ? 'Ya hay una comodin en la flota. Solo puede haber una.'
                        : 'Se presta sola cuando otra moto entra al taller.'}
                    </span>
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Tipo de aceite">
                  <Texto
                    valor={tipoAceite}
                    alCambiar={setTipoAceite}
                    ejemplo="10W-40 Semi-sintetico"
                    bloqueado={enProceso}
                  />
                </Campo>
                <Campo etiqueta="Cambio de aceite cada">
                  <button
                    type="button"
                    onClick={() => setTecleando('INTERVALO')}
                    disabled={enProceso}
                    className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-left text-lg text-slate-100 active:scale-[0.98]"
                  >
                    {intervaloAceite.toLocaleString('es-CR')} km
                  </button>
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Llanta delantera">
                  <Texto
                    valor={llantaDelantera}
                    alCambiar={setLlantaDelantera}
                    ejemplo="2.75-18"
                    bloqueado={enProceso}
                  />
                </Campo>
                <Campo etiqueta="Llanta trasera">
                  <Texto
                    valor={llantaTrasera}
                    alCambiar={setLlantaTrasera}
                    ejemplo="90/90-18"
                    bloqueado={enProceso}
                  />
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Presion de llantas (PSI)">
                  <Texto
                    valor={presion}
                    alCambiar={setPresion}
                    ejemplo="28 del / 32 tras"
                    bloqueado={enProceso}
                  />
                </Campo>
                <Campo etiqueta="Cadena y arrastre">
                  <Texto
                    valor={cadena}
                    alCambiar={setCadena}
                    ejemplo="428H - 120 L"
                    bloqueado={enProceso}
                  />
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Freno delantero">
                  <Eleccion
                    valor={frenoDelantero}
                    alCambiar={setFrenoDelantero}
                    bloqueado={enProceso}
                  />
                </Campo>
                <Campo etiqueta="Freno trasero">
                  <Eleccion valor={frenoTrasero} alCambiar={setFrenoTrasero} bloqueado={enProceso} />
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Campo etiqueta="Vence la revision tecnica">
                  <Fecha valor={rtv} alCambiar={setRtv} bloqueado={enProceso} />
                </Campo>
                <Campo etiqueta="Vence el marchamo y seguro">
                  <Fecha valor={seguro} alCambiar={setSeguro} bloqueado={enProceso} />
                </Campo>
              </div>

              <p className="rounded-2xl bg-fondo p-3 text-xs text-slate-500">
                De las dos fechas sale un aviso en el tablero 30 dias antes. Si las deja en blanco
                no se avisa nada.
              </p>

              <Campo etiqueta="Notas especiales">
                <Texto
                  valor={notas}
                  alCambiar={setNotas}
                  ejemplo="Baul grande, arranque electrico malo..."
                  bloqueado={enProceso}
                />
              </Campo>
            </div>
          )}

          {error ? (
            <p className="mt-5 rounded-2xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-borde p-6">
          <button
            type="button"
            className="boton-tactil border border-borde bg-panelClaro text-slate-300"
            onClick={alCerrar}
            disabled={enProceso}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="boton-tactil bg-entrada text-slate-950 disabled:opacity-40"
            disabled={!completo || enProceso}
          >
            {enProceso ? 'Guardando...' : editando ? 'Guardar' : 'Agregar'}
          </button>
        </div>

        {!completo && pestana === 'TECNICA' ? (
          <p className="px-6 pb-5 text-center text-xs text-aviso">
            Faltan datos generales: placa, marca, modelo y año.
          </p>
        ) : null}
      </form>
    </div>
  );
}

function Pestana({
  activa,
  onClick,
  etiqueta,
}: {
  activa: boolean;
  onClick: () => void;
  etiqueta: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`min-h-tactil flex-1 rounded-2xl border px-4 text-sm font-bold transition active:scale-[0.98] ${
        activa
          ? 'border-entrada bg-entrada/15 text-entrada'
          : 'border-borde bg-panelClaro text-slate-400'
      }`}
    >
      {etiqueta}
    </button>
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

function Texto({
  valor,
  alCambiar,
  ejemplo,
  bloqueado,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  ejemplo: string;
  bloqueado: boolean;
}) {
  return (
    <input
      type="text"
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      placeholder={ejemplo}
      disabled={bloqueado}
      className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
    />
  );
}

/** Disco o tambor, y la opcion de no saberlo todavia. */
function Eleccion({
  valor,
  alCambiar,
  bloqueado,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  bloqueado: boolean;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      disabled={bloqueado}
      className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
    >
      <option value="">Sin anotar</option>
      {TIPOS_DE_FRENO.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function Fecha({
  valor,
  alCambiar,
  bloqueado,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  bloqueado: boolean;
}) {
  return (
    <input
      type="date"
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      disabled={bloqueado}
      className="cifra h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
    />
  );
}

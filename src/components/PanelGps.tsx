'use client';

/**
 * Datos del rastreador y su evidencia.
 *
 * Lo que se vigila aqui no es que la moto TENGA un GPS, sino que alguien haya
 * comprobado hace poco que sigue conectado y con corriente. Un rastreador
 * desenchufado se ve igual que uno funcionando hasta el dia que se roban la
 * moto. Por eso cada foto que se sube mueve la fecha de revision.
 *
 * Las fotos las lleva PanelEvidencia, el mismo que usan la moto y los gastos.
 */

import { PanelEvidencia } from '@/components/PanelEvidencia';
import { TIPOS_DE_FOTO, type Evidencia } from '@/server/services/evidencia';

export interface DatosGpsFormulario {
  tieneGps: boolean;
  proveedor: string;
  identificador: string;
  correo: string;
  notas: string;
}

interface Props {
  /** La moto ya existe. Sin eso no se pueden adjuntar fotos. */
  placa: string | null;
  revisadoEn: Date | null;
  evidencia: Evidencia[];
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
  const cambiar = (parcial: Partial<DatosGpsFormulario>) =>
    alCambiar({ ...valores, ...parcial });

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
              <Texto
                valor={valores.proveedor}
                alCambiar={(v) => cambiar({ proveedor: v })}
                ejemplo="Nombre de la empresa"
                bloqueado={bloqueado}
              />
            </Campo>
            <Campo etiqueta="IMEI del equipo">
              <Texto
                valor={valores.identificador}
                alCambiar={(v) => cambiar({ identificador: v })}
                ejemplo="15 digitos"
                bloqueado={bloqueado}
                cifra
                modo="numeric"
              />
            </Campo>
          </div>

          <Campo etiqueta="Correo de la cuenta del equipo">
            <Texto
              valor={valores.correo}
              alCambiar={(v) => cambiar({ correo: v })}
              ejemplo="Con el que se entra a ver donde anda la moto"
              bloqueado={bloqueado}
              modo="email"
            />
          </Campo>

          <Campo etiqueta="Notas del equipo">
            <Texto
              valor={valores.notas}
              alCambiar={(v) => cambiar({ notas: v })}
              ejemplo="Va detras del faro, corriente del fusible de luces..."
              bloqueado={bloqueado}
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

          <PanelEvidencia
            entidadTipo="GPS"
            entidadId={placa}
            tipos={TIPOS_DE_FOTO.GPS}
            evidencia={evidencia}
            bloqueado={bloqueado}
            avisoSinRegistro="Guarde la moto primero. Despues podra adjuntarle las fotos del GPS."
          />
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

function Texto({
  valor,
  alCambiar,
  ejemplo,
  bloqueado,
  cifra = false,
  modo,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  ejemplo: string;
  bloqueado: boolean;
  cifra?: boolean;
  modo?: 'numeric' | 'email';
}) {
  return (
    <input
      type={modo === 'email' ? 'email' : 'text'}
      inputMode={modo === 'numeric' ? 'numeric' : undefined}
      autoCapitalize={modo === 'email' ? 'none' : undefined}
      value={valor}
      onChange={(e) => alCambiar(e.target.value)}
      placeholder={ejemplo}
      disabled={bloqueado}
      className={`h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada ${
        cifra ? 'cifra' : ''
      }`}
    />
  );
}

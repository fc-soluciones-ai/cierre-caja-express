/**
 * Dia operativo.
 *
 * Una pizzeria cierra despues de medianoche: un turno que empieza el martes a
 * las 18:00 y termina el miercoles a la 1:30 pertenece al martes. Si el
 * sistema usara la fecha del calendario, el ultimo tramo de cada noche caeria
 * en el dia siguiente y ningun cierre cuadraria.
 *
 * Por eso el dia operativo corre desde HORA_CORTE_DIA_OPERATIVO de un dia
 * hasta la misma hora del siguiente.
 */

const HORA_CORTE_POR_DEFECTO = '06:00';

function leerHoraCorte(): { hora: number; minuto: number } {
  const crudo = process.env.HORA_CORTE_DIA_OPERATIVO ?? HORA_CORTE_POR_DEFECTO;
  const m = /^(\d{1,2}):(\d{2})$/.exec(crudo.trim());
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(
      `HORA_CORTE_DIA_OPERATIVO debe tener formato HH:MM, se recibio "${crudo}".`,
    );
  }
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 23 || minuto > 59) {
    throw new Error(`HORA_CORTE_DIA_OPERATIVO fuera de rango: "${crudo}".`);
  }
  return { hora, minuto };
}

function aTextoFecha(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Dia operativo (yyyy-mm-dd) al que pertenece un instante.
 * Antes de la hora de corte, el instante todavia pertenece al dia anterior.
 */
export function diaOperativoDe(instante: Date = new Date()): string {
  const { hora, minuto } = leerHoraCorte();
  const ajustado = new Date(instante);
  const minutosDelDia = instante.getHours() * 60 + instante.getMinutes();
  if (minutosDelDia < hora * 60 + minuto) {
    ajustado.setDate(ajustado.getDate() - 1);
  }
  return aTextoFecha(ajustado);
}

/** Rango [desde, hasta) que cubre un dia operativo, para filtrar por timestamp. */
export function rangoDiaOperativo(dia: string): { desde: Date; hasta: Date } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    throw new Error(`Dia operativo invalido: "${dia}". Se espera yyyy-mm-dd.`);
  }
  const { hora, minuto } = leerHoraCorte();
  const desde = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hora, minuto, 0, 0);
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + 1);
  return { desde, hasta };
}

/** "09/09/2026 21:35" para tiquetes y pantalla. */
export function formatearFechaHora(fecha: Date): string {
  const d = String(fecha.getDate()).padStart(2, '0');
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const y = fecha.getFullYear();
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mm = String(fecha.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

/**
 * Derivacion y verificacion del PIN del cajero.
 *
 * Vive aparte de sesion.ts porque el seed y los scripts de mantenimiento
 * necesitan hashear un PIN sin arrastrar next/headers, que solo existe dentro
 * del servidor de Next.
 *
 * El PIN se guarda derivado con scrypt y se compara en tiempo constante. Un
 * PIN de cuatro digitos tiene poco espacio de busqueda, asi que lo que protege
 * la caja no es su fortaleza sino que este es un equipo de mostrador en red
 * local. Lo que aqui se evita es que alguien con acceso al archivo de la base
 * lea los PIN de todos y firme movimientos como otro cajero.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashearPin(pin: string): string {
  const sal = randomBytes(16);
  const derivada = scryptSync(pin, sal, 64);
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Reglas de un PIN aceptable
// ---------------------------------------------------------------------------

export const LARGO_MINIMO_PIN = 4;
export const LARGO_MAXIMO_PIN = 6;

/**
 * PIN que vienen de fabrica o que se adivinan en tres intentos.
 *
 * La lista es corta a proposito: no pretende ser un diccionario, sino frenar
 * los que alguien probaria parado frente a la caja mientras el cajero va al
 * bano. Contra un ataque serio lo que protege es que el equipo este en una red
 * local, no la fortaleza de cuatro digitos.
 */
const PIN_PROHIBIDOS = new Set([
  '1234', '12345', '123456',
  '0000', '00000', '000000',
  '1111', '11111', '111111',
  '4321', '54321', '654321',
  '1122', '2580', '1010', '1212', '2468', '1379',
]);

/**
 * Devuelve el motivo por el que un PIN no sirve, o null si es aceptable.
 * La usan el comando de cambio de PIN y cualquier pantalla que lo cambie.
 */
export function motivoPinInvalido(pin: string): string | null {
  if (!/^\d+$/.test(pin)) {
    return 'El PIN solo puede tener digitos.';
  }
  if (pin.length < LARGO_MINIMO_PIN || pin.length > LARGO_MAXIMO_PIN) {
    return `El PIN debe tener entre ${LARGO_MINIMO_PIN} y ${LARGO_MAXIMO_PIN} digitos.`;
  }
  if (PIN_PROHIBIDOS.has(pin)) {
    return 'Ese PIN es de los primeros que alguien probaria. Elija otro.';
  }
  if (new Set(pin).size === 1) {
    return 'Todos los digitos iguales es demasiado facil de adivinar.';
  }
  const consecutivo = (paso: number) =>
    [...pin].every((d, i) => i === 0 || Number(d) === Number(pin[i - 1]) + paso);
  if (consecutivo(1) || consecutivo(-1)) {
    return 'Los digitos consecutivos son de los primeros que alguien probaria.';
  }
  return null;
}

export function verificarPin(pin: string, almacenado: string): boolean {
  const [algoritmo, salHex, hashHex] = almacenado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const derivada = scryptSync(pin, Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(hashHex, 'hex');
  if (derivada.length !== esperado.length) return false;
  return timingSafeEqual(derivada, esperado);
}

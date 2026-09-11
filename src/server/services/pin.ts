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

export function verificarPin(pin: string, almacenado: string): boolean {
  const [algoritmo, salHex, hashHex] = almacenado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;
  const derivada = scryptSync(pin, Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(hashHex, 'hex');
  if (derivada.length !== esperado.length) return false;
  return timingSafeEqual(derivada, esperado);
}

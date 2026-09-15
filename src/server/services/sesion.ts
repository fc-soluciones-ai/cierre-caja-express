/**
 * Sesion del cajero.
 *
 * Todo movimiento de dinero queda firmado por quien lo hizo, asi que antes de
 * llegar al dashboard hay que decir quien esta en la caja. Es un PIN corto, no
 * una contrasena: se teclea decenas de veces por noche en una pantalla tactil.
 *
 * DOS DEFENSAS, PORQUE UN PIN DE CUATRO DIGITOS NO SE DEFIENDE SOLO
 *
 * 1. La cookie lleva un token aleatorio de 32 bytes, no el id del cajero. Con
 *    el id dentro de la cookie, cualquiera que pudiera escribirla entraria
 *    como quien quisiera. En la base se guarda el SHA-256 del token, asi que
 *    leer esa tabla tampoco da sesiones utilizables.
 *
 * 2. Los intentos fallidos se cuentan y bloquean. Diez mil combinaciones se
 *    prueban en segundos; lo que protege el PIN no es su largo sino que solo
 *    se pueda probar unas pocas veces por minuto. Mientras el sistema vivio
 *    en una red local esto daba igual; con una direccion publica, no.
 *
 * La derivacion del PIN vive en pin.ts.
 */

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { hashearPin, verificarPin } from '@/server/services/pin';

const COOKIE_SESION = 'caja_sesion';
const DURACION_SESION_SEGUNDOS = 60 * 60 * 16; // una jornada larga

/** Intentos seguidos antes de bloquear. */
const INTENTOS_ANTES_DE_BLOQUEO = 5;

/**
 * Cuanto dura el bloqueo, creciendo con la insistencia. Cinco minutos frenan
 * a quien se equivoco; media hora frenan a quien esta probando combinaciones.
 */
function minutosDeBloqueo(intentosFallidos: number): number {
  if (intentosFallidos >= 15) return 60;
  if (intentosFallidos >= 10) return 30;
  return 5;
}

function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Hash contra el que se compara cuando el cajero no existe.
 *
 * Sin esto, un id inexistente responderia al instante y uno real tardaria lo
 * que tarda scrypt. Esa diferencia le permite a alguien averiguar que ids son
 * validos antes de empezar a probar PIN.
 */
const HASH_SENUELO = hashearPin(randomBytes(8).toString('hex'));

export interface CajeroEnSesion {
  id: string;
  nombre: string;
  rol: string;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Comprueba el PIN y abre la sesion en la base, sin tocar la cookie.
 *
 * Esta separado de iniciarSesion porque cookies() solo existe dentro de una
 * peticion de Next: con la logica aqui, el bloqueo por intentos se puede
 * probar de verdad en la suite en vez de confiar en que funciona.
 */
export async function autenticar(
  cajeroId: string,
  pin: string,
  dispositivo?: string,
): Promise<{ cajero: CajeroEnSesion; token: string; expiraEn: Date }> {
  const cajero = await prisma.cajero.findUnique({ where: { id: cajeroId } });

  // El mismo mensaje para cajero inexistente y para PIN malo: decir cual de
  // los dos fallo le regala al atacante la mitad de la respuesta.
  const credencialInvalida = () =>
    new ErrorNegocio('DATOS_INVALIDOS', 'PIN incorrecto.');

  if (!cajero || cajero.estado !== 'ACTIVO') {
    // Se deriva contra un hash senuelo aunque el cajero no exista, para que
    // el tiempo de respuesta no delate cuales ids son reales.
    verificarPin(pin, HASH_SENUELO);
    throw credencialInvalida();
  }

  if (cajero.bloqueadoHasta && cajero.bloqueadoHasta > new Date()) {
    const minutos = Math.ceil((cajero.bloqueadoHasta.getTime() - Date.now()) / 60_000);
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      `Demasiados intentos fallidos. Espere ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
    );
  }

  if (!verificarPin(pin, cajero.pin)) {
    const intentos = cajero.intentosFallidos + 1;
    const bloquear = intentos >= INTENTOS_ANTES_DE_BLOQUEO;
    const bloqueadoHasta = bloquear
      ? new Date(Date.now() + minutosDeBloqueo(intentos) * 60_000)
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.cajero.update({
        where: { id: cajero.id },
        data: { intentosFallidos: intentos, bloqueadoHasta },
      });
      await registrarEvento(tx, {
        tipo: bloquear ? 'CAJERO_BLOQUEADO' : 'LOGIN_FALLIDO',
        cajeroId: cajero.id,
        entidadTipo: 'Cajero',
        entidadId: cajero.id,
        dispositivo,
        detalle: { intentosSeguidos: intentos },
      });
    });

    if (bloquear) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `Demasiados intentos fallidos. Espere ${minutosDeBloqueo(intentos)} minutos.`,
      );
    }
    throw credencialInvalida();
  }

  // --- PIN correcto ---
  const token = randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + DURACION_SESION_SEGUNDOS * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.cajero.update({
      where: { id: cajero.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null },
    });
    await tx.sesion.create({
      data: {
        tokenHash: hashearToken(token),
        cajeroId: cajero.id,
        expiraEn,
        dispositivo: dispositivo ?? null,
      },
    });
    // Sesiones ya vencidas del mismo cajero: se limpian de paso, sin tarea
    // programada que mantener.
    await tx.sesion.deleteMany({
      where: { cajeroId: cajero.id, expiraEn: { lt: new Date() } },
    });
    await registrarEvento(tx, {
      tipo: 'LOGIN',
      cajeroId: cajero.id,
      entidadTipo: 'Cajero',
      entidadId: cajero.id,
      dispositivo,
    });
  });

  return {
    cajero: { id: cajero.id, nombre: cajero.nombre, rol: cajero.rol },
    token,
    expiraEn,
  };
}

/** Autentica y deja la cookie puesta. Es lo que llama la pantalla de entrada. */
export async function iniciarSesion(
  cajeroId: string,
  pin: string,
  dispositivo?: string,
): Promise<CajeroEnSesion> {
  const { cajero, token } = await autenticar(cajeroId, pin, dispositivo);

  cookies().set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_SEGUNDOS,
    secure: process.env.NODE_ENV === 'production',
  });

  return cajero;
}

/**
 * Entrada del repartidor a su propia pantalla.
 *
 * Mismo bloqueo por intentos y mismo mensaje unico que la caja: decir si
 * fallo el PIN o el repartidor le regalaria a alguien la mitad de la
 * respuesta.
 *
 * Un repartidor sin PIN no entra. Es el estado de todos hasta que el
 * administrador le da acceso con "npm run pin:repartidor".
 */
export async function autenticarRepartidor(
  choferId: string,
  pin: string,
  dispositivo?: string,
): Promise<{ repartidor: RepartidorEnSesion; token: string; expiraEn: Date }> {
  const chofer = await prisma.chofer.findUnique({ where: { id: choferId } });

  const credencialInvalida = () => new ErrorNegocio('DATOS_INVALIDOS', 'PIN incorrecto.');

  if (!chofer || chofer.estado !== 'ACTIVO' || !chofer.pin) {
    // Se deriva contra el senuelo aunque no exista, para que el tiempo de
    // respuesta no delate cuales repartidores tienen acceso.
    verificarPin(pin, HASH_SENUELO);
    throw credencialInvalida();
  }

  if (chofer.bloqueadoHasta && chofer.bloqueadoHasta > new Date()) {
    const minutos = Math.ceil((chofer.bloqueadoHasta.getTime() - Date.now()) / 60_000);
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      `Demasiados intentos fallidos. Espere ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
    );
  }

  if (!verificarPin(pin, chofer.pin)) {
    const intentos = chofer.intentosFallidos + 1;
    const bloquear = intentos >= INTENTOS_ANTES_DE_BLOQUEO;
    const bloqueadoHasta = bloquear
      ? new Date(Date.now() + minutosDeBloqueo(intentos) * 60_000)
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.chofer.update({
        where: { id: chofer.id },
        data: { intentosFallidos: intentos, bloqueadoHasta },
      });
      await registrarEvento(tx, {
        tipo: 'LOGIN_FALLIDO',
        choferId: chofer.id,
        entidadTipo: 'Chofer',
        entidadId: chofer.id,
        dispositivo,
        detalle: { quien: 'REPARTIDOR', intentosSeguidos: intentos },
      });
    });

    if (bloquear) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `Demasiados intentos fallidos. Espere ${minutosDeBloqueo(intentos)} minutos.`,
      );
    }
    throw credencialInvalida();
  }

  const token = randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + DURACION_SESION_SEGUNDOS * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.chofer.update({
      where: { id: chofer.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null },
    });
    await tx.sesion.create({
      data: { tokenHash: hashearToken(token), choferId: chofer.id, expiraEn, dispositivo },
    });
    await registrarEvento(tx, {
      tipo: 'LOGIN',
      choferId: chofer.id,
      entidadTipo: 'Chofer',
      entidadId: chofer.id,
      dispositivo,
      detalle: { quien: 'REPARTIDOR' },
    });
  });

  return {
    repartidor: {
      id: chofer.id,
      nombre: chofer.nombre,
      codigo: chofer.idMeseroSoftRestaurant,
    },
    token,
    expiraEn,
  };
}

/** Abre la sesion del repartidor y deja la cookie. */
export async function iniciarSesionRepartidor(
  choferId: string,
  pin: string,
  dispositivo?: string,
): Promise<RepartidorEnSesion> {
  const { repartidor, token } = await autenticarRepartidor(choferId, pin, dispositivo);

  cookies().set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_SEGUNDOS,
    secure: process.env.NODE_ENV === 'production',
  });

  return repartidor;
}

/** Repartidores que ya tienen PIN, para la pantalla de entrada. */
export async function repartidoresConAcceso(): Promise<
  Array<{ id: string; nombre: string }>
> {
  return prisma.chofer.findMany({
    where: { estado: 'ACTIVO', pin: { not: null } },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Salida y lectura
// ---------------------------------------------------------------------------

export async function cerrarSesion(): Promise<void> {
  const token = cookies().get(COOKIE_SESION)?.value;
  cookies().delete(COOKIE_SESION);
  if (!token) return;
  // La sesion se borra del servidor, no solo del navegador: si alguien copio
  // la cookie, borrarla del navegador no le quitaria nada.
  await prisma.sesion.deleteMany({ where: { tokenHash: hashearToken(token) } }).catch(() => undefined);
}

/** Cajero de la sesion actual, o null si nadie abrio la caja. */
export async function cajeroDeSesion(): Promise<CajeroEnSesion | null> {
  return cajeroPorToken(cookies().get(COOKIE_SESION)?.value);
}

/**
 * Resuelve un token a su cajero. Separado de la cookie para poder probarlo.
 *
 * Una sesion de REPARTIDOR devuelve null aqui, a proposito. Todas las
 * pantallas de caja preguntan por esta funcion, asi que con eso solo, el
 * token de un repartidor no abre ninguna de ellas. La puerta se cierra en un
 * lugar y no en veinte.
 */
export async function cajeroPorToken(
  token: string | undefined,
): Promise<CajeroEnSesion | null> {
  const sesion = await sesionPorToken(token);
  if (!sesion?.cajero || sesion.cajero.estado !== 'ACTIVO') return null;

  return { id: sesion.cajero.id, nombre: sesion.cajero.nombre, rol: sesion.cajero.rol };
}

export interface RepartidorEnSesion {
  id: string;
  nombre: string;
  codigo: string;
}

/** Repartidor de la sesion actual, o null si quien entro no es uno. */
export async function repartidorDeSesion(): Promise<RepartidorEnSesion | null> {
  return repartidorPorToken(cookies().get(COOKIE_SESION)?.value);
}

export async function repartidorPorToken(
  token: string | undefined,
): Promise<RepartidorEnSesion | null> {
  const sesion = await sesionPorToken(token);
  if (!sesion?.chofer || sesion.chofer.estado !== 'ACTIVO') return null;

  return {
    id: sesion.chofer.id,
    nombre: sesion.chofer.nombre,
    codigo: sesion.chofer.idMeseroSoftRestaurant,
  };
}

/** Igual que repartidorDeSesion pero falla si no hay nadie. */
export async function exigirRepartidor(): Promise<RepartidorEnSesion> {
  const repartidor = await repartidorDeSesion();
  if (!repartidor) {
    throw new ErrorNegocio(
      'CHOFER_NO_ENCONTRADO',
      'La sesion expiro. Vuelva a entrar con su PIN.',
    );
  }
  return repartidor;
}

/**
 * La sesion cruda, con su dueno sea quien sea.
 *
 * Aqui viven la caducidad y la marca de uso, una sola vez para los dos tipos
 * de usuario.
 */
async function sesionPorToken(token: string | undefined) {
  if (!token || token.length !== 64) return null;

  const sesion = await prisma.sesion.findUnique({
    where: { tokenHash: hashearToken(token) },
    include: {
      cajero: { select: { id: true, nombre: true, rol: true, estado: true } },
      chofer: {
        select: { id: true, nombre: true, idMeseroSoftRestaurant: true, estado: true },
      },
    },
  });

  if (!sesion || sesion.expiraEn < new Date()) return null;

  // Marca de uso, para poder ver sesiones olvidadas en un equipo del local.
  // Solo se escribe si paso un rato, para no golpear la base en cada pantalla.
  if (Date.now() - sesion.ultimoUso.getTime() > 5 * 60_000) {
    await prisma.sesion
      .update({ where: { id: sesion.id }, data: { ultimoUso: new Date() } })
      .catch(() => undefined);
  }

  return sesion;
}

/** Igual que cajeroDeSesion pero falla si no hay nadie. Para las acciones. */
export async function exigirCajero(): Promise<CajeroEnSesion> {
  const cajero = await cajeroDeSesion();
  if (!cajero) {
    throw new ErrorNegocio(
      'CAJERO_NO_ENCONTRADO',
      'La sesion de caja expiro. Vuelva a entrar con su PIN.',
    );
  }
  return cajero;
}

/** Cajeros disponibles para la pantalla de entrada. */
export async function cajerosActivos(): Promise<Array<{ id: string; nombre: string }>> {
  return prisma.cajero.findMany({
    where: { estado: 'ACTIVO' },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
}

/** Cierra todas las sesiones de un cajero. Para cuando se pierde un equipo. */
export async function revocarSesionesDe(cajeroId: string): Promise<number> {
  const { count } = await prisma.sesion.deleteMany({ where: { cajeroId } });
  return count;
}

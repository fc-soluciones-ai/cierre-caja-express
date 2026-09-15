/**
 * Prueba de la entrada a la caja.
 *
 * Es lo unico que separa a cualquiera de los movimientos de dinero del
 * negocio, asi que se comprueba sola: el bloqueo por intentos, que el token
 * no sea adivinable, que caduque, y que cerrar sesion la mate en el servidor
 * y no solo en el navegador.
 *
 * Ejecutar con: npm run test:sesion
 */

import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { esErrorNegocio } from '@/server/errores';
import { hashearPin } from '@/server/services/pin';
import {
  autenticar,
  cajeroPorToken,
  revocarSesionesDe,
} from '@/server/services/sesion';
import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(descripcion: string, real: unknown, esperado: unknown): void {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${descripcion}`);
  if (!ok) {
    console.log(`      esperado: ${JSON.stringify(esperado)}`);
    console.log(`      obtenido: ${JSON.stringify(real)}`);
  }
}

async function intentar(cajeroId: string, pin: string): Promise<string> {
  try {
    await autenticar(cajeroId, pin, 'PRUEBA');
    return 'OK';
  } catch (e) {
    return esErrorNegocio(e) ? e.message : `ERROR_INESPERADO: ${String(e)}`;
  }
}

async function main(): Promise<void> {
  exigirBaseDePruebas();

  await prisma.evidencia.deleteMany();
  await prisma.registroMantenimiento.deleteMany();
  await prisma.asignacionMoto.deleteMany();
  await prisma.motocicleta.deleteMany();
  await prisma.sesion.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();

  const PIN = '7392';
  const cajero = await prisma.cajero.create({
    data: { nombre: 'Cajero de prueba', pin: hashearPin(PIN), rol: 'ADMIN' },
  });

  // -------------------------------------------------------------------------
  console.log('--- Entrada correcta ---');
  const sesion = await autenticar(cajero.id, PIN, 'PRUEBA');
  comprobar('devuelve el cajero', sesion.cajero.nombre, 'Cajero de prueba');
  comprobar('el token mide 64 caracteres hex', /^[0-9a-f]{64}$/.test(sesion.token), true);
  comprobar('la sesion caduca en el futuro', sesion.expiraEn > new Date(), true);

  const enBase = await prisma.sesion.findFirst();
  comprobar(
    'en la base se guarda el hash, no el token',
    enBase?.tokenHash === sesion.token,
    false,
  );
  comprobar(
    'y ese hash es el SHA-256 del token',
    enBase?.tokenHash,
    createHash('sha256').update(sesion.token).digest('hex'),
  );

  comprobar(
    'el token resuelve al cajero',
    (await cajeroPorToken(sesion.token))?.id,
    cajero.id,
  );
  comprobar('un token inventado no resuelve', await cajeroPorToken('a'.repeat(64)), null);
  comprobar('un token corto no resuelve', await cajeroPorToken('abc'), null);
  comprobar('sin token no resuelve', await cajeroPorToken(undefined), null);

  // -------------------------------------------------------------------------
  console.log('\n--- Bloqueo por intentos ---');
  for (let i = 1; i <= 4; i += 1) {
    const mensaje = await intentar(cajero.id, '0000');
    comprobar(`intento fallido ${i} solo dice PIN incorrecto`, mensaje, 'PIN incorrecto.');
  }

  const quinto = await intentar(cajero.id, '0000');
  comprobar('al quinto bloquea', quinto.startsWith('Demasiados intentos'), true);
  comprobar(
    'y el PIN correcto tampoco entra mientras dure el bloqueo',
    (await intentar(cajero.id, PIN)).startsWith('Demasiados intentos'),
    true,
  );

  const bloqueado = await prisma.cajero.findUnique({ where: { id: cajero.id } });
  comprobar('queda registrado el bloqueo', bloqueado!.bloqueadoHasta !== null, true);
  comprobar('con los intentos contados', bloqueado!.intentosFallidos, 5);

  const eventos = await prisma.eventoAuditoria.groupBy({ by: ['tipo'], _count: true });
  const porTipo = Object.fromEntries(eventos.map((e) => [e.tipo, e._count]));
  comprobar('los fallos quedan en la bitacora', porTipo['LOGIN_FALLIDO'], 4);
  comprobar('y el bloqueo tambien', porTipo['CAJERO_BLOQUEADO'], 1);

  // Se levanta el bloqueo como lo haria el paso del tiempo.
  await prisma.cajero.update({
    where: { id: cajero.id },
    data: { bloqueadoHasta: new Date(Date.now() - 1000) },
  });
  const trasEspera = await autenticar(cajero.id, PIN, 'PRUEBA');
  comprobar('pasado el bloqueo se puede entrar', trasEspera.cajero.id, cajero.id);
  comprobar(
    'y el contador se reinicia',
    (await prisma.cajero.findUnique({ where: { id: cajero.id } }))!.intentosFallidos,
    0,
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Caducidad y revocacion ---');
  const vencida = await autenticar(cajero.id, PIN, 'PRUEBA');
  await prisma.sesion.updateMany({
    where: { tokenHash: createHash('sha256').update(vencida.token).digest('hex') },
    data: { expiraEn: new Date(Date.now() - 1000) },
  });
  comprobar('una sesion vencida no resuelve', await cajeroPorToken(vencida.token), null);

  const viva = await autenticar(cajero.id, PIN, 'PRUEBA');
  comprobar('la sesion nueva si resuelve', (await cajeroPorToken(viva.token))?.id, cajero.id);
  await revocarSesionesDe(cajero.id);
  comprobar('tras revocar, ninguna resuelve', await cajeroPorToken(viva.token), null);

  // -------------------------------------------------------------------------
  console.log('\n--- Cajero inactivo ---');
  const otra = await autenticar(cajero.id, PIN, 'PRUEBA');
  await prisma.cajero.update({ where: { id: cajero.id }, data: { estado: 'INACTIVO' } });
  comprobar('un cajero dado de baja pierde la sesion', await cajeroPorToken(otra.token), null);
  comprobar(
    'y no puede volver a entrar',
    await intentar(cajero.id, PIN),
    'PIN incorrecto.',
  );

  await prisma.sesion.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.cajero.deleteMany();

  console.log(
    fallos === 0
      ? '\nTodas las comprobaciones pasaron.\n'
      : `\n${fallos} comprobacion(es) fallaron.\n`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

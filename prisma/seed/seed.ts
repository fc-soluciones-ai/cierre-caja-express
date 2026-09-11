/**
 * Datos iniciales para poder operar la aplicacion desde el primer arranque.
 * Es idempotente: correrlo dos veces no duplica nada.
 *
 * Los repartidores salen del padron real del negocio (repartidores.ts), no de
 * nombres inventados. Un seed con datos de ejemplo termina copiado a la caja
 * de verdad con demasiada frecuencia, y despues aparecen "Antonio Rojas" y
 * companeros en el dashboard de un local donde nadie se llama asi.
 *
 * El PIN se guarda hasheado con scrypt, nunca en claro.
 */

import { randomInt } from 'node:crypto';

import { prisma } from '../../src/lib/db/prisma';
import { normalizarNombre } from '../../src/lib/excel/columnas';
import { hashearPin } from '../../src/server/services/pin';
import { REPARTIDORES } from './repartidores';

/**
 * PIN inicial del administrador.
 *
 * Si no se indica uno, se genera al azar y se imprime UNA vez. Un valor fijo
 * escrito en el codigo deja de ser secreto en cuanto el repositorio se publica,
 * y la caja se queda con el de fabrica porque nadie se acuerda de cambiarlo.
 *
 * Se cambia despues con: npm run pin
 */
const PIN_INICIAL =
  process.env.PIN_CAJERO_INICIAL ?? String(randomInt(100_000, 1_000_000));

async function main(): Promise<void> {
  // El PIN solo se genera y se anuncia si el administrador no existia. Si ya
  // estaba, su PIN es el que alguien puso y el seed no lo toca ni lo conoce:
  // imprimir uno nuevo aqui haria creer al operador que ese es el que sirve.
  const existente = await prisma.cajero.findUnique({ where: { id: 'cajero-admin' } });
  const esNuevo = existente === null;

  const admin =
    existente ??
    (await prisma.cajero.create({
      data: {
        id: 'cajero-admin',
        nombre: 'Administrador',
        rol: 'ADMIN',
        pin: hashearPin(PIN_INICIAL),
      },
    }));
  console.log(`Cajero administrador listo: ${admin.nombre}`);

  for (const repartidor of REPARTIDORES) {
    await prisma.chofer.upsert({
      where: { idMeseroSoftRestaurant: repartidor.idMesero },
      // No se pisa lo que exista: si alguien corrigio un nombre o dio de baja
      // a un repartidor desde la pantalla, el seed no debe deshacerlo.
      update: {},
      create: {
        idMeseroSoftRestaurant: repartidor.idMesero,
        nombre: repartidor.nombre,
        nombreNormalizado: normalizarNombre(repartidor.nombre),
      },
    });
  }
  console.log(`${REPARTIDORES.length} repartidores del padron listos.`);

  if (esNuevo) {
    console.log(`\nPIN inicial del administrador: ${PIN_INICIAL}`);
    console.log('Anotelo: no se vuelve a mostrar. Cambielo con: npm run pin');
  } else {
    console.log('\nEl administrador ya existia; su PIN no se toco.');
    console.log('Para cambiarlo: npm run pin');
  }
  console.log(
    'Para sincronizar cambios del padron mas adelante: npm run db:repartidores -- --aplicar',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

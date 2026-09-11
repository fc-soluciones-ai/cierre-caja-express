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

import { prisma } from '../../src/lib/db/prisma';
import { normalizarNombre } from '../../src/lib/excel/columnas';
import { hashearPin } from '../../src/server/services/pin';
import { REPARTIDORES } from './repartidores';

const PIN_INICIAL = process.env.PIN_CAJERO_INICIAL ?? '1234';

async function main(): Promise<void> {
  const admin = await prisma.cajero.upsert({
    where: { id: 'cajero-admin' },
    update: {},
    create: {
      id: 'cajero-admin',
      nombre: 'Administrador',
      rol: 'ADMIN',
      pin: hashearPin(PIN_INICIAL),
    },
  });
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
  console.log(
    `\nPIN inicial del administrador: ${PIN_INICIAL} — cambielo antes de usar el sistema en caja.`,
  );
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

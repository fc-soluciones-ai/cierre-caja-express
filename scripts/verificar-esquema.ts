/**
 * Comprobacion de las garantias que el esquema debe dar por si mismo.
 * Escribe y borra datos de prueba en la base apuntada por DATABASE_URL.
 * Ejecutar con: npm run test:esquema
 */

import { prisma } from '@/lib/db/prisma';

async function main(): Promise<void> {
  const tablas = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name",
  );
  console.log('Tablas creadas:', tablas.map((t) => t.name).join(', '));

  const cajero = await prisma.cajero.create({
    data: { nombre: 'Caja de prueba', pin: 'hash-de-prueba' },
  });
  const chofer = await prisma.chofer.create({
    data: {
      idMeseroSoftRestaurant: `PRUEBA-${Date.now()}`,
      nombre: 'Antonio Rojas',
      nombreNormalizado: 'ANTONIO ROJAS',
    },
  });

  const turno1 = await prisma.turnoChofer.create({
    data: { choferId: chofer.id, candadoTurnoAbierto: chofer.id },
  });

  let bloqueado = false;
  try {
    await prisma.turnoChofer.create({
      data: { choferId: chofer.id, candadoTurnoAbierto: chofer.id },
    });
  } catch {
    bloqueado = true;
  }
  console.log('Segundo turno abierto rechazado por la base:', bloqueado);

  await prisma.turnoChofer.update({
    where: { id: turno1.id },
    data: { estado: 'CERRADO', fechaCierre: new Date(), candadoTurnoAbierto: null },
  });
  const turno2 = await prisma.turnoChofer.create({
    data: { choferId: chofer.id, candadoTurnoAbierto: chofer.id },
  });
  console.log('Tras cerrar, se puede abrir otro turno:', turno2.id.length > 0);

  await prisma.abonoEfectivo.createMany({
    data: [
      { turnoChoferId: turno2.id, montoAbonado: 1_500_000, cajeroId: cajero.id, dispositivo: 'CAJA-1' },
      { turnoChoferId: turno2.id, montoAbonado: 800_000, cajeroId: cajero.id, dispositivo: 'CAJA-1' },
    ],
  });
  const suma = await prisma.abonoEfectivo.aggregate({
    where: { turnoChoferId: turno2.id },
    _sum: { montoAbonado: true },
  });
  console.log('Saldo de abonos derivado (centimos):', suma._sum.montoAbonado);

  // Limpieza
  await prisma.abonoEfectivo.deleteMany({ where: { cajeroId: cajero.id } });
  await prisma.turnoChofer.deleteMany({ where: { choferId: chofer.id } });
  await prisma.chofer.delete({ where: { id: chofer.id } });
  await prisma.cajero.delete({ where: { id: cajero.id } });
  console.log('Datos de prueba eliminados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

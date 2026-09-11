/**
 * Llena la base de PRUEBAS con una flota de ejemplo para poder recorrer las
 * pantallas sin tocar la base del negocio.
 *
 *   npm run demo:flota
 *
 * Deja motos en los tres estados y con servicios en distinto grado de
 * vencimiento, para poder ver el semaforo en verde, amarillo y rojo.
 */

import { createHash, randomBytes } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { exigirBaseDePruebas } from './guarda-pruebas';
import { hashearPin } from '@/server/services/pin';
import { registrarMantenimiento } from '@/server/services/mantenimiento';
import { asignarMoto, cambiarEstadoMoto, crearMoto } from '@/server/services/motos';

const PIN_DEMO = '1111';

async function main(): Promise<void> {
  exigirBaseDePruebas();

  await prisma.registroMantenimiento.deleteMany();
  await prisma.asignacionMoto.deleteMany();
  await prisma.motocicleta.deleteMany();
  await prisma.sesion.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();

  const cajero = await prisma.cajero.create({
    data: { nombre: 'Demostracion', pin: hashearPin(PIN_DEMO), rol: 'ADMIN' },
  });

  const padron: Array<[string, string]> = [
    ['10', 'DAVID-R'],
    ['12', 'PINITO-R'],
    ['13', 'YEISON -R'],
    ['16', 'FERNANDO-R'],
  ];
  const choferes = await Promise.all(
    padron.map(([idMeseroSoftRestaurant, nombre]) =>
      prisma.chofer.create({
        data: { idMeseroSoftRestaurant, nombre, nombreNormalizado: nombre.toUpperCase() },
      }),
    ),
  );
  const [david, pinito, yeison] = choferes;
  if (!david || !pinito || !yeison) throw new Error('No se crearon los repartidores.');

  await crearMoto(
    { placa: 'MOT-100', marca: 'Honda', modelo: 'CB125', anio: 2022, kilometrajeActual: 17_800 },
    cajero.id,
  );
  await crearMoto(
    { placa: 'MOT-200', marca: 'Bajaj', modelo: 'Boxer', anio: 2021, kilometrajeActual: 37_000 },
    cajero.id,
  );
  await crearMoto(
    { placa: 'MOT-300', marca: 'Suzuki', modelo: 'GN125', anio: 2020, kilometrajeActual: 63_200 },
    cajero.id,
  );
  await crearMoto(
    {
      placa: 'MOT-999',
      marca: 'Yamaha',
      modelo: 'YBR',
      anio: 2023,
      kilometrajeActual: 5_000,
      esComodin: true,
      notas: 'Comodin de la flota',
    },
    cajero.id,
  );

  await asignarMoto('MOT100', david.id, cajero.id, 'Demostracion');
  await asignarMoto('MOT200', pinito.id, cajero.id, 'Demostracion');
  await asignarMoto('MOT300', yeison.id, cajero.id, 'Demostracion');

  // Verde: recien servida.
  await registrarMantenimiento(
    {
      placa: 'MOT100',
      tipo: 'PREVENTIVO',
      categoria: 'CAMBIO_ACEITE',
      descripcion: 'Aceite y filtro',
      costoTotal: 1_200_000,
      kilometrajeEvento: 17_800,
      tallerOProveedor: 'Taller El Rayo',
      cajeroId: cajero.id,
    },
  );
  await registrarMantenimiento(
    {
      placa: 'MOT100',
      tipo: 'CORRECTIVO',
      categoria: 'FRENOS',
      costoTotal: 2_500_000,
      kilometrajeEvento: 17_900,
      tallerOProveedor: 'Taller El Rayo',
      cajeroId: cajero.id,
    },
  );
  await registrarMantenimiento(
    {
      placa: 'MOT100',
      tipo: 'PREVENTIVO',
      categoria: 'LLANTAS',
      costoTotal: 4_800_000,
      kilometrajeEvento: 18_000,
      cajeroId: cajero.id,
    },
  );

  // Amarillo: el aceite esta por vencer (quedan menos del 15 %).
  await registrarMantenimiento(
    {
      placa: 'MOT200',
      tipo: 'PREVENTIVO',
      categoria: 'LLANTAS',
      costoTotal: 4_500_000,
      kilometrajeEvento: 37_000,
      cajeroId: cajero.id,
    },
  );
  await registrarMantenimiento(
    {
      placa: 'MOT200',
      tipo: 'PREVENTIVO',
      categoria: 'FRENOS',
      costoTotal: 2_200_000,
      kilometrajeEvento: 38_000,
      cajeroId: cajero.id,
    },
  );
  await registrarMantenimiento(
    {
      placa: 'MOT200',
      tipo: 'PREVENTIVO',
      categoria: 'CAMBIO_ACEITE',
      costoTotal: 1_100_000,
      kilometrajeEvento: 40_100,
      cajeroId: cajero.id,
    },
  );

  // Gasolina de todos los dias, para que el costo por km tenga de donde salir.
  for (const [placa, km, monto] of [
    ['MOT100', 18_050, 500_000],
    ['MOT100', 18_260, 520_000],
    ['MOT200', 41_600, 480_000],
    ['MOT200', 41_810, 510_000],
    ['MOT300', 63_300, 495_000],
  ] as Array<[string, number, number]>) {
    await registrarMantenimiento(
      {
        placa,
        tipo: 'PREVENTIVO',
        categoria: 'GASOLINA',
        costoTotal: monto,
        kilometrajeEvento: km,
        cajeroId: cajero.id,
      },
    );
  }

  // Rojo: al taller, y la comodin sale a suplirla.
  await cambiarEstadoMoto('MOT300', 'EN_MANTENIMIENTO', cajero.id, 'Cadena rota');

  // Sesion lista, para entrar sin teclear el PIN si hace falta.
  const token = randomBytes(32).toString('hex');
  await prisma.sesion.create({
    data: {
      cajeroId: cajero.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiraEn: new Date(Date.now() + 8 * 60 * 60 * 1000),
      dispositivo: 'DEMOSTRACION',
    },
  });

  console.log('\nFlota de demostracion lista.');
  console.log(`  Cajero: Demostracion   PIN: ${PIN_DEMO}`);
  console.log(`  Token de sesion: ${token}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

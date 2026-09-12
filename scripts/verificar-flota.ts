/**
 * Prueba del modulo de flota.
 *
 * El grueso son los casos raros del comodin, que es donde el requerimiento
 * original no decia que hacer: dos motos averiadas a la vez, la vuelta del
 * taller, y la propia comodin averiada.
 *
 * Ejecutar con: npm run test:flota
 */

import { prisma } from '@/lib/db/prisma';
import { esErrorNegocio } from '@/server/errores';
import {
  alertasDeFlota,
  registrarMantenimiento,
  resumenDeFlota,
} from '@/server/services/mantenimiento';
import {
  asignarMoto,
  cambiarEstadoMoto,
  crearMoto,
  editarMoto,
  listarFlota,
  normalizarPlaca,
  obtenerMoto,
} from '@/server/services/motos';
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

async function limpiar(): Promise<void> {
  await prisma.registroMantenimiento.deleteMany();
  await prisma.asignacionMoto.deleteMany();
  await prisma.motocicleta.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.cajero.deleteMany();
}

/** Quien trae cada moto ahora mismo, para comprobar de un vistazo. */
async function fotoDeFlota(): Promise<Record<string, string>> {
  const flota = await listarFlota();
  return Object.fromEntries(flota.map((m) => [m.placa, m.choferNombre ?? '(libre)']));
}

async function main(): Promise<void> {
  exigirBaseDePruebas();

  await limpiar();

  const cajero = await prisma.cajero.create({
    data: { nombre: 'Karla (Caja 1)', pin: 'hash', rol: 'ADMIN' },
  });
  const crearChofer = (nombre: string, id: string) =>
    prisma.chofer.create({
      data: { idMeseroSoftRestaurant: id, nombre, nombreNormalizado: nombre.toUpperCase() },
    });

  const david = await crearChofer('DAVID-R', '10');
  const pinito = await crearChofer('PINITO-R', '12');
  const nestor = await crearChofer('NESTOR', '35');

  // -------------------------------------------------------------------------
  console.log('--- Alta de motos ---');
  comprobar('la placa se normaliza', normalizarPlaca(' mot-123 b '), 'MOT123B');

  await crearMoto(
    { placa: 'mot-100', marca: 'Honda', modelo: 'CB125', anio: 2022, kilometrajeActual: 18_000 },
    cajero.id,
  );
  await crearMoto(
    { placa: 'MOT 200', marca: 'Bajaj', modelo: 'Boxer', anio: 2021, kilometrajeActual: 41_500 },
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
    },
    cajero.id,
  );

  comprobar('quedaron 3 motos', (await listarFlota()).length, 3);
  comprobar('la placa se guardo normalizada', (await obtenerMoto('mot 100')).placa, 'MOT100');

  let placaRepetida = '';
  try {
    await crearMoto(
      { placa: 'MOT100', marca: 'X', modelo: 'Y', anio: 2020, kilometrajeActual: 0 },
      cajero.id,
    );
  } catch (e) {
    placaRepetida = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('no se repite una placa', placaRepetida, 'DATOS_INVALIDOS');

  let dosComodines = '';
  try {
    await crearMoto(
      {
        placa: 'MOT888',
        marca: 'X',
        modelo: 'Y',
        anio: 2020,
        kilometrajeActual: 0,
        esComodin: true,
      },
      cajero.id,
    );
  } catch (e) {
    dosComodines = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('no se permiten dos comodines', dosComodines, 'DATOS_INVALIDOS');

  // -------------------------------------------------------------------------
  console.log('\n--- Asignacion ---');
  await asignarMoto('MOT100', david.id, cajero.id);
  await asignarMoto('MOT200', pinito.id, cajero.id);
  comprobar('cada quien con la suya', await fotoDeFlota(), {
    MOT100: 'DAVID-R',
    MOT200: 'PINITO-R',
    MOT999: '(libre)',
  });

  // Reasignar la moto de otro debe dejar a ese otro sin moto, no duplicarla.
  const robo = await asignarMoto('MOT200', nestor.id, cajero.id, 'Prueba de traspaso');
  comprobar('el chofer anterior queda desplazado', robo.choferDesplazado, 'PINITO-R');
  comprobar('y la moto pasa al nuevo', (await obtenerMoto('MOT200')).choferNombre, 'NESTOR');
  await asignarMoto('MOT200', pinito.id, cajero.id, 'Se devuelve');

  // -------------------------------------------------------------------------
  console.log('\n--- El comodin entra al taller ---');
  const averia = await cambiarEstadoMoto('MOT100', 'EN_MANTENIMIENTO', cajero.id, 'Cadena rota');
  comprobar('la moto queda en mantenimiento', averia.estado, 'EN_MANTENIMIENTO');
  comprobar('el chofer afectado es DAVID-R', averia.choferAfectado, 'DAVID-R');
  comprobar('se le presta la comodin', averia.comodinAsignada, 'MOT999');
  comprobar('sin advertencias', averia.advertencia, null);
  comprobar('la flota queda asi', await fotoDeFlota(), {
    MOT100: '(libre)',
    MOT200: 'PINITO-R',
    MOT999: 'DAVID-R',
  });
  comprobar(
    'y la asignacion queda marcada como comodin',
    (await obtenerMoto('MOT999')).tipoAsignacion,
    'COMODIN',
  );

  // -------------------------------------------------------------------------
  console.log('\n--- Segunda averia con el comodin ya prestado ---');
  const segunda = await cambiarEstadoMoto('MOT200', 'EN_MANTENIMIENTO', cajero.id, 'Frenos');
  comprobar('el cambio de estado no se bloquea', segunda.estado, 'EN_MANTENIMIENTO');
  comprobar('no hay comodin que dar', segunda.comodinAsignada, null);
  comprobar(
    'y el sistema lo dice en vez de callarlo',
    segunda.advertencia?.includes('PINITO-R') && segunda.advertencia?.includes('sin moto'),
    true,
  );
  comprobar('PINITO-R queda sin moto', (await fotoDeFlota())['MOT200'], '(libre)');

  // -------------------------------------------------------------------------
  console.log('\n--- Vuelta del taller ---');
  const vuelta = await cambiarEstadoMoto('MOT100', 'OPERATIVA', cajero.id, 'Cadena cambiada');
  comprobar('se le devuelve su moto a DAVID-R', vuelta.motoDevuelta, 'MOT100');
  comprobar('y el comodin queda libre otra vez', await fotoDeFlota(), {
    MOT100: 'DAVID-R',
    MOT200: '(libre)',
    MOT999: '(libre)',
  });

  // Ahora que hay comodin libre, la segunda averia si encuentra reemplazo.
  await cambiarEstadoMoto('MOT200', 'OPERATIVA', cajero.id, 'Frenos listos');
  const tercera = await cambiarEstadoMoto('MOT200', 'EN_MANTENIMIENTO', cajero.id, 'Otra vez');
  comprobar('el comodin liberado si se presta', tercera.comodinAsignada, 'MOT999');
  comprobar('a PINITO-R', tercera.choferAfectado, 'PINITO-R');

  // -------------------------------------------------------------------------
  console.log('\n--- Se averia el propio comodin ---');
  const comodinRota = await cambiarEstadoMoto('MOT999', 'FUERA_DE_SERVICIO', cajero.id, 'Choque');
  comprobar('el comodin no se reemplaza a si mismo', comodinRota.comodinAsignada, null);
  comprobar(
    'y se avisa que el chofer queda a pie',
    comodinRota.advertencia?.includes('PINITO-R'),
    true,
  );
  comprobar('nadie trae moto salvo DAVID-R', await fotoDeFlota(), {
    MOT100: 'DAVID-R',
    MOT200: '(libre)',
    MOT999: '(libre)',
  });

  let asignarRota = '';
  try {
    await asignarMoto('MOT999', nestor.id, cajero.id);
  } catch (e) {
    asignarRota = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('no se asigna una moto fuera de servicio', asignarRota, 'DATOS_INVALIDOS');

  // -------------------------------------------------------------------------
  console.log('\n--- Gastos y kilometraje ---');
  await cambiarEstadoMoto('MOT999', 'OPERATIVA', cajero.id, 'Reparada');

  await registrarMantenimiento({
    placa: 'MOT100',
    tipo: 'PREVENTIVO',
    categoria: 'GASOLINA',
    costoTotal: 1_200_000, // 12 000
    kilometrajeEvento: 18_200,
    cajeroId: cajero.id,
  });
  await registrarMantenimiento({
    placa: 'MOT100',
    tipo: 'PREVENTIVO',
    categoria: 'CAMBIO_ACEITE',
    costoTotal: 900_000, // 9 000
    kilometrajeEvento: 18_500,
    tallerOProveedor: 'Taller Rojas',
    cajeroId: cajero.id,
  });
  await registrarMantenimiento({
    placa: 'MOT100',
    tipo: 'PREVENTIVO',
    categoria: 'GASOLINA',
    costoTotal: 1_100_000, // 11 000
    kilometrajeEvento: 19_000,
    cajeroId: cajero.id,
  });

  comprobar(
    'el kilometraje de la moto se actualiza solo',
    (await obtenerMoto('MOT100')).kilometrajeActual,
    19_000,
  );

  let odometroAtras = '';
  try {
    await registrarMantenimiento({
      placa: 'MOT100',
      tipo: 'PREVENTIVO',
      categoria: 'GASOLINA',
      costoTotal: 500_000,
      kilometrajeEvento: 1_900, // el clasico: falta un cero
      cajeroId: cajero.id,
    });
  } catch (e) {
    odometroAtras = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('el odometro no puede retroceder', odometroAtras, 'DATOS_INVALIDOS');

  const clave = crypto.randomUUID();
  const uno = await registrarMantenimiento({
    placa: 'MOT100',
    tipo: 'PREVENTIVO',
    categoria: 'GASOLINA',
    costoTotal: 800_000,
    kilometrajeEvento: 19_300,
    cajeroId: cajero.id,
    claveIdempotencia: clave,
  });
  const dos = await registrarMantenimiento({
    placa: 'MOT100',
    tipo: 'PREVENTIVO',
    categoria: 'GASOLINA',
    costoTotal: 800_000,
    kilometrajeEvento: 19_300,
    cajeroId: cajero.id,
    claveIdempotencia: clave,
  });
  comprobar('el doble toque no cobra dos veces', dos.id, uno.id);
  comprobar('y se reporta como repetido', dos.repetido, true);

  // -------------------------------------------------------------------------
  console.log('\n--- Costo por kilometro ---');
  const resumen = await resumenDeFlota({ placa: 'MOT100' });
  const m100 = resumen[0]!;
  // 12 000 + 9 000 + 11 000 + 8 000 = 40 000 colones
  comprobar('gasto total de la moto', m100.gastoTotal, 4_000_000);
  comprobar('gasto en gasolina', m100.gastoPorCategoria['GASOLINA'], 3_100_000);
  // Del odometro 18 200 al 19 300 = 1 100 km
  comprobar('kilometros que cubren los registros', m100.kmRecorridos, 1_100);
  // 4 000 000 centimos / 1 100 km = 3 636 centimos por km
  comprobar('costo por kilometro en centimos', m100.costoPorKm, 3_636);

  const sinDatos = (await resumenDeFlota({ placa: 'MOT999' }))[0]!;
  comprobar('sin registros no hay costo por km', sinDatos.costoPorKm, null);
  comprobar('y el gasto es cero', sinDatos.gastoTotal, 0);

  // -------------------------------------------------------------------------
  console.log('\n--- Alertas por kilometraje ---');
  const alertas = await alertasDeFlota();
  const porKilometraje = alertas.filter((a) => a.clase === 'KILOMETRAJE');
  const aceite100 = porKilometraje.find(
    (a) => a.placa === 'MOT100' && a.categoria === 'CAMBIO_ACEITE',
  );
  comprobar(
    'el aceite de MOT100 aun no vence',
    aceite100 === undefined || aceite100.nivel === 'PROXIMO',
    true,
  );

  const frenos200 = porKilometraje.find(
    (a) => a.placa === 'MOT200' && a.categoria === 'FRENOS',
  );
  comprobar('una moto sin servicios registrados sale vencida', frenos200?.nivel, 'VENCIDO');
  comprobar('contando desde cero, no exenta', frenos200?.ultimoKm, null);

  // Se fuerza el vencimiento del aceite rodando 2 000 km mas.
  await registrarMantenimiento({
    placa: 'MOT100',
    tipo: 'PREVENTIVO',
    categoria: 'GASOLINA',
    costoTotal: 1_000_000,
    kilometrajeEvento: 20_600,
    cajeroId: cajero.id,
  });
  const vencidas = await alertasDeFlota();
  const aceiteVencido = vencidas
    .filter((a) => a.clase === 'KILOMETRAJE')
    .find((a) => a.placa === 'MOT100' && a.categoria === 'CAMBIO_ACEITE');
  comprobar('pasados 2 000 km el aceite vence', aceiteVencido?.nivel, 'VENCIDO');
  comprobar('y dice cuanto se paso', aceiteVencido!.kmRestantes < 0, true);

  // -------------------------------------------------------------------------
  console.log('\n--- Ficha tecnica ---');

  const enDias = (dias: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + dias);
    return d;
  };

  await editarMoto(
    'MOT100',
    {
      ficha: {
        tipoAceite: '  10W-40 Semi-sintetico  ',
        intervaloAceiteKm: 1_000,
        medidaLlantaDelantera: '2.75-18',
        medidaCadena: '428H - 120 L',
        frenoDelantero: 'Disco',
        vencimientoRtv: enDias(10),
        vencimientoSeguro: enDias(-5),
      },
    },
    cajero.id,
  );

  const conFicha = await obtenerMoto('MOT100');
  comprobar('el texto se guarda sin espacios sobrantes', conFicha.tipoAceite, '10W-40 Semi-sintetico');
  comprobar('la medida de llanta se guarda tal cual', conFicha.medidaLlantaDelantera, '2.75-18');
  comprobar('la cadena tambien', conFicha.medidaCadena, '428H - 120 L');
  comprobar('lo que no se lleno queda vacio', conFicha.medidaLlantaTrasera, null);

  // Editar solo los datos generales no debe borrar la ficha ya cargada.
  await editarMoto('MOT100', { marca: 'Honda' }, cajero.id);
  comprobar(
    'editar lo general no borra la ficha',
    (await obtenerMoto('MOT100')).tipoAceite,
    '10W-40 Semi-sintetico',
  );

  let intervaloMalo = '';
  try {
    await editarMoto('MOT100', { ficha: { intervaloAceiteKm: 0 } }, cajero.id);
  } catch (e) {
    intervaloMalo = esErrorNegocio(e) ? e.codigo : 'ERROR_INESPERADO';
  }
  comprobar('un intervalo de cero se rechaza', intervaloMalo, 'DATOS_INVALIDOS');

  // -------------------------------------------------------------------------
  console.log('\n--- Alertas por fecha ---');
  const porFecha = (await alertasDeFlota()).filter((a) => a.clase === 'FECHA');

  const rtv = porFecha.find((a) => a.placa === 'MOT100' && a.categoria === 'RTV');
  comprobar('la revision tecnica que vence en 10 dias avisa', rtv?.nivel, 'PROXIMO');
  comprobar('y dice cuantos dias faltan', rtv?.diasRestantes, 10);

  const seguro = porFecha.find((a) => a.placa === 'MOT100' && a.categoria === 'SEGURO');
  comprobar('el marchamo vencido hace 5 dias sale vencido', seguro?.nivel, 'VENCIDO');
  comprobar('con los dias en negativo', seguro?.diasRestantes, -5);

  comprobar(
    'una moto sin fechas anotadas no genera alerta de papeles',
    porFecha.some((a) => a.placa === 'MOT200'),
    false,
  );

  await editarMoto('MOT100', { ficha: { vencimientoRtv: enDias(200) } }, cajero.id);
  comprobar(
    'una fecha lejana no molesta',
    (await alertasDeFlota()).some(
      (a) => a.clase === 'FECHA' && a.placa === 'MOT100' && a.categoria === 'RTV',
    ),
    false,
  );

  // El intervalo de la ficha manda sobre el general: MOT100 pide aceite cada
  // 1 000 km en vez de 2 000.
  const aceitePropio = (await alertasDeFlota())
    .filter((a) => a.clase === 'KILOMETRAJE')
    .find((a) => a.placa === 'MOT100' && a.categoria === 'CAMBIO_ACEITE');
  comprobar('el intervalo de la ficha manda sobre el general', aceitePropio?.intervalo, 1_000);

  // -------------------------------------------------------------------------
  console.log('\n--- Auditoria ---');
  const eventos = await prisma.eventoAuditoria.groupBy({ by: ['tipo'], _count: true });
  const porTipo = Object.fromEntries(eventos.map((e) => [e.tipo, e._count]));
  comprobar('quedan las altas de moto', porTipo['MOTO_CREADA'], 3);
  comprobar('los cambios de estado', porTipo['MOTO_ESTADO'], 7);
  // Cinco gastos, no seis: el envio repetido por idempotencia no crea otro
  // registro y por tanto tampoco otro evento. El rechazado por odometro hacia
  // atras tampoco deja rastro, porque nunca llego a escribirse.
  comprobar('los gastos, sin contar el repetido', porTipo['MANTENIMIENTO'], 5);
  comprobar('y las asignaciones', (porTipo['MOTO_ASIGNADA'] ?? 0) > 0, true);

  const historial = await prisma.asignacionMoto.count();
  comprobar('la historia de asignaciones se conserva', historial > 5, true);

  await limpiar();
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

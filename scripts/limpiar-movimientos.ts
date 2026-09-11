/**
 * Borra los movimientos de la base local dejando cajeros y choferes.
 *
 * Sirve para dejar el equipo limpio despues de una demostracion o de pruebas
 * manuales. NO usar en produccion: la bitacora es la traza contable del
 * negocio y no deberia poder borrarse desde un script.
 */

import { prisma } from '../src/lib/db/prisma';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script no se ejecuta en produccion.');
  }

  const borrados = {
    eventos: (await prisma.eventoAuditoria.deleteMany()).count,
    tiquetes: (await prisma.tiquete.deleteMany()).count,
    cierres: (await prisma.cierreChofer.deleteMany()).count,
    arqueos: (await prisma.arqueoCaja.deleteMany()).count,
    abonos: (await prisma.abonoEfectivo.deleteMany()).count,
    turnos: (await prisma.turnoChofer.deleteMany()).count,
    ventasExcel: (await prisma.ventaChoferExcel.deleteMany()).count,
    cargas: (await prisma.cargaExcel.deleteMany()).count,
  };

  console.log('Movimientos eliminados:', borrados);
  console.log('Cajeros y choferes se conservaron.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

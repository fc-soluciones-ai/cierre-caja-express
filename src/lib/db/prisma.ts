/**
 * Cliente Prisma unico para todo el proceso.
 *
 * En desarrollo Next.js recarga los modulos en caliente; sin este singleton
 * cada recarga abriria una conexion nueva y la base terminaria bloqueada.
 *
 * POR QUE EXISTE DATABASE_URL_PRUEBAS
 *
 * El cliente de Prisma resuelve env("DATABASE_URL") leyendo el archivo .env
 * por su cuenta, no el process.env que le haya dejado quien lo importa. Un
 * script que quiera apuntar a otra base NO puede lograrlo escribiendo
 * process.env.DATABASE_URL: Prisma vuelve a leer .env y usa el de siempre.
 *
 * Eso hizo que las comprobaciones destructivas corrieran contra la base del
 * negocio creyendo que iban contra la de pruebas, y borraran datos reales.
 *
 * Por eso la direccion de pruebas viaja en una variable que Prisma no conoce
 * y que .env no define, y se le entrega al constructor de forma explicita.
 * Lo explicito gana sobre lo que Prisma vuelva a leer.
 */

import { PrismaClient } from '@prisma/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Direccion a usar. Si hay una de pruebas, manda ella.
 *
 * La aplicacion nunca define DATABASE_URL_PRUEBAS: solo la ponen los scripts
 * de comprobacion, justo antes de importar este modulo.
 */
const direccion = process.env.DATABASE_URL_PRUEBAS ?? process.env.DATABASE_URL;

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    ...(direccion ? { datasources: { db: { url: direccion } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = prisma;
}

/**
 * Cliente Prisma unico para todo el proceso.
 *
 * En desarrollo Next.js recarga los modulos en caliente; sin este singleton
 * cada recarga abriria una conexion nueva y SQLite terminaria bloqueado.
 */

import { PrismaClient } from '@prisma/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = prisma;
}

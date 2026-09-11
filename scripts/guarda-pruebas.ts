/**
 * Guarda de seguridad para las comprobaciones destructivas.
 *
 * Varias pruebas vacian todas las tablas antes de empezar. Si por cualquier
 * razon apuntaran a la base del negocio, borrarian la contabilidad de la
 * pizzeria. Ya paso una vez: el envoltorio ponia la direccion de pruebas en
 * process.env, pero el cliente de Prisma vuelve a leer .env por su cuenta y
 * usaba la de produccion.
 *
 * Por eso la comprobacion no confia en el envoltorio: cada script destructivo
 * la llama y se niega a correr si no ve, de forma explicita, que va contra la
 * base de pruebas.
 */

export function exigirBaseDePruebas(): void {
  const pruebas = process.env.DATABASE_URL_PRUEBAS;

  if (!pruebas) {
    throw new Error(
      'Esta comprobacion borra todas las tablas y no ve una base de pruebas.\n' +
        '  Ejecutela por el envoltorio:  tsx scripts/base-de-pruebas.ts <script>\n' +
        '  o con npm:                    npm run test:servicios',
    );
  }

  // SQLite: basta con que sea un archivo distinto al de trabajo.
  if (pruebas.startsWith('file:')) {
    if (!pruebas.includes('prueba')) {
      throw new Error(`La base de pruebas no parece de pruebas: ${pruebas}`);
    }
    return;
  }

  // PostgreSQL: tiene que apuntar al esquema de pruebas, y jamas a public.
  const esquema = new URL(pruebas).searchParams.get('schema');
  if (esquema !== 'pruebas') {
    throw new Error(
      `La base de pruebas apunta al esquema "${esquema ?? '(ninguno)'}" y no a "pruebas". ` +
        'No se ejecuta nada.',
    );
  }
}

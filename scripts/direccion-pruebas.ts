/**
 * Como se deriva la direccion de la base de PRUEBAS.
 *
 * Vive aparte del envoltorio porque varios scripts necesitan la funcion sin
 * disparar la ejecucion del envoltorio al importarlo.
 */

/** Esquema de PostgreSQL donde viven las tablas de prueba. */
const ESQUEMA_PRUEBAS = 'pruebas';

/** Archivo SQLite de pruebas, cuando la base es local. */
const ARCHIVO_PRUEBAS = 'file:./prueba.db';

/**
 * Convierte la direccion de trabajo en la de pruebas.
 *
 * En PostgreSQL se cambia el esquema, no la base: Supabase da una sola base
 * por proyecto y crear otra no es posible desde aqui.
 *
 * NUNCA POR EL AGRUPADOR EN MODO TRANSACCION
 *
 * El puerto 6543 reparte una misma conexion del servidor entre muchos
 * clientes. El "SET search_path" que Prisma emite para apuntar al esquema de
 * pruebas se queda pegado en esa conexion y lo hereda quien la reciba
 * despues, incluida la aplicacion en produccion. Se comprobo en vivo: tras
 * correr las pruebas, TODAS las conexiones nuevas veian el esquema de pruebas
 * y la caja reportaba cero repartidores.
 *
 * Por eso las pruebas van por el puerto 5432, donde cada sesion tiene su
 * propia conexion y lo que se configure ahi no sale de ella.
 */
export function urlDePruebas(url: string | undefined): string {
  if (!url || url.startsWith('file:')) return ARCHIVO_PRUEBAS;

  const direccion = new URL(url);
  direccion.searchParams.set('schema', ESQUEMA_PRUEBAS);

  // Modo sesion, no transaccion: aqui el search_path no se contagia.
  direccion.port = '5432';
  direccion.searchParams.delete('pgbouncer');

  return direccion.toString();
}

/** Oculta la contrasena para poder mostrar a donde apunta. */
export function sinClave(url: string): string {
  return url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
}

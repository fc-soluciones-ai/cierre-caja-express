/**
 * Entrada a la caja.
 *
 * Nadie llega al dashboard sin decir quien es: todo abono y todo cierre queda
 * firmado, y una firma que el navegador pueda elegir no vale nada.
 */

import { FormularioEntrada } from '@/components/FormularioEntrada';
import { cajerosActivos, repartidoresConAcceso } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Entrar() {
  const [cajeros, repartidores] = await Promise.all([
    cajerosActivos(),
    repartidoresConAcceso(),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center text-3xl font-bold">Control Express</h1>
        <p className="mb-6 text-center text-slate-400">Identifiquese para entrar</p>

        {cajeros.length === 0 ? (
          <div className="tarjeta p-8 text-center">
            <p className="text-5xl">🔑</p>
            <h2 className="mt-4 text-xl font-bold">No hay usuarios registrados</h2>
            <p className="mt-2 text-slate-400">
              Ejecute <code className="rounded bg-fondo px-2 py-1">npm run db:seed</code> para
              crear el usuario administrador inicial.
            </p>
          </div>
        ) : (
          <FormularioEntrada cajeros={cajeros} repartidores={repartidores} />
        )}
      </div>
    </main>
  );
}

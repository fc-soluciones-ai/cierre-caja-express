/**
 * Franja que avisa que esta no es la caja de verdad.
 *
 * El riesgo no es teorico: con las dos aplicaciones abiertas en el mismo
 * equipo se parecen tanto que alguien puede recibir un abono real en la de
 * practica, o dar de alta una moto de prueba en la del negocio. Lo primero
 * pierde plata, lo segundo ensucia la contabilidad.
 *
 * La marca se pinta sola cuando el proceso corre contra el esquema de
 * pruebas. No hay nada que recordar encender.
 */

export function AvisoDemostracion() {
  if (!process.env.DATABASE_URL_PRUEBAS) return null;

  return (
    <div
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-aviso px-4 py-2 text-center text-sm font-bold text-slate-950"
      role="status"
    >
      <span>PRACTICA · esto no es la caja del negocio</span>
      <span className="font-normal">
        Nada de lo que haga aqui cuenta. Usuario Demostracion, PIN 2026.
      </span>
    </div>
  );
}

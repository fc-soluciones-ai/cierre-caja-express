/**
 * El repartidor carga su propia gasolina.
 *
 * Es quien esta parado en la bomba con el odometro a la vista y la factura en
 * la mano. Pedirle que se lo dicte al cajero al volver es pedirle a dos
 * personas que recuerden un numero.
 *
 * Solo su moto, solo gasolina. El taller, los repuestos y los seguros los
 * sigue registrando la caja: son gastos que el repartidor no decide.
 */

import { redirect } from 'next/navigation';

import { FormularioGasolina } from '@/components/FormularioGasolina';
import { resumenDelRepartidor } from '@/server/services/repartidor';
import { repartidorDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function CargarGasolina() {
  const repartidor = await repartidorDeSesion();
  if (!repartidor) redirect('/entrar');

  const resumen = await resumenDelRepartidor(repartidor.id);

  return <FormularioGasolina moto={resumen.moto} />;
}

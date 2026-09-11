/**
 * Abonos parciales de efectivo.
 *
 * Es la operacion mas repetida del sistema y la mas expuesta: un repartidor
 * entrega plata, el cajero teclea un monto en una pantalla tactil y hay que
 * darle un papel. Tres cosas la protegen:
 *
 *   1. Idempotencia por clave del cliente, contra el doble toque.
 *   2. Transaccion unica: abono, evento de auditoria y tiquete, o nada.
 *   3. La impresion ocurre FUERA de la transaccion. El dinero ya entro; si la
 *      impresora falla, el tiquete queda pendiente y se reimprime, pero el
 *      movimiento no se pierde ni se revierte.
 */

import { prisma } from '@/lib/db/prisma';
import { tiqueteAbono } from '@/lib/print/plantillas';
import { serializar } from '@/lib/print/documento';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { saldoAbonosDeTurno } from '@/server/services/caja';
import { despacharTiquete } from '@/server/services/impresion';
import { obtenerOAbrirTurno } from '@/server/services/turnos';
import { esquemaAbono, type EntradaAbono } from '@/server/validaciones';

export interface ResultadoAbono {
  abonoId: string;
  turnoId: string;
  montoAbonado: number;
  saldoAcumuladoTurno: number;
  cantidadAbonosTurno: number;
  tiqueteId: string;
  /** Falso si la impresora fallo o esta desactivada. El abono vale igual. */
  impreso: boolean;
  /** Verdadero cuando la clave de idempotencia ya existia y no se creo nada. */
  repetido: boolean;
}

export async function registrarAbono(entrada: EntradaAbono): Promise<ResultadoAbono> {
  const datos = esquemaAbono.parse(entrada);

  // Camino corto de idempotencia: si la clave ya se uso, se devuelve el abono
  // original sin volver a imprimir ni volver a sumar.
  if (datos.claveIdempotencia) {
    const previo = await prisma.abonoEfectivo.findUnique({
      where: { claveIdempotencia: datos.claveIdempotencia },
      include: { tiquetes: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (previo) {
      const saldo = await saldoAbonosDeTurno(previo.turnoChoferId);
      return {
        abonoId: previo.id,
        turnoId: previo.turnoChoferId,
        montoAbonado: previo.montoAbonado,
        saldoAcumuladoTurno: saldo.total,
        cantidadAbonosTurno: saldo.cantidad,
        tiqueteId: previo.tiquetes[0]?.id ?? '',
        impreso: false,
        repetido: true,
      };
    }
  }

  const cajero = await prisma.cajero.findUnique({ where: { id: datos.cajeroId } });
  if (!cajero) {
    throw new ErrorNegocio('CAJERO_NO_ENCONTRADO', 'El cajero de la sesion no existe.');
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const turno = await obtenerOAbrirTurno(tx, datos.choferId);

    const abono = await tx.abonoEfectivo.create({
      data: {
        turnoChoferId: turno.id,
        montoAbonado: datos.montoAbonado,
        cajeroId: datos.cajeroId,
        dispositivo: datos.dispositivo ?? null,
        nota: datos.nota ?? null,
        claveIdempotencia: datos.claveIdempotencia ?? null,
      },
    });

    const saldo = await saldoAbonosDeTurno(turno.id, tx);

    const documento = tiqueteAbono({
      abonoId: abono.id,
      chofer: {
        nombre: turno.chofer.nombre,
        idMeseroSoftRestaurant: turno.chofer.idMeseroSoftRestaurant,
      },
      montoAbonado: abono.montoAbonado,
      saldoAcumuladoTurno: saldo.total,
      cantidadAbonosTurno: saldo.cantidad,
      cajero: cajero.nombre,
      dispositivo: datos.dispositivo,
      timestamp: abono.timestamp,
    });

    const tiquete = await tx.tiquete.create({
      data: {
        tipo: 'ABONO',
        contenidoTexto: serializar(documento),
        abonoId: abono.id,
      },
    });

    await registrarEvento(tx, {
      tipo: 'ABONO',
      cajeroId: datos.cajeroId,
      choferId: datos.choferId,
      entidadTipo: 'AbonoEfectivo',
      entidadId: abono.id,
      monto: abono.montoAbonado,
      dispositivo: datos.dispositivo,
      detalle: { turnoId: turno.id, saldoTurno: saldo.total },
    });

    return {
      abonoId: abono.id,
      turnoId: turno.id,
      montoAbonado: abono.montoAbonado,
      saldoAcumuladoTurno: saldo.total,
      cantidadAbonosTurno: saldo.cantidad,
      tiqueteId: tiquete.id,
      impreso: false,
      repetido: false,
    };
  });

  const despacho = await despacharTiquete(resultado.tiqueteId);
  return { ...resultado, impreso: despacho.impreso };
}

/**
 * Anula un abono con una fila de reverso de monto negativo. El original no se
 * toca: queda enlazado a su reverso y ambos siguen visibles en el historial.
 */
export async function anularAbono(entrada: {
  abonoId: string;
  cajeroId: string;
  motivo: string;
  dispositivo?: string;
}): Promise<{ reversoId: string; saldoAcumuladoTurno: number }> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.abonoEfectivo.findUnique({
      where: { id: entrada.abonoId },
      include: { turno: true },
    });
    if (!original) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El abono indicado no existe.');
    }
    if (original.anuladoPorId !== null) {
      throw new ErrorNegocio('ABONO_YA_ANULADO', 'Ese abono ya fue anulado.');
    }
    if (original.montoAbonado < 0) {
      throw new ErrorNegocio('ABONO_YA_ANULADO', 'No se puede anular una fila de reverso.');
    }
    if (original.turno.estado === 'CERRADO') {
      throw new ErrorNegocio(
        'ABONO_DE_TURNO_CERRADO',
        'El turno ya esta cerrado. Corrija la diferencia con un ajuste, no anulando el abono.',
      );
    }

    const reverso = await tx.abonoEfectivo.create({
      data: {
        turnoChoferId: original.turnoChoferId,
        montoAbonado: -original.montoAbonado,
        cajeroId: entrada.cajeroId,
        dispositivo: entrada.dispositivo ?? null,
        nota: `Reverso de ${original.id}: ${entrada.motivo}`,
      },
    });

    await tx.abonoEfectivo.update({
      where: { id: original.id },
      data: { anuladoPorId: reverso.id },
    });

    await registrarEvento(tx, {
      tipo: 'ABONO_ANULADO',
      cajeroId: entrada.cajeroId,
      choferId: original.turno.choferId,
      entidadTipo: 'AbonoEfectivo',
      entidadId: original.id,
      monto: -original.montoAbonado,
      dispositivo: entrada.dispositivo,
      detalle: { reversoId: reverso.id, motivo: entrada.motivo },
    });

    const saldo = await saldoAbonosDeTurno(original.turnoChoferId, tx);
    return { reversoId: reverso.id, saldoAcumuladoTurno: saldo.total };
  });
}

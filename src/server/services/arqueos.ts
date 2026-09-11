/**
 * Arqueo de caja por si solo, sin cerrar turnos.
 *
 * Sirve para el corte de un cajero que entrega la caja a otro a media noche,
 * o para un conteo de control. El arqueo que acompana a un cierre grupal se
 * hace dentro de cerrarTurnos, en la misma transaccion.
 *
 * El arqueo NO mueve dinero: solo deja constancia de lo que habia contra lo
 * que decia el sistema. Por eso nunca reinicia el teorico del dia.
 */

import { prisma } from '@/lib/db/prisma';
import { serializar } from '@/lib/print/documento';
import { tiqueteArqueo } from '@/lib/print/plantillas';
import { diaOperativoDe } from '@/lib/fechas';
import { clasificarDiferencia, totalizarDesglose } from '@/lib/money/money';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { efectivoTeoricoEnCaja } from '@/server/services/caja';
import { despacharTiquete } from '@/server/services/impresion';
import { esquemaArqueo, type EntradaArqueo } from '@/server/validaciones';

export interface ResultadoArqueo {
  arqueoId: string;
  diaOperativo: string;
  efectivoTeoricoCaja: number;
  efectivoRealContado: number;
  diferenciaCaja: number;
  clasificacion: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE';
  tiqueteId: string;
  repetido: boolean;
}

export async function registrarArqueo(entrada: EntradaArqueo): Promise<ResultadoArqueo> {
  const datos = esquemaArqueo.parse(entrada);
  const diaOperativo = datos.diaOperativo ?? diaOperativoDe();

  if (datos.claveIdempotencia) {
    const previo = await prisma.arqueoCaja.findUnique({
      where: { claveIdempotencia: datos.claveIdempotencia },
      include: { tiquetes: { take: 1, orderBy: { createdAt: 'asc' } } },
    });
    if (previo) {
      return {
        arqueoId: previo.id,
        diaOperativo,
        efectivoTeoricoCaja: previo.efectivoTeoricoCaja,
        efectivoRealContado: previo.efectivoRealContado,
        diferenciaCaja: previo.diferenciaCaja,
        clasificacion: clasificarDiferencia(previo.diferenciaCaja),
        tiqueteId: previo.tiquetes[0]?.id ?? '',
        repetido: true,
      };
    }
  }

  const cajero = await prisma.cajero.findUnique({ where: { id: datos.cajeroId } });
  if (!cajero) {
    throw new ErrorNegocio('CAJERO_NO_ENCONTRADO', 'El cajero de la sesion no existe.');
  }

  const desglose = datos.desglose
    ? Object.fromEntries(Object.entries(datos.desglose).map(([k, v]) => [Number(k), v]))
    : null;

  // Si el cajero conto por denominacion, el total debe coincidir con lo que
  // declaro. Un desajuste aqui es un error de digitacion, no un faltante.
  if (desglose) {
    const sumaDesglose = totalizarDesglose(desglose);
    if (sumaDesglose !== datos.efectivoRealContado) {
      throw new ErrorNegocio(
        'MONTO_INVALIDO',
        'El desglose por denominacion no suma el total contado. Revise el conteo antes de guardar.',
        { sumaDesglose, declarado: datos.efectivoRealContado },
      );
    }
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const teorico = await efectivoTeoricoEnCaja(diaOperativo, tx);
    const diferenciaCaja = datos.efectivoRealContado - teorico.total;

    const arqueo = await tx.arqueoCaja.create({
      data: {
        cajeroId: datos.cajeroId,
        efectivoTeoricoCaja: teorico.total,
        efectivoRealContado: datos.efectivoRealContado,
        diferenciaCaja,
        desgloseDenominaciones: desglose ? JSON.stringify(desglose) : null,
        observacion: datos.observacion ?? null,
        claveIdempotencia: datos.claveIdempotencia ?? null,
      },
    });

    const documento = tiqueteArqueo({
      arqueoId: arqueo.id,
      efectivoTeoricoCaja: arqueo.efectivoTeoricoCaja,
      efectivoRealContado: arqueo.efectivoRealContado,
      diferenciaCaja: arqueo.diferenciaCaja,
      desglose,
      cajero: cajero.nombre,
      timestamp: arqueo.timestamp,
      diaOperativo,
      observacion: datos.observacion,
    });

    const tiquete = await tx.tiquete.create({
      data: {
        tipo: 'ARQUEO',
        contenidoTexto: serializar(documento),
        arqueoCajaId: arqueo.id,
      },
    });

    await registrarEvento(tx, {
      tipo: 'ARQUEO',
      cajeroId: datos.cajeroId,
      entidadTipo: 'ArqueoCaja',
      entidadId: arqueo.id,
      monto: diferenciaCaja,
      detalle: {
        teorico: arqueo.efectivoTeoricoCaja,
        contado: arqueo.efectivoRealContado,
        diaOperativo,
        abonos: teorico.totalAbonos,
        entregasCierre: teorico.totalEntregasCierre,
      },
    });

    return {
      arqueoId: arqueo.id,
      diaOperativo,
      efectivoTeoricoCaja: arqueo.efectivoTeoricoCaja,
      efectivoRealContado: arqueo.efectivoRealContado,
      diferenciaCaja,
      clasificacion: clasificarDiferencia(diferenciaCaja),
      tiqueteId: tiquete.id,
      repetido: false,
    };
  });

  await despacharTiquete(resultado.tiqueteId);
  return resultado;
}

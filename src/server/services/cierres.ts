/**
 * Cierre y conciliacion de turno.
 *
 * Es la operacion critica del sistema: cierra turnos, congela el esperado del
 * Excel, calcula faltantes y opcionalmente asienta el arqueo de la caja. Todo
 * ocurre en UNA transaccion. Si el cierre del cuarto repartidor falla, los
 * tres anteriores no quedan cerrados a medias con la caja ya arqueada.
 *
 *   diferencia = (abonos parciales + efectivo entregado) - efectivo esperado
 *   positiva = sobrante, negativa = faltante
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { serializar } from '@/lib/print/documento';
import {
  tiqueteArqueo,
  tiqueteCierreChofer,
  tiqueteCierreGrupal,
} from '@/lib/print/plantillas';
import { diaOperativoDe } from '@/lib/fechas';
import { calcularDiferencia, clasificarDiferencia } from '@/lib/money/money';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { efectivoTeoricoEnCaja, saldoAbonosDeTurno } from '@/server/services/caja';
import { esperadoDeChofer } from '@/server/services/cargas';
import { despacharTiquete } from '@/server/services/impresion';
import { exigirTurnoAbierto, marcarTurnoCerrado } from '@/server/services/turnos';
import { esquemaCierreLote, type EntradaCierreLote } from '@/server/validaciones';

// ---------------------------------------------------------------------------
// Previsualizacion
// ---------------------------------------------------------------------------

export interface PrevisualizacionCierre {
  choferId: string;
  choferNombre: string;
  turnoId: string;
  abonosParciales: number;
  cantidadAbonos: number;
  efectivoEsperado: number;
  tarjetaEsperada: number;
  sinpeEsperado: number;
  viajesTotales: number;
  /** Lo que falta entregar para cuadrar. Nunca negativo. */
  sugerenciaEntrega: number;
  tieneVentasCargadas: boolean;
  cargas: Array<{ id: string; nombreArchivo: string; tipoCorte: string; tipoReporte: string }>;
}

/**
 * Calcula el estado de un chofer antes de cerrar, para que la pantalla muestre
 * la diferencia en vivo mientras el cajero teclea el efectivo entregado.
 */
export async function previsualizarCierre(
  choferId: string,
  diaOperativo: string = diaOperativoDe(),
): Promise<PrevisualizacionCierre> {
  const turno = await prisma.turnoChofer.findFirst({
    where: { choferId, estado: 'ABIERTO' },
    include: { chofer: true },
  });
  if (!turno) {
    throw new ErrorNegocio(
      'TURNO_NO_ABIERTO',
      'El repartidor no tiene un turno abierto. No hay nada que cerrar.',
    );
  }

  const [saldo, esperado] = await Promise.all([
    saldoAbonosDeTurno(turno.id),
    esperadoDeChofer(choferId, diaOperativo),
  ]);

  return {
    choferId,
    choferNombre: turno.chofer.nombre,
    turnoId: turno.id,
    abonosParciales: saldo.total,
    cantidadAbonos: saldo.cantidad,
    efectivoEsperado: esperado.efectivoEsperado,
    tarjetaEsperada: esperado.tarjetaEsperada,
    sinpeEsperado: esperado.sinpeEsperado,
    viajesTotales: esperado.viajesTotales,
    sugerenciaEntrega: Math.max(0, esperado.efectivoEsperado - saldo.total),
    tieneVentasCargadas: esperado.cargas.length > 0,
    cargas: esperado.cargas,
  };
}

// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------

export interface CierreRealizado {
  cierreId: string;
  choferId: string;
  choferNombre: string;
  efectivoEsperado: number;
  abonosParciales: number;
  efectivoEntregado: number;
  totalRecibido: number;
  diferencia: number;
  clasificacion: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE';
  viajesTotales: number;
  tiqueteId: string;
}

export interface ResultadoCierreLote {
  diaOperativo: string;
  cierres: CierreRealizado[];
  arqueo: {
    arqueoId: string;
    efectivoTeoricoCaja: number;
    efectivoRealContado: number;
    diferenciaCaja: number;
    tiqueteId: string;
  } | null;
  tiqueteGrupalId: string | null;
  diferenciaTotal: number;
  /** Cuantos tiquetes salieron de verdad. El cierre vale aunque no salga ninguno. */
  impresion: { total: number; impresos: number };
}

/**
 * Cierra uno o varios turnos y, si se envia, asienta el arqueo de caja.
 *
 * El arqueo se calcula DESPUES de registrar los cierres, porque el efectivo
 * que el repartidor acaba de entregar ya esta fisicamente en la gaveta cuando
 * el cajero la cuenta.
 */
export async function cerrarTurnos(entrada: EntradaCierreLote): Promise<ResultadoCierreLote> {
  const datos = esquemaCierreLote.parse(entrada);
  const diaOperativo = datos.diaOperativo ?? diaOperativoDe();

  const choferesRepetidos = datos.cierres.map((c) => c.choferId);
  if (new Set(choferesRepetidos).size !== choferesRepetidos.length) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'Un mismo repartidor aparece dos veces en la seleccion.',
    );
  }

  const cajero = await prisma.cajero.findUnique({ where: { id: datos.cajeroId } });
  if (!cajero) {
    throw new ErrorNegocio('CAJERO_NO_ENCONTRADO', 'El cajero de la sesion no existe.');
  }

  // Un arqueo repetido por doble toque se detecta antes de tocar los turnos.
  if (datos.arqueo?.claveIdempotencia) {
    const previo = await prisma.arqueoCaja.findUnique({
      where: { claveIdempotencia: datos.arqueo.claveIdempotencia },
    });
    if (previo) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        'Este cierre ya se proceso. Revise el historial antes de repetirlo.',
      );
    }
  }

  const resultado = await prisma.$transaction(
    async (tx) => {
      const momento = new Date();
      const cierres: CierreRealizado[] = [];

      for (const solicitud of datos.cierres) {
        cierres.push(
          await cerrarUnTurno(tx, {
            solicitud,
            diaOperativo,
            cajeroId: datos.cajeroId,
            cajeroNombre: cajero.nombre,
            momento,
            dispositivo: datos.dispositivo,
          }),
        );
      }

      let arqueo: ResultadoCierreLote['arqueo'] = null;

      if (datos.arqueo) {
        const teorico = await efectivoTeoricoEnCaja(diaOperativo, tx);
        const diferenciaCaja = datos.arqueo.efectivoRealContado - teorico.total;

        const registro = await tx.arqueoCaja.create({
          data: {
            cajeroId: datos.cajeroId,
            efectivoTeoricoCaja: teorico.total,
            efectivoRealContado: datos.arqueo.efectivoRealContado,
            diferenciaCaja,
            desgloseDenominaciones: datos.arqueo.desglose
              ? JSON.stringify(datos.arqueo.desglose)
              : null,
            observacion: datos.arqueo.observacion ?? null,
            claveIdempotencia: datos.arqueo.claveIdempotencia ?? null,
          },
        });

        await tx.cierreChofer.updateMany({
          where: { id: { in: cierres.map((c) => c.cierreId) } },
          data: { arqueoCajaId: registro.id },
        });

        const documentoArqueo = tiqueteArqueo({
          arqueoId: registro.id,
          efectivoTeoricoCaja: registro.efectivoTeoricoCaja,
          efectivoRealContado: registro.efectivoRealContado,
          diferenciaCaja: registro.diferenciaCaja,
          desglose: datos.arqueo.desglose
            ? Object.fromEntries(
                Object.entries(datos.arqueo.desglose).map(([k, v]) => [Number(k), v]),
              )
            : null,
          cajero: cajero.nombre,
          timestamp: registro.timestamp,
          diaOperativo,
          observacion: datos.arqueo.observacion,
        });

        const tiqueteArqueoCreado = await tx.tiquete.create({
          data: {
            tipo: 'ARQUEO',
            contenidoTexto: serializar(documentoArqueo),
            arqueoCajaId: registro.id,
          },
        });

        await registrarEvento(tx, {
          tipo: 'ARQUEO',
          cajeroId: datos.cajeroId,
          entidadTipo: 'ArqueoCaja',
          entidadId: registro.id,
          monto: registro.diferenciaCaja,
          dispositivo: datos.dispositivo,
          detalle: {
            teorico: registro.efectivoTeoricoCaja,
            contado: registro.efectivoRealContado,
            diaOperativo,
          },
        });

        arqueo = {
          arqueoId: registro.id,
          efectivoTeoricoCaja: registro.efectivoTeoricoCaja,
          efectivoRealContado: registro.efectivoRealContado,
          diferenciaCaja: registro.diferenciaCaja,
          tiqueteId: tiqueteArqueoCreado.id,
        };
      }

      let tiqueteGrupalId: string | null = null;
      if (cierres.length > 1) {
        const documentoGrupal = tiqueteCierreGrupal({
          referencia: cierres[0]?.cierreId ?? diaOperativo,
          diaOperativo,
          cajero: cajero.nombre,
          timestamp: momento,
          choferes: cierres.map((c) => ({
            nombre: c.choferNombre,
            efectivoEsperado: c.efectivoEsperado,
            totalRecibido: c.totalRecibido,
            diferencia: c.diferencia,
            viajes: c.viajesTotales,
          })),
          arqueo: arqueo
            ? {
                efectivoTeoricoCaja: arqueo.efectivoTeoricoCaja,
                efectivoRealContado: arqueo.efectivoRealContado,
                diferenciaCaja: arqueo.diferenciaCaja,
              }
            : null,
        });
        const creado = await tx.tiquete.create({
          data: { tipo: 'CIERRE_GRUPAL', contenidoTexto: serializar(documentoGrupal) },
        });
        tiqueteGrupalId = creado.id;
      }

      return {
        diaOperativo,
        cierres,
        arqueo,
        tiqueteGrupalId,
        diferenciaTotal: cierres.reduce((acc, c) => acc + c.diferencia, 0),
        impresion: { total: 0, impresos: 0 },
      };
    },
    { timeout: 20_000 },
  );

  // La impresion va fuera de la transaccion a proposito: el dinero ya quedo
  // registrado y una impresora apagada no puede deshacer un cierre.
  const porImprimir = [
    ...resultado.cierres.map((c) => c.tiqueteId),
    ...(resultado.arqueo ? [resultado.arqueo.tiqueteId] : []),
    ...(resultado.tiqueteGrupalId ? [resultado.tiqueteGrupalId] : []),
  ];

  let impresos = 0;
  for (const tiqueteId of porImprimir) {
    const despacho = await despacharTiquete(tiqueteId);
    if (despacho.impreso) impresos += 1;
  }

  return {
    ...resultado,
    impresion: { total: porImprimir.length, impresos },
  };
}

interface ContextoCierre {
  solicitud: EntradaCierreLote['cierres'][number];
  diaOperativo: string;
  cajeroId: string;
  cajeroNombre: string;
  momento: Date;
  dispositivo?: string;
}

async function cerrarUnTurno(
  tx: Prisma.TransactionClient,
  ctx: ContextoCierre,
): Promise<CierreRealizado> {
  const { solicitud, diaOperativo, cajeroId, cajeroNombre, momento, dispositivo } = ctx;

  const turno = await exigirTurnoAbierto(tx, solicitud.choferId);
  const saldo = await saldoAbonosDeTurno(turno.id, tx);
  const esperado = await esperadoDeChofer(solicitud.choferId, diaOperativo, tx);

  if (esperado.cargas.length === 0 && solicitud.permitirSinVentas !== true) {
    throw new ErrorNegocio(
      'SIN_VENTAS_PARA_CHOFER',
      `No hay ventas cargadas para ${turno.chofer.nombre} en el dia ${diaOperativo}. Importe el reporte de Soft Restaurant antes de cerrar, o confirme el cierre sin ventas.`,
    );
  }

  const diferencia = calcularDiferencia(
    saldo.total,
    solicitud.efectivoEntregado,
    esperado.efectivoEsperado,
  );

  const cierre = await tx.cierreChofer.create({
    data: {
      turnoChoferId: turno.id,
      cargaExcelId: esperado.cargas[0]?.id ?? null,
      cargasConsolidadas: JSON.stringify(esperado.cargas.map((c) => c.id)),
      efectivoEsperado: esperado.efectivoEsperado,
      tarjetaEsperada: esperado.tarjetaEsperada,
      sinpeEsperado: esperado.sinpeEsperado,
      viajesTotales: esperado.viajesTotales,
      abonosParciales: saldo.total,
      efectivoEntregado: solicitud.efectivoEntregado,
      diferencia,
      timestampCierre: momento,
      cajeroId,
      observacion: solicitud.observacion ?? null,
    },
  });

  await marcarTurnoCerrado(tx, turno.id, momento);

  const documento = tiqueteCierreChofer({
    cierreId: cierre.id,
    chofer: {
      nombre: turno.chofer.nombre,
      idMeseroSoftRestaurant: turno.chofer.idMeseroSoftRestaurant,
    },
    turno: { fechaApertura: turno.fechaApertura, fechaCierre: momento },
    efectivoEsperado: esperado.efectivoEsperado,
    tarjetaEsperada: esperado.tarjetaEsperada,
    sinpeEsperado: esperado.sinpeEsperado,
    viajesTotales: esperado.viajesTotales,
    abonosParciales: saldo.total,
    cantidadAbonos: saldo.cantidad,
    efectivoEntregado: solicitud.efectivoEntregado,
    diferencia,
    cajero: cajeroNombre,
    archivos: esperado.cargas.map((c) => ({
      nombreArchivo: c.nombreArchivo,
      tipoReporte: c.tipoReporte,
      tipoCorte: c.tipoCorte,
    })),
    observacion: solicitud.observacion,
  });

  const tiquete = await tx.tiquete.create({
    data: {
      tipo: 'CIERRE_CHOFER',
      contenidoTexto: serializar(documento),
      cierreChoferId: cierre.id,
    },
  });

  await registrarEvento(tx, {
    tipo: 'CIERRE_CHOFER',
    cajeroId,
    choferId: solicitud.choferId,
    entidadTipo: 'CierreChofer',
    entidadId: cierre.id,
    monto: diferencia,
    dispositivo,
    detalle: {
      turnoId: turno.id,
      diaOperativo,
      efectivoEsperado: esperado.efectivoEsperado,
      abonosParciales: saldo.total,
      efectivoEntregado: solicitud.efectivoEntregado,
      cargas: esperado.cargas.map((c) => c.id),
    },
  });

  return {
    cierreId: cierre.id,
    choferId: solicitud.choferId,
    choferNombre: turno.chofer.nombre,
    efectivoEsperado: esperado.efectivoEsperado,
    abonosParciales: saldo.total,
    efectivoEntregado: solicitud.efectivoEntregado,
    totalRecibido: saldo.total + solicitud.efectivoEntregado,
    diferencia,
    clasificacion: clasificarDiferencia(diferencia),
    viajesTotales: esperado.viajesTotales,
    tiqueteId: tiquete.id,
  };
}

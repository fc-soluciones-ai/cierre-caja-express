/**
 * Sincroniza la tabla de choferes con el padron real del negocio.
 *
 *   npm run db:repartidores                 (muestra que haria, sin escribir)
 *   npm run db:repartidores -- --aplicar
 *   npm run db:repartidores -- --aplicar --purgar-prueba
 *
 * Crea los que faltan, corrige el nombre de los que cambiaron y reactiva a los
 * que estaban dados de baja. NO borra a nadie que no este en el padron: puede
 * tener turnos y cierres, que son historia contable. Los deja como estan y
 * avisa, para que la baja se haga a mano desde Gestion de Choferes.
 *
 * --purgar-prueba elimina los repartidores de ejemplo que trae el seed
 * original, junto con sus movimientos. Solo hace algo si esos movimientos son
 * de prueba; si el chofer ya tiene un cierre, el script se detiene.
 */

import { prisma } from '../src/lib/db/prisma';
import { normalizarNombre } from '../src/lib/excel/columnas';
import { registrarEvento } from '../src/server/services/auditoria';
import { CUENTAS_DEL_POS } from '../src/server/config/cuentasDelPos';
import { REPARTIDORES } from '../prisma/seed/repartidores';

/** Nombres que trae el seed de ejemplo y que no existen en el negocio. */
const DE_PRUEBA = ['Antonio Rojas', 'Maria Fernandez', 'Kevin Solis'];

const APLICAR = process.argv.includes('--aplicar');
const PURGAR = process.argv.includes('--purgar-prueba');

async function cajeroResponsable(): Promise<string | null> {
  const cajero = await prisma.cajero.findFirst({
    where: { rol: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  return cajero?.id ?? null;
}

async function purgarDePrueba(cajeroId: string | null): Promise<void> {
  const ficticios = await prisma.chofer.findMany({
    where: { nombre: { in: DE_PRUEBA } },
    include: {
      turnos: { include: { abonos: true, cierre: true } },
      _count: { select: { ventasExcel: true } },
    },
  });

  if (ficticios.length === 0) {
    console.log('No quedan repartidores de prueba.');
    return;
  }

  for (const chofer of ficticios) {
    const cierres = chofer.turnos.filter((t) => t.cierre !== null).length;
    const abonos = chofer.turnos.reduce((a, t) => a + t.abonos.length, 0);

    // Un cierre es un documento contable. Si existe, esto ya no es dato de
    // prueba y borrarlo seria destruir historia real.
    if (cierres > 0 || chofer._count.ventasExcel > 0) {
      throw new Error(
        `"${chofer.nombre}" tiene ${cierres} cierre(s) y ${chofer._count.ventasExcel} linea(s) de Excel. ` +
          'No se borra automaticamente: desactivelo desde Gestion de Choferes.',
      );
    }

    console.log(
      `  ${chofer.nombre}: ${chofer.turnos.length} turno(s) y ${abonos} abono(s) de prueba`,
    );
    if (!APLICAR) continue;

    await prisma.$transaction(async (tx) => {
      const idsTurno = chofer.turnos.map((t) => t.id);
      await tx.tiquete.deleteMany({ where: { abono: { turnoChoferId: { in: idsTurno } } } });
      await tx.abonoEfectivo.deleteMany({ where: { turnoChoferId: { in: idsTurno } } });
      await tx.turnoChofer.deleteMany({ where: { id: { in: idsTurno } } });
      await tx.eventoAuditoria.deleteMany({ where: { choferId: chofer.id } });
      await tx.chofer.delete({ where: { id: chofer.id } });

      await registrarEvento(tx, {
        tipo: 'CHOFER_DESACTIVADO',
        cajeroId,
        entidadTipo: 'Chofer',
        entidadId: chofer.id,
        detalle: {
          accion: 'PURGA_DATOS_DE_PRUEBA',
          nombre: chofer.nombre,
          turnos: chofer.turnos.length,
          abonos,
        },
      });
    });
  }
}

async function main(): Promise<void> {
  console.log(APLICAR ? 'MODO ESCRITURA\n' : 'SIMULACION: no se escribe nada. Agregue --aplicar.\n');

  const cajeroId = await cajeroResponsable();
  if (!cajeroId) {
    console.log('Aviso: no hay cajero ADMIN, los eventos quedaran sin firma.\n');
  }

  if (PURGAR) {
    console.log('--- Repartidores de prueba ---');
    await purgarDePrueba(cajeroId);
    console.log('');
  }

  console.log('--- Padron real ---');
  const enBase = await prisma.chofer.findMany();

  // En simulacion la purga no borro nada todavia. Si no se descartan aqui, el
  // plan mostraria que a un chofer de prueba se le cambia el nombre por el de
  // un repartidor real, que es justo lo contrario de lo que va a pasar.
  const existentes =
    PURGAR && !APLICAR ? enBase.filter((c) => !DE_PRUEBA.includes(c.nombre)) : enBase;

  const porCodigo = new Map(existentes.map((c) => [c.idMeseroSoftRestaurant, c]));

  let creados = 0;
  let actualizados = 0;
  let sinCambio = 0;

  for (const repartidor of REPARTIDORES) {
    const actual = porCodigo.get(repartidor.idMesero);
    const etiqueta = `${repartidor.idMesero.padEnd(4)} ${repartidor.nombre}`;

    if (!actual) {
      console.log(`  CREA        ${etiqueta}`);
      creados += 1;
      if (APLICAR) {
        await prisma.$transaction(async (tx) => {
          const creado = await tx.chofer.create({
            data: {
              idMeseroSoftRestaurant: repartidor.idMesero,
              nombre: repartidor.nombre,
              nombreNormalizado: normalizarNombre(repartidor.nombre),
              estado: 'ACTIVO',
            },
          });
          await registrarEvento(tx, {
            tipo: 'CHOFER_CREADO',
            cajeroId,
            choferId: creado.id,
            entidadTipo: 'Chofer',
            entidadId: creado.id,
            detalle: {
              origen: 'PADRON_SOFT_RESTAURANT',
              nombre: repartidor.nombre,
              idMesero: repartidor.idMesero,
            },
          });
        });
      }
      continue;
    }

    const cambiaNombre = actual.nombre !== repartidor.nombre;
    const cambiaEstado = actual.estado !== 'ACTIVO';

    if (!cambiaNombre && !cambiaEstado) {
      sinCambio += 1;
      continue;
    }

    console.log(
      `  ACTUALIZA   ${etiqueta}` +
        (cambiaNombre ? ` (antes "${actual.nombre}")` : '') +
        (cambiaEstado ? ' (se reactiva)' : ''),
    );
    actualizados += 1;
    if (APLICAR) {
      await prisma.$transaction(async (tx) => {
        await tx.chofer.update({
          where: { id: actual.id },
          data: {
            nombre: repartidor.nombre,
            nombreNormalizado: normalizarNombre(repartidor.nombre),
            estado: 'ACTIVO',
          },
        });
        await registrarEvento(tx, {
          tipo: 'CHOFER_EDITADO',
          cajeroId,
          choferId: actual.id,
          entidadTipo: 'Chofer',
          entidadId: actual.id,
          detalle: {
            origen: 'PADRON_SOFT_RESTAURANT',
            nombreAnterior: actual.nombre,
            nombreNuevo: repartidor.nombre,
            reactivado: cambiaEstado,
          },
        });
      });
    }
  }

  const codigosDelPadron = new Set(REPARTIDORES.map((r) => r.idMesero));
  const fueraDelPadron = existentes.filter(
    (c) => !codigosDelPadron.has(c.idMeseroSoftRestaurant) && !DE_PRUEBA.includes(c.nombre),
  );

  console.log(
    `\nCreados: ${creados} · Actualizados: ${actualizados} · Sin cambio: ${sinCambio}`,
  );

  if (fueraDelPadron.length > 0) {
    console.log('\nEstan en la base pero no en el padron. No se tocan porque pueden');
    console.log('tener historia contable; deles de baja desde Gestion de Choferes:');
    for (const chofer of fueraDelPadron) {
      console.log(`  ${chofer.idMeseroSoftRestaurant.padEnd(4)} ${chofer.nombre} (${chofer.estado})`);
    }
  }

  // Las cuentas del POS no son personas y no deben estar en la tabla. Si
  // reaparecen, alguien las creo a mano o restauro un respaldo viejo.
  const codigosExcluidos = new Set(CUENTAS_DEL_POS.map((c) => c.idMesero));
  const excluidasPresentes = existentes.filter((c) =>
    codigosExcluidos.has(c.idMeseroSoftRestaurant),
  );
  if (excluidasPresentes.length > 0) {
    console.log('\nAviso: hay cuentas del POS cargadas como repartidor.');
    console.log('No son personas y nadie entrega efectivo por ellas. Conviene quitarlas:');
    for (const cuenta of excluidasPresentes) {
      const motivo = CUENTAS_DEL_POS.find(
        (e) => e.idMesero === cuenta.idMeseroSoftRestaurant,
      )?.motivo;
      console.log(`  ${cuenta.idMeseroSoftRestaurant.padEnd(4)} ${cuenta.nombre} — ${motivo}`);
    }
  }

  if (!APLICAR) console.log('\nNo se escribio nada. Repita con --aplicar.');
}

main()
  .catch((e) => {
    console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

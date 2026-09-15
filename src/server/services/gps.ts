/**
 * Datos del rastreador satelital de una moto.
 *
 * Lo que se vigila no es que la moto TENGA un GPS, sino que alguien haya
 * comprobado hace poco que sigue conectado y con corriente. Uno desenchufado
 * se ve igual que uno funcionando hasta el dia que se roban la moto.
 *
 * Las fotos que lo prueban no viven aqui: son evidencia como cualquier otra y
 * las lleva services/evidencia.ts. Subir una mueve la fecha de revision.
 */

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { normalizarPlaca } from '@/server/services/motos';

export interface DatosGps {
  tieneGps: boolean;
  proveedor?: string | null;
  /** IMEI: los quince digitos que identifican al equipo ante la red. */
  identificador?: string | null;
  /** Correo de la cuenta donde el equipo reporta. */
  correo?: string | null;
  notas?: string | null;
}

/**
 * Guarda los datos del rastreador.
 *
 * Quitar el GPS no borra las fotos: son la prueba de que en su momento estuvo
 * puesto, y esa historia no deberia desaparecer porque alguien desmarque una
 * casilla.
 */
export async function guardarDatosGps(
  placa: string,
  datos: DatosGps,
  cajeroId: string,
): Promise<void> {
  const clave = normalizarPlaca(placa);
  const limpio = (v: string | null | undefined) => (v ?? '').trim() || null;

  const correo = limpio(datos.correo);
  // Comprobacion a proposito floja: lo unico que se quiere atajar es el dedazo
  // evidente. Validar correos a fondo rechaza direcciones validas y raras, y
  // aqui nadie va a mandar un mensaje a esta cuenta desde el sistema.
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', `"${correo}" no parece un correo.`);
  }

  await prisma.$transaction(async (tx) => {
    const moto = await tx.motocicleta.findUnique({ where: { placa: clave } });
    if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${clave}.`);

    await tx.motocicleta.update({
      where: { placa: clave },
      data: {
        tieneGps: datos.tieneGps,
        gpsProveedor: limpio(datos.proveedor),
        gpsIdentificador: limpio(datos.identificador),
        gpsCorreo: correo,
        gpsNotas: limpio(datos.notas),
      },
    });

    await registrarEvento(tx, {
      tipo: 'MOTO_EDITADA',
      cajeroId,
      entidadTipo: 'Motocicleta',
      entidadId: clave,
      detalle: {
        seccion: 'GPS',
        tieneGps: datos.tieneGps,
        proveedor: limpio(datos.proveedor),
      },
    });
  });
}

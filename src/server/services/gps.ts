/**
 * Rastreo satelital de la flota y su evidencia fotografica.
 *
 * El dato que importa no es que la moto tenga un GPS instalado, sino que
 * alguien haya comprobado hace poco que sigue conectado y con corriente. Un
 * rastreador desenchufado se ve igual que uno funcionando hasta el dia que se
 * roban la moto. Por eso cada foto mueve la fecha de revision.
 *
 * POR QUE LA IMAGEN VIVE EN LA BASE
 *
 * Las fotos de los repartidores se escriben en public/, que servia cuando el
 * sistema corria en un solo punto de caja con su disco. En Vercel ese disco
 * es de solo lectura y lo que se escriba desaparece en el siguiente
 * despliegue. Una evidencia que desaparece no es una evidencia.
 */

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import { normalizarPlaca } from '@/server/services/motos';

/**
 * 3 MB por foto.
 *
 * Una foto de celular ronda los 2 MB. El limite es generoso pero acotado: van
 * a la base de datos, que se respalda entera cada noche.
 */
const MAXIMO_BYTES = 3 * 1024 * 1024;

/**
 * Cuantas fotos se conservan por moto.
 *
 * Al pasarse, se borra la mas vieja. Sin este tope, fotografiar el GPS cada
 * semana haria crecer la base sin freno, y la evidencia que interesa es la
 * reciente: que el equipo este conectado HOY.
 */
const MAXIMO_POR_MOTO = 6;

/** Que muestra la foto. */
export const TIPOS_DE_EVIDENCIA = ['CONEXION', 'CORRIENTE', 'OTRO'] as const;
export type TipoEvidencia = (typeof TIPOS_DE_EVIDENCIA)[number];

export const NOMBRE_EVIDENCIA: Record<TipoEvidencia, string> = {
  CONEXION: 'Equipo conectado',
  CORRIENTE: 'Con corriente',
  OTRO: 'Otra evidencia',
};

/**
 * Formatos aceptados, reconocidos por los BYTES del archivo.
 *
 * Ni la extension ni el Content-Type sirven: los dos los controla quien sube
 * el archivo. Estos bytes se devuelven despues con ese tipo declarado, asi que
 * equivocarse aqui seria servir cualquier cosa como si fuera una imagen.
 */
const FIRMAS: ReadonlyArray<{ tipoMime: string; coincide: (b: Buffer) => boolean }> = [
  {
    tipoMime: 'image/jpeg',
    coincide: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    tipoMime: 'image/png',
    coincide: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    tipoMime: 'image/webp',
    coincide: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

function tipoMimeSegunContenido(contenido: Buffer): string {
  const firma = FIRMAS.find((f) => f.coincide(contenido));
  if (!firma) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'El archivo no es una imagen JPG, PNG ni WEBP.',
    );
  }
  return firma.tipoMime;
}

// ---------------------------------------------------------------------------
// Datos del equipo
// ---------------------------------------------------------------------------

export interface DatosGps {
  tieneGps: boolean;
  proveedor?: string | null;
  identificador?: string | null;
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

  await prisma.$transaction(async (tx) => {
    const moto = await tx.motocicleta.findUnique({ where: { placa: clave } });
    if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${clave}.`);

    await tx.motocicleta.update({
      where: { placa: clave },
      data: {
        tieneGps: datos.tieneGps,
        gpsProveedor: limpio(datos.proveedor),
        gpsIdentificador: limpio(datos.identificador),
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

// ---------------------------------------------------------------------------
// Evidencia
// ---------------------------------------------------------------------------

export interface EvidenciaGps {
  id: string;
  placa: string;
  tipo: string;
  descripcion: string | null;
  tomadaEn: Date;
  cajeroNombre: string;
  tipoMime: string;
  /** Peso en bytes, para poder avisar si la base se esta llenando. */
  peso: number;
}

/** Las fotos de una moto, de la mas reciente a la mas vieja. Sin los bytes. */
export async function evidenciaDe(placa: string): Promise<EvidenciaGps[]> {
  const clave = normalizarPlaca(placa);

  const filas = await prisma.fotoGps.findMany({
    where: { placa: clave },
    orderBy: { tomadaEn: 'desc' },
    select: {
      id: true,
      placa: true,
      tipo: true,
      descripcion: true,
      tomadaEn: true,
      tipoMime: true,
      contenido: true,
      cajero: { select: { nombre: true } },
    },
  });

  return filas.map((f) => ({
    id: f.id,
    placa: f.placa,
    tipo: f.tipo,
    descripcion: f.descripcion,
    tomadaEn: f.tomadaEn,
    cajeroNombre: f.cajero.nombre,
    tipoMime: f.tipoMime,
    peso: f.contenido.length,
  }));
}

/** Los bytes de una foto, para la ruta que la sirve. */
export async function bytesDeEvidencia(
  id: string,
): Promise<{ contenido: Buffer; tipoMime: string } | null> {
  const foto = await prisma.fotoGps.findUnique({
    where: { id },
    select: { contenido: true, tipoMime: true },
  });
  if (!foto) return null;
  return { contenido: Buffer.from(foto.contenido), tipoMime: foto.tipoMime };
}

export async function agregarEvidencia(
  entrada: {
    placa: string;
    tipo: TipoEvidencia;
    contenido: Buffer;
    descripcion?: string | null;
  },
  cajeroId: string,
): Promise<{ id: string; sustituidas: number }> {
  const clave = normalizarPlaca(entrada.placa);

  if (entrada.contenido.length === 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La foto llego vacia.');
  }
  if (entrada.contenido.length > MAXIMO_BYTES) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'La foto pesa mas de 3 MB. Tomela de nuevo con menos resolucion.',
    );
  }
  if (!TIPOS_DE_EVIDENCIA.includes(entrada.tipo)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Indique que muestra la foto.');
  }

  const tipoMime = tipoMimeSegunContenido(entrada.contenido);

  return prisma.$transaction(async (tx) => {
    const moto = await tx.motocicleta.findUnique({ where: { placa: clave } });
    if (!moto) throw new ErrorNegocio('DATOS_INVALIDOS', `No existe la moto ${clave}.`);

    const foto = await tx.fotoGps.create({
      data: {
        placa: clave,
        tipo: entrada.tipo,
        contenido: entrada.contenido,
        tipoMime,
        descripcion: (entrada.descripcion ?? '').trim() || null,
        cajeroId,
      },
      select: { id: true },
    });

    // Subir evidencia ES la revision: alguien fue, miro y fotografio.
    await tx.motocicleta.update({
      where: { placa: clave },
      data: { gpsRevisadoEn: new Date(), tieneGps: true },
    });

    // Se conservan las mas recientes; las viejas salen.
    const sobrantes = await tx.fotoGps.findMany({
      where: { placa: clave },
      orderBy: { tomadaEn: 'desc' },
      select: { id: true },
      skip: MAXIMO_POR_MOTO,
    });
    if (sobrantes.length > 0) {
      await tx.fotoGps.deleteMany({ where: { id: { in: sobrantes.map((s) => s.id) } } });
    }

    await registrarEvento(tx, {
      tipo: 'GPS_EVIDENCIA',
      cajeroId,
      entidadTipo: 'FotoGps',
      entidadId: foto.id,
      detalle: { placa: clave, tipo: entrada.tipo, peso: entrada.contenido.length },
    });

    return { id: foto.id, sustituidas: sobrantes.length };
  });
}

export async function borrarEvidencia(id: string, cajeroId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const foto = await tx.fotoGps.findUnique({ where: { id }, select: { placa: true } });
    if (!foto) throw new ErrorNegocio('DATOS_INVALIDOS', 'Esa foto ya no esta.');

    await tx.fotoGps.delete({ where: { id } });

    await registrarEvento(tx, {
      tipo: 'GPS_EVIDENCIA',
      cajeroId,
      entidadTipo: 'FotoGps',
      entidadId: id,
      detalle: { placa: foto.placa, accion: 'BORRADA' },
    });
  });
}

/**
 * Evidencia fotografica de cualquier registro del sistema.
 *
 * Empezo siendo solo del GPS. Despues hizo falta para el cambio de llantas,
 * para el alta de una moto y para cada modificacion. Una sola tabla y un solo
 * servicio evitan repetir tres veces la validacion, la ruta que la sirve y el
 * tope de tamano, con tres oportunidades de que uno se quedara atras.
 *
 * POR QUE LA IMAGEN VIVE EN LA BASE
 *
 * Las fotos se escribian en public/, que servia cuando esto corria en un solo
 * punto de caja con su disco. En Vercel ese disco es de solo lectura y lo que
 * se escriba desaparece en el siguiente despliegue. Una evidencia que
 * desaparece no es una evidencia.
 *
 * A cambio hay que cuidarles el tamano: el navegador las encoge antes de
 * subirlas (ver lib/imagen.ts) y aqui se limita cuantas se guardan por
 * registro.
 */

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';

/** 3 MB. Lo que llega del navegador ya viene encogido; esto es el respaldo. */
const MAXIMO_BYTES = 3 * 1024 * 1024;

/**
 * A que se le puede adjuntar evidencia, y cuantas fotos se conservan.
 *
 * El GPS y la moto rotan: lo que importa es el estado de hoy, no el album
 * completo, y sin tope fotografiar el equipo cada semana engordaria la base
 * sin freno.
 *
 * El gasto NO rota. Es un hecho puntual y su foto es el comprobante de que se
 * hizo: borrarla porque llegaron otras seria perder justo lo que se guardo
 * para poder demostrarlo despues.
 */
export const ENTIDADES = {
  MOTOCICLETA: { maximo: 6, rota: true },
  GPS: { maximo: 6, rota: true },
  GASTO: { maximo: 4, rota: false },
} as const;

export type TipoEntidad = keyof typeof ENTIDADES;

/** Que muestra la foto, segun a que este adjunta. */
export const TIPOS_DE_FOTO: Record<TipoEntidad, ReadonlyArray<{ valor: string; etiqueta: string; icono: string; nota: string }>> = {
  GPS: [
    { valor: 'CONEXION', etiqueta: 'Conectado', icono: '🔌', nota: 'El equipo en su sitio, con el arnes puesto.' },
    { valor: 'CORRIENTE', etiqueta: 'Con corriente', icono: '💡', nota: 'La luz encendida, o la plataforma reportando.' },
    { valor: 'OTRO', etiqueta: 'Otra', icono: '📷', nota: 'Cualquier otra cosa que valga anotar.' },
  ],
  MOTOCICLETA: [
    { valor: 'ESTADO', etiqueta: 'Como esta', icono: '🏍️', nota: 'La moto completa, para dejar constancia de como se recibio.' },
    { valor: 'ODOMETRO', etiqueta: 'Odometro', icono: '🔢', nota: 'El tablero marcando el kilometraje.' },
    { valor: 'DANO', etiqueta: 'Dano', icono: '⚠️', nota: 'Un golpe, una pieza rota, algo que reclamar despues.' },
    { valor: 'OTRO', etiqueta: 'Otra', icono: '📷', nota: 'Cualquier otra cosa que valga anotar.' },
  ],
  GASTO: [
    { valor: 'ANTES', etiqueta: 'Antes', icono: '🔧', nota: 'La pieza gastada, la llanta lisa, el aceite sucio.' },
    { valor: 'DESPUES', etiqueta: 'Despues', icono: '✅', nota: 'El trabajo terminado, la pieza nueva puesta.' },
    { valor: 'FACTURA', etiqueta: 'Factura', icono: '🧾', nota: 'El comprobante del taller o de la gasolinera.' },
    { valor: 'ODOMETRO', etiqueta: 'Odometro', icono: '🔢', nota: 'El tablero al momento del servicio.' },
  ],
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
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El archivo no es una imagen JPG, PNG ni WEBP.');
  }
  return firma.tipoMime;
}

export interface Evidencia {
  id: string;
  entidadTipo: string;
  entidadId: string;
  tipo: string;
  descripcion: string | null;
  tomadaEn: Date;
  cajeroNombre: string;
  tipoMime: string;
  /** Peso en bytes, para poder avisar si la base se esta llenando. */
  peso: number;
}

/** Las fotos de un registro, de la mas reciente a la mas vieja. */
export async function evidenciaDe(
  entidadTipo: TipoEntidad,
  entidadId: string,
): Promise<Evidencia[]> {
  const filas = await prisma.evidencia.findMany({
    where: { entidadTipo, entidadId },
    orderBy: { tomadaEn: 'desc' },
    select: {
      id: true,
      entidadTipo: true,
      entidadId: true,
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
    entidadTipo: f.entidadTipo,
    entidadId: f.entidadId,
    tipo: f.tipo,
    descripcion: f.descripcion,
    tomadaEn: f.tomadaEn,
    cajeroNombre: f.cajero.nombre,
    tipoMime: f.tipoMime,
    peso: f.contenido.length,
  }));
}

/**
 * Cuantas fotos tiene cada registro de una lista, sin traer los bytes.
 *
 * Sirve para pintar "3 fotos" en una tabla sin cargar las imagenes de todas
 * las filas, que es lo que pasaria pidiendolas una por una.
 */
export async function conteoDeEvidencia(
  entidadTipo: TipoEntidad,
  entidadIds: string[],
): Promise<Record<string, number>> {
  if (entidadIds.length === 0) return {};

  const filas = await prisma.evidencia.groupBy({
    by: ['entidadId'],
    where: { entidadTipo, entidadId: { in: entidadIds } },
    _count: { _all: true },
  });

  return Object.fromEntries(filas.map((f) => [f.entidadId, f._count._all]));
}

/** Los bytes de una foto, para la ruta que la sirve. */
export async function bytesDeEvidencia(
  id: string,
): Promise<{ contenido: Buffer; tipoMime: string } | null> {
  const foto = await prisma.evidencia.findUnique({
    where: { id },
    select: { contenido: true, tipoMime: true },
  });
  if (!foto) return null;
  return { contenido: Buffer.from(foto.contenido), tipoMime: foto.tipoMime };
}

export interface EntradaEvidencia {
  entidadTipo: TipoEntidad;
  entidadId: string;
  tipo: string;
  contenido: Buffer;
  descripcion?: string | null;
}

export async function agregarEvidencia(
  entrada: EntradaEvidencia,
  cajeroId: string,
): Promise<{ foto: Evidencia; sustituidas: number }> {
  const configuracion = ENTIDADES[entrada.entidadTipo];
  if (!configuracion) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'No se sabe a que adjuntar esa foto.');
  }

  if (entrada.contenido.length === 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La foto llego vacia.');
  }
  if (entrada.contenido.length > MAXIMO_BYTES) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'La foto pesa demasiado. Tomela de nuevo con menos resolucion.',
    );
  }

  const permitidos = TIPOS_DE_FOTO[entrada.entidadTipo].map((t) => t.valor);
  if (!permitidos.includes(entrada.tipo)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Indique que muestra la foto.');
  }

  const tipoMime = tipoMimeSegunContenido(entrada.contenido);

  return prisma.$transaction(async (tx) => {
    const foto = await tx.evidencia.create({
      data: {
        entidadTipo: entrada.entidadTipo,
        entidadId: entrada.entidadId,
        tipo: entrada.tipo,
        contenido: entrada.contenido,
        tipoMime,
        descripcion: (entrada.descripcion ?? '').trim() || null,
        cajeroId,
      },
      select: { id: true, tomadaEn: true, cajero: { select: { nombre: true } } },
    });

    let sustituidas = 0;
    if (configuracion.rota) {
      const sobrantes = await tx.evidencia.findMany({
        where: { entidadTipo: entrada.entidadTipo, entidadId: entrada.entidadId },
        orderBy: { tomadaEn: 'desc' },
        select: { id: true },
        skip: configuracion.maximo,
      });
      if (sobrantes.length > 0) {
        await tx.evidencia.deleteMany({ where: { id: { in: sobrantes.map((s) => s.id) } } });
        sustituidas = sobrantes.length;
      }
    } else {
      const cuantas = await tx.evidencia.count({
        where: { entidadTipo: entrada.entidadTipo, entidadId: entrada.entidadId },
      });
      if (cuantas > configuracion.maximo) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          `Este registro ya tiene ${configuracion.maximo} fotos. Borre una antes de agregar otra.`,
        );
      }
    }

    // Subir evidencia del GPS ES la revision: alguien fue, miro y fotografio.
    if (entrada.entidadTipo === 'GPS') {
      await tx.motocicleta.update({
        where: { placa: entrada.entidadId },
        data: { gpsRevisadoEn: new Date(), tieneGps: true },
      });
    }

    await registrarEvento(tx, {
      tipo: 'EVIDENCIA',
      cajeroId,
      entidadTipo: entrada.entidadTipo,
      entidadId: entrada.entidadId,
      detalle: { tipo: entrada.tipo, peso: entrada.contenido.length },
    });

    return {
      foto: {
        id: foto.id,
        entidadTipo: entrada.entidadTipo,
        entidadId: entrada.entidadId,
        tipo: entrada.tipo,
        descripcion: (entrada.descripcion ?? '').trim() || null,
        tomadaEn: foto.tomadaEn,
        cajeroNombre: foto.cajero.nombre,
        tipoMime,
        peso: entrada.contenido.length,
      },
      sustituidas,
    };
  });
}

export async function borrarEvidencia(id: string, cajeroId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const foto = await tx.evidencia.findUnique({
      where: { id },
      select: { entidadTipo: true, entidadId: true },
    });
    if (!foto) throw new ErrorNegocio('DATOS_INVALIDOS', 'Esa foto ya no esta.');

    await tx.evidencia.delete({ where: { id } });

    await registrarEvento(tx, {
      tipo: 'EVIDENCIA',
      cajeroId,
      entidadTipo: foto.entidadTipo,
      entidadId: foto.entidadId,
      detalle: { accion: 'BORRADA' },
    });
  });
}

/**
 * Quita la evidencia de un registro que deja de existir.
 *
 * Como la evidencia apunta por tipo e identificador y no por llave foranea, la
 * base no la borra sola. Sin esto quedarian fotos huerfanas ocupando lugar y
 * apuntando a algo que ya no esta.
 */
export async function borrarEvidenciaDe(
  entidadTipo: TipoEntidad,
  entidadId: string,
): Promise<number> {
  const { count } = await prisma.evidencia.deleteMany({ where: { entidadTipo, entidadId } });
  return count;
}

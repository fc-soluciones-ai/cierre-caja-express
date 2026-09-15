/**
 * Fotos de los repartidores.
 *
 * POR QUE VIVEN EN LA BASE Y NO EN UN ARCHIVO
 *
 * La primera version las escribia en public/, que servia cuando el sistema
 * corria en un solo punto de caja con su disco. Al publicarlo en Vercel eso
 * dejo de funcionar: ahi el disco es de solo lectura, y aunque se pudiera
 * escribir, lo escrito desaparece en el siguiente despliegue. La foto se subia
 * en el local y el encargado no la veia desde la oficina.
 *
 * Ahora los bytes van a la tabla fotos_chofer, en una fila aparte de la del
 * repartidor para que listar el padron no arrastre las imagenes de todos.
 *
 * El tipo de archivo se decide por los BYTES, no por la extension ni por el
 * Content-Type que declare el navegador. Los dos los controla quien sube el
 * archivo, y esos bytes se devuelven despues con el tipo que aqui se decida.
 */

import { randomBytes } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { ErrorNegocio } from '@/server/errores';

/** 3 MB. Una foto de carnet no llega ni cerca, y estas van al respaldo. */
const MAXIMO_BYTES = 3 * 1024 * 1024;

/** Firmas de los formatos aceptados, comprobadas sobre el contenido real. */
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

/**
 * Guarda la foto y devuelve la direccion donde pedirla.
 *
 * La direccion lleva un sufijo aleatorio que cambia en cada reemplazo. Sin el,
 * el navegador seguiria mostrando la foto anterior desde su cache, porque la
 * direccion seria la misma de siempre.
 */
export async function guardarFotoChofer(
  choferId: string,
  contenido: Buffer,
): Promise<string> {
  if (contenido.length === 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La foto llego vacia.');
  }
  if (contenido.length > MAXIMO_BYTES) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'La foto pesa mas de 3 MB. Tomela de nuevo con menos resolucion.',
    );
  }

  const tipoMime = tipoMimeSegunContenido(contenido);

  await prisma.fotoChofer.upsert({
    where: { choferId },
    create: { choferId, contenido, tipoMime },
    update: { contenido, tipoMime, actualizadaEn: new Date() },
  });

  return `/api/choferes/${choferId}/foto?v=${randomBytes(4).toString('hex')}`;
}

/** Los bytes de una foto, para la ruta que la sirve. */
export async function bytesDeFotoChofer(
  choferId: string,
): Promise<{ contenido: Buffer; tipoMime: string } | null> {
  const foto = await prisma.fotoChofer.findUnique({
    where: { choferId },
    select: { contenido: true, tipoMime: true },
  });
  if (!foto) return null;
  return { contenido: Buffer.from(foto.contenido), tipoMime: foto.tipoMime };
}

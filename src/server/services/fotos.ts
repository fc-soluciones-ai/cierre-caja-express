/**
 * Fotos de los repartidores.
 *
 * Se guardan en public/choferes para que el navegador las sirva directo, sin
 * pasar por una ruta de la aplicacion. En un punto de caja no hay CDN ni
 * almacenamiento de objetos: hay un disco.
 *
 * El tipo de archivo se decide por los BYTES, no por la extension ni por el
 * Content-Type que declare el navegador. Ambos los controla quien sube el
 * archivo, y esta carpeta la sirve el servidor web tal cual.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ErrorNegocio } from '@/server/errores';

const DIRECTORIO = path.join(process.cwd(), 'public', 'choferes');
const RUTA_PUBLICA = '/choferes';

/** 4 MB. Una foto de carnet no llega ni cerca. */
const MAXIMO_BYTES = 4 * 1024 * 1024;

/** Firmas de los formatos aceptados, comprobadas sobre el contenido real. */
const FIRMAS: ReadonlyArray<{
  extension: string;
  coincide: (b: Buffer) => boolean;
}> = [
  {
    extension: '.jpg',
    coincide: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    extension: '.png',
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
    extension: '.webp',
    coincide: (b) =>
      b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

function extensionSegunContenido(contenido: Buffer): string {
  const firma = FIRMAS.find((f) => f.coincide(contenido));
  if (!firma) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'El archivo no es una imagen JPG, PNG ni WEBP.',
    );
  }
  return firma.extension;
}

/**
 * Guarda la foto y devuelve la ruta publica.
 *
 * El nombre lleva un sufijo aleatorio para que al reemplazar la foto de un
 * repartidor el navegador no siga mostrando la anterior desde su cache.
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
      'La foto pesa mas de 4 MB. Use una imagen mas pequena.',
    );
  }

  const extension = extensionSegunContenido(contenido);
  // choferId es un cuid generado por la base, no texto del usuario, pero el
  // basename evita cualquier duda sobre travesia de rutas.
  const nombre = `${path.basename(choferId)}-${randomBytes(4).toString('hex')}${extension}`;

  await mkdir(DIRECTORIO, { recursive: true });
  await writeFile(path.join(DIRECTORIO, nombre), contenido);

  return `${RUTA_PUBLICA}/${nombre}`;
}

/**
 * Borra una foto anterior. Falla en silencio: que quede un archivo huerfano
 * es preferible a que la edicion del repartidor se caiga por esto.
 */
export async function borrarFotoChofer(rutaPublica: string | null): Promise<void> {
  if (!rutaPublica || !rutaPublica.startsWith(`${RUTA_PUBLICA}/`)) return;
  const nombre = path.basename(rutaPublica);
  try {
    await unlink(path.join(DIRECTORIO, nombre));
  } catch {
    // El archivo ya no estaba. No hay nada que hacer.
  }
}

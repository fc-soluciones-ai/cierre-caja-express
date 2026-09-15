/**
 * Encoge una foto en el navegador antes de subirla.
 *
 * Una camara de celular entrega 4000 x 3000 y tres o cuatro megabytes. Eso se
 * muestra despues en un cuadro de 96 pixeles, o en una miniatura de evidencia.
 * Subir el original es gastar la red del local, llenar la base de datos y
 * hacer esperar a quien esta en el mostrador, para tirar el 99 % de los
 * pixeles al dibujarlos.
 *
 * Encogiendo aqui, una foto de 3,5 MB baja a unos 200 KB y deja de chocar con
 * el limite del servidor. El limite del servidor se queda igual: es la ultima
 * defensa contra lo que no pase por esta funcion.
 *
 * Si algo falla se devuelve el archivo original. Una foto grande que el
 * servidor quiza rechace es mejor que ninguna foto y un error raro.
 */

/** Lado mayor de la imagen que se sube. Suficiente para leer una etiqueta. */
const LADO_MAXIMO = 1600;

/** Calidad del JPEG. Por encima de 0,85 el archivo crece sin verse mejor. */
const CALIDAD = 0.85;

export async function encogerImagen(archivo: File): Promise<File> {
  // Lo que no es imagen no se toca: el servidor lo rechazara por sus bytes.
  if (!archivo.type.startsWith('image/')) return archivo;

  try {
    // from-image respeta la orientacion que anota la camara. Sin esto, las
    // fotos verticales quedan acostadas.
    const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });

    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const pincel = lienzo.getContext('2d');
    if (!pincel) return archivo;
    pincel.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolver) =>
      lienzo.toBlob(resolver, 'image/jpeg', CALIDAD),
    );
    if (!blob) return archivo;

    // Si el original ya era mas liviano, se deja. Pasa con las imagenes que
    // alguien recorto antes, o con capturas de pantalla pequenas.
    if (blob.size >= archivo.size) return archivo;

    return new File([blob], nombreJpg(archivo.name), { type: 'image/jpeg' });
  } catch {
    return archivo;
  }
}

function nombreJpg(nombre: string): string {
  const sinExtension = nombre.replace(/\.[^.]+$/, '');
  return `${sinExtension || 'foto'}.jpg`;
}

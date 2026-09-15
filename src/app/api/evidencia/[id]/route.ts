/**
 * Sirve una foto de evidencia desde la base de datos.
 *
 * Existe porque las imagenes no son archivos: viven en la tabla evidencias,
 * para que sobrevivan a un despliegue y viajen en el respaldo. Ver
 * services/evidencia.ts.
 *
 * Exige sesion. Estas fotos muestran donde va escondido el rastreador de una
 * moto, el estado en que se recibio, o la factura de un taller; no son algo
 * que deba poder ver cualquiera que de con la direccion.
 */

import { NextResponse } from 'next/server';

import { bytesDeEvidencia } from '@/server/services/evidencia';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export async function GET(
  _peticion: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const cajero = await cajeroDeSesion();
  if (!cajero) return new NextResponse('No autorizado', { status: 401 });

  const foto = await bytesDeEvidencia(params.id);
  if (!foto) return new NextResponse('No existe', { status: 404 });

  return new NextResponse(new Uint8Array(foto.contenido), {
    headers: {
      'Content-Type': foto.tipoMime,
      'Content-Length': String(foto.contenido.length),
      // La imagen nunca cambia: el id es de esa foto y de ninguna otra. Se
      // guarda solo en el navegador, no en un intermediario compartido.
      'Cache-Control': 'private, max-age=31536000, immutable',
      // Un navegador que decidiera adivinar el tipo podria interpretar como
      // HTML algo que se subio con apariencia de imagen.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

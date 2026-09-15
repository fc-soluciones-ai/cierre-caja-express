/**
 * Sirve la foto de un repartidor desde la base de datos.
 *
 * Las imagenes ya no son archivos en public/: en Vercel ese disco es de solo
 * lectura y lo que se escriba desaparece en el siguiente despliegue. Ver
 * services/fotos.ts.
 *
 * Exige sesion, igual que cualquier otra pantalla: es la cara de un empleado
 * del negocio, no algo que deba ver quien de con la direccion.
 */

import { NextResponse } from 'next/server';

import { bytesDeFotoChofer } from '@/server/services/fotos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export async function GET(
  _peticion: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const cajero = await cajeroDeSesion();
  if (!cajero) return new NextResponse('No autorizado', { status: 401 });

  const foto = await bytesDeFotoChofer(params.id);
  if (!foto) return new NextResponse('No existe', { status: 404 });

  return new NextResponse(new Uint8Array(foto.contenido), {
    headers: {
      'Content-Type': foto.tipoMime,
      'Content-Length': String(foto.contenido.length),
      // La direccion cambia al reemplazar la foto, asi que lo que hay en esta
      // se puede guardar sin miedo. Solo en el navegador de quien la pidio.
      'Cache-Control': 'private, max-age=31536000, immutable',
      // Un navegador que adivinara el tipo podria interpretar como HTML algo
      // que se subio con apariencia de imagen.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

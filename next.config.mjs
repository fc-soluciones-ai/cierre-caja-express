/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // La app corre en un punto de caja, no detras de un CDN: las imagenes de los
  // repartidores se sirven desde public/ sin optimizacion remota.
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      // Los reportes de Soft Restaurant rondan los 100 KB, pero un mes
      // completo de detallado puede pasar el limite de 1 MB por defecto y el
      // error que da Next en ese caso no dice nada util al cajero.
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;

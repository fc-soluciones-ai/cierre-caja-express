/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El servidor de demostracion corre a la vez que el de trabajo. Dos
  // instancias de Next escribiendo la misma carpeta se traban a medio
  // compilar, asi que la demostracion usa la suya. Ver scripts/dev-demo.ts.
  distDir: process.env.CARPETA_BUILD ?? '.next',
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

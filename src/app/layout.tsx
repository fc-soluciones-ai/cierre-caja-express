import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Cierre Caja Express',
  description: 'Abonos parciales y cierre de turno de repartidores',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // El monitor de caja no se pellizca ni se acerca: un zoom accidental a media
  // noche deja la pantalla inservible hasta que alguien sepa deshacerlo.
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b1120',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CR">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

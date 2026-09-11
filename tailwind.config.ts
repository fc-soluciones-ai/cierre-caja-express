import type { Config } from 'tailwindcss';

/**
 * La paleta y las medidas estan pensadas para un monitor tactil de mostrador:
 * fondo oscuro para no encandilar en un local con poca luz, texto grande y
 * objetivos de al menos 64 px, que es lo que mide un dedo con guante.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fondo: '#0b1120',
        panel: '#111c33',
        panelClaro: '#1a2947',
        borde: '#24365c',
        entrada: '#22c55e', // dinero que entra
        alerta: '#f43f5e', // faltante
        aviso: '#f59e0b', // sobrante y advertencias
      },
      spacing: {
        tactil: '4rem', // 64 px, minimo de un objetivo tactil
      },
      fontSize: {
        cifra: ['2.75rem', { lineHeight: '1', fontWeight: '700' }],
        cifraGrande: ['4rem', { lineHeight: '1', fontWeight: '800' }],
      },
    },
  },
  plugins: [],
};

export default config;

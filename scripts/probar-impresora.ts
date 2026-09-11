/**
 * Prueba de impresion y muestrario de plantillas.
 *
 *   npm run print:probar            muestra las cuatro plantillas en consola
 *   npm run print:probar -- enviar  ademas las manda a la impresora
 *
 * Sirve para ajustar el papel y comprobar que los acentos salen bien antes de
 * poner el sistema en la caja.
 */

import { aEscPos, aTextoPlano, type DocumentoTiquete } from '@/lib/print/documento';
import { imprimirDocumento, probarImpresora } from '@/lib/print/impresora';
import {
  tiqueteAbono,
  tiqueteArqueo,
  tiqueteCierreChofer,
  tiqueteCierreGrupal,
} from '@/lib/print/plantillas';

const AHORA = new Date();

const MUESTRAS: Array<{ nombre: string; documento: DocumentoTiquete }> = [
  {
    nombre: 'Abono parcial',
    documento: tiqueteAbono({
      abonoId: 'abono-de-muestra',
      chofer: { nombre: 'Antonio Rojas', idMeseroSoftRestaurant: '12' },
      montoAbonado: 1_500_000,
      saldoAcumuladoTurno: 2_300_000,
      cantidadAbonosTurno: 2,
      cajero: 'Karla (Caja 1)',
      dispositivo: 'CAJA-1',
      timestamp: AHORA,
    }),
  },
  {
    nombre: 'Cierre de turno con faltante',
    documento: tiqueteCierreChofer({
      cierreId: 'cierre-de-muestra',
      chofer: { nombre: 'Maria Fernandez', idMeseroSoftRestaurant: '7' },
      turno: { fechaApertura: new Date(AHORA.getTime() - 6 * 3600 * 1000), fechaCierre: AHORA },
      efectivoEsperado: 1_200_000,
      tarjetaEsperada: 450_000,
      sinpeEsperado: 650_000,
      viajesTotales: 14,
      abonosParciales: 1_000_000,
      cantidadAbonos: 3,
      efectivoEntregado: 100_000,
      diferencia: -100_000,
      cajero: 'Karla (Caja 1)',
      archivos: [
        { nombreArchivo: 'blanco-hoy.xls', tipoReporte: 'BLANCO', tipoCorte: 'TOTAL' },
        { nombreArchivo: 'negro-hoy.xls', tipoReporte: 'NEGRO', tipoCorte: 'TOTAL' },
      ],
      observacion: 'Reporta un pedido cobrado de menos.',
    }),
  },
  {
    nombre: 'Arqueo de caja',
    documento: tiqueteArqueo({
      arqueoId: 'arqueo-de-muestra',
      efectivoTeoricoCaja: 5_300_000,
      efectivoRealContado: 5_300_000,
      diferenciaCaja: 0,
      desglose: { 2_000_000: 2, 1_000_000: 1, 100_000: 3 },
      cajero: 'Karla (Caja 1)',
      timestamp: AHORA,
      diaOperativo: '2026-09-10',
    }),
  },
  {
    nombre: 'Cierre grupal',
    documento: tiqueteCierreGrupal({
      referencia: 'grupal-de-muestra',
      diaOperativo: '2026-09-10',
      cajero: 'Karla (Caja 1)',
      timestamp: AHORA,
      choferes: [
        {
          nombre: 'Antonio Rojas',
          efectivoEsperado: 3_100_000,
          totalRecibido: 3_100_000,
          diferencia: 0,
          viajes: 7,
        },
        {
          nombre: 'Maria Fernandez',
          efectivoEsperado: 1_200_000,
          totalRecibido: 1_100_000,
          diferencia: -100_000,
          viajes: 3,
        },
      ],
      arqueo: {
        efectivoTeoricoCaja: 4_200_000,
        efectivoRealContado: 4_100_000,
        diferenciaCaja: -100_000,
      },
    }),
  },
];

async function main(): Promise<void> {
  const enviar = process.argv.includes('enviar');

  for (const muestra of MUESTRAS) {
    const texto = aTextoPlano(muestra.documento);
    const bytes = aEscPos(muestra.documento);
    const anchoMaximo = Math.max(...texto.split('\n').map((l) => l.length));

    console.log(`\n${'='.repeat(48)}`);
    console.log(`  ${muestra.nombre}  (${bytes.length} bytes ESC/POS)`);
    console.log('='.repeat(48));
    console.log(texto);
    console.log('='.repeat(48));
    if (anchoMaximo > muestra.documento.ancho) {
      console.log(`ATENCION: una linea mide ${anchoMaximo} caracteres y el papel admite ${muestra.documento.ancho}.`);
    }

    if (enviar) {
      const resultado = await imprimirDocumento(muestra.documento);
      console.log(
        resultado.ok
          ? `Enviado a la impresora (modo ${resultado.modo}).`
          : `No se pudo imprimir: ${resultado.error}`,
      );
    }
  }

  if (enviar) {
    const prueba = await probarImpresora();
    console.log(
      prueba.ok
        ? `\nPrueba de conectividad correcta (modo ${prueba.modo}).`
        : `\nLa impresora no respondio: ${prueba.error}`,
    );
  } else {
    console.log('\nVista previa unicamente. Agregue "-- enviar" para imprimir de verdad.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

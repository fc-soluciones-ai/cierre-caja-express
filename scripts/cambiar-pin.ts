/**
 * Cambia el PIN de un cajero.
 *
 *   npm run pin
 *   npm run pin -- --cajero "Administrador"
 *
 * El PIN se teclea en la terminal y no se muestra en pantalla. Nunca se pasa
 * como argumento del comando a proposito: los argumentos quedan en el
 * historial del shell y los ve cualquiera que ejecute "history".
 *
 * Lo que se guarda es la derivacion scrypt, nunca el PIN. Ver pin.ts.
 */

import { createInterface } from 'node:readline';

import { prisma } from '../src/lib/db/prisma';
import {
  hashearPin,
  motivoPinInvalido,
  verificarPin,
  LARGO_MAXIMO_PIN,
  LARGO_MINIMO_PIN,
} from '../src/server/services/pin';
import { registrarEvento } from '../src/server/services/auditoria';
import { revocarSesionesDe } from '../src/server/services/sesion';

/**
 * Lee de la terminal sin mostrar lo tecleado.
 *
 * readline escribe cada caracter en la salida; aqui se intercepta el metodo
 * para que solo pinte la pregunta y nada mas. Es lo mismo que hace sudo.
 */
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolver) => {
    const salida = process.stdout;
    const lector = createInterface({ input: process.stdin, output: salida, terminal: true });

    let silenciado = false;
    const escribirOriginal = salida.write.bind(salida);
    (lector as unknown as { _writeToOutput: (texto: string) => void })._writeToOutput = (
      texto: string,
    ) => {
      if (!silenciado) escribirOriginal(texto);
    };

    lector.question(pregunta, (respuesta) => {
      lector.close();
      escribirOriginal('\n');
      resolver(respuesta.trim());
    });
    silenciado = true;
  });
}

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Lee el PIN de la entrada estandar, para cuando no hay terminal.
 *
 * Se pide de forma explicita con --desde-stdin. Sin esa bandera el comando
 * sigue exigiendo terminal, para que nadie lo corra por accidente dentro de
 * otro script y despues no sepa por que la caja no lo deja entrar.
 *
 * Por la entrada estandar y no por un argumento: los argumentos quedan en el
 * historial del shell, lo que llega por una tuberia no.
 */
function leerDeStdin(): Promise<string> {
  return new Promise((resolver, rechazar) => {
    let texto = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (trozo) => {
      texto += trozo;
    });
    process.stdin.on('end', () => resolver(texto.split(/\r?\n/)[0]?.trim() ?? ''));
    process.stdin.on('error', rechazar);
  });
}

async function main(): Promise<void> {
  const porTuberia = process.argv.includes('--desde-stdin');

  if (!process.stdin.isTTY && !porTuberia) {
    throw new Error(
      'Este comando necesita una terminal interactiva. Abralo en PowerShell o en la consola.\n' +
        '  Si de verdad lo necesita dentro de otro script, pase el PIN por la entrada\n' +
        '  estandar y agregue --desde-stdin.',
    );
  }

  const nombreBuscado = argumento('cajero');
  const cajero = nombreBuscado
    ? await prisma.cajero.findFirst({ where: { nombre: nombreBuscado } })
    : await prisma.cajero.findFirst({ where: { rol: 'ADMIN' }, orderBy: { createdAt: 'asc' } });

  if (!cajero) {
    const todos = await prisma.cajero.findMany({ select: { nombre: true, rol: true } });
    throw new Error(
      `No se encontro ese cajero. Los registrados son: ${
        todos.map((c) => `${c.nombre} (${c.rol})`).join(', ') || 'ninguno'
      }`,
    );
  }

  console.log(`Cambiando el PIN de: ${cajero.nombre} (${cajero.rol})\n`);

  const nuevo = porTuberia
    ? await leerDeStdin()
    : await preguntarOculto(`PIN nuevo (${LARGO_MINIMO_PIN} a ${LARGO_MAXIMO_PIN} digitos): `);

  const motivo = motivoPinInvalido(nuevo);
  if (motivo) throw new Error(motivo);

  if (verificarPin(nuevo, cajero.pin)) {
    throw new Error('Ese ya es el PIN actual. No se cambio nada.');
  }

  if (!porTuberia) {
    const confirmacion = await preguntarOculto('Repitalo para confirmar: ');
    if (confirmacion !== nuevo) {
      throw new Error('Los dos PIN no coinciden. No se cambio nada.');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.cajero.update({ where: { id: cajero.id }, data: { pin: hashearPin(nuevo) } });
    // Queda constancia del cambio, nunca del PIN. Con tipo propio: marcarlo
    // como edicion de chofer ensuciaba el historial de los repartidores con
    // algo que no tiene nada que ver con ellos.
    await registrarEvento(tx, {
      tipo: 'PIN_CAMBIADO',
      cajeroId: cajero.id,
      entidadTipo: 'Cajero',
      entidadId: cajero.id,
      detalle: { cajero: cajero.nombre },
    });
  });

  // Quien tenga la caja abierta con el PIN viejo queda fuera. Sin esto el
  // cambio no sirve de nada contra alguien que ya entro.
  const cerradas = await revocarSesionesDe(cajero.id);

  console.log(`\nPIN de ${cajero.nombre} cambiado.`);
  if (cerradas > 0) {
    console.log(`Se cerraron ${cerradas} sesion(es) que estaban abiertas.`);
  }
  console.log('Entre de nuevo en la caja con el PIN nuevo.');
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

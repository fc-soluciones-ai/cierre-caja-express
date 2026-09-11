/**
 * Documento de tiquete: una descripcion de bloques independiente de la
 * impresora, que se puede renderizar a texto plano para previsualizar en
 * pantalla y a bytes ESC/POS para imprimir.
 *
 * Se guarda ESTE documento en la tabla tiquetes, no los bytes ni los datos de
 * origen. Los bytes no se pueden mostrar en pantalla; los datos de origen
 * harian que una reimpresion saliera distinta si manana cambia la plantilla.
 */

/** Ancho util en caracteres de una impresora de 80 mm con fuente A. */
export const ANCHO_80MM = 48;

export type BloqueTiquete =
  | { t: 'titulo'; texto: string }
  | { t: 'subtitulo'; texto: string }
  | { t: 'centrado'; texto: string; negrita?: boolean }
  | { t: 'linea'; texto: string; negrita?: boolean }
  | { t: 'par'; etiqueta: string; valor: string; negrita?: boolean }
  | { t: 'parGrande'; etiqueta: string; valor: string }
  | { t: 'destacado'; texto: string }
  | { t: 'separador'; caracter?: string }
  | { t: 'espacio'; lineas?: number }
  | { t: 'firma'; etiqueta: string };

export interface DocumentoTiquete {
  /** Version del formato, por si el modelo de bloques cambia mas adelante. */
  v: 1;
  ancho: number;
  bloques: BloqueTiquete[];
  /** Abrir el cajon de dinero al imprimir. */
  abrirCajon?: boolean;
}

// ---------------------------------------------------------------------------
// Texto imprimible
// ---------------------------------------------------------------------------

/**
 * Las impresoras termicas no tienen el simbolo del colon (U+20A1) en ninguna
 * pagina de codigos habitual, y los caracteres fuera de CP1252 salen como
 * basura. Por eso los tiquetes declaran la moneda en el encabezado y los
 * montos van sin simbolo. Esta funcion es la red de seguridad.
 */
const REEMPLAZOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/₡/g, 'C'], // colon
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/[–—]/g, '-'],
  [/…/g, '...'],
  [/\u00a0|\u202f|\u2009/g, ' '],
];

export function transliterar(texto: string): string {
  let salida = texto;
  for (const [patron, reemplazo] of REEMPLAZOS) {
    salida = salida.replace(patron, reemplazo);
  }
  // Todo lo que no exista en CP1252 se descarta antes de llegar a la impresora.
  return salida.replace(/[^\u0020-\u00ff]/g, '?');
}

function centrar(texto: string, ancho: number): string {
  const t = texto.length > ancho ? texto.slice(0, ancho) : texto;
  const izquierda = Math.max(0, Math.floor((ancho - t.length) / 2));
  return ' '.repeat(izquierda) + t;
}

/**
 * Etiqueta a la izquierda, valor pegado a la derecha. Si no caben en una
 * linea, el valor baja a la siguiente alineado a la derecha, que es lo que
 * mantiene legible una columna de montos.
 */
function parEnLinea(etiqueta: string, valor: string, ancho: number): string[] {
  const espacios = ancho - etiqueta.length - valor.length;
  if (espacios >= 1) {
    return [etiqueta + ' '.repeat(espacios) + valor];
  }
  return [etiqueta.slice(0, ancho), valor.padStart(ancho).slice(-ancho)];
}

function partirEnLineas(texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter((p) => p !== '');
  if (palabras.length === 0) return [''];
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    if (actual === '') {
      actual = palabra.slice(0, ancho);
    } else if (actual.length + 1 + palabra.length <= ancho) {
      actual += ` ${palabra}`;
    } else {
      lineas.push(actual);
      actual = palabra.slice(0, ancho);
    }
  }
  if (actual !== '') lineas.push(actual);
  return lineas;
}

/** Render a texto plano, para previsualizar en pantalla y para pruebas. */
export function aTextoPlano(documento: DocumentoTiquete): string {
  const ancho = documento.ancho;
  const lineas: string[] = [];

  for (const bloque of documento.bloques) {
    switch (bloque.t) {
      case 'titulo':
      case 'destacado':
        // Se imprimen a doble ancho, asi que ocupan la mitad de columnas.
        lineas.push(centrar(bloque.texto.toUpperCase(), ancho));
        break;
      case 'subtitulo':
        lineas.push(centrar(bloque.texto, ancho));
        break;
      case 'centrado':
        for (const l of partirEnLineas(bloque.texto, ancho)) lineas.push(centrar(l, ancho));
        break;
      case 'linea':
        for (const l of partirEnLineas(bloque.texto, ancho)) lineas.push(l);
        break;
      case 'par':
        lineas.push(...parEnLinea(bloque.etiqueta, bloque.valor, ancho));
        break;
      case 'parGrande':
        lineas.push(...parEnLinea(bloque.etiqueta, bloque.valor, ancho));
        break;
      case 'separador':
        lineas.push((bloque.caracter ?? '-').repeat(ancho));
        break;
      case 'espacio':
        for (let i = 0; i < (bloque.lineas ?? 1); i += 1) lineas.push('');
        break;
      case 'firma':
        lineas.push('');
        lineas.push('_'.repeat(Math.min(ancho, 32)));
        lineas.push(bloque.etiqueta);
        break;
    }
  }

  return lineas.map((l) => l.replace(/\s+$/, '')).join('\n');
}

// ---------------------------------------------------------------------------
// ESC/POS
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  inicializar: Buffer.from([ESC, 0x40]),
  /** Pagina de codigos 16 = WPC1252, la que trae acentos del espanol. */
  paginaCodigos: Buffer.from([ESC, 0x74, 0x10]),
  alinearIzquierda: Buffer.from([ESC, 0x61, 0x00]),
  alinearCentro: Buffer.from([ESC, 0x61, 0x01]),
  negritaOn: Buffer.from([ESC, 0x45, 0x01]),
  negritaOff: Buffer.from([ESC, 0x45, 0x00]),
  tamanoNormal: Buffer.from([GS, 0x21, 0x00]),
  tamanoDoble: Buffer.from([GS, 0x21, 0x11]),
  tamanoAlto: Buffer.from([GS, 0x21, 0x01]),
  /** Corte parcial con avance previo. */
  cortar: Buffer.from([GS, 0x56, 0x42, 0x00]),
  abrirCajon: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]),
};

function avanzar(lineas: number): Buffer {
  return Buffer.from([ESC, 0x64, lineas]);
}

function texto(contenido: string): Buffer {
  return Buffer.from(`${transliterar(contenido)}\n`, 'latin1');
}

/** Render a bytes ESC/POS listos para enviar a una impresora de 80 mm. */
export function aEscPos(documento: DocumentoTiquete): Buffer {
  const ancho = documento.ancho;
  const partes: Buffer[] = [CMD.inicializar, CMD.paginaCodigos, CMD.alinearIzquierda];

  for (const bloque of documento.bloques) {
    switch (bloque.t) {
      case 'titulo':
        partes.push(CMD.alinearCentro, CMD.tamanoDoble, CMD.negritaOn);
        partes.push(texto(bloque.texto.toUpperCase()));
        partes.push(CMD.negritaOff, CMD.tamanoNormal, CMD.alinearIzquierda);
        break;
      case 'subtitulo':
        partes.push(CMD.alinearCentro, texto(bloque.texto), CMD.alinearIzquierda);
        break;
      case 'centrado':
        partes.push(CMD.alinearCentro);
        if (bloque.negrita) partes.push(CMD.negritaOn);
        for (const l of partirEnLineas(bloque.texto, ancho)) partes.push(texto(l));
        if (bloque.negrita) partes.push(CMD.negritaOff);
        partes.push(CMD.alinearIzquierda);
        break;
      case 'linea':
        if (bloque.negrita) partes.push(CMD.negritaOn);
        for (const l of partirEnLineas(bloque.texto, ancho)) partes.push(texto(l));
        if (bloque.negrita) partes.push(CMD.negritaOff);
        break;
      case 'par':
        if (bloque.negrita) partes.push(CMD.negritaOn);
        for (const l of parEnLinea(bloque.etiqueta, bloque.valor, ancho)) partes.push(texto(l));
        if (bloque.negrita) partes.push(CMD.negritaOff);
        break;
      case 'parGrande':
        // A doble alto la impresora sigue teniendo 48 columnas de ancho.
        partes.push(CMD.tamanoAlto, CMD.negritaOn);
        for (const l of parEnLinea(bloque.etiqueta, bloque.valor, ancho)) partes.push(texto(l));
        partes.push(CMD.negritaOff, CMD.tamanoNormal);
        break;
      case 'destacado':
        partes.push(CMD.alinearCentro, CMD.tamanoDoble, CMD.negritaOn);
        partes.push(texto(bloque.texto.toUpperCase()));
        partes.push(CMD.negritaOff, CMD.tamanoNormal, CMD.alinearIzquierda);
        break;
      case 'separador':
        partes.push(texto((bloque.caracter ?? '-').repeat(ancho)));
        break;
      case 'espacio':
        partes.push(avanzar(bloque.lineas ?? 1));
        break;
      case 'firma':
        partes.push(avanzar(2));
        partes.push(texto('_'.repeat(Math.min(ancho, 32))));
        partes.push(texto(bloque.etiqueta));
        break;
    }
  }

  partes.push(avanzar(4), CMD.cortar);
  if (documento.abrirCajon) partes.push(CMD.abrirCajon);

  return Buffer.concat(partes);
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

export function serializar(documento: DocumentoTiquete): string {
  return JSON.stringify(documento);
}

export function deserializar(crudo: string): DocumentoTiquete {
  const dato = JSON.parse(crudo) as Partial<DocumentoTiquete>;
  if (dato.v !== 1 || !Array.isArray(dato.bloques) || typeof dato.ancho !== 'number') {
    throw new Error('El tiquete guardado no tiene un formato reconocible.');
  }
  return dato as DocumentoTiquete;
}

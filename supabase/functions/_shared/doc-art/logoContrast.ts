/** Contraste do logo compartilhado pelo preview e PDF, sem alterar a imagem. */
export const UNKNOWN_LOGO_PLATE = '#757575';

export function logoPlateFromPixels(rgba: Uint8Array): string | null {
  let opaque = true;
  let dark = 0;
  let light = 0;
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255;
    if (alpha < 0.99) opaque = false;
    if (alpha < 0.15) continue;
    const luminance = (rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722) / 255;
    total += alpha;
    if (luminance < 0.28) dark += alpha;
    if (luminance > 0.72) light += alpha;
  }
  // Imagem sem transparência já traz o próprio fundo. Não acrescentar plaqueta.
  if (opaque || total === 0) return null;
  if (dark / total > 0.18 && light / total > 0.18) return UNKNOWN_LOGO_PLATE;
  return light > dark ? '#111815' : '#ffffff';
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

interface DecodedPng {
  width: number;
  height: number;
  type: number;
  rgba: Uint8Array;
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
}

async function decodePng(bytes: Uint8Array): Promise<DecodedPng | null> {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16), height = view.getUint32(20);
    const depth = bytes[24], type = bytes[25], interlace = bytes[28];
    if (!width || !height || width > 8192 || height > 8192 || width * height > 4_000_000 || interlace !== 0 || ![0, 2, 3, 4, 6].includes(type)) return null;
    if (type === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8) return null;
    const channels = type === 6 ? 4 : type === 4 ? 2 : type === 2 ? 3 : 1;
    const bytesPerPixel = Math.max(1, Math.ceil(channels * depth / 8));
    const chunks: Uint8Array[] = [];
    let palette: Uint8Array | null = null;
    let alpha: Uint8Array | null = null;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > bytes.length) return null;
      const tag = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (tag === 'PLTE') palette = bytes.slice(offset + 8, offset + 8 + length);
      if (tag === 'tRNS') {
        if (type !== 3) return null;
        alpha = bytes.slice(offset + 8, offset + 8 + length);
      }
      if (tag === 'IDAT') chunks.push(bytes.slice(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    if (type === 3 && !palette) return null;
    const stride = Math.ceil(width * channels * depth / 8);
    const expectedSize = (stride + 1) * height;
    const reader = new Blob(chunks.map(chunk => Uint8Array.from(chunk).buffer)).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const raw = new Uint8Array(expectedSize);
    let written = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (written + value.length > expectedSize) {
        await reader.cancel();
        return null;
      }
      raw.set(value, written);
      written += value.length;
    }
    if (written !== expectedSize) return null;
    const rgba = new Uint8Array(width * height * 4);
    let previous = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
      const row = new Uint8Array(stride);
      const offset = y * (stride + 1), filter = raw[offset];
      if (filter > 4) return null;
      for (let x = 0; x < stride; x++) {
        const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
        const above = previous[x], upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
        const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : 0;
        row[x] = (raw[offset + 1 + x] + predictor) & 255;
      }
      for (let x = 0; x < width; x++) {
        const input = x * channels, out = (y * width + x) * 4;
        if (type === 3) {
          const bitOffset = x * depth;
          const index = (row[Math.floor(bitOffset / 8)] >> (8 - depth - bitOffset % 8)) & ((1 << depth) - 1);
          if (index * 3 + 2 >= palette!.length) return null;
          rgba[out] = palette![index * 3];
          rgba[out + 1] = palette![index * 3 + 1];
          rgba[out + 2] = palette![index * 3 + 2];
          rgba[out + 3] = alpha?.[index] ?? 255;
          continue;
        }
        rgba[out] = row[input];
        rgba[out + 1] = type === 0 || type === 4 ? row[input] : row[input + 1];
        rgba[out + 2] = type === 0 || type === 4 ? row[input] : row[input + 2];
        rgba[out + 3] = type === 6 ? row[input + 3] : type === 4 ? row[input + 1] : 255;
      }
      previous = row;
    }
    return { width, height, type, rgba };
  } catch {
    return null;
  }
}

/**
 * PNGs RGB/RGBA de 8 bits e paleta indexada (uploads otimizados). Formatos
 * incomuns usam a plaqueta neutra; JPEG opaco dispensa plaqueta. Não há fetch
 * aqui: o chamador já possui os bytes autorizados da imagem.
 */
export async function logoPlateFromPng(bytes: Uint8Array): Promise<string | null> {
  if (!isPng(bytes)) return null;
  const decoded = await decodePng(bytes);
  return decoded ? logoPlateFromPixels(decoded.rgba) : UNKNOWN_LOGO_PLATE;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc32(out.subarray(4, data.length + 8)));
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * O pdf-lib embute PNG indexado como paleta + tRNS. Alguns rasterizadores de
 * PDF omitem essa imagem em DPI baixo. Converte somente color type 3 para RGBA
 * lossless; PNGs RGB/RGBA e JPEGs permanecem exatamente como foram enviados.
 */
export async function normalizePngForPdf(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isPng(bytes)) return bytes;
  const decoded = await decodePng(bytes);
  if (!decoded) return bytes;

  // Regrava também PNGs RGBA já válidos. Isso remove perfis/chunks que alguns
  // leitores PDF interpretam como grupo de transparência e evita que o fundo
  // do certificado seja pintado por cima dos textos seguintes.
  return encodeRgbaPng(decoded.width, decoded.height, decoded.rgba);
}

async function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  const compressed = new Uint8Array(await new Response(
    new Blob([Uint8Array.from(raw).buffer]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

async function encodeRgbPng(width: number, height: number, rgb: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), rowStart + 1);
  }
  const compressed = new Uint8Array(await new Response(
    new Blob([Uint8Array.from(raw).buffer]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

/**
 * Achata um PNG transparente sobre a superfície que já ficará atrás dele no
 * PDF. O resultado RGB não cria SMask: evita logos parcialmente omitidos por
 * rasterizadores em DPI comum, sem recolorir nem alterar uploads opacos.
 */
export async function flattenPngForPdf(
  bytes: Uint8Array,
  background: readonly [number, number, number],
): Promise<Uint8Array> {
  if (!isPng(bytes)) return bytes;
  const decoded = await decodePng(bytes);
  if (!decoded) return bytes;
  let hasTransparency = false;
  for (let offset = 3; offset < decoded.rgba.length; offset += 4) {
    if (decoded.rgba[offset] < 255) {
      hasTransparency = true;
      break;
    }
  }
  if (!hasTransparency) return bytes;

  const rgbBytes = new Uint8Array(decoded.width * decoded.height * 3);
  for (let source = 0, target = 0; source < decoded.rgba.length; source += 4, target += 3) {
    const alpha = decoded.rgba[source + 3] / 255;
    rgbBytes[target] = Math.round(decoded.rgba[source] * alpha + background[0] * (1 - alpha));
    rgbBytes[target + 1] = Math.round(decoded.rgba[source + 1] * alpha + background[1] * (1 - alpha));
    rgbBytes[target + 2] = Math.round(decoded.rgba[source + 2] * alpha + background[2] * (1 - alpha));
  }
  return encodeRgbPng(decoded.width, decoded.height, rgbBytes);
}

/** Recolore PNG monocromático preservando exatamente o canal alfa. */
export async function tintPngForPdf(
  bytes: Uint8Array,
  color: readonly [number, number, number],
): Promise<Uint8Array> {
  if (!isPng(bytes)) return bytes;
  const decoded = await decodePng(bytes);
  if (!decoded) return bytes;
  const rgba = decoded.rgba.slice();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (rgba[offset + 3] === 0) continue;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
  }
  return encodeRgbaPng(decoded.width, decoded.height, rgba);
}

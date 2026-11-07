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

/**
 * PNGs RGB/RGBA de 8 bits e paleta indexada (uploads otimizados). Formatos
 * incomuns usam a plaqueta neutra; JPEG opaco dispensa plaqueta. Não há fetch
 * aqui: o chamador já possui os bytes autorizados da imagem.
 */
export async function logoPlateFromPng(bytes: Uint8Array): Promise<string | null> {
  if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16), height = view.getUint32(20);
    const depth = bytes[24], type = bytes[25], interlace = bytes[28];
    if (!width || !height || width > 8192 || height > 8192 || width * height > 4_000_000 || interlace !== 0 || ![0, 2, 3, 4, 6].includes(type)) return UNKNOWN_LOGO_PLATE;
    if (type === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8) return UNKNOWN_LOGO_PLATE;
    const channels = type === 6 ? 4 : type === 4 ? 2 : type === 2 ? 3 : 1;
    const bytesPerPixel = Math.max(1, Math.ceil(channels * depth / 8));
    const chunks: Uint8Array[] = [];
    let palette: Uint8Array | null = null;
    let alpha: Uint8Array | null = null;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (offset + length + 12 > bytes.length) return UNKNOWN_LOGO_PLATE;
      const tag = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (tag === 'PLTE') palette = bytes.slice(offset + 8, offset + 8 + length);
      if (tag === 'tRNS') {
        if (type !== 3) return UNKNOWN_LOGO_PLATE;
        alpha = bytes.slice(offset + 8, offset + 8 + length);
      }
      if (tag === 'IDAT') chunks.push(bytes.slice(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    if (type === 3 && !palette) return UNKNOWN_LOGO_PLATE;
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
        return UNKNOWN_LOGO_PLATE;
      }
      raw.set(value, written);
      written += value.length;
    }
    if (written !== expectedSize) return UNKNOWN_LOGO_PLATE;
    const rgba = new Uint8Array(width * height * 4);
    let previous = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
      const row = new Uint8Array(stride);
      const offset = y * (stride + 1), filter = raw[offset];
      if (filter > 4) return UNKNOWN_LOGO_PLATE;
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
          if (index * 3 + 2 >= palette!.length) return UNKNOWN_LOGO_PLATE;
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
    return logoPlateFromPixels(rgba);
  } catch {
    return UNKNOWN_LOGO_PLATE;
  }
}

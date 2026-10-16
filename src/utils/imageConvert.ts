// heic2any é uma lib PESADA (~1,3MB). É necessária SÓ quando o arquivo é HEIC/HEIF
// (foto de iPhone). Carregamos sob demanda via import() dinâmico: assim ela vira
// um chunk lazy próprio e não entra no bundle de NENHUM dos diálogos/telas que
// importam este util (cadastro de cliente/equipamento, foto da OS, perfil etc.).
// O caminho comum (JPEG/PNG/WebP) nunca baixa heic2any.
type Heic2Any = (options: {
  blob: Blob;
  toType: string;
  quality: number;
}) => Promise<Blob | Blob[]>;

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

let heicConverterPromise: Promise<Heic2Any> | null = null;

const getHeicConverter = (): Promise<Heic2Any> => {
  if (!heicConverterPromise) {
    heicConverterPromise = import('heic2any').then((mod) => {
      const maybeModule = mod as unknown as { default?: Heic2Any };
      return (maybeModule.default ?? (mod as unknown as Heic2Any));
    });
  }
  return heicConverterPromise;
};

const toJpgName = (name: string) =>
  name.replace(/\.(heic|heif|png|bmp|webp)$/i, '.jpg').replace(/(?<!\.jpg)$/, '') || `${name}.jpg`;

/** Max dimension (width or height) for uploaded images */
const MAX_DIMENSION = 1920;
/** Target JPEG quality */
const JPEG_QUALITY = 0.82;
/** File size threshold (in bytes) above which we compress — 500 KB */
const COMPRESS_THRESHOLD = 500 * 1024;

/**
 * Compresses and resizes an image file to JPEG.
 * - Resizes to max 1920px on the longest side
 * - Compresses to ~82% JPEG quality
 * - Skips compression for files under 500 KB that are already JPEG
 */
function compressImage(file: File, opts?: CompressOptions): Promise<File> {
  const maxDimension = opts?.maxDimension ?? MAX_DIMENSION;
  const quality = opts?.quality ?? JPEG_QUALITY;
  const threshold = opts?.skipUnderBytes ?? COMPRESS_THRESHOLD;
  return new Promise((resolve) => {
    // Skip small JPEGs
    const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    if (isJpeg && file.size <= threshold) {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Calculate new dimensions keeping aspect ratio
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            // If compressed is larger, keep original
            resolve(file);
            return;
          }
          const newName = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], newName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback to original
    };

    img.src = url;
  });
}

/**
 * Converts HEIC/HEIF to JPEG (no-op for non-HEIC). Shared by `processImageFile`
 * and `compressSelfie`. On any failure, returns the original file untouched.
 */
async function ensureNonHeic(file: File): Promise<File> {
  const lowerType = (file.type || '').toLowerCase();
  const isHeic =
    HEIC_MIME_TYPES.has(lowerType) ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  const convert = async (source: Blob) => {
    const heic2any = await getHeicConverter();
    const converted = await heic2any({
      blob: source,
      toType: 'image/jpeg',
      quality: JPEG_QUALITY,
    });
    const resultBlob = Array.isArray(converted) ? converted[0] : converted;
    return new File([resultBlob], toJpgName(file.name), { type: 'image/jpeg' });
  };

  try {
    return await convert(file);
  } catch {
    try {
      const normalizedBlob = new Blob([await file.arrayBuffer()], { type: 'image/heic' });
      return await convert(normalizedBlob);
    } catch {
      return file;
    }
  }
}

/**
 * Ajuste fino da compressão, por tela. Omitir mantém o padrão histórico
 * (1920px / 82%), que vale pra cadastro de cliente, equipamento, perfil etc.
 */
export interface CompressOptions {
  /** Maior lado do resultado, em px. */
  maxDimension?: number;
  /** Qualidade do JPEG, 0 a 1. */
  quality?: number;
  /** JPEG abaixo deste tamanho passa direto, sem recomprimir. */
  skipUnderBytes?: number;
}

/**
 * Régua das FOTOS DA OS. Medição de 16/10/2026 no bucket `os-photos`: 787
 * arquivos entre 512 KB e 1 MB e 165 acima de 1 MB (353 MB só eles), todos
 * gerados pelo padrão de 1920px/82%. Pra foto de defeito, 1600px a 75% mostra
 * exatamente a mesma evidência pesando perto da metade — e o que é economizado
 * sai direto do plano de dados do técnico em campo. Decisão do CEO em
 * 16/10/2026. Só a OS usa esta régua; as outras telas seguem no padrão.
 */
export const OS_PHOTO_COMPRESSION: CompressOptions = {
  maxDimension: 1600,
  quality: 0.75,
  skipUnderBytes: 300 * 1024,
};

/**
 * Processes an image file:
 * 1. Converts HEIC/HEIF to JPEG
 * 2. Compresses and resizes to optimize storage
 */
export async function processImageFile(file: File, opts?: CompressOptions): Promise<File> {
  const processed = await ensureNonHeic(file);

  // Compress and resize
  try {
    return await compressImage(processed, opts);
  } catch {
    return processed;
  }
}

// ─── Selfie do ponto eletrônico ───────────────────────────────────────────────
//
// Caminho DEDICADO da selfie do ponto (/ponto/:slug). Foco: menor arquivo sem
// perda percebida num ROSTO pra conferência. Difere do processImageFile genérico:
//  - Encoda em WebP (~25-35% menor que JPEG na mesma qualidade percebida).
//  - Reduz pra 1280px no lado maior (rosto não precisa de 1920).
//  - Comprime SEMPRE (não pula arquivos pequenos — re-encodar pra WebP ainda ganha).
//  - Fallback robusto: Safari iOS antigo não encoda WebP via canvas.toBlob →
//    cai pra JPEG 0.82. Nunca quebra a batida por isso.
// NÃO é usado por mais ninguém — os outros usos seguem por processImageFile intactos.

/** Lado maior máximo da selfie (rosto pra conferência não precisa de 1920). */
const SELFIE_MAX_DIMENSION = 1280;
/** Qualidade WebP afinada pra rosto sem perda percebida. */
const SELFIE_WEBP_QUALITY = 0.8;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Comprime a selfie do ponto pro menor tamanho sem perda percebida.
 * Prefere WebP; cai pra JPEG quando o navegador não encoda WebP. Sempre devolve
 * o menor entre o resultado e o original. Em qualquer erro, devolve o original.
 */
export async function compressSelfie(file: File): Promise<File> {
  const source = await ensureNonHeic(file);

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(source);

    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        let { width, height } = img;

        if (width > SELFIE_MAX_DIMENSION || height > SELFIE_MAX_DIMENSION) {
          if (width > height) {
            height = Math.round(height * (SELFIE_MAX_DIMENSION / width));
            width = SELFIE_MAX_DIMENSION;
          } else {
            width = Math.round(width * (SELFIE_MAX_DIMENSION / height));
            height = SELFIE_MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(source);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // 1) Tenta WebP.
        let blob = await canvasToBlob(canvas, 'image/webp', SELFIE_WEBP_QUALITY);
        let outType = 'image/webp';
        let outExt = '.webp';

        // Safari iOS antigo: toBlob WebP devolve null OU silenciosamente cai pra
        // outro tipo (PNG). Nesses casos, re-encoda em JPEG 0.82.
        if (!blob || blob.type !== 'image/webp') {
          blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
          outType = 'image/jpeg';
          outExt = '.jpg';
        }

        if (!blob) {
          resolve(source);
          return;
        }

        // Prefere sempre o menor entre o resultado e o original.
        if (blob.size >= source.size) {
          resolve(source);
          return;
        }

        const newName = source.name.replace(/\.[^.]+$/, '') + outExt;
        resolve(new File([blob], newName, { type: outType }));
      } catch {
        resolve(source);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(source);
    };

    img.src = url;
  });
}

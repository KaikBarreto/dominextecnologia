import heic2any from 'heic2any';

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const getHeicConverter = () => {
  const maybeModule = heic2any as unknown as { default?: typeof heic2any };
  return (maybeModule.default ?? heic2any) as (options: {
    blob: Blob;
    toType: string;
    quality: number;
  }) => Promise<Blob | Blob[]>;
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
function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    // Skip small JPEGs
    const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    if (isJpeg && file.size <= COMPRESS_THRESHOLD) {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Calculate new dimensions keeping aspect ratio
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round(height * (MAX_DIMENSION / width));
          width = MAX_DIMENSION;
        } else {
          width = Math.round(width * (MAX_DIMENSION / height));
          height = MAX_DIMENSION;
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
        JPEG_QUALITY
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
 * Processes an image file:
 * 1. Converts HEIC/HEIF to JPEG
 * 2. Compresses and resizes to optimize storage
 */
export async function processImageFile(file: File): Promise<File> {
  const lowerType = (file.type || '').toLowerCase();
  const isHeic =
    HEIC_MIME_TYPES.has(lowerType) ||
    /\.(heic|heif)$/i.test(file.name);

  let processed = file;

  if (isHeic) {
    const convert = async (source: Blob) => {
      const converted = await getHeicConverter()({
        blob: source,
        toType: 'image/jpeg',
        quality: JPEG_QUALITY,
      });
      const resultBlob = Array.isArray(converted) ? converted[0] : converted;
      return new File([resultBlob], toJpgName(file.name), { type: 'image/jpeg' });
    };

    try {
      processed = await convert(file);
    } catch {
      try {
        const normalizedBlob = new Blob([await file.arrayBuffer()], { type: 'image/heic' });
        processed = await convert(normalizedBlob);
      } catch {
        processed = file;
      }
    }
  }

  // Compress and resize
  try {
    return await compressImage(processed);
  } catch {
    return processed;
  }
}

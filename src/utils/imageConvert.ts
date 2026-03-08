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
  name.replace(/\.(heic|heif)$/i, '.jpg') || `${name}.jpg`;

/**
 * Converts HEIC/HEIF files to JPEG. Returns the original file if not HEIC.
 * If conversion fails, returns the original file to avoid breaking upload flow.
 */
export async function processImageFile(file: File): Promise<File> {
  const lowerType = (file.type || '').toLowerCase();
  const isHeic =
    HEIC_MIME_TYPES.has(lowerType) ||
    /\.(heic|heif)$/i.test(file.name);

  if (!isHeic) return file;

  const convert = async (source: Blob) => {
    const converted = await getHeicConverter()({
      blob: source,
      toType: 'image/jpeg',
      quality: 0.9,
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


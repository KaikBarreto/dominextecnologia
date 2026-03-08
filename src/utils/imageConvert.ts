import heic2any from 'heic2any';

/**
 * Converts HEIC/HEIF files to JPEG. Returns the original file if not HEIC.
 */
export async function processImageFile(file: File): Promise<File> {
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
    /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);

  if (!isHeic) return file;

  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const resultBlob = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
  return new File([resultBlob], newName, { type: 'image/jpeg' });
}

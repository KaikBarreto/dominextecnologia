const FILE_EXTENSION_REGEX = /\.([a-zA-Z0-9]+)$/;
const FILE_BASE_WITHOUT_EXTENSION_REGEX = /\.[^/.]+$/;
const UNICODE_COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const UNSAFE_FILE_CHARS_REGEX = /[^a-zA-Z0-9._-]/g;
const MULTIPLE_UNDERSCORES_REGEX = /_{2,}/g;

export function sanitizeStorageFileName(fileName: string): string {
  const extension = fileName.match(FILE_EXTENSION_REGEX)?.[1]?.toLowerCase();
  const rawBase = fileName.replace(FILE_BASE_WITHOUT_EXTENSION_REGEX, '');

  const safeBase = rawBase
    .normalize('NFD')
    .replace(UNICODE_COMBINING_MARKS_REGEX, '')
    .replace(UNSAFE_FILE_CHARS_REGEX, '_')
    .replace(MULTIPLE_UNDERSCORES_REGEX, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);

  const normalizedBase = safeBase || 'arquivo';
  return extension ? `${normalizedBase}.${extension}` : normalizedBase;
}

export function buildStorageFilePath({
  folder,
  fileName,
  prefix,
}: {
  folder: string;
  fileName: string;
  prefix?: string;
}): string {
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
  const safeName = sanitizeStorageFileName(fileName);
  const normalizedPrefix = prefix ? `${prefix.replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';

  return `${normalizedFolder}/${normalizedPrefix}${crypto.randomUUID()}_${safeName}`;
}

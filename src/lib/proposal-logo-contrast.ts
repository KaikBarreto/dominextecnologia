import { logoPlateFromPixels } from '@/lib/docArt/logoContrast';

/** Lê a imagem já carregada, sem fetch extra e sem modificar as cores da marca. */
export function proposalLogoPlate(image: HTMLImageElement): string | null {
  if (!image.naturalWidth || !image.naturalHeight) return null;
  try {
    const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const plate = logoPlateFromPixels(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
    // Documento Clean já é branco; logo escuro/transparente dispensa superfície adicional.
    return plate === '#ffffff' ? null : plate;
  } catch {
    // Imagens de origem sem CORS continuam visíveis sem leitura de pixels.
    return null;
  }
}

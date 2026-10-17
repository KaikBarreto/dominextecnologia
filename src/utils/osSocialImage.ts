export const OS_SOCIAL_IMAGE_WIDTH = 1200;
export const OS_SOCIAL_IMAGE_HEIGHT = 630;

const SOCIAL_IMAGE_QUALITY = 0.9;
const LIGHT_BACKGROUND = '#f4f8f6';
const DARK_BACKGROUND = '#0d1714';

type LoadedImage = {
  image: HTMLImageElement;
  revoke: () => void;
};

function loadImage(blob: Blob): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(objectUrl) });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível abrir a imagem.'));
    };
    image.src = objectUrl;
  });
}

async function fetchImage(url: string): Promise<Blob> {
  const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar o logo da empresa.');
  return response.blob();
}

function canvasToJpeg(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Não foi possível gerar a imagem social.'));
        return;
      }
      resolve(new File([blob], fileName, { type: 'image/jpeg' }));
    }, 'image/jpeg', SOCIAL_IMAGE_QUALITY);
  });
}

function normalizedHex(value?: string | null): string {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? String(value) : '#00c597';
}

function mixHex(base: string, accent: string, accentWeight: number): string {
  const parse = (hex: string) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const [br, bg, bb] = parse(base);
  const [ar, ag, ab] = parse(accent);
  const channel = (a: number, b: number) => Math.round(a * (1 - accentWeight) + b * accentWeight)
    .toString(16)
    .padStart(2, '0');
  return `#${channel(br, ar)}${channel(bg, ag)}${channel(bb, ab)}`;
}

/**
 * Escolhe claro/escuro pela luminância média dos pixels visíveis do logo.
 * A transparência pesa na amostra; pixels quase transparentes são ignorados.
 */
export function chooseSocialBackground(pixels: Uint8ClampedArray): typeof LIGHT_BACKGROUND | typeof DARK_BACKGROUND {
  let weightedLuminance = 0;
  let totalAlpha = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.15) continue;
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    const linearize = (channel: number) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
    const luminance = 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
    weightedLuminance += luminance * alpha;
    totalAlpha += alpha;
  }

  // Logo sem pixels legíveis: fundo escuro neutro, que funciona bem com o
  // padrão mais comum de logos transparentes claros.
  if (totalAlpha === 0) return DARK_BACKGROUND;
  return weightedLuminance / totalAlpha > 0.38 ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}

function sampleLogo(image: HTMLImageElement): Uint8ClampedArray {
  const sample = document.createElement('canvas');
  sample.width = 96;
  sample.height = 96;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return new Uint8ClampedArray();

  const scale = Math.min(sample.width / image.naturalWidth, sample.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (sample.width - width) / 2, (sample.height - height) / 2, width, height);
  return context.getImageData(0, 0, sample.width, sample.height).data;
}

function paintBrandBackground(context: CanvasRenderingContext2D, background: string, brandColor?: string | null) {
  const accent = normalizedHex(brandColor);
  const gradient = context.createLinearGradient(0, 0, OS_SOCIAL_IMAGE_WIDTH, OS_SOCIAL_IMAGE_HEIGHT);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, mixHex(background, accent, background === DARK_BACKGROUND ? 0.22 : 0.1));
  context.fillStyle = gradient;
  context.fillRect(0, 0, OS_SOCIAL_IMAGE_WIDTH, OS_SOCIAL_IMAGE_HEIGHT);

  context.save();
  context.globalAlpha = background === DARK_BACKGROUND ? 0.12 : 0.08;
  context.fillStyle = accent;
  context.beginPath();
  context.arc(1070, 80, 250, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/** Gera uma arte 1200x630 com o logo centralizado e fundo de alto contraste. */
export async function createOsSocialImageFromLogo(logoUrl: string, brandColor?: string | null): Promise<File> {
  const loaded = await loadImage(await fetchImage(logoUrl));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = OS_SOCIAL_IMAGE_WIDTH;
    canvas.height = OS_SOCIAL_IMAGE_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem social.');

    const background = chooseSocialBackground(sampleLogo(loaded.image));
    paintBrandBackground(context, background, brandColor);

    const maxWidth = 760;
    const maxHeight = 320;
    const scale = Math.min(maxWidth / loaded.image.naturalWidth, maxHeight / loaded.image.naturalHeight, 1.8);
    const width = loaded.image.naturalWidth * scale;
    const height = loaded.image.naturalHeight * scale;
    context.drawImage(
      loaded.image,
      (OS_SOCIAL_IMAGE_WIDTH - width) / 2,
      (OS_SOCIAL_IMAGE_HEIGHT - height) / 2,
      width,
      height,
    );

    return canvasToJpeg(canvas, `os-social-logo-${Date.now()}.jpg`);
  } finally {
    loaded.revoke();
  }
}

/** Recorta uma imagem personalizada em cover central, sempre entregando 1200x630. */
export async function createCustomOsSocialImage(source: Blob): Promise<File> {
  const loaded = await loadImage(source);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = OS_SOCIAL_IMAGE_WIDTH;
    canvas.height = OS_SOCIAL_IMAGE_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem social.');

    const scale = Math.max(
      OS_SOCIAL_IMAGE_WIDTH / loaded.image.naturalWidth,
      OS_SOCIAL_IMAGE_HEIGHT / loaded.image.naturalHeight,
    );
    const width = loaded.image.naturalWidth * scale;
    const height = loaded.image.naturalHeight * scale;
    context.drawImage(
      loaded.image,
      (OS_SOCIAL_IMAGE_WIDTH - width) / 2,
      (OS_SOCIAL_IMAGE_HEIGHT - height) / 2,
      width,
      height,
    );

    return canvasToJpeg(canvas, `os-social-personalizada-${Date.now()}.jpg`);
  } finally {
    loaded.revoke();
  }
}

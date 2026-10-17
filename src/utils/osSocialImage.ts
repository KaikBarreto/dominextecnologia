export const OS_SOCIAL_IMAGE_WIDTH = 1200;
export const OS_SOCIAL_IMAGE_HEIGHT = 630;

// Imagens personalizadas podem ser fotográficas; nelas usamos JPEG quase sem
// perdas. Artes montadas com logo usam PNG para preservar letras e bordas.
const SOCIAL_IMAGE_QUALITY = 0.97;
const LIGHT_BACKGROUND = '#f4f8f6';
const DARK_BACKGROUND = '#0d1714';

type RGB = { red: number; green: number; blue: number };

export type SocialImagePalette = {
  background: string;
  accent: string;
  extendsLogoEdge: boolean;
};

export type OsSocialImageOptions = {
  backgroundColor?: string | null;
  logoScale?: number;
  compactSafeArea?: boolean;
};

export type SocialLogoRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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

function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  type: 'image/jpeg' | 'image/png',
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Não foi possível gerar a imagem social.'));
        return;
      }
      resolve(new File([blob], fileName, { type }));
    }, type, type === 'image/jpeg' ? SOCIAL_IMAGE_QUALITY : undefined);
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

function rgbToHex({ red, green, blue }: RGB): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function hexToRgb(hex: string): RGB {
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function colorDistance(first: RGB, second: RGB): number {
  return Math.sqrt(
    (first.red - second.red) ** 2
    + (first.green - second.green) ** 2
    + (first.blue - second.blue) ** 2,
  );
}

function relativeLuminance({ red, green, blue }: RGB): number {
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(first: RGB, second: RGB): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function quantizedColorKey(red: number, green: number, blue: number): string {
  const quantize = (channel: number) => Math.min(7, Math.floor(channel / 32));
  return `${quantize(red)}-${quantize(green)}-${quantize(blue)}`;
}

type ColorBucket = RGB & { count: number };

function dominantBucket(colors: RGB[]): ColorBucket | null {
  const buckets = new Map<string, ColorBucket>();
  colors.forEach((color) => {
    const key = quantizedColorKey(color.red, color.green, color.blue);
    const bucket = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0 };
    bucket.red += color.red;
    bucket.green += color.green;
    bucket.blue += color.blue;
    bucket.count += 1;
    buckets.set(key, bucket);
  });
  const result = [...buckets.values()].sort((first, second) => second.count - first.count)[0];
  if (!result) return null;
  return {
    red: result.red / result.count,
    green: result.green / result.count,
    blue: result.blue / result.count,
    count: result.count,
  };
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

/**
 * Detecta logos que já possuem uma placa/fundo sólido (como um quadrado preto)
 * e prolonga a cor das bordas na arte. Em logos transparentes, mantém o fundo
 * neutro de alto contraste. A cor secundária também vem do próprio arquivo
 * sempre que houver amostra suficiente.
 */
export function chooseSocialPalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  brandColor?: string | null,
): SocialImagePalette {
  const visible: Array<RGB & { x: number; y: number }> = [];
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 166) continue;
    const pixelIndex = index / 4;
    visible.push({
      red: pixels[index],
      green: pixels[index + 1],
      blue: pixels[index + 2],
      x: pixelIndex % width,
      y: Math.floor(pixelIndex / width),
    });
  }

  const neutralBackground = chooseSocialBackground(pixels);
  if (visible.length === 0) {
    return {
      background: neutralBackground,
      accent: normalizedHex(brandColor),
      extendsLogoEdge: false,
    };
  }

  const minX = Math.min(...visible.map((pixel) => pixel.x));
  const maxX = Math.max(...visible.map((pixel) => pixel.x));
  const minY = Math.min(...visible.map((pixel) => pixel.y));
  const maxY = Math.max(...visible.map((pixel) => pixel.y));
  const boundingArea = (maxX - minX + 1) * (maxY - minY + 1);
  const visibleCoverage = boundingArea > 0 ? visible.length / boundingArea : 0;
  const sampleCoverage = width > 0 && height > 0 ? boundingArea / (width * height) : 0;
  const band = Math.max(1, Math.round(Math.min(maxX - minX + 1, maxY - minY + 1) * 0.08));
  const edgeArea = boundingArea
    - Math.max(0, maxX - minX + 1 - band * 2) * Math.max(0, maxY - minY + 1 - band * 2);
  const edgePixels = visible.filter((pixel) => (
    pixel.x < minX + band
    || pixel.x > maxX - band
    || pixel.y < minY + band
    || pixel.y > maxY - band
  ));
  const edgeColor = dominantBucket(edgePixels);
  const edgeCoverage = edgeArea > 0 ? edgePixels.length / edgeArea : 0;
  const edgeDominance = edgeColor && edgePixels.length > 0 ? edgeColor.count / edgePixels.length : 0;
  const extendsLogoEdge = Boolean(
    edgeColor
    && sampleCoverage >= 0.16
    && visibleCoverage >= 0.72
    && edgeCoverage >= 0.72
    && edgeDominance >= 0.58,
  );
  const backgroundRgb = extendsLogoEdge && edgeColor
    ? { red: edgeColor.red, green: edgeColor.green, blue: edgeColor.blue }
    : hexToRgb(neutralBackground);

  const accentCandidates = visible.filter((pixel) => (
    colorDistance(pixel, backgroundRgb) >= 52
    && contrastRatio(pixel, backgroundRgb) >= 1.45
  ));
  const accentBucket = dominantBucket(accentCandidates);
  const accent = accentBucket && accentBucket.count >= Math.max(3, visible.length * 0.015)
    ? rgbToHex(accentBucket)
    : normalizedHex(brandColor);

  return {
    background: rgbToHex(backgroundRgb),
    accent,
    extendsLogoEdge,
  };
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

function paintBrandBackground(context: CanvasRenderingContext2D, palette: SocialImagePalette) {
  const backgroundIsDark = relativeLuminance(hexToRgb(palette.background)) < 0.3;
  if (palette.extendsLogoEdge) {
    // Mantém a área sob o logo idêntica à borda do arquivo, evitando o efeito
    // de "quadrado colado" sobre um fundo sem relação com a marca.
    context.fillStyle = palette.background;
  } else {
    const gradient = context.createLinearGradient(0, 0, OS_SOCIAL_IMAGE_WIDTH, OS_SOCIAL_IMAGE_HEIGHT);
    gradient.addColorStop(0, palette.background);
    gradient.addColorStop(1, mixHex(palette.background, palette.accent, backgroundIsDark ? 0.22 : 0.1));
    context.fillStyle = gradient;
  }
  context.fillRect(0, 0, OS_SOCIAL_IMAGE_WIDTH, OS_SOCIAL_IMAGE_HEIGHT);
}

/**
 * Calcula a área do logo dentro da arte. No modo compacto, o conteúdo fica
 * inteiramente dentro do quadrado central de 630×630 que o WhatsApp costuma
 * recortar nos cartões menores.
 */
export function calculateSocialLogoRect(
  naturalWidth: number,
  naturalHeight: number,
  options: OsSocialImageOptions = {},
): SocialLogoRect {
  const compactSafeArea = options.compactSafeArea ?? true;
  const logoScale = compactSafeArea
    ? Math.min(1, Math.max(0.6, options.logoScale ?? 1))
    : Math.min(1.4, Math.max(0.6, options.logoScale ?? 1));
  const maxWidth = (compactSafeArea ? 570 : 760) * logoScale;
  const maxHeight = (compactSafeArea ? 420 : 320) * logoScale;
  const imageScale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1.8);
  const width = naturalWidth * imageScale;
  const height = naturalHeight * imageScale;

  return {
    x: (OS_SOCIAL_IMAGE_WIDTH - width) / 2,
    y: (OS_SOCIAL_IMAGE_HEIGHT - height) / 2,
    width,
    height,
  };
}

/** Gera uma arte 1200x630 com o logo centralizado e fundo de alto contraste. */
export async function createOsSocialImageFromLogo(
  logoUrl: string,
  brandColor?: string | null,
  options: OsSocialImageOptions = {},
): Promise<File> {
  const loaded = await loadImage(await fetchImage(logoUrl));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = OS_SOCIAL_IMAGE_WIDTH;
    canvas.height = OS_SOCIAL_IMAGE_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem social.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const sampledPixels = sampleLogo(loaded.image);
    const detectedPalette = chooseSocialPalette(sampledPixels, 96, 96, brandColor);
    const manualBackground = /^#[0-9a-f]{6}$/i.test(options.backgroundColor || '')
      ? String(options.backgroundColor)
      : null;
    const palette = manualBackground
      ? { ...detectedPalette, background: manualBackground, extendsLogoEdge: true }
      : detectedPalette;
    paintBrandBackground(context, palette);

    const logoRect = calculateSocialLogoRect(
      loaded.image.naturalWidth,
      loaded.image.naturalHeight,
      options,
    );
    context.drawImage(
      loaded.image,
      logoRect.x,
      logoRect.y,
      logoRect.width,
      logoRect.height,
    );

    return canvasToFile(canvas, `os-social-logo-${Date.now()}.png`, 'image/png');
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
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

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

    return canvasToFile(canvas, `os-social-personalizada-${Date.now()}.jpg`, 'image/jpeg');
  } finally {
    loaded.revoke();
  }
}

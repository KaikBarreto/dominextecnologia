// brandedQrExport — geração off-screen de QR com marca para download PNG
// e impressão de etiqueta.
//
// Espelha EXATAMENTE as opções do BrandedQRCode (nível H, fundo branco,
// logo central ~20%, hideBackgroundDots, RENDER_SCALE 3x, contraste).
// Não é um componente React — é uma função imperativa que usa a API da
// qr-code-styling diretamente, sem precisar de um <canvas> no DOM.
//
// Por que 3x no export também?
//   - Download: entregar PNG nítido (mesmo nível do que o usuário vê na tela).
//   - Etiqueta: impressão geralmente vai pra papel de alta resolução; 3x
//     garante nitidez mesmo em 300 DPI.

import QRCodeStyling, {
  type DotType,
  type CornerSquareType,
  type CornerDotType,
} from 'qr-code-styling';
import type { QRDotStyle, QRCornerStyle } from '@/components/BrandedQRCode';

// Importa o ícone Dominex preto (mesmo asset do BrandedQRCode).
import dominexIconBlack from '@/assets/icone_preto.png';

// Fator de super-amostragem (igual ao BrandedQRCode).
const RENDER_SCALE = 3;

// Mapas de estilo (espelho fiel do BrandedQRCode).
const DOT_TYPE: Record<QRDotStyle, DotType> = {
  square: 'square',
  rounded: 'rounded',
  dots: 'dots',
  classy: 'classy',
};

const CORNER_SQUARE_TYPE: Record<QRCornerStyle, CornerSquareType> = {
  square: 'square',
  rounded: 'extra-rounded',
  dot: 'dot',
};

const CORNER_DOT_TYPE: Record<QRCornerStyle, CornerDotType> = {
  square: 'square',
  rounded: 'square',
  dot: 'dot',
};

/**
 * Garante que a cor dos módulos seja escura o bastante sobre branco (mesmo
 * guard do BrandedQRCode). Hex inválido/ausente → preto.
 */
function enforceReadableColor(hex?: string): string {
  const fallback = '#000000';
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? fallback : `#${m[1].toLowerCase()}`;
}

export interface BrandedQrExportOpts {
  /** Conteúdo do QR (URL, texto, etc.). */
  value: string;
  /** Lado do QR em px (quadrado) — o export será renderizado em 3x internamente. */
  size: number;
  /** Logo do tenant (white-label). null/vazio → ícone Dominex preto. */
  logoUrl?: string | null;
  /** Estilo dos módulos. */
  dotStyle?: QRDotStyle;
  /** Estilo dos cantos (olhos). */
  cornerStyle?: QRCornerStyle;
  /** Cor dos módulos (forçada a ter contraste sobre branco). */
  color?: string;
}

/**
 * Converte um Blob para dataURL via FileReader (compatível com todos os
 * ambientes de browser).
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Retorna um dataURL PNG do QR com a marca do tenant (logo central, nível H,
 * fundo branco, alta resolução). Pronto para uso em download e em <img> na
 * etiqueta de impressão.
 *
 * Resolve com null se a lib não conseguir gerar o blob (raro: ambiente sem
 * canvas, ex. SSR).
 */
export async function getBrandedQrPngDataUrl(
  opts: BrandedQrExportOpts,
): Promise<string | null> {
  const {
    value,
    size,
    logoUrl,
    dotStyle = 'square',
    cornerStyle = 'square',
    color = '#000000',
  } = opts;

  const image = logoUrl && logoUrl.trim() ? logoUrl : dominexIconBlack;
  const moduleColor = enforceReadableColor(color);
  const renderSize = size * RENDER_SCALE;

  const qr = new QRCodeStyling({
    width: renderSize,
    height: renderSize,
    type: 'canvas' as const,
    data: value,
    image,
    margin: 0,
    qrOptions: {
      errorCorrectionLevel: 'H' as const,
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.2,
      crossOrigin: 'anonymous',
      margin: 4 * RENDER_SCALE,
    },
    dotsOptions: {
      type: DOT_TYPE[dotStyle],
      color: moduleColor,
    },
    cornersSquareOptions: {
      type: CORNER_SQUARE_TYPE[cornerStyle],
      color: moduleColor,
    },
    cornersDotOptions: {
      type: CORNER_DOT_TYPE[cornerStyle],
      color: moduleColor,
    },
    backgroundOptions: {
      color: '#ffffff',
    },
  });

  const blob = await qr.getRawData('png');
  if (!blob) return null;

  return blobToDataUrl(blob as Blob);
}

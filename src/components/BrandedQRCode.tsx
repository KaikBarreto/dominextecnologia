// BrandedQRCode — QR Code compartilhado do sistema, com LOGO no centro.
//
// Fundação única de QR do produto: renderiza qualquer conteúdo (Pix copia-e-cola,
// links de portal, etc.) com o logo da marca no meio. Usa `qr-code-styling`
// (imperativa/canvas), então este wrapper React cuida do ciclo de vida via
// useRef/useEffect e limpa/atualiza o QR quando as props mudam.
//
// Marca no centro:
//   - `logoUrl` presente  → logo do tenant (white-label).
//   - `logoUrl` null/vazio → ícone Dominex padrão (asset quadrado da marca).
//
// LEGIBILIDADE É PRIORIDADE #1 (regras inegociáveis):
//   - errorCorrectionLevel 'H' (30% de redundância, aguenta o logo no centro);
//   - fundo BRANCO fixo (lê em qualquer tema);
//   - a cor dos módulos é forçada a ter contraste suficiente sobre o branco —
//     se vier uma cor clara/baixo contraste, cai pro preto;
//   - logo central pequeno (~20% do QR) com margem + hideBackgroundDots, pra não
//     comer módulos;
//   - crossOrigin 'anonymous' na imagem (logo de tenant pode vir de outra origem).

import { useEffect, useMemo, useRef } from 'react';
import QRCodeStyling, {
  type DotType,
  type CornerSquareType,
  type CornerDotType,
} from 'qr-code-styling';
// Logo DEFAULT (sem white-label) = ícone preto — nunca o verde (FOUC, contraste).
// White-label usa o logo do tenant via `logoUrl` prop.
import dominexIconBlack from '@/assets/icone_preto.png';

// Fator de super-amostragem: renderiza o QR em Nx e exibe em 1x (nitidez retina).
const RENDER_SCALE = 3;

export type QRDotStyle = 'square' | 'rounded' | 'dots' | 'classy';
export type QRCornerStyle = 'square' | 'rounded' | 'dot';

export interface BrandedQRCodeProps {
  /** Conteúdo do QR (obrigatório) — ex.: Pix copia-e-cola, URL do portal. */
  value: string;
  /** Lado do QR em px (quadrado). Default 200. */
  size?: number;
  /**
   * Logo do centro. Presente → marca do tenant (white-label).
   * null/undefined/'' → ícone Dominex padrão.
   */
  logoUrl?: string | null;
  /** Estilo dos módulos. Default 'square'. */
  dotStyle?: QRDotStyle;
  /** Estilo dos cantos (olhos). Default 'square'. */
  cornerStyle?: QRCornerStyle;
  /** Cor dos módulos. Forçada a ter contraste sobre branco. Default '#000000'. */
  color?: string;
  /** Classe extra no container (o container já é do tamanho do QR, centralizado). */
  className?: string;
}

// ── Mapas de estilo (API do produto → API da lib) ───────────────────────────
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
 * Garante que a cor dos módulos seja escura o bastante sobre o branco pra o QR
 * ler. Se a luminância relativa sRGB for alta demais (cor clara), cai pro preto.
 * Hex inválido/ausente → preto. Threshold conservador (0.5) porque contraste
 * baixo em QR já é falha de leitura, não só de estética.
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
  // Cor clara demais sobre branco → força preto pra manter contraste.
  return luminance > 0.5 ? fallback : `#${m[1].toLowerCase()}`;
}

export function BrandedQRCode({
  value,
  size = 200,
  logoUrl,
  dotStyle = 'square',
  cornerStyle = 'square',
  color = '#000000',
  className,
}: BrandedQRCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Logo do centro: tenant (white-label) → logo colorido; Dominex default → ícone PRETO.
  // Ícone preto garante contraste sobre o fundo branco fixo do QR.
  const image = logoUrl && logoUrl.trim() ? logoUrl : dominexIconBlack;
  const moduleColor = useMemo(() => enforceReadableColor(color), [color]);

  const options = useMemo(
    () => ({
      // Renderiza o buffer em ALTA RESOLUÇÃO (3x) e exibe no tamanho `size` via CSS
      // (canvas escalado no effect). Sem isso, o canvas sai em 1x e fica pixelado
      // no retina — inclusive o logo do centro. 3x cobre telas 2x/3x com folga.
      width: size * RENDER_SCALE,
      height: size * RENDER_SCALE,
      type: 'canvas' as const,
      data: value,
      image,
      margin: 0,
      qrOptions: {
        // 'H' = 30% de correção de erro: cobre o logo no centro sem perder leitura.
        errorCorrectionLevel: 'H' as const,
      },
      imageOptions: {
        // Não deixa módulos aparecerem por baixo do logo (evita ruído de leitura).
        hideBackgroundDots: true,
        // Logo pequeno (~20% do lado) — dentro do que o nível H aguenta com folga.
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
      // Fundo BRANCO fixo — lê em qualquer tema, independente do container.
      backgroundOptions: {
        color: '#ffffff',
      },
    }),
    [value, size, image, dotStyle, cornerStyle, moduleColor],
  );

  // UM único effect idempotente: LIMPA o container e (re)cria o QR a cada mudança
  // de options. Evita o bug de canvas duplicado/vazio da qr-code-styling sob
  // StrictMode/re-render (o padrão create-uma-vez + update() corria com o desenho
  // assíncrono da imagem e deixava um canvas em branco visível). Aqui sempre há
  // exatamente um canvas, redesenhado do zero.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    const qr = new QRCodeStyling(options);
    qr.append(container);
    // Buffer é 3x; exibe no tamanho real via CSS pra ficar nítido no retina.
    const canvas = container.querySelector('canvas');
    if (canvas) {
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    return () => {
      container.innerHTML = '';
    };
  }, [options, size]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size, lineHeight: 0 }}
      aria-hidden="true"
    />
  );
}

export default BrandedQRCode;

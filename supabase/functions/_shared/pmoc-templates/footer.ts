// =============================================================================
// pmoc-templates/footer.ts — Rodapé "Powered by Dominex" com logo.
// =============================================================================
// Centralizado horizontalmente: logo Dominex pequeno + "www.dominex.app".
// SÓ aparece quando o tenant NÃO está em white-label (responsabilidade do
// chamador — passar `enabled: !isWhiteLabel`).
// =============================================================================

import {
  PDFDocument,
  PDFPage,
  PDFImage,
  PDFFont,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { A4_W } from "./html-renderer.ts";
import { getDominexLogoBytes } from "./dominex-logo.ts";

const MUTED = rgb(0.45, 0.45, 0.45);

/**
 * Embeda o logo Dominex UMA vez e devolve o PDFImage pra reuso em N páginas.
 * Documentos auto-paginados (ex.: Planilha PMOC) precisam do rodapé em toda
 * página; re-embedar por página decodifica o raster N vezes e estoura o worker
 * de PDF (mesma régua do logo do tenant no Cronograma). Best-effort: se o embed
 * falhar, devolve null e o rodapé cai no texto-only.
 */
export async function embedDominexFooterLogo(
  pdf: PDFDocument,
): Promise<PDFImage | null> {
  try {
    return await pdf.embedPng(getDominexLogoBytes());
  } catch {
    return null;
  }
}

export interface DrawDominexFooterLineOptions {
  /** Quando false, função não desenha nada (white-label). */
  enabled: boolean;
  /** Logo Dominex já embedado (via `embedDominexFooterLogo`). */
  logoImage: PDFImage | null;
  /** Fonte Helvetica já embedada no documento. */
  font: PDFFont;
  /** Margem horizontal do conteúdo (a linha tem essa largura útil). */
  marginX: number;
  /** Largura desejada do logo em pt. Default ~52pt. */
  logoWidth?: number;
  /** Distância (pt) da base da página ao texto "dominex.app". Default 24pt. */
  bottomMargin?: number;
}

/**
 * Rodapé Dominex por página: logo Dominex pequeno + "dominex.app", centralizados
 * horizontalmente. (Linha separadora removida — ver nota no corpo da função.)
 *
 * Reusa o `logoImage` pré-embedado (NÃO re-embeda por página). Se `enabled`
 * for false (white-label), é no-op — nada de marca Dominex no documento.
 *
 * O chamador deve reservar a faixa inferior (~50pt) pra o conteúdo não invadir.
 */
export function drawDominexFooterLine(
  page: PDFPage,
  opts: DrawDominexFooterLineOptions,
): void {
  if (!opts.enabled) return;

  const logoTargetW = Math.max(36, Math.min(90, opts.logoWidth ?? 52));
  const bottomMargin = Math.max(14, opts.bottomMargin ?? 24);

  // Empilhamento de baixo pra cima: URL → logo. Sem linha separadora (removida
  // por ordem do CEO 2026-06: ficava colada/por cima do logo Dominex). Rodapé
  // agora é só logo + "dominex.app", centralizados.
  const urlSize = 8;
  const urlText = "dominex.app";
  const urlY = bottomMargin; // baseline do texto
  const logoGap = 6; // respiro entre topo do texto e base do logo
  const logoBaseY = urlY + urlSize + logoGap;

  if (opts.logoImage) {
    const img = opts.logoImage;
    const ratio = logoTargetW / img.width;
    const drawW = logoTargetW;
    const drawH = img.height * ratio;
    page.drawImage(img, {
      x: (A4_W - drawW) / 2,
      y: logoBaseY,
      width: drawW,
      height: drawH,
    });
  }

  // Texto "dominex.app" embaixo do logo, centralizado.
  const urlW = opts.font.widthOfTextAtSize(urlText, urlSize);
  page.drawText(urlText, {
    x: (A4_W - urlW) / 2,
    y: urlY,
    size: urlSize,
    font: opts.font,
    color: MUTED,
  });
}

export interface DrawDominexFooterOptions {
  /** Quando false, função não desenha nada (white-label). */
  enabled: boolean;
  /** Largura desejada do logo em pt. Default ~60pt. */
  logoWidth?: number;
  /**
   * Distância (em pt) do RODAPÉ da página até o BASE da linha do logo.
   * Default ~30pt (mesma "respiração" do PDF da OS).
   */
  bottomMargin?: number;
}

/**
 * Desenha o rodapé Dominex (logo + URL) centralizado horizontalmente no rodapé
 * da página informada. Se `enabled=false`, é no-op.
 *
 * Cuidado: chamador deve garantir que não há conteúdo no espaço dos últimos
 * ~50pt da página (esse helper escreve por cima).
 */
export async function drawDominexFooter(
  pdf: PDFDocument,
  page: PDFPage,
  opts: DrawDominexFooterOptions,
): Promise<void> {
  if (!opts.enabled) return;

  const logoTargetW = Math.max(40, Math.min(120, opts.logoWidth ?? 60));
  const bottomMargin = Math.max(16, opts.bottomMargin ?? 30);

  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  // Embeda o logo. Falha silenciosa: se quebrar, escreve só o texto.
  try {
    const logoBytes = getDominexLogoBytes();
    const img = await pdf.embedPng(logoBytes);
    const ratio = logoTargetW / img.width;
    const drawW = logoTargetW;
    const drawH = img.height * ratio;

    const logoX = (A4_W - drawW) / 2;
    const logoY = bottomMargin + 12; // 12pt de gap entre logo e texto URL

    page.drawImage(img, {
      x: logoX,
      y: logoY,
      width: drawW,
      height: drawH,
    });

    // Texto URL embaixo do logo, centralizado.
    const urlText = "www.dominex.app";
    const urlSize = 8;
    const urlW = helv.widthOfTextAtSize(urlText, urlSize);
    page.drawText(urlText, {
      x: (A4_W - urlW) / 2,
      y: bottomMargin,
      size: urlSize,
      font: helv,
      color: MUTED,
    });
  } catch {
    // Fallback texto-only — escreve só "Powered by Dominex • www.dominex.app"
    const fallback = "Powered by Dominex - www.dominex.app";
    const size = 8;
    const w = helv.widthOfTextAtSize(fallback, size);
    page.drawText(fallback, {
      x: (A4_W - w) / 2,
      y: bottomMargin,
      size,
      font: helv,
      color: MUTED,
    });
  }
}

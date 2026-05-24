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
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { A4_W } from "./html-renderer.ts";
import { getDominexLogoBytes } from "./dominex-logo.ts";

const MUTED = rgb(0.45, 0.45, 0.45);

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

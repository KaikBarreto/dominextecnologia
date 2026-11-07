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
import { getDominexLogoBytes } from "./dominex-logo.ts";
import { tintPngForPdf } from "../doc-art/logoContrast.ts";

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

  const { width } = page.getSize();
  const logoTargetW = Math.max(42, Math.min(90, opts.logoWidth ?? 46));
  const bottomMargin = Math.max(8, opts.bottomMargin ?? 12);
  const label = "Gerado por";
  const labelSize = 7.5;
  const gap = 6;
  const logoHeight = opts.logoImage ? opts.logoImage.height * (logoTargetW / opts.logoImage.width) : labelSize;
  const brandWidth = opts.logoImage ? logoTargetW : opts.font.widthOfTextAtSize("Dominex", labelSize);
  const totalWidth = opts.font.widthOfTextAtSize(label, labelSize) + gap + brandWidth;
  const startX = (width - totalWidth) / 2;

  page.drawText(label, {
    x: startX,
    y: bottomMargin + Math.max(0, (logoHeight - labelSize) / 2),
    size: labelSize,
    font: opts.font,
    color: MUTED,
  });

  if (opts.logoImage) {
    page.drawImage(opts.logoImage, {
      x: startX + opts.font.widthOfTextAtSize(label, labelSize) + gap,
      y: bottomMargin,
      width: logoTargetW,
      height: logoHeight,
    });
  } else {
    page.drawText("Dominex", {
      x: startX + opts.font.widthOfTextAtSize(label, labelSize) + gap,
      y: bottomMargin,
      size: labelSize,
      font: opts.font,
      color: MUTED,
    });
  }
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
  /** Usa assinatura branca diretamente sobre documentos escuros. */
  dark?: boolean;
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

  // Mantem todos os documentos PMOC no mesmo rodape institucional usado por
  // certificados e relatorios. As opcoes antigas continuam aceitas para nao
  // quebrar os chamadores existentes.
  await drawGeneratedByDominexFooter(pdf, page, { dark: opts.dark });
}

/**
 * Assinatura institucional "Gerado por" para documentos que a exigem.
 *
 * Diferente do rodape generico acima, este rodape nunca e ocultado por
 * white-label. Certificados a chamam obrigatoriamente; outros documentos
 * continuam respeitando `enabled` em `drawDominexFooter`, salvo chamada
 * explicita (como o relatorio PMOC emitido por OS).
 */
export async function drawGeneratedByDominexFooter(
  pdf: PDFDocument,
  page: PDFPage,
  opts: { dark?: boolean } = {},
): Promise<void> {
  const { width } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const label = "Gerado por";
  // Assinatura visual unica para certificados e relatorios: legivel sem
  // competir com o conteudo e sem a antiga borda que atravessava o logo.
  const labelSize = 7.5;
  const logoWidth = 46;
  const gap = 6;
  const color = opts.dark ? rgb(1, 1, 1) : MUTED;

  try {
    const logoBytes = opts.dark
      ? await tintPngForPdf(getDominexLogoBytes(), [255, 255, 255])
      : getDominexLogoBytes();
    const logo = await pdf.embedPng(logoBytes);
    const logoHeight = logo.height * (logoWidth / logo.width);
    const totalWidth = font.widthOfTextAtSize(label, labelSize) + gap + logoWidth;
    const startX = (width - totalWidth) / 2;
    page.drawText(label, {
      x: startX,
      y: 9 + Math.max(0, (logoHeight - labelSize) / 2),
      size: labelSize,
      font,
      color,
    });
    page.drawImage(logo, {
      x: startX + font.widthOfTextAtSize(label, labelSize) + gap,
      y: 9,
      width: logoWidth,
      height: logoHeight,
    });
  } catch {
    const fallback = "Gerado por Dominex";
    const fallbackWidth = font.widthOfTextAtSize(fallback, labelSize);
    page.drawText(fallback, {
      x: (width - fallbackWidth) / 2,
      y: 9,
      size: labelSize,
      font,
      color,
    });
  }
}

/** Regra obrigatoria aplicada por todos os renderizadores de certificado. */
export async function drawCertificateGeneratedByFooter(
  pdf: PDFDocument,
  page: PDFPage,
  opts: { dark?: boolean } = {},
): Promise<void> {
  await drawGeneratedByDominexFooter(pdf, page, opts);
}

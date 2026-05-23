// =============================================================================
// pmoc-templates/certificado.ts — Certificado de Conformidade.
// =============================================================================
// Página 3 do dossiê. HTML rich (default ou customizado pelo gestor) +
// bloco de assinatura do RT (Onda E) + selo "Conforme Lei 13.589/2018" no
// rodapé absoluto.
// =============================================================================

import { PDFDocument, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext } from "./context.ts";
import { sanitizeHtml } from "./html-sanitizer.ts";
import { renderHtmlToPdf, A4_W, A4_H, MARGIN_Y, MARGIN_X, CONTENT_W } from "./html-renderer.ts";
import {
  drawRtSignatureBlock,
  SIGNATURE_BLOCK_HEIGHT,
} from "./signature-embed.ts";

const BLACK = rgb(0, 0, 0);

export function buildDefaultCertificadoHtml(ctx: TemplateContext): string {
  // Onda G: CFT vazio vira linha pontilhada (campo preenchido à mão).
  //         Endereço vazio vira "—" (separador semântico).
  const cftDisplay = ctx.rt.cft_crea && ctx.rt.cft_crea.trim()
    ? escapeHtml(ctx.rt.cft_crea)
    : "____________________";
  const addressDisplay = ctx.customer.address && ctx.customer.address.trim()
    ? escapeHtml(ctx.customer.address)
    : "—";
  return `
    <h1>CERTIFICADO DE CONFORMIDADE</h1>
    <p>Certificamos que a unidade <strong>${escapeHtml(ctx.customer.name)}</strong>, localizada em ${addressDisplay}, está sob plano formal de manutenção preventiva e operacional conforme estabelecido pela Lei Federal nº 13.589 de 4 de janeiro de 2018, sob supervisão técnica de <strong>${escapeHtml(ctx.rt.nome)}</strong> (${escapeHtml(ctx.rt.modalidade)} - CFT ${cftDisplay}).</p>
    <p>Periodicidade das manutenções: ${escapeHtml(ctx.contract.frequency_label)}.</p>
    <p>Vigência: a partir de ${escapeHtml(ctx.contract.start_date_extenso)}.</p>
    <p>Documento gerado em ${escapeHtml(ctx.generated_at_extenso)}.</p>
  `;
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderCertificadoResult {
  page: PDFPage;
  pagesUsed: number;
  tagsRemoved: number;
  attrsRemoved: number;
  /** Onda E: true quando signature_image_url não estava disponível ao gerar. */
  signaturePending: boolean;
}

export async function drawCertificadoPage(
  pdf: PDFDocument,
  ctx: TemplateContext,
  customHtml: string | null,
): Promise<RenderCertificadoResult> {
  const raw = customHtml && customHtml.trim().length > 0
    ? customHtml
    : buildDefaultCertificadoHtml(ctx);

  const { clean, tagsRemoved, attrsRemoved } = sanitizeHtml(raw);

  const initialPage = pdf.addPage([A4_W, A4_H]);
  const result = await renderHtmlToPdf(pdf, clean, {
    startPage: initialPage,
    cursorY: A4_H - MARGIN_Y,
    newPage: () => pdf.addPage([A4_W, A4_H]),
  });

  // -- Onda E: bloco de assinatura do RT (acima do selo no rodapé).
  //    Reservamos pelo menos espaço do bloco + selo (~50pt). Se não cabe na
  //    página corrente, abre nova.
  const SEAL_RESERVED = 60; // espaço reservado pro selo no rodapé
  const SPACE_NEEDED = SIGNATURE_BLOCK_HEIGHT + 20 + SEAL_RESERVED;

  let sigPage = result.page;
  let sigTopY = result.cursorY - 16;

  if (sigTopY - SPACE_NEEDED < MARGIN_Y) {
    sigPage = pdf.addPage([A4_W, A4_H]);
    sigTopY = A4_H - MARGIN_Y - 20;
  }

  const sigResult = await drawRtSignatureBlock(
    pdf,
    sigPage,
    {
      rt_name: ctx.rt.nome,
      rt_modality: ctx.rt.modalidade,
      rt_cft_crea: ctx.rt.cft_crea,
      signature_image_url: ctx.rt.signature_image_url ?? null,
      stamp_image_url: ctx.rt.stamp_image_url ?? null,
    },
    {
      x: MARGIN_X,
      y: sigTopY,
      width: CONTENT_W,
    },
  );

  // Desenha o selo "Conforme Lei 13.589/2018" no rodapé da MESMA página onde
  // está o bloco de assinatura (último frame da renderização).
  const finalPage = sigPage;
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  const sealText = "Conforme Lei Federal 13.589/2018";
  const sealSize = 11;
  const sealW = helvBold.widthOfTextAtSize(sealText, sealSize);
  const sealY = MARGIN_Y / 2 + 10;

  finalPage.drawText(sealText, {
    x: (A4_W - sealW) / 2,
    y: sealY,
    size: sealSize,
    font: helvBold,
    color: BLACK,
  });

  // Linha decorativa pequena acima do selo
  const decorW = 80;
  finalPage.drawLine({
    start: { x: (A4_W - decorW) / 2, y: sealY + 16 },
    end: { x: (A4_W - decorW) / 2 + decorW, y: sealY + 16 },
    thickness: 0.5,
    color: BLACK,
  });

  // Rodapé "Powered by Dominex"
  const footerText = "Powered by Dominex";
  const footerSize = 8;
  const footerW = helv.widthOfTextAtSize(footerText, footerSize);
  finalPage.drawText(footerText, {
    x: (A4_W - footerW) / 2,
    y: sealY - 14,
    size: footerSize,
    font: helv,
    color: rgb(0.4, 0.4, 0.4),
  });

  return {
    page: finalPage,
    pagesUsed: 1 + result.pagesRendered + (sigPage !== result.page ? 1 : 0),
    tagsRemoved,
    attrsRemoved,
    signaturePending: sigResult.pending,
  };
}

// =============================================================================
// pmoc-templates/certificado.ts — Certificado de Conformidade.
// =============================================================================
// Página 3 do dossiê. HTML rich (default ou customizado pelo gestor) +
// bloco de assinatura do RT (Onda E) + selo "Conforme Lei 13.589/2018" no
// rodapé absoluto.
//
// Pipeline (Onda H — v1.9.x):
//   1. raw HTML (do banco ou default) — pode conter <span data-pmoc-var="...">
//   2. substituteVariables(raw, variableContext) — troca spans por valores reais
//   3. sanitizeHtml(...) — defesa em camada server-side (whitelist tags/attrs)
//   4. renderHtmlToPdf(...) — desenha no PDF
//
// Ver `termo-rt.ts` pra explicação da ordem (sanitizer strippa data-pmoc-var).
// =============================================================================

import { PDFDocument, PDFPage, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext } from "./context.ts";
import { sanitizeHtml } from "./html-sanitizer.ts";
import { renderHtmlToPdf, A4_W, A4_H, MARGIN_Y, MARGIN_X, CONTENT_W } from "./html-renderer.ts";
import {
  drawRtSignatureBlock,
  SIGNATURE_BLOCK_HEIGHT,
} from "./signature-embed.ts";
import { PmocVariableContext, substituteVariables } from "./variables.ts";

const BLACK = rgb(0, 0, 0);

/**
 * Template padrão do Certificado de Conformidade com spans `data-pmoc-var`
 * (Onda H). Espelha 1:1 `src/utils/pmocDocumentTemplates.ts#buildDefaultCertificadoHtml`
 * pra paridade entre o que o gestor vê no editor e o PDF gerado.
 */
export function buildDefaultCertificadoHtml(): string {
  return `
<h2>CERTIFICADO DE CONFORMIDADE</h2>

<p>Certificamos que a unidade <strong><span data-pmoc-var="cliente.nome"></span></strong>, localizada em <span data-pmoc-var="cliente.endereco"></span>, está sob plano formal de manutenção preventiva e operacional conforme estabelecido pela Lei Federal nº 13.589 de 4 de janeiro de 2018, sob supervisão técnica de <strong><span data-pmoc-var="rt.nome"></span></strong> (<span data-pmoc-var="rt.modalidade"></span> — CFT <span data-pmoc-var="rt.cft_crea"></span>).</p>

<p><strong>Periodicidade das manutenções:</strong> <span data-pmoc-var="contrato.frequencia"></span>.<br>
<strong>Vigência:</strong> a partir de <span data-pmoc-var="contrato.vigencia_inicio"></span>.</p>

<p>Documento gerado em <span data-pmoc-var="data.hoje_extenso"></span>.</p>
`.trim();
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
  variableContext: PmocVariableContext | null = null,
): Promise<RenderCertificadoResult> {
  const raw = customHtml && customHtml.trim().length > 0
    ? customHtml
    : buildDefaultCertificadoHtml();

  // ---- (Onda H) Substituir variáveis ANTES do sanitizer.
  //      Sanitizer remove o atributo data-pmoc-var de <span>; ordem inversa
  //      faz o substituidor encontrar spans vazios e quebra o pipeline.
  const substituted = substituteVariables(raw, variableContext);

  const { clean, tagsRemoved, attrsRemoved } = sanitizeHtml(substituted);

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

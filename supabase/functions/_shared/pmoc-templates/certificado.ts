// =============================================================================
// pmoc-templates/certificado.ts — Certificado de Conformidade.
// =============================================================================
// Página 3 do dossiê. HTML rich (default ou customizado pelo gestor) +
// bloco de assinatura do RT (Onda E).
//
// Pipeline (Onda H — v1.9.x):
//   1. raw HTML (do banco ou default) — pode conter <span data-pmoc-var="...">
//   2. substituteVariables(raw, variableContext) — troca spans por valores reais
//   3. sanitizeHtml(...) — defesa em camada server-side (whitelist tags/attrs)
//   4. renderHtmlToPdf(...) — desenha no PDF
//
// Ver `termo-rt.ts` pra explicação da ordem (sanitizer strippa data-pmoc-var).
// =============================================================================

import { PDFDocument, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext } from "./context.ts";
import { sanitizeHtml } from "./html-sanitizer.ts";
import { renderHtmlToPdf, A4_W, A4_H, MARGIN_Y, MARGIN_X, CONTENT_W } from "./html-renderer.ts";
import {
  drawRtSignatureBlock,
  SIGNATURE_BLOCK_HEIGHT,
} from "./signature-embed.ts";
import { PmocVariableContext, substituteVariables } from "./variables.ts";
import { drawDominexFooter } from "./footer.ts";

/**
 * Template padrão do Certificado de Conformidade com spans `data-pmoc-var`
 * (Onda H). Espelha 1:1 `src/utils/pmocDocumentTemplates.ts#buildDefaultCertificadoHtml`
 * pra paridade entre o que o gestor vê no editor e o PDF gerado.
 */
export function buildDefaultCertificadoHtml(): string {
  return `
<h2>CERTIFICADO DE CONFORMIDADE</h2>

<p>&nbsp;</p>

<p>A empresa <strong><span data-pmoc-var="empresa.razao_social"></span></strong>, inscrita no CNPJ nº <strong><span data-pmoc-var="empresa.cnpj"></span></strong>, certifica que a unidade <strong><span data-pmoc-var="cliente.nome"></span></strong>, inscrita no CNPJ nº <strong><span data-pmoc-var="cliente.documento"></span></strong>, localizada em <span data-pmoc-var="cliente.endereco"></span>, está sob plano formal de manutenção preventiva e operacional conforme estabelecido pela Lei Federal nº 13.589 de 4 de janeiro de 2018, sob supervisão técnica de <strong><span data-pmoc-var="rt.nome"></span></strong> (<span data-pmoc-var="rt.modalidade"></span> — CFT <span data-pmoc-var="rt.cft_crea"></span>).</p>

<p>&nbsp;</p>

<p><strong>Periodicidade das manutenções:</strong> <span data-pmoc-var="contrato.frequencia"></span>.<br>
<strong>Vigência:</strong> a partir de <span data-pmoc-var="contrato.vigencia_inicio"></span>.</p>

<p>&nbsp;</p>

<p><strong>Validade deste documento:</strong> <span data-pmoc-var="documento.validade"></span>. Válido até <span data-pmoc-var="documento.data_vencimento"></span>.</p>

<p>&nbsp;</p>

<p>Documento gerado em <span data-pmoc-var="data.hoje_extenso"></span>.</p>

<p>&nbsp;</p>
<p>&nbsp;</p>
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

  // -- Onda E: bloco de assinatura do RT (acima do rodapé).
  //    Reservamos espaço pro footer Dominex (~72pt) quando não é white-label.
  const isWhiteLabel = ctx.empresa.white_label_enabled === true;
  const FOOTER_RESERVED = isWhiteLabel ? 40 : 80;
  const SPACE_NEEDED = SIGNATURE_BLOCK_HEIGHT + 20 + FOOTER_RESERVED;

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

  const finalPage = sigPage;

  // -- Onda I (v1.9.x): rodapé Dominex centralizado (logo + URL).
  //    SÓ aparece quando NÃO é white-label — substitui o antigo
  //    "Powered by Dominex" texto-puro.
  await drawDominexFooter(pdf, finalPage, {
    enabled: !isWhiteLabel,
  });

  return {
    page: finalPage,
    pagesUsed: 1 + result.pagesRendered + (sigPage !== result.page ? 1 : 0),
    tagsRemoved,
    attrsRemoved,
    signaturePending: sigResult.pending,
  };
}

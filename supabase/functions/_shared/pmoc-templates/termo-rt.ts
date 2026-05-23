// =============================================================================
// pmoc-templates/termo-rt.ts — Termo de Responsabilidade Técnica.
// =============================================================================
// Renderiza o HTML do Termo RT no PDF. Se gestor não customizou
// (htmlContent=null), monta o template padrão com placeholders substituídos.
//
// Sempre passa pelo sanitizer ANTES de render (defesa em camada server-side).
//
// Onda E (v1.9.x): suporta marker <!-- SIGNATURE_BLOCK --> no HTML. Após o
// renderer terminar o texto, desenha automaticamente o bloco de assinatura
// do RT (com imagem da assinatura embebida quando responsible_technicians
// .signature_image_url existe) no rodapé da última página.
// =============================================================================

import { PDFDocument, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext } from "./context.ts";
import { sanitizeHtml } from "./html-sanitizer.ts";
import { renderHtmlToPdf, A4_W, A4_H, MARGIN_Y, MARGIN_X, CONTENT_W } from "./html-renderer.ts";
import {
  drawRtSignatureBlock,
  SIGNATURE_BLOCK_HEIGHT,
} from "./signature-embed.ts";

// Marcador opcional no HTML pra posicionar o bloco de assinatura. Se ausente,
// desenhamos no rodapé da última página automaticamente. Mantemos o sanitizer
// ignorando esse comentário (sanitizer strippa tudo que não está na whitelist,
// então o comentário some — mas nós não dependemos do comentário aparecer no
// PDF, dependemos só de localizar visualmente o RT block ao final).
export const SIGNATURE_BLOCK_MARKER = "<!-- SIGNATURE_BLOCK -->";

/**
 * Monta o HTML padrão do Termo RT já com placeholders substituídos.
 * Texto exato fornecido pelo CEO (§3.2 do plano da Onda C).
 *
 * Onda E: o bloco final "RESPONSÁVEL TÉCNICO: ___________" é substituído pelo
 * marker SIGNATURE_BLOCK_MARKER (que vira o bloco de assinatura desenhado pelo
 * signature-embed.ts, com imagem se houver).
 */
export function buildDefaultTermoRtHtml(ctx: TemplateContext): string {
  const cft = ctx.rt.cft_crea || "____________________";
  const empresaUpper = ctx.empresa.razao_social.toUpperCase();
  return `
    <h1>TERMO DE RESPONSABILIDADE TÉCNICA – PMOC</h1>
    <p>A empresa <strong>${escapeHtml(ctx.empresa.razao_social)}</strong>, inscrita no CNPJ nº <strong>${escapeHtml(ctx.empresa.cnpj)}</strong>, responsável pela execução dos serviços de manutenção preventiva, corretiva e higienização dos sistemas de climatização da unidade contratante, declara para os devidos fins que os serviços relacionados ao Plano de Manutenção, Operação e Controle (PMOC) serão executados sob supervisão técnica do profissional abaixo identificado:</p>
    <h2>RESPONSÁVEL TÉCNICO</h2>
    <p>Nome: <strong>${escapeHtml(ctx.rt.nome)}</strong><br>
    Modalidade: ${escapeHtml(ctx.rt.modalidade)}<br>
    Registro Profissional CFT: ${escapeHtml(cft)}</p>
    <p>O responsável técnico acima qualificado será responsável pela supervisão técnica do PMOC, validação dos procedimentos executados, orientações técnicas e conformidade dos serviços relacionados aos sistemas de climatização da unidade atendida.</p>
    <p>Os serviços operacionais poderão ser executados por equipe técnica operacional da <strong>${escapeHtml(ctx.empresa.razao_social)}</strong>, devidamente treinada e orientada, ficando o responsável técnico encarregado da supervisão geral do plano de manutenção.</p>
    <p>A documentação referente ao PMOC ficará disponível na unidade para apresentação aos órgãos fiscalizadores competentes.</p>
    <p>${escapeHtml(ctx.cidade)}, ____ de ___________________ de 20____.</p>
    <h3>CONTRATANTE:</h3>
    <p>___________________________________________</p>
    <h3>${escapeHtml(empresaUpper)}:</h3>
    <p>___________________________________________</p>
    ${SIGNATURE_BLOCK_MARKER}
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

/**
 * Renderiza a página do Termo RT. Se `customHtml` é fornecido, sanitiza e usa.
 * Senão, monta o default a partir do `ctx`.
 *
 * Retorna { page, pagesUsed, tagsRemoved, attrsRemoved, signaturePending }
 * pra logging.
 */
export interface RenderTermoRtResult {
  page: PDFPage;
  pagesUsed: number;
  tagsRemoved: number;
  attrsRemoved: number;
  /** true se nenhuma signature_image_url estava disponível ao gerar (estado pendente). */
  signaturePending: boolean;
}

export async function drawTermoRtPage(
  pdf: PDFDocument,
  ctx: TemplateContext,
  customHtml: string | null,
): Promise<RenderTermoRtResult> {
  const raw = customHtml && customHtml.trim().length > 0
    ? customHtml
    : buildDefaultTermoRtHtml(ctx);

  // SANITIZE OBRIGATÓRIO — defesa em camada server-side (Regra Plataforma §2.7)
  // O sanitizer strippa o comentário <!-- SIGNATURE_BLOCK --> também, mas isso
  // é OK: o marker só serve pro template default sinalizar onde IRIA o bloco;
  // o desenho do bloco de assinatura é sempre feito no rodapé da última página.
  const { clean, tagsRemoved, attrsRemoved } = sanitizeHtml(raw);

  // Nova página sempre (termo começa em folha limpa)
  const initialPage = pdf.addPage([A4_W, A4_H]);
  const result = await renderHtmlToPdf(pdf, clean, {
    startPage: initialPage,
    cursorY: A4_H - MARGIN_Y,
    newPage: () => pdf.addPage([A4_W, A4_H]),
  });

  // -- Onda E: desenhar bloco de assinatura do RT no rodapé da última página.
  //    Se não houver espaço suficiente abaixo do cursor, criar nova página.
  const SPACE_NEEDED = SIGNATURE_BLOCK_HEIGHT + 20; // 20pt de respiro topo
  let sigPage = result.page;
  let sigTopY = result.cursorY - 16; // respiro entre conteúdo e bloco

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

  return {
    page: sigPage,
    pagesUsed: 1 + result.pagesRendered + (sigPage !== result.page ? 1 : 0),
    tagsRemoved,
    attrsRemoved,
    signaturePending: sigResult.pending,
  };
}

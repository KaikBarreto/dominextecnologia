// =============================================================================
// pmoc-templates/termo-rt.ts — Termo de Responsabilidade Técnica.
// =============================================================================
// Renderiza o HTML do Termo RT no PDF. Se gestor não customizou
// (htmlContent=null), monta o template padrão com placeholders substituídos.
//
// Sempre passa pelo sanitizer ANTES de render (defesa em camada server-side).
// =============================================================================

import { PDFDocument, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext } from "./context.ts";
import { sanitizeHtml } from "./html-sanitizer.ts";
import { renderHtmlToPdf, A4_W, A4_H, MARGIN_Y } from "./html-renderer.ts";

/**
 * Monta o HTML padrão do Termo RT já com placeholders substituídos.
 * Texto exato fornecido pelo CEO (§3.2 do plano da Onda C).
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
    <h3>RESPONSÁVEL TÉCNICO:</h3>
    <p>___________________________________________</p>
    <p>${escapeHtml(ctx.rt.nome)}<br>${escapeHtml(ctx.rt.modalidade)}<br>CFT: ${escapeHtml(cft)}</p>
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
 * Retorna { page, pagesUsed, tagsRemoved, attrsRemoved } pra logging.
 */
export interface RenderTermoRtResult {
  page: PDFPage;
  pagesUsed: number;
  tagsRemoved: number;
  attrsRemoved: number;
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
  const { clean, tagsRemoved, attrsRemoved } = sanitizeHtml(raw);

  // Nova página sempre (termo começa em folha limpa)
  const initialPage = pdf.addPage([A4_W, A4_H]);
  const result = await renderHtmlToPdf(pdf, clean, {
    startPage: initialPage,
    cursorY: A4_H - MARGIN_Y,
    newPage: () => pdf.addPage([A4_W, A4_H]),
  });

  return {
    page: result.page,
    pagesUsed: 1 + result.pagesRendered, // initialPage + extras
    tagsRemoved,
    attrsRemoved,
  };
}

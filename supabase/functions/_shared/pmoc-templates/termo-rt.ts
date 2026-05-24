// =============================================================================
// pmoc-templates/termo-rt.ts — Termo de Responsabilidade Técnica.
// =============================================================================
// Renderiza o HTML do Termo RT no PDF. Se gestor não customizou
// (htmlContent=null), monta o template padrão com placeholders de variável.
//
// Pipeline (Onda H — v1.9.x):
//   1. raw HTML (do banco ou default) — pode conter <span data-pmoc-var="...">
//   2. substituteVariables(raw, variableContext) — troca spans por valores reais
//   3. sanitizeHtml(...) — defesa em camada server-side (whitelist tags/attrs)
//   4. renderHtmlToPdf(...) — desenha no PDF
//
// ORDEM IMPORTA: o sanitizer strippa o atributo `data-pmoc-var` do <span>
// (não está na whitelist). Se trocar a ordem, o span chega "limpo" no
// substituteVariables e a substituição falha silenciosamente.
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
import { PmocVariableContext, substituteVariables } from "./variables.ts";
import { drawTenantHeader } from "./header.ts";
import { drawDominexFooter } from "./footer.ts";

// Marcador opcional no HTML pra posicionar o bloco de assinatura. Se ausente,
// desenhamos no rodapé da última página automaticamente. Mantemos o sanitizer
// ignorando esse comentário (sanitizer strippa tudo que não está na whitelist,
// então o comentário some — mas nós não dependemos do comentário aparecer no
// PDF, dependemos só de localizar visualmente o RT block ao final).
export const SIGNATURE_BLOCK_MARKER = "<!-- SIGNATURE_BLOCK -->";

/**
 * Monta o HTML padrão do Termo RT com spans `data-pmoc-var` (Onda H).
 *
 * O texto vem do CEO (§3.2 do plano Onda C), agora com variáveis em vez de
 * valores pré-substituídos. Após `substituteVariables`, vira o texto final.
 * Espelha 1:1 `src/utils/pmocDocumentTemplates.ts#buildDefaultTermoRtHtml`
 * pra que o gestor vendo no editor seja idêntico ao PDF.
 *
 * Onda E: o bloco final é seguido por SIGNATURE_BLOCK_MARKER (que vira o
 * bloco de assinatura desenhado pelo signature-embed.ts).
 */
export function buildDefaultTermoRtHtml(): string {
  return `
<h2>TERMO DE RESPONSABILIDADE TÉCNICA — PMOC</h2>

<p>A empresa <strong><span data-pmoc-var="empresa.razao_social"></span></strong>, inscrita no CNPJ nº <strong><span data-pmoc-var="empresa.cnpj"></span></strong>, responsável pela execução dos serviços de manutenção preventiva, corretiva e higienização dos sistemas de climatização da unidade contratante, declara para os devidos fins que os serviços relacionados ao Plano de Manutenção, Operação e Controle (PMOC) serão executados sob supervisão técnica do profissional abaixo identificado:</p>

<h3>RESPONSÁVEL TÉCNICO</h3>

<p><strong>Nome:</strong> <span data-pmoc-var="rt.nome"></span><br>
<strong>Modalidade:</strong> <span data-pmoc-var="rt.modalidade"></span><br>
<strong>Registro Profissional CFT:</strong> <span data-pmoc-var="rt.cft_crea"></span></p>

<p>O responsável técnico acima qualificado será responsável pela supervisão técnica do PMOC, validação dos procedimentos executados, orientações técnicas e conformidade dos serviços relacionados aos sistemas de climatização da unidade atendida.</p>

<p>Os serviços operacionais poderão ser executados por equipe técnica operacional da <strong><span data-pmoc-var="empresa.razao_social"></span></strong>, devidamente treinada e orientada, ficando o responsável técnico encarregado da supervisão geral do plano de manutenção.</p>

<p>A documentação referente ao PMOC ficará disponível na unidade para apresentação aos órgãos fiscalizadores competentes.</p>

<p><span data-pmoc-var="empresa.cidade"></span>, <span data-pmoc-var="contrato.criado_dia"></span> de <span data-pmoc-var="contrato.criado_mes"></span> de <span data-pmoc-var="contrato.criado_ano"></span>.</p>

<p><strong>CONTRATANTE:</strong></p>

<p>&nbsp;</p>
<p>&nbsp;</p>
<p>___________________________________________</p>

<p><strong><span data-pmoc-var="empresa.razao_social"></span>:</strong></p>

<p>&nbsp;</p>
<p>&nbsp;</p>
<p>___________________________________________</p>

${SIGNATURE_BLOCK_MARKER}
`.trim();
}

/**
 * Renderiza a página do Termo RT. Se `customHtml` é fornecido, sanitiza e usa.
 * Senão, monta o default. Em ambos os casos, `variableContext` é aplicado
 * ANTES do sanitizer pra substituir os `<span data-pmoc-var="X">`.
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
  variableContext: PmocVariableContext | null = null,
): Promise<RenderTermoRtResult> {
  const raw = customHtml && customHtml.trim().length > 0
    ? customHtml
    : buildDefaultTermoRtHtml();

  // ---- (Onda H) Substituir variáveis ANTES do sanitizer.
  //      Sanitizer remove o atributo data-pmoc-var de <span>, então a ordem
  //      inversa quebra o pipeline (span chega "vazio" no substituidor).
  const substituted = substituteVariables(raw, variableContext);

  // SANITIZE OBRIGATÓRIO — defesa em camada server-side (Regra Plataforma §2.7)
  // O sanitizer strippa o comentário <!-- SIGNATURE_BLOCK --> também, mas isso
  // é OK: o marker só serve pro template default sinalizar onde IRIA o bloco;
  // o desenho do bloco de assinatura é sempre feito no rodapé da última página.
  const { clean, tagsRemoved, attrsRemoved } = sanitizeHtml(substituted);

  // Nova página sempre (termo começa em folha limpa)
  const initialPage = pdf.addPage([A4_W, A4_H]);

  // -- Onda I (v1.9.x): cabeçalho com identidade do tenant no topo do TRT.
  //    Replica o visual do ReportHeader da OS (logo + nome + CNPJ + endereço).
  //    Sempre desenha (mesmo sem opt-in) — tenant é a parte regulatória do
  //    documento, faz sentido aparecer também no PDF standalone.
  const headerResult = await drawTenantHeader(
    pdf,
    initialPage,
    {
      name: ctx.empresa.razao_social,
      cnpj: ctx.empresa.cnpj || null,
      phone: ctx.empresa.phone ?? null,
      email: ctx.empresa.email ?? null,
      address: ctx.empresa.address ?? null,
      address_number: ctx.empresa.address_number ?? null,
      neighborhood: ctx.empresa.neighborhood ?? null,
      city: ctx.empresa.cidade || null,
      state: ctx.empresa.state ?? null,
      zip_code: ctx.empresa.zip_code ?? null,
      logo_bytes: ctx.empresa.logo_bytes ?? null,
      logo_mime: ctx.empresa.logo_mime ?? null,
    },
    {
      bgColor: ctx.empresa.header_bg_color ?? null,
      textColor: ctx.empresa.header_text_color ?? null,
      logoSize: ctx.empresa.header_logo_size ?? null,
    },
  );

  // Conteúdo começa abaixo do header (com respiro de 18pt).
  const contentStartY = headerResult.bottomY - 18;
  const result = await renderHtmlToPdf(pdf, clean, {
    startPage: initialPage,
    cursorY: contentStartY,
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

  // -- Onda I (v1.9.x): rodapé Dominex centralizado, só se NÃO for white-label.
  //    Desenhamos na MESMA página onde está o bloco de assinatura (última do TRT).
  await drawDominexFooter(pdf, sigPage, {
    enabled: ctx.empresa.white_label_enabled !== true,
  });

  return {
    page: sigPage,
    pagesUsed: 1 + result.pagesRendered + (sigPage !== result.page ? 1 : 0),
    tagsRemoved,
    attrsRemoved,
    signaturePending: sigResult.pending,
  };
}

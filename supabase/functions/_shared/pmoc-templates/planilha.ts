// =============================================================================
// pmoc-templates/planilha.ts — "Planilha PMOC" (espelha o modelo do cliente).
// =============================================================================
// Layout fiel ao `public/MODELO DE PMOC.pdf`:
//   Título centralizado preto-sobre-branco:
//     "PMOC - PLANO DE MANUTENÇÃO, OPERAÇÃO E CONTROLE"
//     "SISTEMAS DE AR CONDICIONADO – <empresa>"
//   Seção 1 — Identificação do ambiente (unidade/local) — tabela com borda.
//   Seção 2 — Proprietário / locatário — tabela com borda.
//   Seção 3 — Responsável Técnico (nome / CFT-CREA / modalidade) — tabela.
//   Seção 4 — Relação dos ambientes climatizados — tabela (tipo, ocupantes,
//             identificação, área, carga térmica) + equipamentos por ambiente.
//   Seção 5 — Plano de manutenção: ITEM / DESCRIÇÃO / PERIODICIDADE agrupado por
//             componente (FILTROS DE AR, BANDEJAS, ...), com matriz de 12 meses
//             (M=todo mês, T a cada 3, S a cada 6, A no 12; E não entra).
//   (Opcional) Resumo de execução: visitas concluídas + conformidade.
//
// Auto-paginação: helper `ensureSpace` abre nova página e redesenha o
// cabeçalho compacto quando o conteúdo não cabe.
//
// O logo é desenhado a partir do PDFImage JÁ embedado (passado pela edge) pra
// não re-decodificar o raster por página (régua de memória do worker).
// =============================================================================

import {
  PDFDocument,
  PDFPage,
  PDFImage,
  PDFFont,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { drawDominexFooterLine, embedDominexFooterLogo } from "./footer.ts";

// Faixa inferior reservada pro rodapé Dominex (linha + logo + URL). O conteúdo
// nunca pode invadir essa região, então a paginação descansa o cursor acima
// dela. ~70pt cobre o texto (y≈24) + logo + linha (y≈54) com folga.
const FOOTER_RESERVED_H = 92;

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN_X = 50;
const CONTENT_W = A4_W - 2 * MARGIN_X;

const COLORS = {
  black: rgb(0.1, 0.1, 0.1),
  gray: rgb(0.42, 0.42, 0.42),
  lightGray: rgb(0.93, 0.93, 0.93),
  rowAlt: rgb(0.972, 0.972, 0.972),
  border: rgb(0.55, 0.55, 0.55),
  cellLabelBg: rgb(0.95, 0.95, 0.95),
  headerBg: rgb(0.86, 0.86, 0.86), // cabeçalho de tabela cinza (estilo modelo)
  headerText: rgb(0.1, 0.1, 0.1),
  accent: rgb(0.12, 0.16, 0.23),
  mark: rgb(0.18, 0.62, 0.31), // verde — mês marcado na matriz
  white: rgb(1, 1, 1),
};

const MESES_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// Rótulos PT-BR das seções do plano (chave = `section` de
// contract_plan_activities). Fallback = a própria chave humanizada.
const SECTION_LABELS: Record<string, string> = {
  condicionadores: "Condicionadores de Ar",
  dutos: "Dutos e Difusores",
  tomada_ar_exterior: "Tomada de Ar Exterior",
  casa_maquinas: "Casa de Máquinas",
  quadros_eletricos: "Quadros Elétricos",
  medicoes: "Medições (Relatório Técnico)",
  testes: "Testes",
  tubulacao_hidraulica: "Tubulação Hidráulica",
  torres_resfriamento: "Torres de Resfriamento",
  bombas_agua: "Bombas de Água",
  caixa_expansao: "Caixa de Expansão / Reposição",
  tratamento_quimico: "Tratamento Físico-Químico da Água",
  qualidade_ar: "Qualidade do Ar Interior",
  // Componentes do modelo PMOC (Lei 13.589/2018).
  filtros_ar: "Filtros de Ar",
  bandejas: "Bandejas",
  evaporadores: "Evaporadores",
  serpentinas: "Serpentinas",
  gabinetes: "Gabinetes",
  condensadores: "Condensadores",
  ventiladores: "Ventiladores",
  motores_eletricos: "Motores Elétricos",
  compressores: "Compressores",
  circuito_refrigerante: "Circuito Refrigerante",
  circuito_eletrico: "Circuito Elétrico",
};

const FREQ_MONTHS: Record<string, number> = { M: 1, T: 3, S: 6, A: 12 };

export interface PlanilhaEquipment {
  name: string | null;
  brand: string | null;
  model: string | null;
  capacity: string | null;
  location: string | null;
  serial_number: string | null;
}

// Seção 4 do modelo do cliente — caracterização do ambiente climatizado
// (tipo de atividade, identificação, área, ocupantes e carga térmica). Vem das
// linhas de `contract_environments` (1 contrato → N ambientes); no legado, de
// um único ambiente das colunas pmoc_* do contrato. Campo ausente vira "—".
export interface PlanilhaAmbiente {
  tipo_atividade: string | null;
  identificacao: string | null;
  area_m2: number | null;
  ocupantes_fixos: number | null;
  ocupantes_flutuantes: number | null;
  carga_termica_tr: number | null;
}

// Um ambiente climatizado COM seus próprios equipamentos. O modelo do cliente
// repete a relação (caracterização + equipamentos) por unidade; aqui cada bloco
// é uma unidade. `equipments` são só os equipamentos daquele ambiente.
export interface PlanilhaAmbienteBlock {
  ambiente: PlanilhaAmbiente;
  equipments: PlanilhaEquipment[];
}

export interface PlanilhaActivity {
  section: string | null;
  component: string | null;
  description: string | null;
  freq_code: string | null; // M|T|S|A|E
  freq_months: number | null; // caso genérico (não-PMOC)
}

export interface PlanilhaExecutionSummary {
  total: number;
  concluidas: number;
  conformes: number;
  nao_conformes: number;
}

export interface PlanilhaData {
  tenant: {
    name: string;
    cnpj: string;
    logoImage: PDFImage | null;
  };
  customer: {
    name: string;
    document: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  /**
   * Identificação da UNIDADE/local do contrato PMOC (Seção 1). 1 contrato = 1
   * unidade (loja/site), que pode ter endereço PRÓPRIO (≠ do cliente/proprietário
   * — ex.: rede com várias lojas). Vem das colunas `unidade_*` de `contracts`.
   * Campo vazio → a edge passa fallback pro endereço/nome do cliente, então aqui
   * é tratado como já resolvido (vazio vira "—").
   */
  unidade: {
    nome: string | null;
    endereco: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
  };
  rt: {
    nome: string;
    modalidade: string;
    cft_crea: string | null;
  };
  contract: {
    name: string | null;
    start_date_extenso: string;
    frequency_label: string;
  };
  /**
   * Ambientes climatizados do contrato (1→N), cada um com seus equipamentos.
   * Renderiza UM bloco por ambiente (igual o modelo do cliente). Quando o
   * contrato não tem ambientes cadastrados, a edge passa um único bloco vindo
   * das colunas pmoc_* legadas (com todos os equipamentos sem environment_id).
   */
  ambientes: PlanilhaAmbienteBlock[];
  activities: PlanilhaActivity[];
  execution: PlanilhaExecutionSummary | null;
  generated_at_extenso: string;
  /**
   * Quando true (tenant white-label), o rodapé Dominex NÃO é desenhado em
   * nenhuma página. Mesmo critério do Dossiê (`company_settings
   * .white_label_enabled`). Sem marca Dominex em documento white-label.
   */
  whiteLabel: boolean;
}

// WinAnsi (Helvetica) não tem todos os glifos — normaliza os problemáticos.
function safe(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, "-");
}

// Número no padrão BR (vírgula decimal), sem casas inúteis. null/undefined → "—".
function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = Number.isInteger(n) ? String(n) : String(n);
  return s.replace(".", ",");
}

// Texto livre vazio vira travessão.
function orDash(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : "—";
}

function sectionLabel(key: string | null): string {
  if (!key) return "Outros";
  return SECTION_LABELS[key] ?? humanize(key);
}

// "circuito_refrigerante" -> "Circuito refrigerante" (texto humano, sem
// underscore técnico). Capitaliza só a 1ª letra.
function humanize(key: string): string {
  const s = key.replace(/_/g, " ").trim().toLowerCase();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Meses em que uma atividade cai, na janela de 12 meses (0-based).
// M=todo mês; T a cada 3; S a cada 6; A no índice 0 (mês 12 do ciclo anterior =
// início). Eventual (E) → nunca marca (entra sob demanda). Caso genérico usa
// freq_months. Regra alinhada ao motor (`k % meses == 0`).
function monthsHit(freqCode: string | null, freqMonths: number | null): boolean[] {
  const hit = new Array(12).fill(false);
  let step = 0;
  if (freqCode && FREQ_MONTHS[freqCode]) {
    step = FREQ_MONTHS[freqCode];
  } else if (freqCode === "E") {
    return hit; // eventual não entra no cronograma
  } else if (freqMonths && freqMonths > 0) {
    step = freqMonths;
  } else {
    return hit;
  }
  for (let k = 0; k < 12; k++) {
    if (k % step === 0) hit[k] = true;
  }
  return hit;
}

// Quebra texto em linhas que cabem em `maxW` na fonte/tamanho dados. Quebra
// também PALAVRA longa que não cabe sozinha (evita overflow pra coluna vizinha).
function wrapText(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  const pushBrokenWord = (word: string) => {
    // Palavra maior que a célula: quebra por caractere.
    let chunk = "";
    for (const ch of word) {
      const tryChunk = chunk + ch;
      if (font.widthOfTextAtSize(tryChunk, size) > maxW && chunk) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = tryChunk;
      }
    }
    cur = chunk;
  };
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(tryLine, size) > maxW) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      if (font.widthOfTextAtSize(w, size) > maxW) {
        pushBrokenWord(w);
      } else {
        cur = w;
      }
    } else {
      cur = tryLine;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  helv: PDFFont;
  helvBold: PDFFont;
  cursorY: number;
  data: PlanilhaData;
  /** Logo Dominex pré-embedado (uma vez) pro rodapé de toda página. */
  dominexLogo: PDFImage | null;
}

// Rodapé Dominex desenhado em TODA página (linha + logo + dominex.app). Some em
// white-label. Reusa o PDFImage pré-embedado pra não estourar o worker de PDF.
function drawPageFooter(ctx: Ctx): void {
  drawDominexFooterLine(ctx.page, {
    enabled: !ctx.data.whiteLabel,
    logoImage: ctx.dominexLogo,
    font: ctx.helv,
    marginX: MARGIN_X,
  });
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.pdf.addPage([A4_W, A4_H]);
  drawCompactHeader(ctx);
  drawPageFooter(ctx);
}

// Cabeçalho compacto reusado no topo de cada página (a partir da 2ª). Discreto,
// preto-sobre-branco com linha fina embaixo (sem faixa escura — estilo modelo).
function drawCompactHeader(ctx: Ctx): void {
  const { page, data, helv, helvBold } = ctx;
  const topY = A4_H - 28;

  let textX = MARGIN_X;
  if (data.tenant.logoImage) {
    try {
      const img = data.tenant.logoImage;
      const h = 22;
      const w = (img.width / img.height) * h;
      page.drawImage(img, {
        x: MARGIN_X,
        y: topY - h + 4,
        width: w,
        height: h,
      });
      textX = MARGIN_X + w + 10;
    } catch {
      // ignora
    }
  }

  page.drawText(safe(data.tenant.name).slice(0, 60), {
    x: textX,
    y: topY - 8,
    size: 10,
    font: helvBold,
    color: COLORS.black,
  });
  page.drawText("PMOC - Plano de Manutencao, Operacao e Controle", {
    x: textX,
    y: topY - 19,
    size: 7,
    font: helv,
    color: COLORS.gray,
  });

  // Linha fina separadora.
  page.drawLine({
    start: { x: MARGIN_X, y: topY - 26 },
    end: { x: MARGIN_X + CONTENT_W, y: topY - 26 },
    thickness: 0.5,
    color: COLORS.border,
  });

  ctx.cursorY = topY - 40;
}

// Título principal (só na 1ª página): centralizado, preto sobre branco.
function drawMainTitle(ctx: Ctx): void {
  const { page, data, helv, helvBold } = ctx;
  const topY = A4_H - 56;

  const t1 = "PMOC - PLANO DE MANUTENCAO, OPERACAO E CONTROLE";
  const t1Size = 15;
  const t1W = helvBold.widthOfTextAtSize(t1, t1Size);
  page.drawText(t1, {
    x: (A4_W - t1W) / 2,
    y: topY,
    size: t1Size,
    font: helvBold,
    color: COLORS.black,
  });

  const empresa = safe(data.tenant.name).toUpperCase();
  const t2 = `SISTEMAS DE AR CONDICIONADO - ${empresa}`;
  let t2Size = 10;
  while (t2Size > 7 && helvBold.widthOfTextAtSize(t2, t2Size) > CONTENT_W) {
    t2Size -= 0.5;
  }
  const t2W = helvBold.widthOfTextAtSize(t2, t2Size);
  page.drawText(t2, {
    x: (A4_W - t2W) / 2,
    y: topY - 16,
    size: t2Size,
    font: helvBold,
    color: COLORS.black,
  });

  ctx.cursorY = topY - 40;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.cursorY - needed < FOOTER_RESERVED_H) {
    newPage(ctx);
  }
}

// Título de seção numerada (estilo modelo: número + título em negrito, sem
// faixa colorida — texto preto com underline implícito pela própria tabela).
function drawSectionTitle(ctx: Ctx, num: string, title: string): void {
  ensureSpace(ctx, 26);
  const { page, helvBold } = ctx;
  page.drawText(`${num} - ${safe(title)}`, {
    x: MARGIN_X,
    y: ctx.cursorY - 11,
    size: 10,
    font: helvBold,
    color: COLORS.black,
  });
  ctx.cursorY -= 18;
}

// ---------------------------------------------------------------------------
// Primitivos de tabela com borda (estilo do modelo do cliente).
// ---------------------------------------------------------------------------

// Desenha uma célula: retângulo com borda, opcionalmente fundo (rótulo) e
// label (negrito pequeno em cima) + valor embaixo. Retorna nada (altura fixa).
function drawCell(
  ctx: Ctx,
  x: number,
  y: number, // topo da célula
  w: number,
  h: number,
  opts: { label?: string; value?: string; bg?: ReturnType<typeof rgb> },
): void {
  const { page, helv, helvBold } = ctx;
  if (opts.bg) {
    page.drawRectangle({ x, y: y - h, width: w, height: h, color: opts.bg });
  }
  page.drawRectangle({
    x,
    y: y - h,
    width: w,
    height: h,
    borderColor: COLORS.border,
    borderWidth: 0.6,
  });
  let cy = y - 10;
  if (opts.label) {
    page.drawText(safe(opts.label), {
      x: x + 4,
      y: cy,
      size: 6.8,
      font: helvBold,
      color: COLORS.gray,
    });
    cy -= 11;
  }
  if (opts.value !== undefined) {
    let txt = safe(opts.value);
    while (txt.length > 1 && helv.widthOfTextAtSize(txt, 8.5) > w - 8) {
      txt = txt.slice(0, -2) + "…";
    }
    page.drawText(txt, {
      x: x + 4,
      y: cy,
      size: 8.5,
      font: helv,
      color: COLORS.black,
    });
  }
}

// Uma linha de células rotuladas (label em cima, valor embaixo). cells: array de
// {label,value,frac}. frac soma 1 (proporção da largura). Altura padrão 26pt.
function drawLabeledRow(
  ctx: Ctx,
  cells: { label: string; value: string; frac: number }[],
  rowH = 26,
): void {
  ensureSpace(ctx, rowH);
  let x = MARGIN_X;
  for (const c of cells) {
    const w = CONTENT_W * c.frac;
    drawCell(ctx, x, ctx.cursorY, w, rowH, { label: c.label, value: c.value });
    x += w;
  }
  ctx.cursorY -= rowH;
}

export async function drawPlanilha(
  pdf: PDFDocument,
  data: PlanilhaData,
): Promise<void> {
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Logo Dominex do rodapé: embedado UMA vez aqui e reusado em todas as páginas
  // (a planilha auto-pagina). Pular o embed em white-label evita trabalho inútil.
  const dominexLogo = data.whiteLabel ? null : await embedDominexFooterLogo(pdf);

  const ctx: Ctx = {
    pdf,
    page: pdf.addPage([A4_W, A4_H]),
    helv,
    helvBold,
    cursorY: 0,
    data,
    dominexLogo,
  };
  drawMainTitle(ctx);
  drawPageFooter(ctx);
  ctx.cursorY -= 8;

  // ---- Seção 1 — Identificação do ambiente climatizado (UNIDADE) -----------
  drawSectionTitle(ctx, "1", "Identificacao do Ambiente ou Conjunto de Ambientes");
  const u = data.unidade;
  // Linha cheia: Unidade / Local.
  drawLabeledRow(ctx, [
    { label: "UNIDADE / LOCAL", value: orDash(u.nome ?? data.customer.name), frac: 1 },
  ]);
  // Endereço + Nº.
  const ruaNum = orDash(u.endereco);
  drawLabeledRow(ctx, [
    { label: "ENDEREÇO COMPLETO", value: ruaNum, frac: 0.82 },
    { label: "Nº", value: orDash(u.numero), frac: 0.18 },
  ]);
  // Complemento / Bairro / Cidade / UF.
  drawLabeledRow(ctx, [
    { label: "COMPLEMENTO", value: orDash(u.complemento), frac: 0.28 },
    { label: "BAIRRO", value: orDash(u.bairro), frac: 0.28 },
    { label: "CIDADE", value: orDash(u.cidade), frac: 0.30 },
    { label: "UF", value: orDash(u.uf), frac: 0.14 },
  ]);
  // CEP / Contrato / Início vigência.
  drawLabeledRow(ctx, [
    { label: "CEP", value: orDash(u.cep), frac: 0.22 },
    { label: "CONTRATO", value: orDash(data.contract.name), frac: 0.45 },
    { label: "INÍCIO DA VIGÊNCIA", value: data.contract.start_date_extenso, frac: 0.33 },
  ]);
  ctx.cursorY -= 12;

  // ---- Seção 2 — Proprietário / Locatário ----------------------------------
  drawSectionTitle(ctx, "2", "Identificacao do Proprietario, Locatario ou Preposto");
  drawLabeledRow(ctx, [
    { label: "NOME / RAZÃO SOCIAL", value: orDash(data.customer.name), frac: 0.62 },
    { label: "CPF / CNPJ", value: orDash(data.customer.document), frac: 0.38 },
  ]);
  drawLabeledRow(ctx, [
    { label: "ENDEREÇO COMPLETO", value: orDash(data.customer.address), frac: 0.62 },
    { label: "CIDADE", value: orDash(data.customer.city), frac: 0.26 },
    { label: "UF", value: orDash(data.customer.state), frac: 0.12 },
  ]);
  ctx.cursorY -= 12;

  // ---- Seção 3 — Responsável Técnico ---------------------------------------
  drawSectionTitle(ctx, "3", "Identificacao do Responsavel Tecnico");
  drawLabeledRow(ctx, [
    { label: "NOME", value: orDash(data.rt.nome), frac: 0.62 },
    { label: "CFT / CREA", value: orDash(data.rt.cft_crea), frac: 0.38 },
  ]);
  drawLabeledRow(ctx, [
    { label: "MODALIDADE", value: orDash(data.rt.modalidade), frac: 0.62 },
    { label: "PERIODICIDADE BASE", value: orDash(data.contract.frequency_label), frac: 0.38 },
  ]);
  ctx.cursorY -= 12;

  // ---- Seção 4 — Relação dos ambientes climatizados ------------------------
  drawSectionTitle(ctx, "4", "Relacao dos Ambientes Climatizados");
  const ambientes = data.ambientes ?? [];
  if (ambientes.length === 0) {
    ensureSpace(ctx, 18);
    ctx.page.drawText("Nenhum ambiente climatizado cadastrado no contrato.", {
      x: MARGIN_X,
      y: ctx.cursorY - 11,
      size: 9,
      font: helv,
      color: COLORS.gray,
    });
    ctx.cursorY -= 18;
  } else {
    // Cabeçalho da tabela de caracterização (estilo modelo).
    drawAmbientesHeader(ctx);
    ambientes.forEach((bloco, i) => {
      drawAmbienteRow(ctx, bloco.ambiente, i);
    });
    ctx.cursorY -= 6;
    // Equipamentos por ambiente (logo abaixo da relação).
    ambientes.forEach((bloco, i) => {
      const ident = orDash(bloco.ambiente.identificacao);
      const subTitle = ambientes.length > 1
        ? `Equipamentos - ${ident !== "—" ? ident : `Ambiente ${i + 1}`}`
        : "Relação de Equipamentos";
      drawEquipSubtitle(ctx, subTitle);
      drawEquipmentTable(ctx, bloco.equipments);
      ctx.cursorY -= 4;
    });
  }
  ctx.cursorY -= 10;

  // ---- Seção 5 — Plano de manutenção + matriz 12 meses ---------------------
  drawSectionTitle(ctx, "5", "Plano de Manutencao (Periodicidade Programada)");
  drawPlanTable(ctx);

  // ---- (Opcional) Resumo de execução ---------------------------------------
  if (data.execution && data.execution.total > 0) {
    ctx.cursorY -= 10;
    drawSectionTitle(ctx, "6", "Registro de Execucao");
    drawExecutionSummary(ctx);
  }

  // Data de geração (sem selo regulatório no PDF).
  drawGeneratedAt(ctx);
}

// -- Seção 4: cabeçalho da tabela de caracterização dos ambientes ------------
function drawAmbientesHeader(ctx: Ctx): void {
  const rowH = 24;
  ensureSpace(ctx, rowH);
  const { page, helvBold } = ctx;
  const cols = [
    { label: "TIPO DE ATIVIDADE", frac: 0.24 },
    { label: "OCUP. FIXOS", frac: 0.12 },
    { label: "OCUP. FLUT.", frac: 0.12 },
    { label: "IDENTIFICAÇÃO", frac: 0.26 },
    { label: "ÁREA (m²)", frac: 0.14 },
    { label: "CARGA (TR)", frac: 0.12 },
  ];
  let x = MARGIN_X;
  for (const c of cols) {
    const w = CONTENT_W * c.frac;
    page.drawRectangle({
      x,
      y: ctx.cursorY - rowH,
      width: w,
      height: rowH,
      color: COLORS.headerBg,
      borderColor: COLORS.border,
      borderWidth: 0.6,
    });
    // label centralizado (até 2 linhas)
    const lines = wrapText(helvBold, c.label, 7, w - 6);
    let ly = ctx.cursorY - (rowH - lines.length * 8) / 2 - 7;
    for (const ln of lines) {
      const lw = helvBold.widthOfTextAtSize(ln, 7);
      page.drawText(ln, {
        x: x + (w - lw) / 2,
        y: ly,
        size: 7,
        font: helvBold,
        color: COLORS.headerText,
      });
      ly -= 8;
    }
    x += w;
  }
  ctx.cursorY -= rowH;
}

// -- Seção 4: uma linha da tabela de caracterização --------------------------
function drawAmbienteRow(ctx: Ctx, a: PlanilhaAmbiente, idx: number): void {
  const { helv } = ctx;
  const cols = [
    { value: orDash(a.tipo_atividade), frac: 0.24 },
    { value: a.ocupantes_fixos != null ? fmtNum(a.ocupantes_fixos) : "—", frac: 0.12 },
    { value: a.ocupantes_flutuantes != null ? fmtNum(a.ocupantes_flutuantes) : "—", frac: 0.12 },
    { value: orDash(a.identificacao), frac: 0.26 },
    { value: a.area_m2 != null ? `${fmtNum(a.area_m2)} m²` : "—", frac: 0.14 },
    { value: a.carga_termica_tr != null ? `${fmtNum(a.carga_termica_tr)} TR` : "—", frac: 0.12 },
  ];
  // altura por wrap da maior coluna textual
  const maxLines = Math.max(
    ...cols.map((c) => wrapText(helv, c.value, 8, CONTENT_W * c.frac - 8).length),
  );
  const rowH = Math.max(20, maxLines * 9 + 8);
  if (ctx.cursorY - rowH < FOOTER_RESERVED_H) {
    newPage(ctx);
    drawAmbientesHeader(ctx);
  }
  const { page } = ctx;
  let x = MARGIN_X;
  for (const c of cols) {
    const w = CONTENT_W * c.frac;
    if (idx % 2 === 1) {
      page.drawRectangle({
        x,
        y: ctx.cursorY - rowH,
        width: w,
        height: rowH,
        color: COLORS.rowAlt,
      });
    }
    page.drawRectangle({
      x,
      y: ctx.cursorY - rowH,
      width: w,
      height: rowH,
      borderColor: COLORS.border,
      borderWidth: 0.6,
    });
    const lines = wrapText(helv, c.value, 8, w - 8);
    let ly = ctx.cursorY - 10;
    for (const ln of lines) {
      const lw = helv.widthOfTextAtSize(ln, 8);
      page.drawText(ln, {
        x: x + (w - lw) / 2,
        y: ly,
        size: 8,
        font: helv,
        color: COLORS.black,
      });
      ly -= 9;
    }
    x += w;
  }
  ctx.cursorY -= rowH;
}

// -- Seção 4: subtítulo da relação de equipamentos ---------------------------
function drawEquipSubtitle(ctx: Ctx, title: string): void {
  ensureSpace(ctx, 16);
  ctx.page.drawText(safe(title), {
    x: MARGIN_X,
    y: ctx.cursorY - 10,
    size: 8.5,
    font: ctx.helvBold,
    color: COLORS.accent,
  });
  ctx.cursorY -= 15;
}

// -- Seção 4 (parte B): tabela de equipamentos do ambiente -------------------
function drawEquipmentTable(ctx: Ctx, equipments: PlanilhaEquipment[]): void {
  const { helv, helvBold } = ctx;
  const cols = [
    { key: "name", label: "Equipamento", w: 0.30 },
    { key: "brand", label: "Marca", w: 0.16 },
    { key: "model", label: "Modelo", w: 0.18 },
    { key: "capacity", label: "Capacidade", w: 0.16 },
    { key: "location", label: "Local", w: 0.20 },
  ];
  const rowH = 16;

  const drawHeaderRow = () => {
    ensureSpace(ctx, rowH + 4);
    const { page } = ctx;
    let x = MARGIN_X;
    for (const c of cols) {
      const cw = CONTENT_W * c.w;
      page.drawRectangle({
        x,
        y: ctx.cursorY - rowH,
        width: cw,
        height: rowH,
        color: COLORS.headerBg,
        borderColor: COLORS.border,
        borderWidth: 0.6,
      });
      page.drawText(c.label, {
        x: x + 4,
        y: ctx.cursorY - rowH + 5,
        size: 7.5,
        font: helvBold,
        color: COLORS.headerText,
      });
      x += cw;
    }
    ctx.cursorY -= rowH;
  };

  if (equipments.length === 0) {
    ensureSpace(ctx, 16);
    ctx.page.drawText("Nenhum equipamento vinculado a este ambiente.", {
      x: MARGIN_X,
      y: ctx.cursorY - 10,
      size: 8,
      font: helv,
      color: COLORS.gray,
    });
    ctx.cursorY -= 16;
    return;
  }

  drawHeaderRow();
  let idx = 0;
  for (const eq of equipments) {
    if (ctx.cursorY - rowH < FOOTER_RESERVED_H) {
      newPage(ctx);
      drawHeaderRow();
    }
    const { page } = ctx;
    const values: Record<string, string> = {
      name: eq.name ?? "—",
      brand: eq.brand ?? "",
      model: eq.model ?? "",
      capacity: eq.capacity ?? "",
      location: eq.location ?? "",
    };
    let x = MARGIN_X;
    for (const c of cols) {
      const cw = CONTENT_W * c.w;
      if (idx % 2 === 1) {
        page.drawRectangle({
          x,
          y: ctx.cursorY - rowH,
          width: cw,
          height: rowH,
          color: COLORS.rowAlt,
        });
      }
      page.drawRectangle({
        x,
        y: ctx.cursorY - rowH,
        width: cw,
        height: rowH,
        borderColor: COLORS.border,
        borderWidth: 0.6,
      });
      const raw = values[c.key] ?? "";
      let txt = safe(raw);
      while (txt.length > 1 && helv.widthOfTextAtSize(txt, 8) > cw - 8) {
        txt = txt.slice(0, -2) + "…";
      }
      page.drawText(txt, {
        x: x + 4,
        y: ctx.cursorY - rowH + 5,
        size: 8,
        font: helv,
        color: COLORS.black,
      });
      x += cw;
    }
    ctx.cursorY -= rowH;
    idx++;
  }
}

// -- Seção 5: plano de manutenção com matriz de 12 meses ---------------------
// Layout `table-layout: fixed`: larguras explícitas por coluna. ITEM | DESCRIÇÃO
// | FREQ | J F M A M J J A S O N D. A célula de DESCRIÇÃO quebra linha (wrap +
// quebra de palavra longa) e NUNCA invade a coluna de freq/meses.
function drawPlanTable(ctx: Ctx): void {
  const { helv, helvBold } = ctx;

  if (ctx.data.activities.length === 0) {
    ensureSpace(ctx, 30);
    ctx.page.drawText(
      "Nenhuma atividade de manutenção cadastrada no plano deste contrato.",
      { x: MARGIN_X, y: ctx.cursorY - 11, size: 9, font: helv, color: COLORS.gray },
    );
    ctx.cursorY -= 14;
    ctx.page.drawText(
      "Cadastre as atividades e periodicidades no plano do contrato para que a planilha seja preenchida.",
      { x: MARGIN_X, y: ctx.cursorY - 11, size: 8, font: helv, color: COLORS.gray },
    );
    ctx.cursorY -= 20;
    return;
  }

  // -- Larguras FIXAS das colunas (somam CONTENT_W). ----
  const itemW = 26; // "Nº" do item
  const freqW = 30; // sigla M/T/S/A/E
  const matrixW = 12 * 13; // 12 meses × 13pt
  const descW = CONTENT_W - itemW - freqW - matrixW; // resto pra descrição
  const monthW = matrixW / 12;
  // Offsets das colunas.
  const itemX = MARGIN_X;
  const descX = itemX + itemW;
  const freqX = descX + descW;
  const matrixX = freqX + freqW;
  const padCell = 4;

  // Cabeçalho da matriz (cinza, estilo modelo).
  const drawMatrixHeader = () => {
    const rowH = 16;
    ensureSpace(ctx, rowH + 4);
    const { page } = ctx;
    // fundo cinza completo + bordas por coluna
    const drawHdrCell = (x: number, w: number, label: string, center = false) => {
      page.drawRectangle({
        x,
        y: ctx.cursorY - rowH,
        width: w,
        height: rowH,
        color: COLORS.headerBg,
        borderColor: COLORS.border,
        borderWidth: 0.6,
      });
      const lw = helvBold.widthOfTextAtSize(label, 7);
      page.drawText(label, {
        x: center ? x + (w - lw) / 2 : x + padCell,
        y: ctx.cursorY - rowH + 5,
        size: 7,
        font: helvBold,
        color: COLORS.headerText,
      });
    };
    drawHdrCell(itemX, itemW, "ITEM", true);
    drawHdrCell(descX, descW, "DESCRIÇÃO DO SERVIÇO");
    drawHdrCell(freqX, freqW, "FREQ", true);
    for (let m = 0; m < 12; m++) {
      const mx = matrixX + m * monthW;
      const lbl = MESES_ABBR[m].slice(0, 1);
      page.drawRectangle({
        x: mx,
        y: ctx.cursorY - rowH,
        width: monthW,
        height: rowH,
        color: COLORS.headerBg,
        borderColor: COLORS.border,
        borderWidth: 0.6,
      });
      const lw = helvBold.widthOfTextAtSize(lbl, 6.5);
      page.drawText(lbl, {
        x: mx + (monthW - lw) / 2,
        y: ctx.cursorY - rowH + 5,
        size: 6.5,
        font: helvBold,
        color: COLORS.headerText,
      });
    }
    ctx.cursorY -= rowH;
  };

  // Agrupa por seção/componente.
  const bySection = new Map<string, PlanilhaActivity[]>();
  for (const a of ctx.data.activities) {
    const key = a.section ?? "outros";
    const arr = bySection.get(key) ?? [];
    arr.push(a);
    bySection.set(key, arr);
  }

  drawMatrixHeader();
  let itemNum = 0;
  let rowIdx = 0;
  for (const [section, acts] of bySection) {
    // Sub-cabeçalho do componente (em maiúsculas, faixa cinza clara — full width).
    const groupH = 14;
    if (ctx.cursorY - (groupH + 16) < FOOTER_RESERVED_H) {
      newPage(ctx);
      drawMatrixHeader();
    }
    {
      const { page } = ctx;
      page.drawRectangle({
        x: MARGIN_X,
        y: ctx.cursorY - groupH,
        width: CONTENT_W,
        height: groupH,
        color: COLORS.lightGray,
        borderColor: COLORS.border,
        borderWidth: 0.6,
      });
      page.drawText(safe(sectionLabel(section)).toUpperCase(), {
        x: MARGIN_X + padCell,
        y: ctx.cursorY - groupH + 4,
        size: 7.5,
        font: helvBold,
        color: COLORS.accent,
      });
      ctx.cursorY -= groupH;
    }

    for (const a of acts) {
      itemNum++;
      // Componente humanizado como prefixo SÓ quando difere do grupo (raro). O
      // grupo já é o componente; aqui mostramos só a descrição limpa.
      const descText = safe(a.description ?? "");
      const descLines = wrapText(helv, descText, 7.5, descW - 2 * padCell);
      const thisRowH = Math.max(15, descLines.length * 9 + 6);
      if (ctx.cursorY - thisRowH < FOOTER_RESERVED_H) {
        newPage(ctx);
        drawMatrixHeader();
      }
      const p = ctx.page;
      // Fundo zebra (todas as colunas).
      const drawRowCellBorder = (x: number, w: number) => {
        if (rowIdx % 2 === 1) {
          p.drawRectangle({
            x,
            y: ctx.cursorY - thisRowH,
            width: w,
            height: thisRowH,
            color: COLORS.rowAlt,
          });
        }
        p.drawRectangle({
          x,
          y: ctx.cursorY - thisRowH,
          width: w,
          height: thisRowH,
          borderColor: COLORS.border,
          borderWidth: 0.6,
        });
      };
      // ITEM
      drawRowCellBorder(itemX, itemW);
      const itemLbl = String(itemNum);
      const ilw = helv.widthOfTextAtSize(itemLbl, 7.5);
      p.drawText(itemLbl, {
        x: itemX + (itemW - ilw) / 2,
        y: ctx.cursorY - thisRowH / 2 - 3,
        size: 7.5,
        font: helv,
        color: COLORS.black,
      });
      // DESCRIÇÃO (multi-linha, dentro da célula)
      drawRowCellBorder(descX, descW);
      let ly = ctx.cursorY - 10;
      for (const ln of descLines) {
        p.drawText(ln, {
          x: descX + padCell,
          y: ly,
          size: 7.5,
          font: helv,
          color: COLORS.black,
        });
        ly -= 9;
      }
      // FREQ
      drawRowCellBorder(freqX, freqW);
      const fLabel = a.freq_code
        ? a.freq_code
        : a.freq_months
          ? `${a.freq_months}m`
          : "—";
      const flw = helvBold.widthOfTextAtSize(fLabel, 7.5);
      p.drawText(fLabel, {
        x: freqX + (freqW - flw) / 2,
        y: ctx.cursorY - thisRowH / 2 - 3,
        size: 7.5,
        font: helvBold,
        color: COLORS.accent,
      });
      // Matriz de meses (bordas + bolinha verde quando o mês cai).
      const hits = monthsHit(a.freq_code, a.freq_months);
      for (let m = 0; m < 12; m++) {
        const mx = matrixX + m * monthW;
        drawRowCellBorder(mx, monthW);
        if (hits[m]) {
          p.drawCircle({
            x: mx + monthW / 2,
            y: ctx.cursorY - thisRowH / 2,
            size: 2.2,
            color: COLORS.mark,
          });
        }
      }
      ctx.cursorY -= thisRowH;
      rowIdx++;
    }
  }

  // Legenda de periodicidade.
  ctx.cursorY -= 12;
  ensureSpace(ctx, 14);
  const legend = "M=Mensal  T=Trimestral  S=Semestral  A=Anual  E=Eventual   (bolinha verde = mes previsto)";
  ctx.page.drawText(legend, {
    x: MARGIN_X,
    y: ctx.cursorY,
    size: 7.5,
    font: helv,
    color: COLORS.gray,
  });
  ctx.cursorY -= 8;
}

// -- Seção 6: resumo de execução ---------------------------------------------
function drawExecutionSummary(ctx: Ctx): void {
  const { helv, helvBold, data } = ctx;
  const e = data.execution!;
  const cards = [
    { label: "Visitas concluídas", value: `${e.concluidas} de ${e.total}` },
    { label: "Atividades conformes", value: String(e.conformes) },
    { label: "Não conformidades", value: String(e.nao_conformes) },
  ];
  ensureSpace(ctx, 44);
  const cardW = (CONTENT_W - 2 * 10) / 3;
  let x = MARGIN_X;
  for (const c of cards) {
    ctx.page.drawRectangle({
      x,
      y: ctx.cursorY - 40,
      width: cardW,
      height: 40,
      color: COLORS.rowAlt,
      borderColor: COLORS.border,
      borderWidth: 0.6,
    });
    ctx.page.drawText(c.value, {
      x: x + 8,
      y: ctx.cursorY - 22,
      size: 14,
      font: helvBold,
      color: COLORS.accent,
    });
    ctx.page.drawText(safe(c.label), {
      x: x + 8,
      y: ctx.cursorY - 34,
      size: 7.5,
      font: helv,
      color: COLORS.gray,
    });
    x += cardW + 10;
  }
  ctx.cursorY -= 48;
}

// -- Data de geração (rodapé textual, sem selo regulatório) ------------------
function drawGeneratedAt(ctx: Ctx): void {
  const { helv, data } = ctx;
  ensureSpace(ctx, 18);
  ctx.page.drawText(
    `Documento gerado em ${safe(data.generated_at_extenso)}.`,
    {
      x: MARGIN_X,
      y: FOOTER_RESERVED_H + 8,
      size: 7.5,
      font: helv,
      color: COLORS.gray,
    },
  );
}

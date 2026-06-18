// =============================================================================
// pmoc-templates/planilha.ts — "Planilha PMOC" (espelha o modelo do cliente).
// =============================================================================
// Estrutura espelhando o `public/MODELO DE PMOC.pdf`, com estética melhor:
//   Seção 1 — Identificação do ambiente (cliente/unidade).
//   Seção 2 — Proprietário / locatário.
//   Seção 3 — Responsável Técnico (nome / CFT-CREA / modalidade).
//   Seção 4 — Relação dos equipamentos climatizados (tipo, marca, modelo,
//             capacidade, local — campos ausentes ficam em branco).
//   Seção 5 — Plano de manutenção: atividades agrupadas por seção/componente,
//             cada uma com periodicidade M/T/S/A/E + matriz de 12 meses
//             (mesma regra do motor: M=todo mês, T a cada 3, S a cada 6,
//             A no 12; E não entra no cronograma automático).
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
import { drawComplianceSeal } from "./assets/draw-compliance-seal.ts";
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
  lightGray: rgb(0.95, 0.95, 0.95),
  rowAlt: rgb(0.975, 0.975, 0.975),
  border: rgb(0.82, 0.82, 0.82),
  headerBg: rgb(0.12, 0.16, 0.23), // slate-800 (igual identidade)
  headerText: rgb(1, 1, 1),
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
};

const FREQ_LABELS: Record<string, string> = {
  M: "Mensal",
  T: "Trimestral",
  S: "Semestral",
  A: "Anual",
  E: "Eventual",
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
  return SECTION_LABELS[key] ?? key.replace(/_/g, " ");
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

// Quebra texto em linhas que cabem em `maxW` na fonte/tamanho dados.
function wrapText(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(tryLine, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = tryLine;
    }
  }
  if (cur) lines.push(cur);
  return lines;
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

// Cabeçalho compacto reusado no topo de cada página da planilha.
function drawCompactHeader(ctx: Ctx): void {
  const { page, data, helv, helvBold } = ctx;
  const headerH = 46;
  page.drawRectangle({
    x: 0,
    y: A4_H - headerH,
    width: A4_W,
    height: headerH,
    color: COLORS.headerBg,
  });

  let textX = MARGIN_X;
  if (data.tenant.logoImage) {
    try {
      const img = data.tenant.logoImage;
      const h = 28;
      const w = (img.width / img.height) * h;
      // fundo branco sutil atrás do logo
      page.drawRectangle({
        x: MARGIN_X - 3,
        y: A4_H - headerH / 2 - h / 2 - 3,
        width: w + 6,
        height: h + 6,
        color: COLORS.white,
      });
      page.drawImage(img, {
        x: MARGIN_X,
        y: A4_H - headerH / 2 - h / 2,
        width: w,
        height: h,
      });
      textX = MARGIN_X + w + 12;
    } catch {
      // ignora
    }
  }

  page.drawText(safe(data.tenant.name).slice(0, 48), {
    x: textX,
    y: A4_H - 21,
    size: 12,
    font: helvBold,
    color: COLORS.headerText,
  });
  page.drawText("Planilha PMOC - Plano de Manutencao, Operacao e Controle", {
    x: textX,
    y: A4_H - 34,
    size: 8,
    font: helv,
    color: rgb(0.78, 0.82, 0.88),
  });

  ctx.cursorY = A4_H - headerH - 24;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.cursorY - needed < FOOTER_RESERVED_H) {
    newPage(ctx);
  }
}

// Título de seção numerada (faixa cinza com número + título).
function drawSectionTitle(ctx: Ctx, num: string, title: string): void {
  ensureSpace(ctx, 34);
  const { page, helvBold } = ctx;
  const barH = 20;
  page.drawRectangle({
    x: MARGIN_X,
    y: ctx.cursorY - barH,
    width: CONTENT_W,
    height: barH,
    color: COLORS.lightGray,
  });
  page.drawRectangle({
    x: MARGIN_X,
    y: ctx.cursorY - barH,
    width: 3,
    height: barH,
    color: COLORS.accent,
  });
  page.drawText(`${num}  ${safe(title)}`, {
    x: MARGIN_X + 10,
    y: ctx.cursorY - barH + 6,
    size: 10.5,
    font: helvBold,
    color: COLORS.black,
  });
  ctx.cursorY -= barH + 8;
}

// Linha label: valor (pra seções 1-3).
function drawField(ctx: Ctx, label: string, value: string): void {
  ensureSpace(ctx, 16);
  const { page, helv, helvBold } = ctx;
  const labelW = 130;
  page.drawText(safe(label), {
    x: MARGIN_X + 6,
    y: ctx.cursorY - 10,
    size: 9,
    font: helvBold,
    color: COLORS.gray,
  });
  const valLines = wrapText(helv, value || "—", 9, CONTENT_W - labelW - 12);
  let vy = ctx.cursorY - 10;
  for (const ln of valLines) {
    page.drawText(ln, {
      x: MARGIN_X + labelW,
      y: vy,
      size: 9,
      font: helv,
      color: COLORS.black,
    });
    vy -= 12;
  }
  ctx.cursorY -= Math.max(16, valLines.length * 12 + 4);
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
  drawCompactHeader(ctx);
  drawPageFooter(ctx);

  // ---- Seção 1 — Identificação da unidade ----------------------------------
  // 1 contrato = 1 unidade (loja/site). O nome/local e o endereço usam a
  // identificação da UNIDADE (`unidade_*`), que pode diferir do cliente. A edge
  // já resolve o fallback pro cliente quando os campos da unidade estão vazios.
  drawSectionTitle(ctx, "1.", "Identificação do Ambiente Climatizado");
  const u = data.unidade;
  drawField(ctx, "Unidade / Local:", orDash(u.nome ?? data.customer.name));
  // Linha 1: logradouro, número, complemento. Linha 2: bairro, cidade-uf, CEP.
  const ruaNum = [u.endereco, u.numero].filter((s) => s && s.trim()).join(", ");
  const linha1 = [ruaNum, u.complemento].filter((s) => s && s.trim()).join(" - ");
  const cidadeUf = [u.cidade, u.uf].filter((s) => s && s.trim()).join(" - ");
  const cepStr = u.cep && u.cep.trim() ? `CEP ${u.cep.trim()}` : "";
  const linha2 = [u.bairro, cidadeUf, cepStr].filter((s) => s && s.trim()).join(", ");
  const endereco = [linha1, linha2].filter((s) => s && s.trim()).join(", ");
  drawField(ctx, "Endereço:", orDash(endereco));
  drawField(ctx, "Contrato:", data.contract.name ?? "—");
  drawField(ctx, "Início da vigência:", data.contract.start_date_extenso);
  drawField(ctx, "Periodicidade base:", data.contract.frequency_label);
  ctx.cursorY -= 6;

  // ---- Seção 2 — Proprietário / Locatário ----------------------------------
  drawSectionTitle(ctx, "2.", "Proprietário / Locatário do Ambiente");
  drawField(ctx, "Nome / Razão social:", data.customer.name);
  drawField(ctx, "Documento (CPF/CNPJ):", data.customer.document ?? "");
  ctx.cursorY -= 6;

  // ---- Seção 3 — Responsável Técnico ---------------------------------------
  drawSectionTitle(ctx, "3.", "Responsável Técnico (RT)");
  drawField(ctx, "Nome:", data.rt.nome);
  drawField(ctx, "Modalidade:", data.rt.modalidade);
  drawField(ctx, "CFT / CREA:", data.rt.cft_crea ?? "");
  ctx.cursorY -= 6;

  // ---- Seção 4 — Relação dos ambientes climatizados ------------------------
  // UM bloco por ambiente (igual o modelo do cliente): caracterização do
  // ambiente + a tabela dos equipamentos DAQUELE ambiente. Auto-pagina.
  drawSectionTitle(ctx, "4.", "Relação dos Ambientes Climatizados");
  const ambientes = data.ambientes ?? [];
  if (ambientes.length === 0) {
    ensureSpace(ctx, 18);
    ctx.page.drawText("Nenhum ambiente climatizado cadastrado no contrato.", {
      x: MARGIN_X + 6,
      y: ctx.cursorY - 11,
      size: 9,
      font: helv,
      color: COLORS.gray,
    });
    ctx.cursorY -= 18;
  } else {
    ambientes.forEach((bloco, i) => {
      // Sub-cabeçalho da unidade (Ambiente 1 — Identificação) quando há >1.
      if (ambientes.length > 1) {
        drawAmbienteSubheader(ctx, i + 1, bloco.ambiente);
      }
      drawAmbienteBlock(ctx, bloco.ambiente);
      drawEquipmentTable(ctx, bloco.equipments);
      if (i < ambientes.length - 1) ctx.cursorY -= 10;
    });
  }
  ctx.cursorY -= 6;

  // ---- Seção 5 — Plano de manutenção + matriz 12 meses ---------------------
  drawSectionTitle(ctx, "5.", "Plano de Manutenção (Periodicidade)");
  drawPlanTable(ctx);

  // ---- (Opcional) Resumo de execução ---------------------------------------
  if (data.execution && data.execution.total > 0) {
    ctx.cursorY -= 6;
    drawSectionTitle(ctx, "6.", "Registro de Execução");
    drawExecutionSummary(ctx);
  }

  // Rodapé/selo na última página.
  await drawFooterSeal(ctx);
}

// -- Seção 4: sub-cabeçalho da unidade (quando há mais de um ambiente) --------
// Faixa fina identificando "Ambiente N — <identificação>", pra separar
// visualmente cada unidade (modelo do cliente repete a relação por unidade).
function drawAmbienteSubheader(
  ctx: Ctx,
  num: number,
  a: PlanilhaAmbiente,
): void {
  ensureSpace(ctx, 18);
  const { page, helvBold } = ctx;
  const barH = 15;
  page.drawRectangle({
    x: MARGIN_X,
    y: ctx.cursorY - barH,
    width: CONTENT_W,
    height: barH,
    color: COLORS.lightGray,
  });
  const ident = orDash(a.identificacao);
  const label = ident !== "—" ? `Ambiente ${num} — ${ident}` : `Ambiente ${num}`;
  page.drawText(safe(label), {
    x: MARGIN_X + 6,
    y: ctx.cursorY - barH + 4,
    size: 8.5,
    font: helvBold,
    color: COLORS.accent,
  });
  ctx.cursorY -= barH + 4;
}

// -- Seção 4 (parte A): caracterização do ambiente climatizado ---------------
// Espelha o modelo do cliente: tipo de atividade, identificação, área (m²),
// ocupantes (fixos/flutuantes) e carga térmica (TR). Campo ausente vira "—".
function drawAmbienteBlock(ctx: Ctx, a: PlanilhaAmbiente | null): void {
  drawField(ctx, "Tipo de atividade:", orDash(a?.tipo_atividade));
  drawField(ctx, "Identificação do ambiente:", orDash(a?.identificacao));
  drawField(
    ctx,
    "Área climatizada (m²):",
    a?.area_m2 != null ? fmtNum(a.area_m2) : "—",
  );
  drawField(
    ctx,
    "Nº de ocupantes:",
    `Fixos: ${a?.ocupantes_fixos != null ? fmtNum(a.ocupantes_fixos) : "—"}   ` +
      `Flutuantes: ${a?.ocupantes_flutuantes != null ? fmtNum(a.ocupantes_flutuantes) : "—"}`,
  );
  drawField(
    ctx,
    "Carga térmica (TR):",
    a?.carga_termica_tr != null ? fmtNum(a.carga_termica_tr) : "—",
  );
  ctx.cursorY -= 4;
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
    page.drawRectangle({
      x: MARGIN_X,
      y: ctx.cursorY - rowH,
      width: CONTENT_W,
      height: rowH,
      color: COLORS.headerBg,
    });
    let x = MARGIN_X;
    for (const c of cols) {
      const cw = CONTENT_W * c.w;
      page.drawText(c.label, {
        x: x + 4,
        y: ctx.cursorY - rowH + 5,
        size: 8,
        font: helvBold,
        color: COLORS.headerText,
      });
      x += cw;
    }
    ctx.cursorY -= rowH;
  };

  if (equipments.length === 0) {
    ensureSpace(ctx, 18);
    ctx.page.drawText("Nenhum equipamento vinculado a este ambiente.", {
      x: MARGIN_X + 6,
      y: ctx.cursorY - 11,
      size: 9,
      font: helv,
      color: COLORS.gray,
    });
    ctx.cursorY -= 18;
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
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: MARGIN_X,
        y: ctx.cursorY - rowH,
        width: CONTENT_W,
        height: rowH,
        color: COLORS.rowAlt,
      });
    }
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
      const raw = values[c.key] ?? "";
      // trunca pra caber na coluna
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
  // borda inferior
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.cursorY },
    end: { x: MARGIN_X + CONTENT_W, y: ctx.cursorY },
    thickness: 0.5,
    color: COLORS.border,
  });
}

// -- Seção 5: plano de manutenção com matriz de 12 meses ---------------------
function drawPlanTable(ctx: Ctx): void {
  const { helv, helvBold } = ctx;

  if (ctx.data.activities.length === 0) {
    ensureSpace(ctx, 30);
    ctx.page.drawText(
      "Nenhuma atividade de manutenção cadastrada no plano deste contrato.",
      { x: MARGIN_X + 6, y: ctx.cursorY - 11, size: 9, font: helv, color: COLORS.gray },
    );
    ctx.cursorY -= 14;
    ctx.page.drawText(
      "Cadastre as atividades e periodicidades no plano do contrato para que a planilha seja preenchida.",
      { x: MARGIN_X + 6, y: ctx.cursorY - 11, size: 8, font: helv, color: COLORS.gray },
    );
    ctx.cursorY -= 20;
    return;
  }

  // Layout de colunas: descrição (larga) + freq + 12 colunas de mês.
  const descW = CONTENT_W * 0.42;
  const freqW = CONTENT_W * 0.10;
  const matrixW = CONTENT_W - descW - freqW;
  const monthW = matrixW / 12;
  const rowH = 15;

  const drawMatrixHeader = () => {
    ensureSpace(ctx, rowH + 4);
    const { page } = ctx;
    page.drawRectangle({
      x: MARGIN_X,
      y: ctx.cursorY - rowH,
      width: CONTENT_W,
      height: rowH,
      color: COLORS.headerBg,
    });
    page.drawText("Atividade", {
      x: MARGIN_X + 4,
      y: ctx.cursorY - rowH + 4,
      size: 7.5,
      font: helvBold,
      color: COLORS.headerText,
    });
    page.drawText("Freq.", {
      x: MARGIN_X + descW + 4,
      y: ctx.cursorY - rowH + 4,
      size: 7.5,
      font: helvBold,
      color: COLORS.headerText,
    });
    for (let m = 0; m < 12; m++) {
      const mx = MARGIN_X + descW + freqW + m * monthW;
      const lbl = MESES_ABBR[m].slice(0, 1);
      const lw = helvBold.widthOfTextAtSize(lbl, 6.5);
      page.drawText(lbl, {
        x: mx + (monthW - lw) / 2,
        y: ctx.cursorY - rowH + 4,
        size: 6.5,
        font: helvBold,
        color: COLORS.headerText,
      });
    }
    ctx.cursorY -= rowH;
  };

  // Agrupa por seção.
  const bySection = new Map<string, PlanilhaActivity[]>();
  for (const a of ctx.data.activities) {
    const key = a.section ?? "outros";
    const arr = bySection.get(key) ?? [];
    arr.push(a);
    bySection.set(key, arr);
  }

  drawMatrixHeader();
  let rowIdx = 0;
  for (const [section, acts] of bySection) {
    // Sub-cabeçalho da seção.
    if (ctx.cursorY - (rowH + 14) < FOOTER_RESERVED_H) {
      newPage(ctx);
      drawMatrixHeader();
    }
    const { page } = ctx;
    page.drawRectangle({
      x: MARGIN_X,
      y: ctx.cursorY - 13,
      width: CONTENT_W,
      height: 13,
      color: COLORS.lightGray,
    });
    page.drawText(safe(sectionLabel(section)).toUpperCase(), {
      x: MARGIN_X + 4,
      y: ctx.cursorY - 10,
      size: 7.5,
      font: helvBold,
      color: COLORS.accent,
    });
    ctx.cursorY -= 13;

    for (const a of acts) {
      const descLines = wrapText(helv, a.description ?? "", 7.5, descW - 18);
      const thisRowH = Math.max(rowH, descLines.length * 9 + 6);
      if (ctx.cursorY - thisRowH < FOOTER_RESERVED_H) {
        newPage(ctx);
        drawMatrixHeader();
      }
      const p = ctx.page;
      if (rowIdx % 2 === 1) {
        p.drawRectangle({
          x: MARGIN_X,
          y: ctx.cursorY - thisRowH,
          width: CONTENT_W,
          height: thisRowH,
          color: COLORS.rowAlt,
        });
      }
      // componente (prefixo) + descrição
      const comp = a.component ? `${safe(a.component)}: ` : "";
      let ly = ctx.cursorY - 10;
      let first = true;
      for (const ln of descLines) {
        const text = first && comp ? comp + ln : ln;
        p.drawText(text, {
          x: MARGIN_X + 6,
          y: ly,
          size: 7.5,
          font: first && comp ? helvBold : helv,
          color: COLORS.black,
        });
        ly -= 9;
        first = false;
      }
      // freq label curto
      const fcode = a.freq_code ?? (a.freq_months ? `${a.freq_months}m` : "—");
      const fLabel = a.freq_code
        ? a.freq_code
        : a.freq_months
          ? `${a.freq_months}m`
          : "—";
      p.drawText(fLabel, {
        x: MARGIN_X + descW + 6,
        y: ctx.cursorY - 10,
        size: 7.5,
        font: helvBold,
        color: COLORS.accent,
      });
      // matriz de meses
      const hits = monthsHit(a.freq_code, a.freq_months);
      for (let m = 0; m < 12; m++) {
        if (hits[m]) {
          const mx = MARGIN_X + descW + freqW + m * monthW;
          const cx = mx + monthW / 2;
          const cy = ctx.cursorY - thisRowH / 2;
          p.drawCircle({ x: cx, y: cy, size: 2.4, color: COLORS.mark });
        }
      }
      ctx.cursorY -= thisRowH;
      rowIdx++;
    }
  }
  // borda inferior
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.cursorY },
    end: { x: MARGIN_X + CONTENT_W, y: ctx.cursorY },
    thickness: 0.5,
    color: COLORS.border,
  });

  // Legenda de periodicidade.
  ctx.cursorY -= 14;
  ensureSpace(ctx, 14);
  const legend = "M = Mensal   T = Trimestral   S = Semestral   A = Anual   E = Eventual   (bolinha verde = mês previsto)";
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
      borderWidth: 0.5,
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

// -- Selo regulatório (última página, ACIMA do rodapé Dominex) ----------------
// O selo de conformidade + a linha da Lei ficam logo acima da faixa reservada
// pro rodapé Dominex (FOOTER_RESERVED_H) pra não colidir com ele. Ancorado em
// Y absoluto a partir do topo dessa faixa.
async function drawFooterSeal(ctx: Ctx): Promise<void> {
  const { pdf, helv, helvBold, data } = ctx;
  // Garante que ainda há espaço acima da faixa do rodapé pro bloco do selo.
  ensureSpace(ctx, 80);

  const sealText = "Conforme Lei Federal 13.589/2018";
  const sealSize = 9;
  const sealW = helvBold.widthOfTextAtSize(sealText, sealSize);
  const sealTextX = MARGIN_X + (CONTENT_W - sealW) / 2;

  // Base do bloco logo acima da faixa reservada do rodapé Dominex.
  const baseY = FOOTER_RESERVED_H + 8;

  ctx.page.drawText(
    `Documento gerado em ${safe(data.generated_at_extenso)}.`,
    {
      x: MARGIN_X,
      y: baseY + 18,
      size: 7.5,
      font: helv,
      color: COLORS.gray,
    },
  );
  ctx.page.drawText(sealText, {
    x: sealTextX,
    y: baseY,
    size: sealSize,
    font: helvBold,
    color: COLORS.black,
  });

  // Selo PNG de conformidade centralizado, logo acima do texto da lei.
  await drawComplianceSeal(pdf, ctx.page, {
    centerX: A4_W / 2,
    baselineY: baseY + sealSize + 6,
    width: 50,
  });
}

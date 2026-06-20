// =============================================================================
// pmoc-templates/cronograma-tabela.ts — Cronograma anual em formato TABELA/RELATÓRIO.
// =============================================================================
// Substitui o antigo calendário (cronograma-mes.ts, 1 página/mês) por uma
// visão de relatório: uma linha por visita, ordenada por data, segmentada por
// mês (subtítulo de grupo). Pagina automaticamente quando passa do rodapé.
//
// Colunas: Mês | Data prevista | Nº OS | Status | Técnico (responsável).
//   - "Mês" é renderizado como faixa de subtítulo agrupando as linhas (não
//     repete em cada linha), e as colunas de dados ocupam o restante.
//
// Cabeçalho compacto reaproveitado do calendário (logo do tenant + título +
// subtítulo do contrato). Rodapé com legenda de status.
// =============================================================================

import {
  PDFDocument,
  PDFPage,
  PDFImage,
  StandardFonts,
  PDFFont,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext } from "./context.ts";

const A4_W = 595.28;
const A4_H = 841.89;

const COLORS = {
  black: rgb(0, 0, 0),
  gray: rgb(0.4, 0.4, 0.4),
  lightGray: rgb(0.95, 0.95, 0.95),
  headerGray: rgb(0.88, 0.88, 0.88),
  borderGray: rgb(0.82, 0.82, 0.82),
  rowAlt: rgb(0.975, 0.975, 0.975),
  green: rgb(0.18, 0.62, 0.31), // concluida
  red: rgb(0.86, 0.18, 0.18), // atrasada
  blue: rgb(0.18, 0.40, 0.86), // agendada/pendente
  yellow: rgb(0.85, 0.65, 0.18), // em_andamento/pausada/a_caminho
  slate: rgb(0.45, 0.45, 0.45), // cancelada/outros
  white: rgb(1, 1, 1),
};

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface CronogramaTabelaServiceOrder {
  id: string;
  order_number: number | null;
  scheduled_date: string | null; // ISO yyyy-mm-dd
  status: string;
  /** Nome do técnico responsável (resolvido na edge via profiles). null = sem técnico. */
  technician_name?: string | null;
}

export interface DrawCronogramaTabelaParams {
  pdf: PDFDocument;
  ctx: TemplateContext;
  serviceOrders: CronogramaTabelaServiceOrder[];
}

// Substitui glifos fora do WinAnsi (Helvetica) por equivalentes seguros.
function safeText(raw: string): string {
  return (raw ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, "-");
}

function statusColor(status: string) {
  switch (status) {
    case "concluida":
      return COLORS.green;
    case "atrasada":
      return COLORS.red;
    case "agendada":
    case "pendente":
      return COLORS.blue;
    case "em_andamento":
    case "pausada":
    case "a_caminho":
      return COLORS.yellow;
    case "cancelada":
      return COLORS.slate;
    default:
      return COLORS.gray;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "concluida":
      return "Concluída";
    case "atrasada":
      return "Atrasada";
    case "agendada":
      return "Agendada";
    case "pendente":
      return "Pendente";
    case "em_andamento":
      return "Em andamento";
    case "pausada":
      return "Pausada";
    case "a_caminho":
      return "A caminho";
    case "cancelada":
      return "Cancelada";
    default:
      return status || "—";
  }
}

// Formata "yyyy-mm-dd" como "DD/MM/AAAA" sem depender de fuso (data pura).
function formatDateBr(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.slice(0, 10).split("-");
  if (m.length !== 3) return "—";
  return `${m[2]}/${m[1]}/${m[0]}`;
}

// Status visual: atrasada quando a data já passou e não está concluída/cancelada.
function visualStatusOf(os: CronogramaTabelaServiceOrder, todayIso: string): string {
  if (
    os.scheduled_date &&
    os.scheduled_date.slice(0, 10) < todayIso &&
    os.status !== "concluida" &&
    os.status !== "cancelada"
  ) {
    return "atrasada";
  }
  return os.status;
}

// Trunca um texto pra caber numa largura, adicionando "…" (como "...").
function ellipsize(font: PDFFont, text: string, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxW) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

// -----------------------------------------------------------------------------
// Layout da tabela
// -----------------------------------------------------------------------------
const MARGIN_X = 40;
const TABLE_W = A4_W - 2 * MARGIN_X;
const TOP_Y = A4_H - 50;
const BOTTOM_LIMIT = 80; // não desenhar abaixo disso (reserva pro rodapé/legenda)

const ROW_H = 22;
const HEADER_ROW_H = 24;
const MONTH_BAND_H = 22;

// Colunas (larguras proporcionais à TABLE_W)
// Data prevista | Nº OS | Status | Técnico
const COLS = [
  { key: "data", label: "Data prevista", w: 0.22 },
  { key: "os", label: "Nº OS", w: 0.14 },
  { key: "status", label: "Status", w: 0.26 },
  { key: "tecnico", label: "Técnico responsável", w: 0.38 },
];

function colX(index: number): number {
  let x = MARGIN_X;
  for (let i = 0; i < index; i++) x += COLS[i].w * TABLE_W;
  return x;
}
function colW(index: number): number {
  return COLS[index].w * TABLE_W;
}

export async function drawCronogramaTabela(
  params: DrawCronogramaTabelaParams,
): Promise<void> {
  const { pdf, ctx, serviceOrders } = params;

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const todayIso = new Date().toISOString().slice(0, 10);

  // Embeda o logo UMA vez (reuso em todas as páginas — evita estourar worker).
  let logoImage: PDFImage | null = null;
  if (ctx.empresa.logo_bytes && ctx.empresa.logo_mime) {
    try {
      logoImage =
        ctx.empresa.logo_mime === "image/png"
          ? await pdf.embedPng(ctx.empresa.logo_bytes)
          : await pdf.embedJpg(ctx.empresa.logo_bytes);
    } catch {
      logoImage = null;
    }
  }

  // Ordena por data (sem data vai pro fim).
  const ordered = [...serviceOrders].sort((a, b) => {
    const da = a.scheduled_date ?? "9999-99-99";
    const db = b.scheduled_date ?? "9999-99-99";
    return da.localeCompare(db);
  });

  // Agrupa por mês-ano (chave yyyy-mm; "sem-data" pro grupo final).
  type Group = { key: string; title: string; items: CronogramaTabelaServiceOrder[] };
  const groupsMap = new Map<string, Group>();
  for (const os of ordered) {
    let key: string;
    let title: string;
    if (os.scheduled_date) {
      const iso = os.scheduled_date.slice(0, 10);
      const [y, m] = iso.split("-");
      key = `${y}-${m}`;
      title = `${MESES_PT[parseInt(m, 10) - 1] ?? "—"} ${y}`;
    } else {
      key = "zzzz-sem-data";
      title = "Sem data prevista";
    }
    let g = groupsMap.get(key);
    if (!g) {
      g = { key, title, items: [] };
      groupsMap.set(key, g);
    }
    g.items.push(os);
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  // ---- Página + cursor com paginação automática.
  let page: PDFPage | null = null;
  let cursorY = 0;
  let pageNum = 0;

  const startNewPage = () => {
    page = pdf.addPage([A4_W, A4_H]);
    pageNum += 1;
    cursorY = TOP_Y;
    drawPageHeader(page, helv, helvBold, ctx, logoImage);
    cursorY -= 66; // espaço ocupado pelo cabeçalho
    syncCursor(cursorY);
    drawTableHeaderRow(page, helvBold);
    cursorY -= HEADER_ROW_H;
  };

  const ensureSpace = (needed: number) => {
    if (!page || cursorY - needed < BOTTOM_LIMIT) {
      startNewPage();
    }
  };

  startNewPage();

  if (ordered.length === 0) {
    page!.drawText(
      "Nenhuma visita programada para os próximos 12 meses.",
      { x: MARGIN_X, y: cursorY - 16, size: 10, font: helv, color: COLORS.gray },
    );
  }

  let rowToggle = 0;
  for (const g of groups) {
    // Faixa de mês (cabe junto da 1ª linha pra não "órfanar" o subtítulo).
    ensureSpace(MONTH_BAND_H + ROW_H);
    syncCursor(cursorY);
    drawMonthBand(page!, helvBold, g.title);
    cursorY -= MONTH_BAND_H;

    for (const os of g.items) {
      ensureSpace(ROW_H);
      const vStatus = visualStatusOf(os, todayIso);
      syncCursor(cursorY);
      drawDataRow(page!, helv, helvBold, os, vStatus, rowToggle % 2 === 1);
      cursorY -= ROW_H;
      rowToggle++;
    }
  }

  // Legenda de status no rodapé da ÚLTIMA página.
  drawLegend(page!, helv);
}

// -----------------------------------------------------------------------------
// Sub-rotinas de desenho (usam o cursor via closures? não — recebem page e leem
// o cursorY pelo módulo). Pra manter simples, desenhamos com Y absoluto passado
// implicitamente: como o cursor é local à função principal, repassamos via
// variável de módulo controlada. Optamos por desenhar lendo um Y mutável.
// -----------------------------------------------------------------------------

// Para evitar passar cursorY em toda chamada, usamos uma referência de módulo.
// (As funções abaixo leem/escrevem `__cursorY` indiretamente via parâmetros.)

function drawPageHeader(
  page: PDFPage,
  helv: PDFFont,
  helvBold: PDFFont,
  ctx: TemplateContext,
  logoImage: PDFImage | null,
): void {
  const topY = TOP_Y;

  if (logoImage) {
    try {
      const h = 28;
      const w = (logoImage.width / logoImage.height) * h;
      page.drawImage(logoImage, { x: MARGIN_X, y: topY - h, width: w, height: h });
    } catch {
      // ignora
    }
  }

  const titleText = safeText(`PMOC — ${ctx.customer.name}`);
  page.drawText(ellipsize(helvBold, titleText, 13, TABLE_W - 100), {
    x: 110,
    y: topY - 8,
    size: 13,
    font: helvBold,
    color: COLORS.black,
  });

  page.drawText("Cronograma anual de manutenções", {
    x: 110,
    y: topY - 24,
    size: 10,
    font: helv,
    color: COLORS.gray,
  });

  // Linha de contexto do contrato (frequência + RT).
  const ctxParts: string[] = [];
  if (ctx.contract.frequency_label && ctx.contract.frequency_label !== "—") {
    ctxParts.push(`Periodicidade: ${ctx.contract.frequency_label}`);
  }
  if (ctx.rt.nome && ctx.rt.nome.trim()) {
    ctxParts.push(`Resp. Técnico: ${ctx.rt.nome.trim()}`);
  }
  if (ctxParts.length > 0) {
    page.drawText(safeText(ctxParts.join("   •   ").replace(/•/g, "-")), {
      x: 110,
      y: topY - 38,
      size: 8.5,
      font: helv,
      color: COLORS.gray,
    });
  }

  // Régua separadora abaixo do cabeçalho.
  page.drawRectangle({
    x: MARGIN_X,
    y: topY - 52,
    width: TABLE_W,
    height: 0.8,
    color: COLORS.borderGray,
  });
}

// Como o cursor é gerenciado na função principal, as funções de linha precisam
// dele. Reescrevemos para receber o Y via uma variável de módulo sincronizada.
// Implementação: a função principal escreve em `cy` antes de cada chamada.
let cy = 0;
function syncCursor(v: number) {
  cy = v;
}

// --- As funções abaixo desenham na posição `cy` (linha corrente). -------------

function drawTableHeaderRow(page: PDFPage, helvBold: PDFFont): void {
  const y = cy - HEADER_ROW_H;
  page.drawRectangle({
    x: MARGIN_X,
    y,
    width: TABLE_W,
    height: HEADER_ROW_H,
    color: COLORS.headerGray,
    borderColor: COLORS.borderGray,
    borderWidth: 0.5,
  });
  for (let i = 0; i < COLS.length; i++) {
    const cellX = colX(i);
    page.drawText(COLS[i].label, {
      x: cellX + 6,
      y: y + 8,
      size: 9,
      font: helvBold,
      color: COLORS.black,
    });
  }
}

function drawMonthBand(page: PDFPage, helvBold: PDFFont, title: string): void {
  const y = cy - MONTH_BAND_H;
  page.drawRectangle({
    x: MARGIN_X,
    y,
    width: TABLE_W,
    height: MONTH_BAND_H,
    color: COLORS.lightGray,
    borderColor: COLORS.borderGray,
    borderWidth: 0.5,
  });
  page.drawText(safeText(title), {
    x: MARGIN_X + 8,
    y: y + 7,
    size: 9.5,
    font: helvBold,
    color: COLORS.black,
  });
}

function drawDataRow(
  page: PDFPage,
  helv: PDFFont,
  helvBold: PDFFont,
  os: CronogramaTabelaServiceOrder,
  vStatus: string,
  alt: boolean,
): void {
  const y = cy - ROW_H;

  // Fundo zebrado
  if (alt) {
    page.drawRectangle({ x: MARGIN_X, y, width: TABLE_W, height: ROW_H, color: COLORS.rowAlt });
  }
  // Borda da linha
  page.drawRectangle({
    x: MARGIN_X,
    y,
    width: TABLE_W,
    height: ROW_H,
    borderColor: COLORS.borderGray,
    borderWidth: 0.4,
  });

  const textY = y + 7;

  // Coluna 0: Data prevista
  page.drawText(formatDateBr(os.scheduled_date), {
    x: colX(0) + 6,
    y: textY,
    size: 9,
    font: helv,
    color: COLORS.black,
  });

  // Coluna 1: Nº OS
  const osLabel = os.order_number != null ? `OS ${os.order_number}` : "—";
  page.drawText(osLabel, {
    x: colX(1) + 6,
    y: textY,
    size: 9,
    font: helv,
    color: COLORS.black,
  });

  // Coluna 2: Status (bolinha colorida + label)
  const dotX = colX(2) + 6;
  const dotR = 3.2;
  page.drawCircle({
    x: dotX + dotR,
    y: y + ROW_H / 2,
    size: dotR,
    color: statusColor(vStatus),
  });
  page.drawText(statusLabel(vStatus), {
    x: dotX + dotR * 2 + 5,
    y: textY,
    size: 9,
    font: helv,
    color: COLORS.black,
  });

  // Coluna 3: Técnico
  const tecMaxW = colW(3) - 12;
  const tecName = (os.technician_name && os.technician_name.trim())
    ? safeText(os.technician_name.trim())
    : "—";
  page.drawText(ellipsize(helv, tecName, 9, tecMaxW), {
    x: colX(3) + 6,
    y: textY,
    size: 9,
    font: helv,
    color: COLORS.black,
  });
}

function drawLegend(page: PDFPage, helv: PDFFont): void {
  const legendY = 50;
  const legendItems = [
    { color: COLORS.blue, label: "Agendada / Pendente" },
    { color: COLORS.yellow, label: "Em andamento" },
    { color: COLORS.green, label: "Concluída" },
    { color: COLORS.red, label: "Atrasada" },
    { color: COLORS.slate, label: "Cancelada" },
  ];

  page.drawText("Legenda:", {
    x: MARGIN_X,
    y: legendY + 14,
    size: 8,
    font: helv,
    color: COLORS.gray,
  });

  let lx = MARGIN_X;
  for (const item of legendItems) {
    page.drawCircle({ x: lx + 4, y: legendY + 4, size: 3.2, color: item.color });
    page.drawText(item.label, {
      x: lx + 12,
      y: legendY + 1,
      size: 7.5,
      font: helv,
      color: COLORS.black,
    });
    lx += helv.widthOfTextAtSize(item.label, 7.5) + 28;
  }
}

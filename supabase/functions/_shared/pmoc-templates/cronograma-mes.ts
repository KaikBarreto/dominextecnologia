// =============================================================================
// pmoc-templates/cronograma-mes.ts — 1 página do cronograma anual.
// =============================================================================
// Layout (§3.4 do plano):
//   - Cabeçalho compacto: logo + "PMOC — {customer.name}" + "Cronograma — {mês
//     extenso} {ano}".
//   - Grid 7 colunas (Dom-Sáb) x 5-6 linhas.
//   - Cada célula: número do dia + badge OS se houver.
//   - Cores por status (verde concluida, vermelho atrasada, azul agendada).
//   - Rodapé: legenda.
// =============================================================================

import {
  PDFDocument,
  PDFPage,
  PDFImage,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext, ymdInTimeZone } from "./context.ts";

const A4_W = 595.28;
const A4_H = 841.89;

const COLORS = {
  black: rgb(0, 0, 0),
  gray: rgb(0.4, 0.4, 0.4),
  lightGray: rgb(0.92, 0.92, 0.92),
  borderGray: rgb(0.8, 0.8, 0.8),
  green: rgb(0.18, 0.62, 0.31), // concluida
  red: rgb(0.86, 0.18, 0.18), // atrasada
  blue: rgb(0.18, 0.40, 0.86), // agendada
  yellow: rgb(0.85, 0.65, 0.18), // em_andamento/pausada
  white: rgb(1, 1, 1),
};

const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const DOW_PT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export interface CronogramaServiceOrder {
  id: string;
  order_number: number | null;
  scheduled_date: string | null; // ISO yyyy-mm-dd
  status: string;
}

export interface DrawCronogramaMesParams {
  pdf: PDFDocument;
  ctx: TemplateContext;
  /** Primeiro dia do mês (UTC). */
  month: Date;
  serviceOrders: CronogramaServiceOrder[];
  /**
   * Logo do tenant JÁ embedado no PDF (PDFImage). Quando informado, a página
   * reusa essa referência em vez de chamar `embedPng`/`embedJpg` de novo.
   * Crítico p/ logos grandes: re-embedar a cada uma das 12 páginas decodifica o
   * raster N vezes e estoura a memória do worker (WORKER_RESOURCE_LIMIT). Quando
   * o Dossiê passa o logo pré-embedado, decodificamos uma vez só.
   */
  logoImage?: PDFImage | null;
  /**
   * Fuso da EMPRESA (`company_settings.timezone`). Define o que é "hoje" nesta
   * página: o destaque do dia atual e o marcador "atrasada" das OSs.
   *
   * Antes o cálculo era em UTC: às 22h em São Paulo o instante já está no dia
   * seguinte em UTC, então uma visita agendada para HOJE aparecia como ATRASADA
   * no documento entregue ao cliente final, um dia antes da hora.
   *
   * Ausente/nulo/inválido cai em America/Sao_Paulo (ver `safeTimeZone`), sem
   * derrubar a geração do PDF.
   */
  timeZone?: string | null;
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
    default:
      return COLORS.gray;
  }
}

export async function drawCronogramaMesPage(
  params: DrawCronogramaMesParams,
): Promise<PDFPage> {
  const { pdf, ctx, month, serviceOrders, logoImage, timeZone } = params;
  const page = pdf.addPage([A4_W, A4_H]);

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // "Hoje" no calendário da EMPRESA, não em UTC. `month` continua em UTC de
  // propósito: ele é aritmética de mês (dia 1), não instante de relógio.
  const todayYmd = ymdInTimeZone(new Date(), timeZone);
  /** "YYYY-MM-DD" de hoje no fuso da empresa, pra comparação lexicográfica. */
  const todayIso = todayYmd
    ? `${String(todayYmd.year).padStart(4, "0")}-${String(todayYmd.month).padStart(2, "0")}-${
      String(todayYmd.day).padStart(2, "0")
    }`
    : "";
  const monthYear = month.getUTCFullYear();
  const monthIdx = month.getUTCMonth();

  // -- Cabeçalho ------------------------------------------------------------
  let cursorY = A4_H - 50;

  // Logo (opcional). Preferimos o PDFImage pré-embedado (logoImage) p/ não
  // re-decodificar o raster a cada página — logos grandes (ex.: 1898x1898)
  // estouravam a memória do worker quando embedados 12x. Fallback p/ embed
  // local mantém o template utilizável fora do Dossiê.
  if (logoImage) {
    try {
      const h = 28;
      const w = (logoImage.width / logoImage.height) * h;
      page.drawImage(logoImage, { x: 50, y: cursorY - h, width: w, height: h });
    } catch {
      // ignora
    }
  } else if (ctx.empresa.logo_bytes && ctx.empresa.logo_mime) {
    try {
      let img: PDFImage;
      if (ctx.empresa.logo_mime === "image/png") {
        img = await pdf.embedPng(ctx.empresa.logo_bytes);
      } else {
        img = await pdf.embedJpg(ctx.empresa.logo_bytes);
      }
      const h = 28;
      const w = (img.width / img.height) * h;
      page.drawImage(img, { x: 50, y: cursorY - h, width: w, height: h });
    } catch {
      // ignora
    }
  }

  // Título à direita do logo
  const titleText = `PMOC — ${ctx.customer.name}`;
  page.drawText(titleText.slice(0, 50), {
    x: 130,
    y: cursorY - 10,
    size: 12,
    font: helvBold,
    color: COLORS.black,
  });

  // Subtítulo
  const subText = `Cronograma — ${MESES_PT[monthIdx]} ${monthYear}`;
  page.drawText(subText, {
    x: 130,
    y: cursorY - 26,
    size: 10,
    font: helv,
    color: COLORS.gray,
  });

  cursorY -= 60;

  // -- Grid do calendário ---------------------------------------------------
  const gridMarginX = 40;
  const gridW = A4_W - 2 * gridMarginX;
  const cellW = gridW / 7;
  const cellH = 80;

  // Cabeçalho dos dias da semana
  for (let i = 0; i < 7; i++) {
    const x = gridMarginX + i * cellW;
    page.drawRectangle({
      x,
      y: cursorY - 22,
      width: cellW,
      height: 22,
      color: COLORS.lightGray,
      borderColor: COLORS.borderGray,
      borderWidth: 0.5,
    });
    const dowText = DOW_PT[i];
    const dowW = helvBold.widthOfTextAtSize(dowText, 9);
    page.drawText(dowText, {
      x: x + (cellW - dowW) / 2,
      y: cursorY - 16,
      size: 9,
      font: helvBold,
      color: COLORS.black,
    });
  }
  cursorY -= 22;

  // Calcula primeiro dia do mês e DOW
  const firstDay = new Date(Date.UTC(monthYear, monthIdx, 1));
  const firstDow = firstDay.getUTCDay(); // 0 = Domingo
  const daysInMonth = new Date(Date.UTC(monthYear, monthIdx + 1, 0)).getUTCDate();

  // Indexa OSs por dia do mês
  // `scheduled_date` é data-only ("YYYY-MM-DD"): `ymdInTimeZone` lê os números
  // literais, sem converter fuso (converter reintroduziria o off-by-one ao
  // contrário). Se um dia vier timestamptz, aí sim sai no fuso da empresa.
  const osByDay = new Map<number, CronogramaServiceOrder[]>();
  const scheduledYmd = new Map<string, ReturnType<typeof ymdInTimeZone>>();
  for (const os of serviceOrders) {
    if (!os.scheduled_date) continue;
    const ymd = ymdInTimeZone(os.scheduled_date, timeZone);
    if (!ymd) continue;
    scheduledYmd.set(os.id, ymd);
    if (ymd.year === monthYear && ymd.month === monthIdx + 1) {
      const arr = osByDay.get(ymd.day) ?? [];
      arr.push(os);
      osByDay.set(ymd.day, arr);
    }
  }

  // Desenha 6 linhas (máximo possível pra um mês)
  const totalCells = 6 * 7;
  const todayKey = todayYmd && todayYmd.year === monthYear && todayYmd.month === monthIdx + 1
    ? todayYmd.day
    : -1;

  for (let cell = 0; cell < totalCells; cell++) {
    const row = Math.floor(cell / 7);
    const col = cell % 7;
    const dayNum = cell - firstDow + 1;
    const x = gridMarginX + col * cellW;
    const y = cursorY - (row + 1) * cellH;

    // Borda da célula
    page.drawRectangle({
      x,
      y,
      width: cellW,
      height: cellH,
      borderColor: COLORS.borderGray,
      borderWidth: 0.5,
    });

    if (dayNum < 1 || dayNum > daysInMonth) {
      // Fora do mês — célula vazia cinza claro
      page.drawRectangle({
        x: x + 0.5,
        y: y + 0.5,
        width: cellW - 1,
        height: cellH - 1,
        color: COLORS.lightGray,
      });
      continue;
    }

    // Hoje? Marcador sutil
    if (dayNum === todayKey) {
      page.drawRectangle({
        x: x + 0.5,
        y: y + 0.5,
        width: cellW - 1,
        height: cellH - 1,
        color: rgb(0.95, 0.97, 1),
      });
    }

    // Número do dia
    page.drawText(String(dayNum), {
      x: x + 6,
      y: y + cellH - 14,
      size: 10,
      font: helvBold,
      color: COLORS.black,
    });

    // Badges das OSs
    const oss = osByDay.get(dayNum) ?? [];
    const maxBadges = 3;
    for (let i = 0; i < Math.min(oss.length, maxBadges); i++) {
      const os = oss[i];
      const badgeY = y + cellH - 28 - i * 14;
      const badgeH = 10;
      const badgeX = x + 4;
      const badgeW = cellW - 8;

      // Status visual: atrasada quando o dia agendado já passou NO CALENDÁRIO
      // DA EMPRESA e a OS não foi concluída nem cancelada. Comparação de strings
      // "YYYY-MM-DD" (lexicográfica = cronológica), sem instante no meio.
      // Sem `todayIso` (relógio inválido) não marcamos nada: melhor não marcar
      // do que marcar errado num documento legal.
      let visualStatus = os.status;
      const osYmd = scheduledYmd.get(os.id);
      const osIso = osYmd
        ? `${String(osYmd.year).padStart(4, "0")}-${String(osYmd.month).padStart(2, "0")}-${
          String(osYmd.day).padStart(2, "0")
        }`
        : "";
      if (
        todayIso &&
        osIso &&
        osIso < todayIso &&
        os.status !== "concluida" &&
        os.status !== "cancelada"
      ) {
        visualStatus = "atrasada";
      }

      page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeW,
        height: badgeH,
        color: statusColor(visualStatus),
      });
      const label = os.order_number != null ? `OS ${os.order_number}` : "OS";
      // texto branco encurtado
      page.drawText(label, {
        x: badgeX + 3,
        y: badgeY + 2,
        size: 7,
        font: helvBold,
        color: COLORS.white,
      });
    }

    // "+N mais"
    if (oss.length > maxBadges) {
      const moreText = `+${oss.length - maxBadges} mais`;
      page.drawText(moreText, {
        x: x + 4,
        y: y + 4,
        size: 7,
        font: helv,
        color: COLORS.gray,
      });
    }
  }

  // -- Legenda + rodapé -----------------------------------------------------
  const legendY = 50;
  const legendItems = [
    { color: COLORS.blue, label: "Agendada" },
    { color: COLORS.green, label: "Concluída" },
    { color: COLORS.yellow, label: "Em andamento" },
    { color: COLORS.red, label: "Atrasada" },
  ];

  let lx = gridMarginX;
  for (const item of legendItems) {
    page.drawRectangle({
      x: lx,
      y: legendY,
      width: 10,
      height: 8,
      color: item.color,
    });
    page.drawText(item.label, {
      x: lx + 14,
      y: legendY + 1,
      size: 8,
      font: helv,
      color: COLORS.black,
    });
    lx += 80;
  }

  return page;
}

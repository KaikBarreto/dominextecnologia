// =============================================================================
// pmoc-templates/context.ts — TemplateContext compartilhado.
// =============================================================================
// Estrutura única consumida pelos templates de capa, termo RT, certificado e
// cronograma. Cada edge function (generate-pmoc-dossie-pdf, generate-pmoc-
// cronograma-pdf) monta esse ctx a partir do banco e passa pros templates.
// =============================================================================

export interface TemplateContextEmpresa {
  razao_social: string;
  cnpj: string;        // ex.: "12.345.678/0001-90"
  cidade: string;      // pode ser do company_settings ou customer
  logo_bytes?: Uint8Array | null;
  logo_mime?: "image/png" | "image/jpeg" | null;
  // ---- Onda I (v1.9.x) — campos extras pro cabeçalho do tenant no TRT.
  //      Opcionais; quando ausentes, o header simplesmente não renderiza
  //      a linha correspondente (ex.: sem telefone → sem bullet).
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  state?: string | null;
  zip_code?: string | null;
  /** Cores do report_header_* (fallback DEFAULT_HEADER_CONFIG). */
  header_bg_color?: string | null;
  header_text_color?: string | null;
  header_logo_size?: number | null;
  /** Quando true, o rodapé Dominex NÃO renderiza. */
  white_label_enabled?: boolean;
}

export interface TemplateContextRT {
  nome: string;
  modalidade: string;
  cft_crea: string | null;
  /** Onda E: URL da assinatura visual do RT (storage signed/public). null = pendente. */
  signature_image_url?: string | null;
  /** Onda E: URL do carimbo (reservado, ainda não desenhado). */
  stamp_image_url?: string | null;
}

export interface TemplateContextCustomer {
  name: string;
  address: string;
  city: string | null;
  state: string | null;
}

export interface TemplateContextContract {
  name: string | null;
  frequency_label: string;
  start_date_extenso: string;
}

export interface TemplateContext {
  empresa: TemplateContextEmpresa;
  rt: TemplateContextRT;
  customer: TemplateContextCustomer;
  contract: TemplateContextContract;
  cidade: string;
  generated_at_extenso: string;
  /**
   * URL pública do Portal PMOC da unidade (`/contrato/unidade/<token>`).
   * Quando presente, a capa desenha link + QR Code no canto inferior direito.
   * Ausente (sem token) → capa não renderiza o bloco do portal.
   */
  portal_url?: string | null;
  /**
   * QR Code do `portal_url` já rasterizado em PNG (bytes). Gerado na edge
   * function via `QRCode.toDataURL` pra manter o template livre de import de QR.
   */
  portal_qr_png?: Uint8Array | null;
}

// -----------------------------------------------------------------------------
// Helpers de formato compartilhados
// -----------------------------------------------------------------------------

// ─── Fuso da EMPRESA (company_settings.timezone) ─────────────────────────────
//
// DUPLICAÇÃO PROPOSITAL de `src/lib/timezone.ts`. Edge function roda em Deno e
// NÃO pode importar de `src/` (o bundle da edge não enxerga o app). As regras
// são as mesmas e precisam continuar iguais nos dois lados:
//
//  - `en-CA` é o único locale que o Intl formata como ISO YYYY-MM-DD. Remontar
//    a data com `getUTCDate()/getUTCFullYear()` ignora o fuso e é exatamente o
//    defeito que esta onda corrige: às 22h em São Paulo o instante já está no
//    dia seguinte em UTC, e o PDF saía com "documento gerado em [amanhã]".
//  - `Intl` lança RangeError quando o nome do fuso não é IANA válido, então
//    todo caminho cai no padrão sem derrubar a geração do PDF.
//
// IMPORTANTE: fuso só se aplica a INSTANTE (timestamptz, `new Date()`). Uma
// data-only ("2026-01-15", ex.: `contracts.start_date`) é dia de calendário,
// não instante: aplicar fuso nela reintroduziria o off-by-one ao contrário.
// Por isso todo helper abaixo detecta data-only e usa os números literais.

/** Fuso padrão quando a empresa não tem um configurado ou o valor é inválido. */
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

/** Nome de fuso que o Intl aceita, sempre. Vazio/nulo/inválido → padrão. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  const tz = typeof timeZone === "string" && timeZone.trim() ? timeZone.trim() : DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Data-only "YYYY-MM-DD" (dia de calendário, sem hora). */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type Ymd = { year: number; month: number; day: number };

/**
 * Ano/mês/dia de uma entrada, no fuso da empresa.
 *  - data-only → números literais (sem conversão de fuso);
 *  - instante  → o dia que o relógio da empresa mostra naquele instante.
 * `null` quando a entrada é vazia ou inválida.
 */
export function ymdInTimeZone(
  input: Date | string | null,
  timeZone: string | null | undefined,
): Ymd | null {
  if (!input) return null;

  if (typeof input === "string") {
    const onlyDate = DATE_ONLY_RE.exec(input.trim());
    if (onlyDate) {
      return {
        year: Number(onlyDate[1]),
        month: Number(onlyDate[2]),
        day: Number(onlyDate[3]),
      };
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const ymd = { year: get("year"), month: get("month"), day: get("day") };
  if (!Number.isFinite(ymd.year) || !Number.isFinite(ymd.month) || !Number.isFinite(ymd.day)) {
    return null;
  }
  return ymd;
}

const MESES_PT: Record<number, string> = {
  0: "janeiro",
  1: "fevereiro",
  2: "março",
  3: "abril",
  4: "maio",
  5: "junho",
  6: "julho",
  7: "agosto",
  8: "setembro",
  9: "outubro",
  10: "novembro",
  11: "dezembro",
};

/**
 * "15 de janeiro de 2026" a partir de um instante OU de uma data-only.
 *
 * `timeZone` é o `company_settings.timezone` da empresa dona do contrato. Ele
 * só entra quando a entrada é um INSTANTE (ex.: `new Date()` da geração do
 * documento): o dia tem que ser o do calendário da empresa, não o dia UTC.
 * Sem isso, gerar o PDF depois das 21h em São Paulo carimbava o dia seguinte.
 */
export function dateToExtenso(
  input: Date | string | null,
  timeZone?: string | null,
): string {
  const ymd = ymdInTimeZone(input, timeZone);
  if (!ymd) return "____ de ___________________ de 20____";
  const dia = String(ymd.day).padStart(2, "0");
  const mes = MESES_PT[ymd.month - 1] ?? "____________";
  return `${dia} de ${mes} de ${ymd.year}`;
}

/**
 * Quebra um ISO de data em partes PT-BR pras variáveis
 * `contrato.criado_{dia,mes,ano}` do PmocVariableContext.
 *
 * Retorna strings vazias quando a data é inválida — substituidor de variáveis
 * trata vazio como linha pontilhada (`____________________`) no PDF final.
 *
 * `contracts.created_at` é um INSTANTE (timestamptz), então o dia sai no fuso
 * da empresa (`timeZone`), exatamente como o `dateToExtenso`. O helper espelhado
 * no frontend (`partsFromIso` em PmocContractDocsTab.tsx) segue a mesma regra.
 */
export function extractContractCreatedParts(
  input: Date | string | null,
  timeZone?: string | null,
): { dia: string; mes: string; ano: string } {
  const ymd = ymdInTimeZone(input, timeZone);
  if (!ymd) return { dia: "", mes: "", ano: "" };
  return {
    dia: String(ymd.day).padStart(2, "0"),
    mes: MESES_PT[ymd.month - 1] ?? "",
    ano: String(ymd.year),
  };
}

/**
 * Formata um Date (instante) como DD/MM/AAAA no fuso da EMPRESA
 * (`company_settings.timezone`, padrão America/Sao_Paulo). Usado pras variáveis
 * `documento.data_emissao` e `documento.data_vencimento`. Sem dependência
 * externa (Intl).
 */
export function formatDateBr(
  input: Date | string | null,
  timeZone?: string | null,
): string {
  const ymd = ymdInTimeZone(input, timeZone);
  if (!ymd) return "";
  const dd = String(ymd.day).padStart(2, "0");
  const mm = String(ymd.month).padStart(2, "0");
  return `${dd}/${mm}/${String(ymd.year).padStart(4, "0")}`;
}

/**
 * Calcula a data de vencimento de um documento de conformidade PMOC.
 * `generatedAt` (instante de geração) + `months` meses, devolvendo:
 *  - `dateOnly` ("yyyy-MM-dd") pra gravar em `pmoc_documents.valid_until`;
 *  - `formatted` (DD/MM/AAAA) pra variável `documento.data_vencimento`.
 *
 * Ancorado ao fuso da EMPRESA (`company_settings.timezone`, padrão
 * America/Sao_Paulo): o "dia" da geração é extraído nesse fuso antes de somar
 * os meses, evitando off-by-one quando o instante cai perto da meia-noite UTC.
 * Overflow de mês é clampado pro último dia do mês destino (ex: 31/01 + 1 mês
 * → 28/02).
 */
export function computeValidUntil(
  generatedAt: Date,
  months: number,
  timeZone?: string | null,
): { dateOnly: string; formatted: string } {
  // Dia de geração no fuso da empresa (fuso inválido cai no padrão, sem lançar).
  const ymd = ymdInTimeZone(generatedAt, timeZone) ?? { year: 1970, month: 1, day: 1 };
  const baseYear = ymd.year;
  const baseMonthIdx = ymd.month - 1;
  const baseDay = ymd.day;

  const safeMonths = Number.isFinite(months) && months > 0 ? Math.round(months) : 12;
  const totalMonths = baseMonthIdx + safeMonths;
  const targetYear = baseYear + Math.floor(totalMonths / 12);
  const targetMonthIdx = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIdx + 1, 0)).getUTCDate();
  const day = Math.min(baseDay, lastDay);

  const yStr = String(targetYear).padStart(4, "0");
  const mStr = String(targetMonthIdx + 1).padStart(2, "0");
  const dStr = String(day).padStart(2, "0");
  const dateOnly = `${yStr}-${mStr}-${dStr}`;
  return { dateOnly, formatted: `${dStr}/${mStr}/${yStr}` };
}

export function frequencyLabelFrom(value: number | null, type: string | null): string {
  if (!value || !type) return "—";
  const v = Math.max(1, Math.round(value));
  if (type === "months") {
    if (v === 1) return "Mensal";
    if (v === 2) return "Bimestral";
    if (v === 3) return "Trimestral";
    if (v === 6) return "Semestral";
    if (v === 12) return "Anual";
    return `A cada ${v} meses`;
  }
  if (type === "days") return v === 1 ? "Diária" : `A cada ${v} dias`;
  if (type === "weeks") return v === 1 ? "Semanal" : `A cada ${v} semanas`;
  if (type === "years") return v === 1 ? "Anual" : `A cada ${v} anos`;
  return `A cada ${v} ${type}`;
}

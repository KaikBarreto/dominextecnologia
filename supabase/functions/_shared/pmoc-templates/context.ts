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

export function dateToExtenso(input: Date | string | null): string {
  if (!input) return "____ de ___________________ de 20____";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "____ de ___________________ de 20____";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = MESES_PT[d.getUTCMonth()] ?? "____________";
  const ano = d.getUTCFullYear();
  return `${dia} de ${mes} de ${ano}`;
}

/**
 * Quebra um ISO de data em partes PT-BR pras variáveis
 * `contrato.criado_{dia,mes,ano}` do PmocVariableContext.
 *
 * Retorna strings vazias quando a data é inválida — substituidor de variáveis
 * trata vazio como linha pontilhada (`____________________`) no PDF final.
 *
 * UTC para casar EXATAMENTE com o `dateToExtenso` e com o helper espelhado no
 * frontend (`partsFromIso` em PmocContractDocsTab.tsx), evitando off-by-one
 * quando o navegador do gestor está em fuso diferente de UTC.
 */
export function extractContractCreatedParts(
  input: Date | string | null,
): { dia: string; mes: string; ano: string } {
  if (!input) return { dia: "", mes: "", ano: "" };
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return { dia: "", mes: "", ano: "" };
  return {
    dia: String(d.getUTCDate()).padStart(2, "0"),
    mes: MESES_PT[d.getUTCMonth()] ?? "",
    ano: String(d.getUTCFullYear()),
  };
}

/**
 * Formata um Date (instante) como DD/MM/AAAA no fuso de Brasília
 * (America/Sao_Paulo). Usado pras variáveis `documento.data_emissao` e
 * `documento.data_vencimento`. Sem dependência externa (Intl).
 */
export function formatDateBr(input: Date | string | null): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")}`;
}

/**
 * Calcula a data de vencimento de um documento de conformidade PMOC.
 * `generatedAt` (instante de geração) + `months` meses, devolvendo:
 *  - `dateOnly` ("yyyy-MM-dd") pra gravar em `pmoc_documents.valid_until`;
 *  - `formatted` (DD/MM/AAAA) pra variável `documento.data_vencimento`.
 *
 * Ancorado ao fuso de Brasília: o "dia" da geração é extraído em America/
 * Sao_Paulo antes de somar os meses, evitando off-by-one quando o instante
 * cai perto da meia-noite UTC. Overflow de mês é clampado pro último dia do
 * mês destino (ex: 31/01 + 1 mês → 28/02).
 */
export function computeValidUntil(
  generatedAt: Date,
  months: number,
): { dateOnly: string; formatted: string } {
  // Dia de geração no fuso de Brasília.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(generatedAt);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const baseYear = get("year");
  const baseMonthIdx = get("month") - 1;
  const baseDay = get("day");

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

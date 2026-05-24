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

import type { Quote, QuoteItem } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';

/**
 * Uma seção CONFIGURÁVEL da proposta (só o template Clean respeita hoje).
 * `key` identifica a seção; `enabled` liga/desliga; `order` define a posição na
 * lista de seções pós-Totais; `customText` é o texto DEFAULT da empresa (aplicado
 * quando o orçamento não trouxer texto próprio). `pagamento` não tem `customText`
 * (é o bloco calculado de formas de pagamento).
 */
export interface ProposalSection {
  key: string;
  enabled: boolean;
  order: number;
  customText?: string;
}

/** Chaves das seções configuráveis do Clean, na ordem padrão. */
export const PROPOSAL_SECTION_KEYS = [
  'abertura',
  'pagamento',
  'informacoes',
  'observacoes',
  'sobre',
  'garantia',
  'encerramento',
] as const;

export type ProposalSectionKey = (typeof PROPOSAL_SECTION_KEYS)[number];

/** Seções que carregam texto editável (todas menos `pagamento`, que é calculada). */
export const PROPOSAL_TEXT_SECTION_KEYS: ProposalSectionKey[] = [
  'abertura',
  'informacoes',
  'observacoes',
  'sobre',
  'garantia',
  'encerramento',
];

export interface ProposalCustomization {
  primary_color?: string;
  accent_color?: string;
  header_bg?: string;
  /** Logo específico da proposta. Quando definido, vence o logo da empresa. */
  logo_url?: string;
  /** Mostra "Página XX/YY" no rodapé de cada folha A4. Default: desligado. */
  show_pagination?: boolean;
  /** Mostra a linha de deslocamento no bloco de Investimento. Default: ligado. */
  show_displacement?: boolean;
  /** Mostra a seção de Brindes (cortesias). Default: ligado. */
  show_gifts?: boolean;
  /**
   * Seções configuráveis da proposta (ligar/desligar, reordenar, texto default).
   * Ausente em empresas antigas → usar `getProposalSections` pra materializar o
   * default completo (todas ligadas, ordem padrão).
   */
  sections?: ProposalSection[];
}

/**
 * Materializa a lista de seções configuráveis mesclando o DEFAULT (todas ligadas,
 * na ordem padrão de PROPOSAL_SECTION_KEYS) com o que a empresa salvou. Garante
 * que:
 *  - configs antigas (sem `sections`) recebem a lista completa;
 *  - seções NOVAS (adicionadas depois) aparecem mesmo em configs já salvas;
 *  - a ordem salva é respeitada, com seções novas no fim (na ordem padrão).
 */
export function getProposalSections(customization?: ProposalCustomization): ProposalSection[] {
  const saved = customization?.sections ?? [];
  const savedByKey = new Map(saved.map((s) => [s.key, s]));

  const keyIndex = new Map<string, number>(PROPOSAL_SECTION_KEYS.map((k, i) => [k, i]));

  const merged: ProposalSection[] = PROPOSAL_SECTION_KEYS.map((key, i) => {
    const s = savedByKey.get(key);
    return {
      key,
      enabled: s?.enabled ?? true,
      order: s?.order ?? i,
      customText: s?.customText,
    };
  });

  // Ordena por `order`; em empate (orders duplicados) desempata pelo índice
  // padrão em PROPOSAL_SECTION_KEYS pra ordem ser determinística.
  return merged.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return (keyIndex.get(a.key) ?? 0) - (keyIndex.get(b.key) ?? 0);
  });
}

export interface ProposalTemplateProps {
  quote: Quote;
  company: CompanySettings | null | undefined;
  items: QuoteItem[];
  customization?: ProposalCustomization;
}

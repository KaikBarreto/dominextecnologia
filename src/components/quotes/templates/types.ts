import type { Quote, QuoteItem } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';

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
}

export interface ProposalTemplateProps {
  quote: Quote;
  company: CompanySettings | null | undefined;
  items: QuoteItem[];
  customization?: ProposalCustomization;
}

import type { Quote, QuoteItem } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';

export interface ProposalCustomization {
  primary_color?: string;
  accent_color?: string;
  header_bg?: string;
}

export interface ProposalTemplateProps {
  quote: Quote;
  company: CompanySettings | null | undefined;
  items: QuoteItem[];
  customization?: ProposalCustomization;
}

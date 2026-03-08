import type { Quote, QuoteItem } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';

export interface ProposalTemplateProps {
  quote: Quote;
  company: CompanySettings | null | undefined;
  items: QuoteItem[];
}

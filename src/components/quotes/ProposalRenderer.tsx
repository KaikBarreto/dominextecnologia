import type { Quote, QuoteItem } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { ClassicTemplate } from './templates/ClassicTemplate';
import { ModernTemplate } from './templates/ModernTemplate';
import { MinimalTemplate } from './templates/MinimalTemplate';
import { forwardRef } from 'react';

interface ProposalRendererProps {
  quote: Quote;
  company: CompanySettings | null | undefined;
  templateSlug?: string;
}

export const ProposalRenderer = forwardRef<HTMLDivElement, ProposalRendererProps>(
  ({ quote, company, templateSlug = 'classico' }, ref) => {
    const items: QuoteItem[] = quote.quote_items ?? [];

    const props = { quote, company, items };

    return (
      <div ref={ref}>
        {templateSlug === 'moderno' ? (
          <ModernTemplate {...props} />
        ) : templateSlug === 'minimalista' ? (
          <MinimalTemplate {...props} />
        ) : (
          <ClassicTemplate {...props} />
        )}
      </div>
    );
  }
);

ProposalRenderer.displayName = 'ProposalRenderer';

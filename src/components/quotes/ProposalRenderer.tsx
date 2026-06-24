import type { Quote, QuoteItem } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import type { ProposalCustomization } from './templates/types';
import { VanguardaTemplate } from './templates/VanguardaTemplate';
import { AuroraTemplate } from './templates/AuroraTemplate';
import { PrismaTemplate } from './templates/PrismaTemplate';
import { forwardRef } from 'react';

interface ProposalRendererProps {
  quote: Quote;
  company: CompanySettings | null | undefined;
  templateSlug?: string;
  customization?: ProposalCustomization;
}

/**
 * Despacha o template de proposta por slug. Slugs válidos: `vanguarda` |
 * `aurora` | `prisma`. Qualquer outro valor (incl. registros antigos como
 * `classico`/`moderno`/`minimalista`) cai no DEFAULT = Vanguarda.
 */
export const ProposalRenderer = forwardRef<HTMLDivElement, ProposalRendererProps>(
  ({ quote, company, templateSlug = 'vanguarda', customization }, ref) => {
    const items: QuoteItem[] = quote.quote_items ?? [];
    const props = { quote, company, items, customization };

    return (
      <div ref={ref}>
        {templateSlug === 'aurora' ? (
          <AuroraTemplate {...props} />
        ) : templateSlug === 'prisma' ? (
          <PrismaTemplate {...props} />
        ) : (
          <VanguardaTemplate {...props} />
        )}
      </div>
    );
  }
);

ProposalRenderer.displayName = 'ProposalRenderer';

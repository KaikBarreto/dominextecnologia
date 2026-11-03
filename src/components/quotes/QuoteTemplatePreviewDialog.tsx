import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Quote } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { ProposalRenderer } from './ProposalRenderer';

export function QuoteTemplatePreviewDialog({
  open,
  onOpenChange,
  quote,
  company,
  templateSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  company: CompanySettings | null | undefined;
  templateSlug: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[90dvh] w-[96vw] max-w-[1100px] flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-16">
          <DialogTitle>Pré-visualização da proposta</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3 sm:p-6">
          <div className="mx-auto w-[794px] overflow-hidden rounded-lg border bg-white shadow-sm">
            <ProposalRenderer
              quote={quote}
              company={company}
              templateSlug={templateSlug}
              customization={company?.proposal_customization}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

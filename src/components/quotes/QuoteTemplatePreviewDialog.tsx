import { useLayoutEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Quote } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { ProposalRenderer } from './ProposalRenderer';

export function QuoteTemplatePreviewDialog({
  open,
  onOpenChange,
  quote,
  company,
  templateSlug,
  incomplete = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  company: CompanySettings | null | undefined;
  templateSlug: string;
  incomplete?: boolean;
}) {
  const { locale, currency } = useAppLocaleContext();
  const documentRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 794, height: 1123 });
  const [expanded, setExpanded] = useState(false);
  const [reading, setReading] = useState(true);

  useLayoutEffect(() => {
    if (!open) { setExpanded(false); setReading(true); }
  }, [open]);

  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!viewportElement || !documentRef.current) return;
    const measure = () => setPreviewSize({ width: Math.min(794, viewportElement.clientWidth), height: documentRef.current?.scrollHeight || 1123 });
    const observer = new ResizeObserver(measure);
    observer.observe(viewportElement);
    observer.observe(documentRef.current);
    measure();
    return () => observer.disconnect();
  }, [viewportElement, quote, templateSlug, reading]);
  const scale = expanded ? 1 : previewSize.width / 794;
  const visibleCosts = [
    quote.show_labor_cost_in_proposal && 'mão de obra',
    quote.show_inputs_cost_in_proposal && 'insumos',
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[90dvh] w-[96vw] max-w-[1100px] flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 space-y-3 border-b px-4 py-4 sm:px-6">
          <DialogTitle className="text-xl sm:pr-24 sm:text-2xl">Como o cliente verá</DialogTitle>
          <div className="flex flex-col-reverse gap-2 text-left sm:flex-row sm:items-start sm:justify-between sm:gap-5">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {visibleCosts.length ? `Custos compartilhados: ${visibleCosts.join(' e ')}.` : 'Custos de mão de obra e insumos ocultos.'}
              {incomplete && <span className="mt-1 block">Prévia em preenchimento. Os dados aparecem conforme você monta o orçamento.</span>}
            </p>
            <p className="flex shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground sm:block sm:text-right">Total da proposta<span className="text-lg font-semibold tabular-nums text-foreground sm:mt-0.5 sm:block sm:text-xl">{formatMoney(quote.total_value ?? quote.final_price ?? 0, currency, locale)}</span></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border p-1" aria-label="Visualização da proposta">
              <Button type="button" size="sm" variant="ghost" aria-pressed={reading} className={cn('h-9', reading && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')} onClick={() => setReading(true)}>Leitura</Button>
              <Button type="button" size="sm" variant="ghost" aria-pressed={!reading} className={cn('h-9', !reading && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')} onClick={() => setReading(false)}>Documento</Button>
            </div>
            {!reading && <Button type="button" variant="outline" size="sm" className="h-11 sm:h-9" onClick={() => setExpanded(value => !value)}>{expanded ? 'Ajustar à tela' : 'Ampliar'}</Button>}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3 sm:p-6" aria-label="Conteúdo da proposta">
          <div ref={setViewportElement} className="mx-auto w-full max-w-[794px]">
            <div className="relative bg-white shadow-sm" style={{ width: reading ? '100%' : expanded ? 794 : '100%', height: reading ? undefined : previewSize.height * scale }}>
              <div ref={documentRef} className={cn('origin-top-left overflow-hidden bg-white', !reading && 'absolute left-0 top-0 w-[794px]')} style={{ transform: reading ? undefined : `scale(${scale})` }}>
                <ProposalRenderer
                  quote={quote}
                  company={company}
                  templateSlug={templateSlug}
                  customization={company?.proposal_customization}
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

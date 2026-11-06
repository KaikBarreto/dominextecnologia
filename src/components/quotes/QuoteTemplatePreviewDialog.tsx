import { useLayoutEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  const documentRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 794, height: 1123 });
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    if (!open) setExpanded(false);
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
  }, [viewportElement, quote, templateSlug]);
  const scale = expanded ? 1 : previewSize.width / 794;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[90dvh] w-[96vw] max-w-[1100px] flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-28 sm:px-6 sm:pr-28">
          <DialogTitle className="text-xl">Prévia da proposta</DialogTitle>
          <Button type="button" variant="outline" size="sm" className="mt-2 w-fit" onClick={() => setExpanded(value => !value)}>{expanded ? 'Ajustar à tela' : 'Ampliar'}</Button>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3 sm:p-6">
          <div ref={setViewportElement} className="mx-auto w-full max-w-[794px]">
            <div className="relative bg-white shadow-sm" style={{ width: expanded ? 794 : '100%', height: previewSize.height * scale }}>
              <div ref={documentRef} className="absolute left-0 top-0 w-[794px] origin-top-left overflow-hidden bg-white" style={{ transform: `scale(${scale})` }}>
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

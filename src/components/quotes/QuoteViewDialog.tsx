import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import type { Quote } from '@/hooks/useQuotes';
import { Download, Share2, Eye } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ProposalRenderer } from './ProposalRenderer';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface QuoteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote | null;
}

export function QuoteViewDialog({ open, onOpenChange, quote }: QuoteViewDialogProps) {
  const isMobile = useIsMobile();
  const { settings: company } = useCompanySettings();
  const printRef = useRef<HTMLDivElement>(null);
  const { locale } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;

  if (!quote) return null;

  const templateSlug = quote.proposal_templates?.slug ?? 'classico';

  const handlePDF = async () => {
    if (!printRef.current) return;
    const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`proposta-${quote.quote_number}.pdf`);
  };

  const handleWhatsApp = () => {
    const url = `${window.location.origin}/proposta/${quote.token}`;
    const msg = `Olá! Segue a proposta #${quote.quote_number} no valor de R$ ${(quote.total_value ?? 0).toFixed(2)}.\n\nAcesse: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const viewCount = quote.view_count ?? 0;
  const viewsLine = viewCount === 0
    ? tq.viewNotViewed
    : quote.last_viewed_at
      ? tq.viewViewedAt
          .replace('{count}', String(viewCount))
          .replace('{date}', format(new Date(quote.last_viewed_at), "dd/MM 'às' HH:mm", { locale: ptBR }))
          .replace('{rel}', formatDistanceToNow(new Date(quote.last_viewed_at), { addSuffix: true, locale: ptBR }))
      : tq.viewViewedCount.replace('{count}', String(viewCount));

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          {viewsLine}
        </span>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleWhatsApp}>
          <Share2 className="h-4 w-4 mr-1.5" /> {tq.viewShareWhatsApp}
        </Button>
        <Button variant="outline" size="sm" onClick={handlePDF}>
          <Download className="h-4 w-4 mr-1.5" /> {tq.viewDownloadPDF}
        </Button>
      </div>

      <div className="rounded-lg overflow-hidden border">
        <ProposalRenderer
          ref={printRef}
          quote={quote}
          company={company ?? null}
          templateSlug={templateSlug}
          customization={company?.proposal_customization}
        />
      </div>
    </div>
  );

  const title = tq.viewDialogTitle.replace('{number}', String(quote.quote_number));

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

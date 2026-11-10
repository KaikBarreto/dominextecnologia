import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import type { Quote } from '@/hooks/useQuotes';
import { Download, Share2, Eye, CreditCard, Loader2 } from 'lucide-react';
import { ChargeDialog } from '@/components/financial/ChargeDialog';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es as esLocale, fr as frLocale, type Locale } from 'date-fns/locale';
import type { LocaleCode } from '@/lib/i18n/locales';

const DATE_FNS_LOCALES: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es: esLocale,
  fr: frLocale,
};
import { ProposalRenderer } from './ProposalRenderer';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getQuoteCommercialTotal } from '@/lib/quote-commercial-total';
import { formatMoney } from '@/lib/format';
import { buildProposalPdfFilename, generateProposalPDF, PROPOSAL_PDF_WIDTH_PX } from '@/utils/proposalPdf';
import { useToast } from '@/hooks/use-toast';

interface QuoteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote | null;
}

export function QuoteViewDialog({ open, onOpenChange, quote }: QuoteViewDialogProps) {
  const isMobile = useIsMobile();
  const { settings: company } = useCompanySettings();
  const printRef = useRef<HTMLDivElement>(null);
  const { locale, currency, timezone } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;
  const { hasModule } = useCompanyModules();
  const { isActive: isPaymentActive } = useTenantPaymentAccount();
  const showChargeAction = hasModule('cobrancas') && isPaymentActive;
  const [chargeOpen, setChargeOpen] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { toast } = useToast();

  if (!quote) return null;

  const templateSlug = quote.proposal_templates?.slug ?? 'classico';

  const handlePDF = async () => {
    if (!printRef.current || isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    try {
      await generateProposalPDF(printRef.current, buildProposalPdfFilename(quote, timezone));
    } catch (error) {
      console.error('Falha ao gerar PDF da proposta', error);
      toast({ variant: 'destructive', title: tq.viewPDFError });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleWhatsApp = () => {
    const url = `${window.location.origin}/proposta/${quote.token}`;
    const value = formatMoney(getQuoteCommercialTotal(quote), currency, locale);
    const msg = tq.whatsAppMsg
      .replace('{number}', String(quote.quote_number))
      .replace('{value}', value)
      .replace('{url}', url);
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const dfLocale = DATE_FNS_LOCALES[locale];
  const viewCount = quote.view_count ?? 0;
  const viewsLine = viewCount === 0
    ? tq.viewNotViewed
    : quote.last_viewed_at
      ? tq.viewViewedAt
          .replace('{count}', String(viewCount))
          .replace('{date}', format(new Date(quote.last_viewed_at), 'dd/MM HH:mm', { locale: dfLocale }))
          .replace('{rel}', formatDistanceToNow(new Date(quote.last_viewed_at), { addSuffix: true, locale: dfLocale }))
      : tq.viewViewedCount.replace('{count}', String(viewCount));

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          {viewsLine}
        </span>
      </div>
      <div className="flex gap-2 justify-end flex-wrap">
        {showChargeAction && quote.customer_id && (
          <Button variant="outline" size="sm" onClick={() => setChargeOpen(true)}>
            <CreditCard className="h-4 w-4 mr-1.5" /> {tq.actionGenerateCharge}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleWhatsApp}>
          <Share2 className="h-4 w-4 mr-1.5" /> {tq.viewShareWhatsApp}
        </Button>
        <Button variant="outline" size="sm" onClick={handlePDF} disabled={isGeneratingPDF}>
          {isGeneratingPDF ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-1.5" />
          )}
          {tq.viewDownloadPDF}
        </Button>
      </div>

      <div className="rounded-lg overflow-x-auto border bg-white">
        <div
          className={isMobile ? undefined : 'mx-auto max-w-none'}
          style={isMobile ? undefined : { width: `${PROPOSAL_PDF_WIDTH_PX}px`, minWidth: `${PROPOSAL_PDF_WIDTH_PX}px` }}
        >
          <ProposalRenderer
            ref={printRef}
            quote={quote}
            company={company ?? null}
            templateSlug={templateSlug}
            customization={company?.proposal_customization}
          />
        </div>
      </div>
    </div>
  );

  const title = tq.viewDialogTitle.replace('{number}', String(quote.quote_number));

  const chargeDialog = showChargeAction && quote.customer_id ? (
    <ChargeDialog
      open={chargeOpen}
      onOpenChange={setChargeOpen}
      presetCustomerId={quote.customer_id}
      lockCustomer
      presetAmount={getQuoteCommercialTotal(quote) || undefined}
      presetDescription={`Orçamento Nº ${quote.quote_number}`}
      source={{ type: 'quote', id: quote.id }}
    />
  ) : null;

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
            <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>{content}</div>
          </DrawerContent>
        </Drawer>
        {chargeDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-none max-h-[90vh] overflow-y-auto"
          style={{ width: 'calc(100vw - 2rem)', maxWidth: '56rem' }}
        >
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
      {chargeDialog}
    </>
  );
}

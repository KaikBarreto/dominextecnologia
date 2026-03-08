import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { STATUS_LABELS, STATUS_COLORS, type Quote } from '@/hooks/useQuotes';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Download, Share2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

interface QuoteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote | null;
}

export function QuoteViewDialog({ open, onOpenChange, quote }: QuoteViewDialogProps) {
  const isMobile = useIsMobile();
  const { settings: company } = useCompanySettings();
  const printRef = useRef<HTMLDivElement>(null);

  if (!quote) return null;

  const items = quote.quote_items ?? [];
  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';

  const handlePDF = async () => {
    if (!printRef.current) return;
    const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`orcamento-${quote.quote_number}.pdf`);
  };

  const handleWhatsApp = () => {
    const url = `${window.location.origin}/orcamento/${quote.token}`;
    const msg = `Olá! Segue o orçamento #${quote.quote_number} no valor de R$ ${(quote.total_value ?? 0).toFixed(2)}.\n\nAcesse: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const content = (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleWhatsApp}>
          <Share2 className="h-4 w-4 mr-1.5" /> WhatsApp
        </Button>
        <Button variant="outline" size="sm" onClick={handlePDF}>
          <Download className="h-4 w-4 mr-1.5" /> PDF
        </Button>
      </div>

      {/* Printable area */}
      <div ref={printRef} className="bg-white text-black p-6 rounded-lg space-y-5" style={{ fontFamily: 'sans-serif' }}>
        {/* Header with company info */}
        <div className="flex justify-between items-start">
          <div>
            {company?.logo_url && (
              <img src={company.logo_url} alt="Logo" className="h-12 mb-2 object-contain" crossOrigin="anonymous" />
            )}
            <p className="font-bold text-lg">{company?.name || 'Sua Empresa'}</p>
            {company?.document && <p className="text-xs text-gray-500">{company.document}</p>}
            {company?.phone && <p className="text-xs text-gray-500">{company.phone}</p>}
            {company?.email && <p className="text-xs text-gray-500">{company.email}</p>}
            {company?.address && (
              <p className="text-xs text-gray-500">
                {company.address}{company?.neighborhood ? `, ${company.neighborhood}` : ''}
                {company?.city ? ` - ${company.city}` : ''}{company?.state ? `/${company.state}` : ''}
                {company?.zip_code ? ` - ${company.zip_code}` : ''}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">Orçamento</p>
            <p className="text-lg text-gray-600">#{quote.quote_number}</p>
            <Badge className={STATUS_COLORS[quote.status]}>{STATUS_LABELS[quote.status]}</Badge>
          </div>
        </div>

        <Separator />

        {/* Client info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase">Cliente</p>
            <p className="font-semibold">{clientName}</p>
            {quote.customers?.email && <p className="text-gray-500">{quote.customers.email}</p>}
            {quote.customers?.phone && <p className="text-gray-500">{quote.customers.phone}</p>}
            {!quote.customer_id && quote.prospect_email && <p className="text-gray-500">{quote.prospect_email}</p>}
            {!quote.customer_id && quote.prospect_phone && <p className="text-gray-500">{quote.prospect_phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase">Data</p>
            <p>{format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
            {quote.valid_until && (
              <>
                <p className="text-xs text-gray-400 uppercase mt-2">Validade</p>
                <p>{format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}</p>
              </>
            )}
          </div>
        </div>

        {/* Service items */}
        {serviceItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Serviços</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 font-medium">Descrição</th>
                  <th className="text-center py-1.5 font-medium w-16">Qtd</th>
                  <th className="text-right py-1.5 font-medium w-24">Unit.</th>
                  <th className="text-right py-1.5 font-medium w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {serviceItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5">{item.description}</td>
                    <td className="text-center py-1.5">{item.quantity}</td>
                    <td className="text-right py-1.5">R$ {(item.unit_price || 0).toFixed(2)}</td>
                    <td className="text-right py-1.5 font-medium">R$ {(item.total_price || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Material items */}
        {materialItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Materiais</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 font-medium">Descrição</th>
                  <th className="text-center py-1.5 font-medium w-16">Qtd</th>
                  <th className="text-right py-1.5 font-medium w-24">Unit.</th>
                  <th className="text-right py-1.5 font-medium w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {materialItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1.5">{item.description}</td>
                    <td className="text-center py-1.5">{item.quantity}</td>
                    <td className="text-right py-1.5">R$ {(item.unit_price || 0).toFixed(2)}</td>
                    <td className="text-right py-1.5 font-medium">R$ {(item.total_price || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="border-t pt-3 flex flex-col items-end text-sm">
          {(quote.discount_amount ?? 0) > 0 && (
            <>
              <p className="text-gray-500">Subtotal: R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
              <p className="text-gray-500">Desconto: -R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
            </>
          )}
          <p className="text-xl font-bold mt-1">Total: R$ {(quote.total_value ?? 0).toFixed(2)}</p>
        </div>

        {/* Terms */}
        {quote.terms && (
          <div>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Condições e Termos</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.terms}</p>
          </div>
        )}

        {quote.notes && (
          <div>
            <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Observações</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </div>
    </div>
  );

  const title = `Orçamento #${quote.quote_number}`;

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

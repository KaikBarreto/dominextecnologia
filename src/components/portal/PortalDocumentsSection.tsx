import { useState } from 'react';
import { Download, FileText, Loader2, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/mobile/EmptyState';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';

export interface PortalDocumentItem {
  id: string;
  source: 'manual' | 'contract_attachment' | 'dominex_nfse';
  title: string;
  description: string | null;
  document_type: 'nfse' | 'nfe_product' | 'contract' | 'other';
  document_number?: string | null;
  issue_date?: string | null;
  amount?: number | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface PortalDocumentsSectionProps {
  kind: 'invoice' | 'document';
  items: PortalDocumentItem[];
  portalToken: string;
  sessionToken: string;
  locale: LocaleCode;
  timezone?: string | null;
  currency: string;
}

const TYPE_LABEL: Record<PortalDocumentItem['document_type'], string> = {
  nfse: 'NFS-e',
  nfe_product: 'NF-e de produto',
  contract: 'Contrato',
  other: 'Outro',
};

function formatBytes(value: number | null): string | null {
  if (!value) return null;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function base64PdfToUrl(base64: string): string {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

export function PortalDocumentsSection({
  kind,
  items,
  portalToken,
  sessionToken,
  locale,
  timezone,
  currency,
}: PortalDocumentsSectionProps) {
  const { toast } = useToast();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const isInvoice = kind === 'invoice';

  const handleOpen = async (item: PortalDocumentItem) => {
    setOpeningId(item.id);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal-document-download', {
        body: {
          portalToken,
          sessionToken: sessionToken || null,
          documentId: item.id,
          source: item.source,
        },
      });
      if (error || !data) throw error ?? new Error('Arquivo indisponível.');

      if (typeof data.url === 'string' && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (typeof data.pdf_base64 === 'string' && data.pdf_base64) {
        const objectUrl = base64PdfToUrl(data.pdf_base64);
        window.open(objectUrl, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        return;
      }
      throw new Error('Arquivo indisponível.');
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível abrir o arquivo',
        description: 'Tente novamente em instantes ou fale com a empresa responsável.',
      });
    } finally {
      setOpeningId(null);
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={isInvoice ? <ReceiptText className="h-9 w-9" /> : <FileText className="h-9 w-9" />}
        title={isInvoice ? 'Nenhuma nota fiscal disponível' : 'Nenhum documento disponível'}
        description={isInvoice
          ? 'Quando uma nota for emitida ou liberada, ela aparecerá aqui.'
          : 'Quando a empresa liberar um contrato ou documento, ele aparecerá aqui.'}
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => {
        const date = item.issue_date || item.created_at;
        const size = formatBytes(item.size_bytes);
        const sourceLabel = item.source === 'dominex_nfse'
          ? 'Emitida pelo Dominex'
          : item.source === 'contract_attachment'
            ? 'Anexo de contrato'
            : 'Enviada manualmente';
        return (
          <Card key={`${item.source}-${item.id}`} className="overflow-hidden">
            <CardContent className="flex h-full flex-col gap-4 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {isInvoice ? <ReceiptText className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
                    <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[item.document_type] ?? 'Arquivo'}</Badge>
                  </div>
                  {item.description && item.description !== item.title && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[
                      item.document_number ? `Nº ${item.document_number}` : null,
                      date ? formatDate(date, locale, timezone ?? undefined) : null,
                      size,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {isInvoice && item.amount != null && (
                    <p className="mt-1 text-sm font-semibold">{formatMoney(item.amount, currency, locale)}</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">{sourceLabel}</p>
                </div>
              </div>
              <Button variant="outline" className="mt-auto w-full" onClick={() => void handleOpen(item)} disabled={openingId === item.id}>
                {openingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Abrir arquivo
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

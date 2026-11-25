import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileCode2, FileText, Loader2, ReceiptText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useDataPagination } from '@/hooks/useDataPagination';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import {
  requestPortalDocumentDownload,
  type PortalDocumentFormat,
  type PortalDocumentSource,
} from './portalDocumentDownload';

export interface PortalDocumentItem {
  id: string;
  source: PortalDocumentSource;
  title: string;
  description: string | null;
  document_type: 'nfse' | 'nfe' | 'nfce' | 'nfe_product' | 'contract' | 'other';
  document_number?: string | null;
  issue_date?: string | null;
  amount?: number | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  /** Só NF-e/NFC-e emitidas pela empresa trazem esse campo. */
  has_xml?: boolean;
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

const PAGE_SIZE = 10;

const TYPE_LABEL: Record<PortalDocumentItem['document_type'], string> = {
  nfse: 'NFS-e',
  nfe: 'NF-e',
  nfce: 'NFC-e',
  nfe_product: 'NF-e de produto',
  contract: 'Contrato',
  other: 'Outro',
};

type InvoiceFilter = 'all' | 'nfse' | 'nfe' | 'nfce' | 'other';

const FILTER_LABEL: Record<InvoiceFilter, string> = {
  all: 'Todas',
  nfse: 'NFS-e',
  nfe: 'NF-e',
  nfce: 'NFC-e',
  other: 'Outras',
};

const FILTER_ORDER: InvoiceFilter[] = ['nfse', 'nfe', 'nfce', 'other'];

function invoiceGroup(item: PortalDocumentItem): Exclude<InvoiceFilter, 'all'> {
  if (item.document_type === 'nfse') return 'nfse';
  if (item.document_type === 'nfe' || item.document_type === 'nfe_product') return 'nfe';
  if (item.document_type === 'nfce') return 'nfce';
  return 'other';
}

function isGoodsInvoice(item: PortalDocumentItem): boolean {
  return item.source === 'dominex_nfe' || item.source === 'dominex_nfce';
}

function sourceLabel(item: PortalDocumentItem): string {
  // White-label: o portal é da empresa (tenant). A marca da plataforma nunca aparece aqui.
  if (item.source === 'dominex_nfe' || item.source === 'dominex_nfce' || item.source === 'dominex_nfse') return 'Emitida pela empresa';
  if (item.source === 'contract_attachment') return 'Anexo de contrato';
  return 'Enviada manualmente';
}

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
  const [opening, setOpening] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<InvoiceFilter>('all');
  const isInvoice = kind === 'invoice';

  const availableFilters = useMemo(() => {
    if (!isInvoice) return [] as InvoiceFilter[];
    const present = new Set<InvoiceFilter>(items.map(invoiceGroup));
    return FILTER_ORDER.filter((group) => present.has(group));
  }, [isInvoice, items]);

  const filtered = useMemo(() => items.filter((item) => {
    if (isInvoice && typeFilter !== 'all' && invoiceGroup(item) !== typeFilter) return false;
    return fuzzyIncludesAny(
      [item.title, item.document_number, item.description, item.file_name, TYPE_LABEL[item.document_type]],
      search,
    );
  }), [isInvoice, items, search, typeFilter]);

  const pagination = useDataPagination(filtered, PAGE_SIZE);
  // Busca só com 2+ itens; filtro só com 2+ tipos; paginação só com 2+ páginas.
  const showSearch = items.length > 1;
  const showTypeFilter = availableFilters.length > 1;

  const handleOpen = async (item: PortalDocumentItem, format?: PortalDocumentFormat) => {
    const key = `${item.source}-${item.id}-${format ?? 'default'}`;
    setOpening(key);
    try {
      const result = await requestPortalDocumentDownload({
        portalToken,
        sessionToken: sessionToken || null,
        documentId: item.id,
        source: item.source,
        format,
      });
      if (result.kind === 'url') {
        window.open(result.url, '_blank', 'noopener,noreferrer');
        return;
      }
      const objectUrl = base64PdfToUrl(result.base64);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível abrir o arquivo',
        description: 'Tente novamente em instantes ou fale com a empresa responsável.',
      });
    } finally {
      setOpening(null);
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

  const changeFilter = (value: InvoiceFilter) => {
    setTypeFilter(value);
    pagination.setPage(1);
  };

  return (
    <div className="space-y-3">
      {(showSearch || showTypeFilter) && (
        <div className="space-y-3">
          {showSearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  pagination.setPage(1);
                }}
                placeholder={isInvoice ? 'Buscar por número ou descrição' : 'Buscar documento'}
                aria-label={isInvoice ? 'Buscar nota fiscal' : 'Buscar documento'}
                className="h-10 pl-9"
              />
            </div>
          )}
          {showTypeFilter && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de nota">
              {(['all', ...availableFilters] as InvoiceFilter[]).map((value) => {
                const active = typeFilter === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    aria-pressed={active}
                    onClick={() => changeFilter(value)}
                    className="h-10 rounded-full px-4"
                  >
                    {FILTER_LABEL[value]}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Search className="h-9 w-9" />}
          title="Nada encontrado"
          description="Tente outro termo de busca ou outro tipo de nota."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pagination.paginatedItems.map((item) => {
            const date = item.issue_date || item.created_at;
            const size = formatBytes(item.size_bytes);
            const goods = isGoodsInvoice(item);
            const pdfKey = `${item.source}-${item.id}-${goods ? 'pdf' : 'default'}`;
            const xmlKey = `${item.source}-${item.id}-xml`;
            return (
              <Card key={`${item.source}-${item.id}`} className="overflow-hidden" data-testid="portal-document-card">
                <CardContent className="flex h-full flex-col gap-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      {isInvoice ? <ReceiptText className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="line-clamp-2 min-w-0 break-words text-sm font-semibold">{item.title}</p>
                        <Badge className="border-transparent bg-primary text-[10px] text-primary-foreground hover:bg-primary">
                          {TYPE_LABEL[item.document_type] ?? 'Arquivo'}
                        </Badge>
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
                      <p className="mt-1 text-[11px] text-muted-foreground">{sourceLabel(item)}</p>
                    </div>
                  </div>
                  <div className={cn('mt-auto grid gap-2', goods && item.has_xml && 'grid-cols-2')}>
                    <Button
                      variant="outline"
                      className="h-10 w-full"
                      onClick={() => void handleOpen(item, goods ? 'pdf' : undefined)}
                      disabled={opening === pdfKey}
                    >
                      {opening === pdfKey
                        ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                        : <Download className="mr-2 h-4 w-4 shrink-0" />}
                      <span className="truncate">{goods ? 'Baixar PDF' : 'Abrir arquivo'}</span>
                    </Button>
                    {goods && item.has_xml && (
                      <Button
                        variant="outline"
                        className="h-10 w-full"
                        onClick={() => void handleOpen(item, 'xml')}
                        disabled={opening === xmlKey}
                      >
                        {opening === xmlKey
                          ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                          : <FileCode2 className="mr-2 h-4 w-4 shrink-0" />}
                        <span className="truncate">Baixar XML</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => pagination.setPage(pagination.page - 1)}
            disabled={!pagination.canGoPrev}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>
          <span className="text-center text-xs text-muted-foreground">
            {pagination.from} a {pagination.to} de {pagination.totalItems}
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => pagination.setPage(pagination.page + 1)}
            disabled={!pagination.canGoNext}
            aria-label="Próxima página"
          >
            <span className="hidden sm:inline">Próxima</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

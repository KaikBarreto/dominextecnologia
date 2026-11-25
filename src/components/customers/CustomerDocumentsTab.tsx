import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileCode,
  FileDown,
  FileText,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { HoverDropdownMenu } from '@/components/ui/hover-dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import {
  useCustomerDocuments,
  type CustomerDocument,
  type CustomerDocumentKind,
  type CustomerDocumentType,
} from '@/hooks/useCustomerDocuments';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDataPagination } from '@/hooks/useDataPagination';
import { FISCAL_NOTE_LABELS as FISCAL_LABEL, useFiscalNoteDownloads } from '@/hooks/useCustomerFiscalNotes';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';

interface CustomerDocumentsTabProps {
  customerId: string;
  canManage: boolean;
}

const TYPE_LABELS: Record<CustomerDocumentType, string> = {
  nfse: 'NFS-e de serviço',
  nfe_product: 'NF-e de produto',
  contract: 'Contrato',
  other: 'Outro documento',
};

function formatBytes(value: number | null): string {
  if (!value) return '';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** Selo saturado (fundo na cor + texto branco), conforme a régua de UI da casa. */
/** Abaixo desta largura do painel a tabela vira lista em cartões. */
const COMPACT_LIST_WIDTH = 640;

/**
 * Selos da lista. Tipo e origem usam o ACENTO do app (`bg-primary`, que é preto
 * com texto branco no padrão e segue a cor da marca quando a empresa tem uma) e
 * sempre `text-primary-foreground`: branco cravado some no tema escuro padrão.
 * Cor fixa só para SITUAÇÃO (no portal, fora do portal, cancelada).
 */
const BADGE_BASE = 'border-transparent text-[10px] whitespace-nowrap';
const BADGE_ACCENT = `${BADGE_BASE} bg-primary text-primary-foreground hover:bg-primary`;
const BADGE_SLATE = `${BADGE_BASE} bg-slate-500 text-white hover:bg-slate-500`;
const BADGE_EMERALD = `${BADGE_BASE} bg-emerald-600 text-white hover:bg-emerald-600`;
const BADGE_CANCELLED = `${BADGE_BASE} bg-gray-800 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-600`;

/** Opções do filtro de cada sub-aba; a chave de uma linha vem de `filterKeyOf`. */
const FILTER_OPTIONS: Record<CustomerDocumentKind, Array<{ value: string; label: string }>> = {
  invoice: [
    { value: 'nfe', label: 'NF-e' },
    { value: 'nfce', label: 'NFC-e' },
    { value: 'nfse', label: 'NFS-e' },
    { value: 'manual', label: 'Enviadas por você' },
  ],
  document: [
    { value: 'manual', label: 'Enviados por você' },
    { value: 'pmoc', label: 'Gerados pela OS' },
    { value: 'contract_attachment', label: 'Anexos de contrato' },
    { value: 'contract_pmoc', label: 'Gerados pelo contrato' },
    { value: 'shortcut', label: 'Atalhos' },
  ],
};

export function filterKeyOf(document: CustomerDocument): string {
  return document.fiscal ? document.fiscal.model : document.source;
}

const SHORTCUT_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  service_order: 'Ordem de serviço',
  contract: 'Contrato',
};

function formatDateOnly(value: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

export function CustomerDocumentsTab({ customerId, canManage }: CustomerDocumentsTabProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  // A ficha abre ao lado da lista de clientes: o painel pode ser estreito mesmo em
  // tela grande. A troca tabela/cartões segue a largura REAL do painel.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0]?.contentRect.width ?? null));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const useCards = isMobile || (containerWidth != null && containerWidth < COMPACT_LIST_WIDTH);
  const navigate = useNavigate();
  const { money, date: formatTimestamp } = useLocaleFormatters();
  const { list, upload, setVisibility, remove, getSignedUrl } = useCustomerDocuments(customerId);
  const fiscalDownloads = useFiscalNoteDownloads();
  const [search, setSearch] = useState('');
  const [originFilter, setOriginFilter] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeKind, setActiveKind] = useState<CustomerDocumentKind>('invoice');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState<CustomerDocumentType>('nfe_product');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [visibleInPortal, setVisibleInPortal] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const kindDocuments = useMemo(
    () => (list.data ?? []).filter((item) => item.document_kind === activeKind),
    [activeKind, list.data],
  );

  const optionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of kindDocuments) counts[filterKeyOf(item)] = (counts[filterKeyOf(item)] ?? 0) + 1;
    return counts;
  }, [kindDocuments]);

  const documents = useMemo(
    () => kindDocuments
      .filter((item) => originFilter.length === 0 || originFilter.includes(filterKeyOf(item)))
      .filter((item) => fuzzyIncludesAny(
        [
          item.title,
          item.document_number,
          item.description,
          item.file_name,
          item.fiscal?.number,
          item.fiscal ? FISCAL_LABEL[item.fiscal.model] : null,
          item.shortcut ? SHORTCUT_LABELS[item.shortcut.kind] : null,
        ],
        search,
      ))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [kindDocuments, originFilter, search],
  );

  const pagination = useDataPagination(documents, 10, `customer-documents-${customerId}-${activeKind}`);
  const hasFilters = originFilter.length > 0 || search.trim().length > 0;
  const clearFilters = () => {
    setSearch('');
    setOriginFilter([]);
    pagination.setPage(1);
  };

  const changeKind = (kind: CustomerDocumentKind) => {
    setActiveKind(kind);
    setSearch('');
    setOriginFilter([]);
  };

  const handleShortcut = (document: CustomerDocument) => {
    if (!document.shortcut) return;
    if (document.shortcut.newTab) window.open(`${window.location.origin}${document.shortcut.path}`, '_blank', 'noopener,noreferrer');
    else navigate(document.shortcut.path);
  };

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setDescription('');
    setDocumentNumber('');
    setIssueDate('');
    setAmount('');
    setVisibleInPortal(true);
    setDocumentType(activeKind === 'invoice' ? 'nfe_product' : 'other');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openUpload = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleFile = (selected: File | null) => {
    setFile(selected);
    if (selected && !title) {
      setTitle(selected.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) return;
    try {
      const normalizedAmount = amount.trim()
        ? Number(amount.replace(/\./g, '').replace(',', '.'))
        : null;
      if (normalizedAmount != null && (!Number.isFinite(normalizedAmount) || normalizedAmount < 0)) {
        throw new Error('Informe um valor válido.');
      }
      await upload.mutateAsync({
        file,
        kind: activeKind,
        type: documentType,
        title,
        description,
        documentNumber,
        issueDate,
        amount: normalizedAmount,
        visibleInPortal,
      });
      toast({ title: activeKind === 'invoice' ? 'Nota fiscal adicionada' : 'Documento adicionado' });
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível enviar o arquivo', description: getErrorMessage(error) });
    }
  };

  const handleOpen = async (document: CustomerDocument) => {
    setOpeningId(document.id);
    try {
      const url = await getSignedUrl(document);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível abrir o arquivo', description: getErrorMessage(error) });
    } finally {
      setOpeningId(null);
    }
  };

  const handleVisibility = async (document: CustomerDocument, visible: boolean) => {
    try {
      await setVisibility.mutateAsync({ id: document.id, visible });
      toast({ title: visible ? 'Arquivo liberado no portal' : 'Arquivo ocultado do portal' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível alterar a publicação', description: getErrorMessage(error) });
    }
  };

  const handleRemove = async (document: CustomerDocument) => {
    if (!window.confirm(`Excluir “${document.title}”? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove.mutateAsync(document);
      toast({ title: 'Arquivo excluído' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não foi possível excluir o arquivo', description: getErrorMessage(error) });
    }
  };

  const isInvoice = activeKind === 'invoice';
  const RowIcon = isInvoice ? ReceiptText : FileText;
  const itemClass = 'gap-2 focus:bg-primary focus:text-primary-foreground';

  const isBusy = (document: CustomerDocument) =>
    openingId === document.id || (document.fiscal != null && fiscalDownloads.busyKey === document.fiscal.key);

  const rowDate = (document: CustomerDocument) =>
    document.fiscal ? formatTimestamp(document.created_at) : formatDateOnly(document.issue_date);

  /** Linha de apoio do cartão: número, série, data e tamanho. */
  const rowMeta = (document: CustomerDocument) =>
    [
      document.document_number && !document.fiscal ? `Nº ${document.document_number}` : null,
      document.fiscal?.series != null ? `Série ${document.fiscal.series}` : null,
      rowDate(document),
      originText(document),
      formatBytes(document.size_bytes),
    ].filter(Boolean).join(' · ');

  /** Segunda linha da tabela: o que identifica o item além do título. */
  const rowSubline = (document: CustomerDocument) =>
    [
      document.document_number && !document.fiscal ? `Nº ${document.document_number}` : null,
      document.fiscal?.series != null ? `Série ${document.fiscal.series}` : null,
      originText(document),
      document.source !== 'manual' && document.description ? document.description : null,
      formatBytes(document.size_bytes),
    ].filter(Boolean).join(' · ') || document.file_name;

  const typeBadges = (document: CustomerDocument) => {
    // Um selo por linha: a origem ("Emitida pelo Dominex") vai na linha de apoio.
    if (document.fiscal) return <Badge className={BADGE_ACCENT}>{FISCAL_LABEL[document.fiscal.model]}</Badge>;
    if (document.source === 'manual') {
      return <Badge className={BADGE_ACCENT}>{TYPE_LABELS[document.document_type as CustomerDocumentType] ?? 'Outro'}</Badge>;
    }
    if (document.source === 'pmoc') return <Badge className={BADGE_ACCENT}>Gerado pela OS</Badge>;
    if (document.source === 'contract_attachment') return <Badge className={BADGE_ACCENT}>Anexo de contrato</Badge>;
    if (document.source === 'contract_pmoc') return <Badge className={BADGE_ACCENT}>Gerado pelo contrato</Badge>;
    if (document.source === 'shortcut') return <Badge className={BADGE_ACCENT}>Atalho</Badge>;
    return null;
  };

  /** De onde o item veio, em texto, para a linha de apoio. */
  const originText = (document: CustomerDocument) => {
    if (document.fiscal) return 'Emitida pelo Dominex';
    if (document.source === 'shortcut') return SHORTCUT_LABELS[document.shortcut?.kind ?? ''] ?? null;
    return null;
  };

  /** Só o que pede atenção: nota cancelada, ou upload liberado/oculto no portal. */
  const statusBadge = (document: CustomerDocument) => {
    if (document.fiscal?.cancelled) {
      return <Badge className={cn(BADGE_CANCELLED, 'gap-1')}><Ban className="h-3 w-3" />Cancelada</Badge>;
    }
    if (document.source === 'manual') {
      return document.is_visible_in_portal
        ? <Badge className={cn(BADGE_EMERALD, 'gap-1')}><Eye className="h-3 w-3" />No portal</Badge>
        : <Badge className={cn(BADGE_SLATE, 'gap-1')}><EyeOff className="h-3 w-3" />Fora do portal</Badge>;
    }
    return null;
  };

  const rowActionItems = (document: CustomerDocument) => {
    const fiscal = document.fiscal;
    const manual = canManage && document.source === 'manual';
    return (
      <>
        {fiscal?.hasPdf && (
          <DropdownMenuItem onClick={() => void fiscalDownloads.download(fiscal, 'pdf')} disabled={fiscalDownloads.busyKey !== null} className={itemClass}>
            <FileDown className="h-4 w-4" />
            {fiscal.model === 'nfse' ? 'Baixar PDF' : fiscal.model === 'nfce' ? 'Baixar DANFC-e' : 'Baixar DANFE'}
          </DropdownMenuItem>
        )}
        {fiscal?.hasXml && (
          <DropdownMenuItem onClick={() => void fiscalDownloads.download(fiscal, 'xml')} disabled={fiscalDownloads.busyKey !== null} className={itemClass}>
            <FileCode className="h-4 w-4" />
            Baixar XML
          </DropdownMenuItem>
        )}
        {!fiscal && document.source === 'shortcut' && (
          <DropdownMenuItem onClick={() => handleShortcut(document)} className={itemClass}>
            <ExternalLink className="h-4 w-4" />
            Abrir
          </DropdownMenuItem>
        )}
        {!fiscal && document.source !== 'shortcut' && (
          <DropdownMenuItem onClick={() => void handleOpen(document)} disabled={isBusy(document)} className={itemClass}>
            <Download className="h-4 w-4" />
            Abrir arquivo
          </DropdownMenuItem>
        )}
        {manual && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleVisibility(document, !document.is_visible_in_portal)} className={itemClass}>
              {document.is_visible_in_portal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {document.is_visible_in_portal ? 'Ocultar do portal' : 'Mostrar no portal'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleRemove(document)}
              className="gap-2 text-destructive focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </>
        )}
      </>
    );
  };

  return (
    <div ref={containerRef} className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <MobilePillTabs
          className="mx-0 min-w-0 sm:w-auto"
          tabs={[
            { value: 'invoice', label: 'Notas fiscais', icon: <ReceiptText className="h-4 w-4" /> },
            { value: 'document', label: 'Documentos', icon: <FileText className="h-4 w-4" /> },
          ]}
          activeTab={activeKind}
          onTabChange={(value) => changeKind(value as CustomerDocumentKind)}
        />
        {canManage && (
          <Button onClick={openUpload}>
            <Plus className="mr-2 h-4 w-4" />
            {isInvoice ? 'Adicionar nota externa' : 'Adicionar documento'}
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {isInvoice
          ? 'Aqui ficam as notas enviadas por você, de outros sistemas, e as notas emitidas pelo Dominex para este cliente (NF-e, NFC-e e NFS-e), que aparecem sozinhas. As notas autorizadas também entram no portal do cliente quando a seção de notas estiver liberada.'
          : 'Além dos arquivos enviados por você, aparecem aqui sozinhos os anexos e documentos PMOC dos contratos deste cliente, e atalhos para os orçamentos, ordens de serviço e contratos dele.'}
      </div>

      {list.failedSources.length > 0 && (
        <div role="alert" className="rounded-lg border border-destructive px-4 py-3 text-sm text-destructive">
          Não foi possível carregar: {list.failedSources.join(', ')}. A lista pode estar incompleta.
          <Button variant="outline" size="sm" className="ml-3 h-9" onClick={() => void list.refetch()}>Tentar novamente</Button>
        </div>
      )}

      {kindDocuments.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); pagination.setPage(1); }}
              placeholder={isInvoice ? 'Buscar por número, tipo ou título' : 'Buscar por título, contrato ou número'}
              aria-label="Buscar arquivos"
              className="h-10 pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 gap-1.5 self-start sm:self-auto">
                {isInvoice ? 'Tipo' : 'Origem'}
                {originFilter.length > 0 && (
                  <Badge className="h-5 min-w-5 border-transparent bg-primary px-1.5 text-[10px] text-primary-foreground hover:bg-primary">
                    {originFilter.length}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {originFilter.length === 0 ? 'Mostrando todos' : isInvoice ? 'Tipo' : 'Origem'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {FILTER_OPTIONS[activeKind].map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={originFilter.includes(option.value)}
                  onCheckedChange={() => {
                    setOriginFilter((previous) => previous.includes(option.value)
                      ? previous.filter((value) => value !== option.value)
                      : [...previous, option.value]);
                    pagination.setPage(1);
                  }}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="flex-1">{option.label}</span>
                  <span className="ml-3 text-xs text-muted-foreground">{optionCounts[option.value] ?? 0}</span>
                </DropdownMenuCheckboxItem>
              ))}
              {originFilter.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setOriginFilter([]); pagination.setPage(1); }}>Limpar</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {list.isLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : list.isError ? (
        <Card><CardContent className="py-10 text-center text-sm text-destructive">Não foi possível carregar os arquivos deste cliente.</CardContent></Card>
      ) : kindDocuments.length === 0 ? (
        <EmptyState
          size="compact"
          icon={isInvoice ? <ReceiptText className="h-9 w-9" /> : <FileText className="h-9 w-9" />}
          title={isInvoice ? 'Nenhuma nota fiscal por aqui' : 'Nenhum documento por aqui'}
          description={isInvoice
            ? 'As notas emitidas pelo Dominex para este cliente aparecem sozinhas. Notas de outros sistemas podem ser enviadas aqui.'
            : 'Envie contratos, laudos, termos e outros arquivos do cliente. Anexos e documentos dos contratos aparecem sozinhos.'}
          action={canManage ? { label: isInvoice ? 'Adicionar nota externa' : 'Adicionar documento', onClick: openUpload } : undefined}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Search className="h-9 w-9" />}
          title="Nada encontrado"
          description="Nenhum arquivo corresponde à busca ou ao filtro escolhido."
          action={hasFilters ? { label: 'Limpar filtros', onClick: clearFilters } : undefined}
        />
      ) : (
        <>
          {useCards ? (
            /* ─── Mobile ou painel estreito: lista em cartões, mesma régua das telas de notas ─── */
            <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border/60">
              {pagination.paginatedItems.map((document) => (
                <div key={document.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary">
                    <RowIcon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{document.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{rowMeta(document) || document.file_name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {typeBadges(document)}
                      {statusBadge(document)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {document.amount != null && (
                      <p className="whitespace-nowrap text-sm font-bold">{money(Number(document.amount))}</p>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mr-2 h-10 w-10 shrink-0 text-muted-foreground"
                          aria-label={`Ações de ${document.title}`}
                          disabled={isBusy(document)}
                        >
                          {isBusy(document) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {rowActionItems(document)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ─── Desktop: tabela com menu de ações por linha ─── */
            <div className="overflow-x-auto rounded-lg border">
              <Table className="table-fixed [&_th]:px-2.5 [&_td]:px-2.5">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs uppercase tracking-wider">{isInvoice ? 'Nota' : 'Documento'}</TableHead>
                    <TableHead className={cn('text-xs uppercase tracking-wider', isInvoice ? 'w-[124px]' : 'w-[150px]')}>{isInvoice ? 'Tipo' : 'Origem'}</TableHead>
                    <TableHead className="w-[92px] whitespace-nowrap text-xs uppercase tracking-wider">Data</TableHead>
                    {isInvoice && <TableHead className="w-[104px] whitespace-nowrap text-right text-xs uppercase tracking-wider">Valor</TableHead>}
                    <TableHead className="w-[124px] text-center text-xs uppercase tracking-wider">Situação</TableHead>
                    <TableHead className="w-[56px] text-center text-xs uppercase tracking-wider">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((document) => (
                    <TableRow key={document.id} className="hover:bg-muted/30">
                      <TableCell>
                        <span className="block truncate font-medium" title={document.title}>{document.title}</span>
                        <span className="block truncate text-xs text-muted-foreground" title={rowSubline(document)}>{rowSubline(document)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">{typeBadges(document)}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{rowDate(document) ?? '—'}</TableCell>
                      {isInvoice && (
                        <TableCell className="whitespace-nowrap text-right font-semibold">
                          {document.amount != null ? money(Number(document.amount)) : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-center">{statusBadge(document) ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-center">
                        <HoverDropdownMenu
                          align="end"
                          contentClassName="w-56"
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Ações de ${document.title}`}
                              disabled={isBusy(document)}
                            >
                              {isBusy(document) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          }
                        >
                          {rowActionItems(document)}
                        </HoverDropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DataTablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            from={pagination.from}
            to={pagination.to}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}

      <ResponsiveModal
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && upload.isPending) return;
          setDialogOpen(open);
        }}
        title={isInvoice ? 'Adicionar nota fiscal externa' : 'Adicionar documento'}
      >
        <div className="space-y-4 p-1">
          <div className="space-y-2">
            <Label htmlFor="customer-document-file">Arquivo</Label>
            <Input
              ref={fileInputRef}
              id="customer-document-file"
              type="file"
              accept={isInvoice ? '.pdf,.xml,application/pdf,application/xml,text/xml' : '.pdf,.xml,.txt,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx'}
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">Até 15 MB. {isInvoice ? 'PDF ou XML.' : 'PDF, XML, imagem, Word, Excel ou texto.'}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer-document-title">Título</Label>
              <Input id="customer-document-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isInvoice ? 'Ex.: NF-e dos equipamentos' : 'Ex.: Contrato de manutenção'} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={documentType} onValueChange={(value) => setDocumentType(value as CustomerDocumentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isInvoice ? (
                    <>
                      <SelectItem value="nfe_product">NF-e de produto</SelectItem>
                      <SelectItem value="nfse">NFS-e de serviço</SelectItem>
                      <SelectItem value="other">Outro documento fiscal</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="contract">Contrato</SelectItem>
                      <SelectItem value="other">Outro documento</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            {isInvoice && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="customer-document-number">Número da nota</Label>
                  <Input id="customer-document-number" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-document-date">Data de emissão</Label>
                  <Input id="customer-document-date" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-document-amount">Valor</Label>
                  <Input id="customer-document-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" />
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="customer-document-description">Observação</Label>
              <Textarea id="customer-document-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Opcional" />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/20 p-3">
            <div>
              <Label htmlFor="customer-document-visible">Disponível no portal</Label>
              <p className="mt-1 text-xs text-muted-foreground">O arquivo só aparece se esta publicação e a seção do portal estiverem liberadas.</p>
            </div>
            <Switch id="customer-document-visible" checked={visibleInPortal} onCheckedChange={setVisibleInPortal} />
          </div>

          <Button className="w-full" onClick={() => void handleSubmit()} disabled={!file || !title.trim() || upload.isPending}>
            {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Enviar arquivo
          </Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}

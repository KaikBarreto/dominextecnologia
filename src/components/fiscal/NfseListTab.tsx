import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  FileText,
  Plus,
  Search,
  Loader2,
  Eye,
  RefreshCw,
  FileDown,
  FileCode,
  History,
  Ban,
  Pencil,
  Send,
  Trash2,
  SlidersHorizontal,
  MoreVertical,
  MoreHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { EmptyState } from '@/components/mobile/EmptyState';

import { useIsMobile } from '@/hooks/use-mobile';
import { useNfseEmissionsPaged, type NfseEmissionRow } from '@/hooks/useNfseEmissionsPaged';
import { useNfseEmission } from '@/hooks/useNfseEmission';
import { useNfse, type NfseEmission } from '@/hooks/useNfse';
import { invokeFisqal } from '@/utils/fisqalEdge';
import { formatMoney, formatDate as formatDateLib } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

import { NfseStatusBadge, NFSE_STATUS_FILTER_OPTIONS } from '@/components/fiscal/nfseStatus';
import { NovaNotaModal } from '@/components/fiscal/NovaNotaModal';
import { NfseDetailModal, type NfseDetailAction } from '@/components/fiscal/NfseDetailModal';
import type { NfseInitialDraft } from '@/components/fiscal/nova-nota/types';

// ─── Constantes ──────────────────────────────────────────────────────────────

const PAGE_SIZE_KEY = 'nfse-list-page-size';
const ALL_PAGE_SIZE = 100_000;

/** Status filter options: os existentes + rascunho. */
const STATUS_FILTER_OPTIONS_EXTENDED = [
  ...NFSE_STATUS_FILTER_OPTIONS,
  { value: 'rascunho' } as const,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBRL(value: number | null | undefined) {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDt(isoStr: string | null | undefined) {
  if (!isoStr) return '—';
  try {
    return format(new Date(isoStr), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '—';
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface NfseListTabProps {
  canEmit: boolean;
  onNewNote: () => void;
}

/**
 * Aba de listagem de NFS-e.
 * - Desktop: tabela (Número / Data / Tomador / Valor / Status / Ações).
 * - Mobile: cards com menu ⋮.
 * - Filtros server-side via RPC `get_nfse_emissions_paged`.
 * - Suporte a rascunho: Continuar preenchendo / Emitir / Excluir.
 */
export function NfseListTab({ canEmit, onNewNote }: NfseListTabProps) {
  const isMobile = useIsMobile();
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const tList = t.list;

  const { rows, totalCount, loading, fetch, refetch } = useNfseEmissionsPaged();
  const { cancel: cancelNfse } = useNfse();

  // ─── Filtros ─────────────────────────────────────────────────────────────

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(() => {
    if (typeof window === 'undefined') return 10;
    const saved = localStorage.getItem(PAGE_SIZE_KEY);
    if (saved === 'all') return 'all';
    const n = saved ? parseInt(saved, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 10;
  });

  // Debounce de busca ~350 ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset p/ página 1 quando filtros mudam.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, itemsPerPage]);

  // Fetch server-side.
  useEffect(() => {
    fetch({
      statuses: statusFilter.length ? statusFilter : undefined,
      search: debouncedSearch || undefined,
      sortKey: 'created_at',
      sortDir: 'desc',
      page: currentPage,
      pageSize: itemsPerPage === 'all' ? ALL_PAGE_SIZE : itemsPerPage,
    });
  }, [fetch, debouncedSearch, statusFilter, currentPage, itemsPerPage]);

  // ─── Paginação ────────────────────────────────────────────────────────────

  const effectivePageSize = itemsPerPage === 'all' ? Math.max(totalCount, 1) : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalCount / effectivePageSize));
  const from = totalCount === 0 ? 0 : (currentPage - 1) * effectivePageSize + 1;
  const to = Math.min(from + rows.length - 1, totalCount);

  const handlePageSizeChange = useCallback((value: 10 | 25 | 50 | 100 | 'all') => {
    setItemsPerPage(value);
    setCurrentPage(1);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PAGE_SIZE_KEY, value === 'all' ? 'all' : String(value));
    }
  }, []);

  // ─── Rascunho: "Continuar preenchendo" ────────────────────────────────────

  const [draftToOpen, setDraftToOpen] = useState<string | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [draftInitial, setDraftInitial] = useState<NfseInitialDraft | undefined>(undefined);

  const { emission: draftEmission, isLoading: loadingDraft } = useNfseEmission(draftToOpen);

  useEffect(() => {
    if (!draftToOpen || loadingDraft) return;
    if (!draftEmission) return;
    // Converte a linha completa no shape NfseInitialDraft.
    const draft: NfseInitialDraft = {
      id: draftEmission.id,
      customerId: draftEmission.customer_id ?? null,
      dataCompetencia: (draftEmission as any).data_competencia ?? null,
      regimeApuracao: null,
      servico: {
        codigoServico: (draftEmission as any).codigo_servico ?? '',
        codigoNbs: (draftEmission as any).codigo_nbs ?? '',
        municipioIncidenciaIbge: (draftEmission as any).municipio_incidencia_ibge ?? '',
        municipioIncidenciaNome: (draftEmission as any).municipio_incidencia_nome ?? '',
        tribIssqn: (draftEmission as any).trib_issqn ?? '1',
        discriminacao: draftEmission.descricao_servico ?? '',
      },
      valores: {
        valorServico: draftEmission.valor_servico ?? 0,
        aliquotaIssqn: (draftEmission as any).aliquota_issqn ?? 0,
        tpRetIssqn: (draftEmission as any).tp_ret_issqn ?? '2',
        valorPis: (draftEmission as any).valor_pis ?? 0,
        valorCofins: (draftEmission as any).valor_cofins ?? 0,
        valorCsll: (draftEmission as any).valor_csll ?? 0,
        percentualTribSn: (draftEmission as any).perc_trib_sn ?? 0,
      },
    };
    setDraftInitial(draft);
    setDraftToOpen(null);
    setNovaOpen(true);
  }, [draftToOpen, draftEmission, loadingDraft]);

  const handleContinueDraft = (row: NfseEmissionRow) => {
    setDraftToOpen(row.id);
  };

  // ─── Ação: Emitir rascunho ────────────────────────────────────────────────

  const handleEmitDraft = async (row: NfseEmissionRow) => {
    if (!canEmit) {
      toast.error('Você não tem permissão para emitir notas fiscais.');
      return;
    }
    const tid = toast.loading('Enviando NFS-e...');
    try {
      const result = await invokeFisqal('fisqal-emit-nfse', { emissionId: row.id });
      toast.dismiss(tid);
      if (!result.ok) {
        toast.error(result.message ?? 'Erro ao emitir a nota.');
        return;
      }
      toast.success('NFS-e enviada para emissão.');
      refetch();
    } catch {
      toast.dismiss(tid);
      toast.error('Erro ao emitir a nota fiscal.');
    }
  };

  // ─── Ação: Excluir rascunho ───────────────────────────────────────────────

  const handleDeleteDraft = async (row: NfseEmissionRow) => {
    const tid = toast.loading('Excluindo rascunho...');
    try {
      const result = await invokeFisqal('fisqal-delete-nfse-draft', { id: row.id });
      toast.dismiss(tid);
      if (!result.ok) {
        toast.error(result.message ?? 'Erro ao excluir o rascunho.');
        return;
      }
      toast.success('Rascunho excluído.');
      refetch();
    } catch {
      toast.dismiss(tid);
      toast.error('Erro ao excluir o rascunho.');
    }
  };

  // ─── Ação: Cancelar NFS-e emitida ────────────────────────────────────────

  const handleCancel = async (row: NfseEmissionRow) => {
    if (!canEmit) {
      toast.error('Você não tem permissão para cancelar notas fiscais.');
      return;
    }
    const tid = toast.loading('Cancelando NFS-e...');
    try {
      await cancelNfse({ emissionId: row.id });
      toast.dismiss(tid);
      toast.success('Cancelamento solicitado.');
      refetch();
    } catch {
      toast.dismiss(tid);
      toast.error('Não foi possível cancelar a nota.');
    }
  };

  // ─── Ação: Atualizar status ───────────────────────────────────────────────

  const { refreshStatus } = useNfse();

  const handleRefreshStatus = async (row: NfseEmissionRow) => {
    const tid = toast.loading('Consultando status...');
    try {
      await refreshStatus(row.id);
      toast.dismiss(tid);
      toast.success('Status atualizado.');
      refetch();
    } catch {
      toast.dismiss(tid);
      toast.error('Não foi possível atualizar o status.');
    }
  };

  // ─── Ação: Download PDF ───────────────────────────────────────────────────

  const handleDownloadPdf = (row: NfseEmissionRow) => {
    if (!row.pdf_url) { toast.error('PDF não disponível.'); return; }
    window.open(row.pdf_url, '_blank', 'noopener');
  };

  // ─── Ação: Download XML ───────────────────────────────────────────────────

  const [xmlLoadingId, setXmlLoadingId] = useState<string | null>(null);
  const handleDownloadXml = async (row: NfseEmissionRow) => {
    if (!row.xml_url) { toast.error('XML não disponível.'); return; }
    window.open(row.xml_url, '_blank', 'noopener');
  };

  // ─── Detalhe (NfseDetailModal) ─────────────────────────────────────────────

  /**
   * Converte NfseEmissionRow para NfseEmission (tipo do NfseDetailModal).
   * Campos não presentes na RPC ficam como null.
   */
  const rowToEmission = useCallback((row: NfseEmissionRow): NfseEmission => {
    return {
      id: row.id,
      company_id: '',
      customer_id: row.customer_id ?? null,
      financial_transaction_id: null,
      status: row.status,
      fisqal_dps_id: null,
      fisqal_fiscal_request_id: null,
      numero_nfse: row.numero_nfse ?? '',
      chave_acesso: row.chave_acesso ?? null,
      protocolo: row.protocolo ?? null,
      pdf_url: row.pdf_url ?? null,
      xml_url: row.xml_url ?? null,
      valor_servico: row.valor_servico ?? null,
      valor_iss: row.valor_iss ?? null,
      descricao_servico: null,
      idempotency_key: null,
      error_message: row.error_message ?? null,
      emitida_em: row.emitida_em ?? null,
      created_at: row.created_at,
      updated_at: row.created_at,
    } as unknown as NfseEmission;
  }, []);

  const [detailEmission, setDetailEmission] = useState<NfseEmission | null>(null);
  const [detailAction, setDetailAction] = useState<NfseDetailAction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (row: NfseEmissionRow, action: NfseDetailAction | null = null) => {
    setDetailEmission(rowToEmission(row));
    setDetailAction(action);
    setDetailOpen(true);
  };

  // ─── Menu de ações por linha ──────────────────────────────────────────────

  const rowActionsMenu = (row: NfseEmissionRow, triggerNode: React.ReactNode) => {
    const isDraft = row.status === 'rascunho';
    const isRejected = row.status === 'rejeitada' || row.status === 'falhou';
    const isAuthorized = row.status === 'autorizada';
    const isPending = row.status === 'pendente' || row.status === 'processando';
    const isCancelled = row.status === 'cancelada';

    const canViewDetail = !isDraft;
    const canContinueDraft = isDraft;
    // Emitir/Reenviar depende de a empresa estar habilitada (pode_emitir).
    const canEmitRow = (isDraft || isRejected) && canEmit;
    const canCheckStatus = isPending;
    const canDownloadPdf = isAuthorized && !!row.pdf_url;
    const canDownloadXml = (isAuthorized || isCancelled) && !!row.xml_url;
    const canHistory = !isDraft;
    const canCancelRow = canEmit && (isAuthorized || isPending);
    // Excluir o próprio rascunho NÃO exige habilitação de emissão.
    const canDeleteDraft = isDraft;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          {triggerNode}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
          {canViewDetail && (
            <DropdownMenuItem
              onClick={() => openDetail(row)}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
            >
              <Eye className="h-4 w-4" />
              {t.actions.viewDetail}
            </DropdownMenuItem>
          )}
          {canContinueDraft && (
            <DropdownMenuItem
              onClick={() => handleContinueDraft(row)}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
              disabled={loadingDraft && draftToOpen === row.id}
            >
              {loadingDraft && draftToOpen === row.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Pencil className="h-4 w-4" />}
              {t.actions.continueDraft}
            </DropdownMenuItem>
          )}
          {canEmitRow && (
            <DropdownMenuItem
              onClick={() => handleEmitDraft(row)}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
            >
              <Send className="h-4 w-4" />
              {isRejected ? t.actions.reemit : t.actions.emitDraft}
            </DropdownMenuItem>
          )}
          {canCheckStatus && (
            <DropdownMenuItem
              onClick={() => handleRefreshStatus(row)}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              {t.actions.refreshStatus}
            </DropdownMenuItem>
          )}
          {canDownloadPdf && (
            <DropdownMenuItem
              onClick={() => handleDownloadPdf(row)}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
            >
              <FileDown className="h-4 w-4" />
              {t.actions.downloadPdf}
            </DropdownMenuItem>
          )}
          {canDownloadXml && (
            <DropdownMenuItem
              onClick={() => handleDownloadXml(row)}
              disabled={xmlLoadingId === row.id}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
            >
              <FileCode className="h-4 w-4" />
              {t.actions.downloadXml}
            </DropdownMenuItem>
          )}
          {canHistory && (
            <DropdownMenuItem
              onClick={() => openDetail(row)}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
            >
              <History className="h-4 w-4" />
              {t.actions.history}
            </DropdownMenuItem>
          )}

          {/* Ações destrutivas */}
          {canCancelRow && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleCancel(row)}
                className="gap-2 text-destructive focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white"
              >
                <Ban className="h-4 w-4" />
                {t.actions.cancel}
              </DropdownMenuItem>
            </>
          )}
          {canDeleteDraft && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDeleteDraft(row)}
                className="gap-2 text-destructive focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
                {t.actions.deleteDraft}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // ─── Filtro de status ─────────────────────────────────────────────────────

  const statusFilterOptions = STATUS_FILTER_OPTIONS_EXTENDED.map((o) => ({
    value: o.value,
    label: (t.status as Record<string, string>)[o.value] ?? o.value,
  }));

  const filterButton = (
    <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 shrink-0">
          <SlidersHorizontal className="h-4 w-4" />
          {t.filters.button}
          {statusFilter.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
              {statusFilter.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle>{t.filters.title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <FilterCheckboxGroup
            label={t.filters.status}
            options={statusFilterOptions}
            selected={statusFilter}
            onChange={setStatusFilter}
            emptyLabel={t.filters.allLabel}
          />
        </div>
        <div className="sticky bottom-0 border-t bg-background px-5 py-3 flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setStatusFilter([])}
            disabled={statusFilter.length === 0}
          >
            {t.actions.clear}
          </Button>
          <Button className="flex-1" onClick={() => setFilterOpen(false)}>
            {t.actions.apply}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="space-y-4 min-w-0 w-full">
      {/* Barra de busca + filtros + botão Nova Nota */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.search.placeholder}
            className="pl-9"
          />
        </div>
        {filterButton}
        {canEmit && (
          <Button onClick={onNewNote} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t.actions.newNote}</span>
          </Button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title={tList.empty}
          description=""
        />
      ) : isMobile ? (
        /* ─── Mobile: cards ─── */
        <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 px-4 py-3.5"
              onClick={() => row.status !== 'rascunho' && openDetail(row)}
            >
              <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate leading-tight">
                  {row.customer_name || tList.customerFallback}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                  {row.numero_nfse
                    ? <span className="font-medium">{tList.notePrefix} {row.numero_nfse}</span>
                    : <span className="italic">{t.status.rascunho}</span>}
                  {row.created_at && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{formatDt(row.created_at)}</span>
                    </>
                  )}
                </div>
                <div className="mt-1">
                  <NfseStatusBadge status={row.status} />
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {row.valor_servico != null && (
                  <p className="font-bold text-sm whitespace-nowrap text-primary">
                    {formatBRL(row.valor_servico)}
                  </p>
                )}
                {rowActionsMenu(
                  row,
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 -mr-2 text-muted-foreground shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>,
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── Desktop: tabela ─── */
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px] text-center">{t.columns.number}</TableHead>
                <TableHead className="w-[120px]">{t.columns.date}</TableHead>
                <TableHead>{t.columns.customer}</TableHead>
                <TableHead className="text-right w-[140px] whitespace-nowrap">{t.columns.value}</TableHead>
                <TableHead className="text-center">{t.columns.status}</TableHead>
                <TableHead className="text-center w-[80px]">{t.columns.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => row.status !== 'rascunho' && openDetail(row)}
                >
                  <TableCell className="font-medium text-center">
                    {row.numero_nfse ? `#${row.numero_nfse}` : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDt(row.created_at)}
                  </TableCell>
                  <TableCell className="break-words max-w-[200px] truncate">
                    {row.customer_name || '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold whitespace-nowrap">
                    {formatBRL(row.valor_servico)}
                  </TableCell>
                  <TableCell className="text-center">
                    <NfseStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {rowActionsMenu(
                      row,
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paginação */}
      {!loading && totalCount > 0 && (
        <DataTablePagination
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          from={from}
          to={to}
          pageSize={itemsPerPage === 'all' ? 'all' : (itemsPerPage as 10 | 25 | 50 | 100)}
          onPageChange={(p) => setCurrentPage(Math.max(1, Math.min(p, totalPages)))}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {/* Modal: Nova Nota / Continuar Preenchendo */}
      <NovaNotaModal
        open={novaOpen}
        onOpenChange={(o) => {
          setNovaOpen(o);
          if (!o) {
            setDraftInitial(undefined);
          }
        }}
        onEmitted={() => {
          setDraftInitial(undefined);
          refetch();
        }}
        initialDraft={draftInitial}
      />

      {/* Modal: Detalhe da nota */}
      <NfseDetailModal
        emission={detailEmission}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        initialAction={detailAction}
      />
    </div>
  );
}

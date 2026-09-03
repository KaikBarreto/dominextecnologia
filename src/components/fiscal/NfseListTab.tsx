import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
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
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverDropdownMenu } from '@/components/ui/hover-dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { UserAvatarTooltip } from '@/components/ui/UserAvatarTooltip';
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
import { useTableSort } from '@/hooks/useTableSort';
import { useNfseEmissionsPaged } from '@/hooks/useNfseEmissionsPaged';
import { useNfseEmission } from '@/hooks/useNfseEmission';
import { useNfse } from '@/hooks/useNfse';
import { invokeNfse } from '@/utils/nfseEdge';
import { cpfCnpjMask } from '@/utils/masks';
import { formatMoney, formatDate, formatNumber } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

import { NfseStatusBadge, NFSE_STATUS_FILTER_OPTIONS } from '@/components/fiscal/nfseStatus';
import { NovaNotaModal } from '@/components/fiscal/NovaNotaModal';
import { NfseDetailModal, type NfseDetailAction } from '@/components/fiscal/NfseDetailModal';
import { nfseDisplayDate, nfseRowToEmission, type NfseListRow } from '@/components/fiscal/nfseRow';
import type { NfseInitialDraft, TribIssqn, TpRetIssqn } from '@/components/fiscal/nova-nota/types';

// ─── Constantes ──────────────────────────────────────────────────────────────

const PAGE_SIZE_KEY = 'nfse-list-page-size';
const ALL_PAGE_SIZE = 100_000;

/** Status filter options — a lista canônica já inclui rascunho. */
const STATUS_FILTER_OPTIONS_EXTENDED = [...NFSE_STATUS_FILTER_OPTIONS];

/**
 * Chaves de ordenação que a RPC sabe ordenar no SERVIDOR (whitelist do
 * `get_nfse_emissions_paged`). Para as outras — competência e tomador — a RPC
 * cai no `created_at` e quem reordena é o `useTableSort`, sobre a página que
 * veio. Ordenar as duas listas pela MESMA chave é idempotente: quando o banco
 * ampliar a whitelist, o passo do cliente vira no-op sozinho.
 */
const SERVER_SORT_KEYS = new Set(['numero_nfse', 'valor_servico', 'status', 'created_at']);

/** Linha + a data derivada usada na ordenação da coluna "Data". */
type NfseSortableRow = NfseListRow & { sort_date: string | null };

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Estreita o texto do banco pro enum da situação do ISSQN (default '1'). */
function toTribIssqn(value: string | null | undefined): TribIssqn {
  return value === '2' || value === '3' || value === '4' ? value : '1';
}

/**
 * Estreita o texto do banco pro enum de retenção do ISS.
 * Default '1' = NÃO retido (tabela do layout nacional).
 */
function toTpRetIssqn(value: string | null | undefined): TpRetIssqn {
  return value === '2' || value === '3' ? value : '1';
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface NfseListTabProps {
  canEmit: boolean;
  /** Recorte de período escolhido no header (data-pura YYYY-MM-DD ou null). */
  dateStart?: string | null;
  dateEnd?: string | null;
}

/**
 * Aba de listagem de NFS-e.
 * - Desktop: tabela ordenável com linha expansível (detalhe completo da nota).
 * - Mobile: cards com menu ⋮.
 * - Filtros server-side via RPC `get_nfse_emissions_paged`.
 * - Suporte a rascunho: Continuar preenchendo / Emitir / Excluir.
 */
export function NfseListTab({ canEmit, dateStart, dateEnd }: NfseListTabProps) {
  const isMobile = useIsMobile();
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const tList = t.list;
  const tDetails = t.details;

  const { rows, totalCount, loading, fetch, refetch } = useNfseEmissionsPaged();

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

  // ─── Ordenação ────────────────────────────────────────────────────────────

  /**
   * `sort_date` é a data EXIBIDA (competência, com queda pro `created_at`)
   * reduzida a YYYY-MM-DD. Ordenar pela coluna crua `data_competencia` não
   * funcionava: ela é nula na maioria das notas, então a coluna Data mostrava
   * uma data e a ordenação usava outra (ou nenhuma).
   */
  const sortableRows = useMemo<NfseSortableRow[]>(
    () => rows.map((r) => ({ ...r, sort_date: nfseDisplayDate(r)?.slice(0, 10) ?? null })),
    [rows],
  );
  const { sortedItems, sortConfig, handleSort } = useTableSort<NfseSortableRow>(
    sortableRows,
    'created_at',
    'desc',
  );
  const sortKey = sortConfig.key && sortConfig.direction ? sortConfig.key : 'created_at';
  const sortDir = sortConfig.direction ?? 'desc';
  const visibleRows = sortedItems;

  // Debounce de busca ~350 ms.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset p/ página 1 quando filtros mudam.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, itemsPerPage, dateStart, dateEnd]);

  // Fetch server-side.
  useEffect(() => {
    fetch({
      statuses: statusFilter.length ? statusFilter : undefined,
      search: debouncedSearch || undefined,
      dateStart: dateStart ?? null,
      dateEnd: dateEnd ?? null,
      sortKey: SERVER_SORT_KEYS.has(sortKey) ? sortKey : 'created_at',
      sortDir,
      page: currentPage,
      pageSize: itemsPerPage === 'all' ? ALL_PAGE_SIZE : itemsPerPage,
    });
  }, [
    fetch,
    debouncedSearch,
    statusFilter,
    currentPage,
    itemsPerPage,
    dateStart,
    dateEnd,
    sortKey,
    sortDir,
  ]);

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

  // ─── Linha expansível ─────────────────────────────────────────────────────

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Rascunho: "Continuar preenchendo" ────────────────────────────────────

  const [draftToOpen, setDraftToOpen] = useState<string | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [draftInitial, setDraftInitial] = useState<NfseInitialDraft | undefined>(undefined);

  const { emission: draftEmission, isLoading: loadingDraft } = useNfseEmission(draftToOpen);

  useEffect(() => {
    if (!draftToOpen || loadingDraft) return;
    if (!draftEmission) return;
    // Converte a linha completa no shape NfseInitialDraft. Sem `as any`: as
    // colunas abaixo existem no schema — o cast só mascarava nome errado.
    const draft: NfseInitialDraft = {
      id: draftEmission.id,
      customerId: draftEmission.customer_id ?? null,
      intermediarioCustomerId: draftEmission.intermediario_customer_id ?? null,
      dataCompetencia: draftEmission.data_competencia ?? null,
      regimeApuracao: draftEmission.regime_apuracao ?? null,
      servico: {
        // Seletor de serviço: guarda a ESCOLHA, não só os códigos. Vazio quando
        // o serviço foi apagado depois (a coluna vira nulo) — nesse caso os
        // códigos continuam na nota e ela segue emitível, só o seletor abre em
        // branco.
        serviceTypeId: draftEmission.service_type_id ?? '',
        codigoServico: draftEmission.codigo_servico ?? '',
        // cTribMun salvo na própria nota (override do herdado do tipo de serviço).
        codigoTributacaoMunicipal: draftEmission.codigo_tributacao_municipal ?? '',
        codigoNbs: draftEmission.codigo_nbs ?? '',
        municipioIncidenciaIbge: draftEmission.municipio_incidencia_ibge ?? '',
        // O nome do município não é persistido (não existe coluna): a etapa
        // Serviço trabalha só com o código IBGE e o resumo cai nele.
        tribIssqn: toTribIssqn(draftEmission.trib_issqn),
        discriminacao: draftEmission.descricao_servico ?? '',
      },
      valores: {
        valorServico: draftEmission.valor_servico ?? 0,
        aliquotaIssqn: draftEmission.aliquota_issqn ?? 0,
        tpRetIssqn: toTpRetIssqn(draftEmission.tp_ret_issqn),
        valorPis: draftEmission.valor_pis ?? 0,
        valorCofins: draftEmission.valor_cofins ?? 0,
        valorCsll: draftEmission.valor_csll ?? 0,
        percentualTribSn: draftEmission.percentual_trib_sn ?? 0,
      },
    };
    setDraftInitial(draft);
    setDraftToOpen(null);
    setNovaOpen(true);
  }, [draftToOpen, draftEmission, loadingDraft]);

  const handleContinueDraft = (row: NfseListRow) => {
    setDraftToOpen(row.id);
  };

  // ─── Ação: Emitir rascunho ────────────────────────────────────────────────

  const handleEmitDraft = async (row: NfseListRow) => {
    if (!canEmit) {
      toast.error(tList.toastNoEmitPermission);
      return;
    }
    const tid = toast.loading(tList.toastEmitting);
    try {
      const result = await invokeNfse('nfse-emit', { emissionId: row.id });
      toast.dismiss(tid);
      if (!result.ok) {
        toast.error(result.message ?? tList.toastEmitError);
        return;
      }
      toast.success(tList.toastEmitSuccess);
      refetch();
    } catch {
      toast.dismiss(tid);
      toast.error(tList.toastEmitError);
    }
  };

  // ─── Ação: Excluir rascunho ───────────────────────────────────────────────

  const handleDeleteDraft = async (row: NfseListRow) => {
    const tid = toast.loading(tList.toastDeletingDraft);
    try {
      const result = await invokeNfse('nfse-delete-draft', { id: row.id });
      toast.dismiss(tid);
      if (!result.ok) {
        toast.error(result.message ?? tList.toastDeleteDraftError);
        return;
      }
      toast.success(tList.toastDeleteDraftSuccess);
      refetch();
    } catch {
      toast.dismiss(tid);
      toast.error(tList.toastDeleteDraftError);
    }
  };

  // ─── Ação: Atualizar status ───────────────────────────────────────────────

  const { refreshStatus } = useNfse();

  const handleRefreshStatus = async (row: NfseListRow) => {
    const tid = toast.loading(tList.toastCheckingStatus);
    try {
      await refreshStatus(row.id);
      toast.dismiss(tid);
      toast.success(tList.toastStatusUpdated);
      refetch();
    } catch {
      toast.dismiss(tid);
      toast.error(tList.toastStatusError);
    }
  };

  // ─── Ação: Download PDF ───────────────────────────────────────────────────

  /**
   * Baixa o DANFSE (PDF) da nota.
   *
   * O motor próprio não guarda o PDF numa URL (o documento é gerado sob demanda
   * pela rota `nfse-danfse`), então pedimos o PDF e entregamos o ARQUIVO — que é
   * o que o usuário quer fazer com uma nota fiscal: mandar pro cliente. Abrir
   * documento em aba nova é anti-padrão da casa.
   */
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const handleDownloadPdf = async (row: NfseListRow) => {
    setPdfLoadingId(row.id);
    const tid = toast.loading(tList.pdfLoading);
    try {
      const res = await invokeNfse<{ pdfBase64?: string | null; pdfUrl?: string | null; nomeArquivo?: string }>(
        'nfse-danfse',
        { emissionId: row.id },
      );
      toast.dismiss(tid);
      if (!res.ok || (!res.data?.pdfBase64 && !res.data?.pdfUrl)) {
        toast.error(res.message ?? tList.pdfError);
        return;
      }
      const nome = res.data.nomeArquivo || `NFSe-${row.numero_nfse ?? row.id.slice(0, 8)}.pdf`;
      const href = res.data.pdfBase64
        ? URL.createObjectURL(
            new Blob(
              [Uint8Array.from(atob(res.data.pdfBase64), (c) => c.charCodeAt(0))],
              { type: 'application/pdf' },
            ),
          )
        : res.data.pdfUrl!;
      const a = document.createElement('a');
      a.href = href;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Só revoga o que nós criamos, e depois do clique (revogar antes cancela
      // o download em alguns navegadores).
      if (res.data.pdfBase64) setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch {
      toast.dismiss(tid);
      toast.error(tList.pdfError);
    } finally {
      setPdfLoadingId(null);
    }
  };

  // ─── Ação: Download XML ───────────────────────────────────────────────────

  const handleDownloadXml = (row: NfseListRow) => {
    if (!row.xml_url) {
      toast.error(tList.xmlUnavailable);
      return;
    }
    // Documento fiscal se BAIXA, não se abre em aba nova.
    const a = document.createElement('a');
    a.href = row.xml_url;
    a.download = `NFSe-${row.numero_nfse ?? row.id.slice(0, 8)}.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ─── Detalhe (NfseDetailModal) ─────────────────────────────────────────────

  const [detailEmission, setDetailEmission] = useState<ReturnType<typeof nfseRowToEmission> | null>(
    null,
  );
  const [detailAction, setDetailAction] = useState<NfseDetailAction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const openDetail = (row: NfseListRow, action: NfseDetailAction | null = null) => {
    setDetailEmission(nfseRowToEmission(row));
    setDetailAction(action);
    setDetailOpen(true);
  };

  // ─── Menu de ações por linha ──────────────────────────────────────────────

  /** Itens do menu — compartilhados pelo menu de hover (desktop) e de clique (mobile). */
  const rowActionItems = (row: NfseListRow) => {
    const isDraft = row.status === 'rascunho';
    const isRejected = row.status === 'rejeitada' || row.status === 'falhou';
    const isAuthorized = row.status === 'autorizada';
    const isPending = row.status === 'pendente' || row.status === 'processando';
    const isCancelled = row.status === 'cancelada';
    // Cancelamento pedido e ainda em andamento: a nota segue mudando de estado,
    // então precisa continuar consultável até virar "Cancelada".
    const isCancelPending = row.status === 'cancelamento_pendente';

    const canViewDetail = !isDraft;
    const canContinueDraft = isDraft;
    // Emitir/Reenviar depende de a empresa estar apta (município liberado +
    // registro + certificado — ver isFiscalReadyToEmit).
    const canEmitRow = (isDraft || isRejected) && canEmit;
    const canCheckStatus = isPending || isCancelPending;
    // O documento existe e vale enquanto o cancelamento não é efetivado.
    // O DANFSE é gerado sob demanda pela rota `nfse-danfse` — NÃO depende de
    // `pdf_url` (que o motor próprio nunca preenche). Cancelada também tem
    // direito ao documento: ele existiu, tem número e chave.
    const canDownloadPdf = isAuthorized || isCancelPending || isCancelled;
    const canDownloadXml = (isAuthorized || isCancelPending || isCancelled) && !!row.xml_url;
    const canHistory = !isDraft;
    const canCancelRow = canEmit && (isAuthorized || isPending);
    // Excluir o próprio rascunho NÃO exige habilitação de emissão.
    const canDeleteDraft = isDraft;

    return (
      <>
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
            disabled={pdfLoadingId === row.id}
            className="gap-2 focus:bg-primary focus:text-primary-foreground"
          >
            {pdfLoadingId === row.id
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileDown className="h-4 w-4" />}
            {t.actions.downloadPdf}
          </DropdownMenuItem>
        )}
        {canDownloadXml && (
          <DropdownMenuItem
            onClick={() => handleDownloadXml(row)}
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
              // NUNCA cancelar direto daqui. Cancelamento de NFS-e é
              // irreversível, tem efeito na prefeitura e exige motivo de 15 a
              // 255 caracteres por exigência do layout nacional. Abrimos o
              // detalhe em modo cancelamento, que já tem a confirmação e o
              // campo de motivo.
              onClick={() => openDetail(row, 'cancel')}
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
      </>
    );
  };

  // ─── Filtro de status ─────────────────────────────────────────────────────

  const statusFilterOptions = STATUS_FILTER_OPTIONS_EXTENDED.map((o) => ({
    value: o.value,
    label: (t.status as Record<string, string>)[o.value] ?? o.value,
  }));

  const toggleStatus = (value: string) => {
    setStatusFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  /** Dropdown "Status ⌄" em linha própria — o caminho curto do filtro mais usado. */
  const statusInlineFilter = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9">
          {t.filters.status}
          {statusFilter.length > 0 && (
            <Badge className="h-5 min-w-5 px-1.5 text-[10px] bg-primary text-primary-foreground border-transparent hover:bg-primary">
              {statusFilter.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {statusFilter.length === 0 ? t.filters.allLabel : t.filters.status}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {statusFilterOptions.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={statusFilter.includes(o.value)}
            onCheckedChange={() => toggleStatus(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {statusFilter.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setStatusFilter([])}
              className="gap-2 focus:bg-primary focus:text-primary-foreground"
            >
              {t.actions.clear}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

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

  // ─── Formatação de célula ─────────────────────────────────────────────────

  const fmtDate = (value: string | null | undefined) =>
    value ? formatDate(value, locale, timezone) : null;

  /**
   * "set/2026" — mês da nota, no lugar da série (NFS-e nacional não tem série).
   *
   * Sai da MESMA data exibida na coluna Data (competência, com queda pro
   * `created_at`): usar só a competência crua deixava a coluna serrilhada, com
   * o mês aparecendo em uma linha e sumindo na seguinte.
   */
  const fmtCompetenceShort = (value: string | null | undefined) => {
    if (!value) return null;
    const month = formatDate(value, locale, timezone, {
      day: undefined,
      year: undefined,
      month: 'short',
    }).replace(/\.$/, '');
    const year = formatDate(value, locale, timezone, {
      day: undefined,
      month: undefined,
      year: 'numeric',
    });
    return `${month}/${year}`;
  };

  const fmtMoney = (value: number | null | undefined) =>
    value == null ? null : formatMoney(value, currency, locale);

  const fmtPercent = (value: number | null | undefined) =>
    value == null || value === 0
      ? null
      : `${formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  /** Quem recolhe o ISS, em português de gente (tabela do layout nacional). */
  const issWithholdingLabel = (value: string | null | undefined) => {
    const ret = t.stepper.valores.tpRetIssqn;
    switch (toTpRetIssqn(value)) {
      case '2':
        return ret.op2;
      case '3':
        return ret.op3;
      default:
        return ret.op1;
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const isEmpty = !loading && rows.length === 0;

  /**
   * Par "rótulo: valor" curto, dentro da grade de 2 colunas do detalhe.
   * Campo vazio não é renderizado (nada de linha com "—" pra tudo).
   */
  const DetailField = ({ label, value }: { label: string; value: React.ReactNode }) => {
    if (value == null || value === '') return null;
    return (
      <>
        <span className="text-muted-foreground">{label}:</span>
        <span className="font-medium break-words">{value}</span>
      </>
    );
  };

  /**
   * Campo LONGO (descrição, chave de acesso, protocolo) — fica FORA da grade,
   * com o rótulo em cima e o valor embaixo. Dentro da grade de 4 colunas, um
   * valor comprido empurrava o rótulo seguinte pra outra linha e o bloco virava
   * um quebra-cabeça.
   */
  const DetailLongField = ({
    label,
    value,
    mono,
  }: {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
  }) => {
    if (value == null || value === '') return null;
    return (
      <div className="mt-2 text-sm">
        <span className="text-muted-foreground">{label}:</span>{' '}
        <span className={cn('font-medium', mono && 'font-mono text-xs break-all')}>{value}</span>
      </div>
    );
  };

  const renderExpandedRow = (row: NfseListRow) => {
    const hasFederalTaxes =
      (row.valor_pis ?? 0) > 0 || (row.valor_cofins ?? 0) > 0 || (row.valor_csll ?? 0) > 0;

    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={9} className="p-0">
          <div className="px-6 py-4 bg-background border-t">
            <div className="space-y-4">
              {/* Bloco 1 — TOMADOR */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                  {tDetails.blockCustomer}
                </div>
                <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  <DetailField label={tDetails.name} value={row.customer_name} />
                  <DetailField
                    label={tDetails.document}
                    value={row.customer_document ? cpfCnpjMask(row.customer_document) : null}
                  />
                </div>
              </div>

              {/* Bloco 2 — IDENTIFICAÇÃO */}
              <div className="border-t border-border/40 pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                  {tDetails.blockIdentification}
                </div>
                <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  <DetailField label={tDetails.competence} value={fmtDate(row.data_competencia)} />
                  <DetailField label={tDetails.serviceCode} value={row.codigo_servico} />
                  <DetailField
                    label={tDetails.municipalCode}
                    value={row.codigo_tributacao_municipal}
                  />
                  <DetailField label={tDetails.nbs} value={row.codigo_nbs} />
                  <DetailField label={tDetails.issuedBy} value={row.created_by_name} />
                </div>
                <DetailLongField label={tDetails.description} value={row.descricao_servico} />
                <DetailLongField label={tDetails.accessKey} value={row.chave_acesso} mono />
                <DetailLongField label={tDetails.protocol} value={row.protocolo} mono />
              </div>

              {/* Bloco 3 — VALORES */}
              <div className="border-t border-border/40 pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                  {tDetails.blockValues}
                </div>
                <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  <DetailField label={tDetails.serviceValue} value={fmtMoney(row.valor_servico)} />
                  <DetailField label={tDetails.issRate} value={fmtPercent(row.aliquota_issqn)} />
                  <DetailField label={tDetails.iss} value={fmtMoney(row.valor_iss)} />
                  <DetailField
                    label={tDetails.issWithholding}
                    value={issWithholdingLabel(row.tp_ret_issqn)}
                  />
                  {hasFederalTaxes && (
                    <>
                      <DetailField label={tDetails.pis} value={fmtMoney(row.valor_pis)} />
                      <DetailField label={tDetails.cofins} value={fmtMoney(row.valor_cofins)} />
                      <DetailField label={tDetails.csll} value={fmtMoney(row.valor_csll)} />
                    </>
                  )}
                  <DetailField
                    label={tDetails.simplesPercent}
                    value={fmtPercent(row.percentual_trib_sn)}
                  />
                </div>
              </div>

              {/* Bloco 4 — OCORRÊNCIA (só quando a prefeitura recusou) */}
              {row.error_message && (
                <div className="border-t border-border/40 pt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                    {tDetails.blockIssue}
                  </div>
                  <p className="text-sm text-destructive">{row.error_message}</p>
                </div>
              )}
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4 min-w-0 w-full">
      {/* Barra de busca + filtros + botão Nova Nota */}
      <div className="flex flex-col gap-3">
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
          {/* "Nova Nota" saiu daqui: a ação principal virou FAB no nível da
              página, e dois botões idênticos na mesma tela só dividiam a
              atenção. O gate de emissão continua valendo dentro do modal. */}
          {filterButton}
        </div>
        {/* Filtro mais usado em linha própria — sem precisar abrir o painel. */}
        <div className="flex flex-wrap items-center gap-2">{statusInlineFilter}</div>
      </div>

      {/* Lista */}
      {loading ? (
        // Girador SEM texto deixa o usuário no escuro por alguns segundos e a
        // tela parece vazia/quebrada. O rótulo também dá acessibilidade — um
        // ícone animado sozinho não é anunciado por leitor de tela.
        <div
          className="flex flex-col items-center justify-center gap-3 py-16"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{tList.loading}</p>
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
          {visibleRows.map((row) => (
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
                  {/* Sem número não quer dizer rascunho: nota REJEITADA também
                      fica sem numeração. Aqui só mostramos o número quando ele
                      existe — a situação da nota está no selo logo abaixo. */}
                  {row.numero_nfse && (
                    <>
                      <span className="font-medium">{tList.notePrefix} {row.numero_nfse}</span>
                      <span className="text-muted-foreground/50">·</span>
                    </>
                  )}
                  {nfseDisplayDate(row) && <span>{fmtDate(nfseDisplayDate(row))}</span>}
                </div>
                {row.descricao_servico && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {row.descricao_servico}
                  </p>
                )}
                <div className="mt-1">
                  <NfseStatusBadge status={row.status} />
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {row.valor_servico != null && (
                  <p className="font-bold text-sm whitespace-nowrap text-primary">
                    {fmtMoney(row.valor_servico)}
                  </p>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 -mr-2 text-muted-foreground shrink-0"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-52"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rowActionItems(row)}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── Desktop: tabela ─── */
        // Rolagem horizontal em vez de `overflow-hidden`: com 9 colunas, cortar
        // a coluna de Ações some com o menu da linha em telas menores.
        <div className="rounded-lg border overflow-x-auto">
          <Table className="table-fixed [&_th]:px-2 [&_td]:px-2">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-9" />
                <TableHead className="w-10">
                  <span className="sr-only">{t.columns.author}</span>
                </TableHead>
                <SortableTableHead
                  sortKey="numero_nfse"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  className="w-[92px] text-center"
                >
                  {t.columns.number}
                </SortableTableHead>
                <SortableTableHead
                  sortKey="sort_date"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  className="w-[100px] whitespace-nowrap"
                >
                  {t.columns.date}
                </SortableTableHead>
                <SortableTableHead
                  sortKey="customer_name"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  className="w-[180px]"
                >
                  {t.columns.customer}
                </SortableTableHead>
                <TableHead className="text-xs uppercase tracking-wider">
                  {t.columns.service}
                </TableHead>
                <SortableTableHead
                  sortKey="valor_servico"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  className="w-[104px] whitespace-nowrap text-right"
                >
                  {t.columns.value}
                </SortableTableHead>
                <SortableTableHead
                  sortKey="status"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  className="w-[128px] text-center"
                >
                  {t.columns.status}
                </SortableTableHead>
                <TableHead className="w-[56px] text-center text-xs uppercase tracking-wider">
                  {t.columns.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const isExpanded = expandedRows.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className={cn(
                        'cursor-pointer hover:bg-muted/30',
                        isExpanded && 'bg-muted/80 dark:bg-muted/40',
                      )}
                      onClick={() => toggleExpand(row.id)}
                    >
                      <TableCell className="w-9">
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </TableCell>
                      <TableCell className="w-10">
                        {/* Autoria só existe a partir de 2026-09-03: nota antiga
                            fica com a célula VAZIA — boneco genérico só polui. */}
                        {row.created_by_name && (
                          <UserAvatarTooltip
                            name={row.created_by_name}
                            avatarUrl={row.created_by_avatar_url}
                            roleLabel={t.details.issuedBy}
                            size={26}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-center">
                        {row.numero_nfse ? `#${row.numero_nfse}` : '—'}
                        {/* NFS-e nacional não tem série: no lugar dela, o mês da nota. */}
                        {fmtCompetenceShort(nfseDisplayDate(row)) && (
                          <div className="text-xs text-muted-foreground font-normal">
                            {fmtCompetenceShort(nfseDisplayDate(row))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fmtDate(nfseDisplayDate(row)) ?? '—'}
                      </TableCell>
                      <TableCell className="w-[180px]">
                        <span className="block truncate">{row.customer_name || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="block truncate text-muted-foreground">
                          {row.descricao_servico || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        {fmtMoney(row.valor_servico) ?? '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <NfseStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <HoverDropdownMenu
                          align="end"
                          contentClassName="w-52"
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        >
                          {rowActionItems(row)}
                        </HoverDropdownMenu>
                      </TableCell>
                    </TableRow>
                    {isExpanded && renderExpandedRow(row)}
                  </Fragment>
                );
              })}
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
        onChanged={refetch}
      />
    </div>
  );
}

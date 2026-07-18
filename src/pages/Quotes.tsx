import { useState, useMemo } from 'react';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import {
  FileText, Plus, Search, Pencil, Trash2, Eye, CheckCircle2, XCircle,
  ExternalLink, DollarSign, ArrowRight, Settings2, TrendingUp,
  Wallet, BarChart3, FileEdit, Send, Clock, Boxes, Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsSidebarLayout } from '@/components/SettingsSidebarLayout';
import { useQuotes, STATUS_LABELS, type Quote } from '@/hooks/useQuotes';
import { useQuoteConversion } from '@/hooks/useQuoteConversion';
import { QuoteFormDialog } from '@/components/quotes/QuoteFormDialog';
import { QuoteViewDialog } from '@/components/quotes/QuoteViewDialog';
import { ReceivePaymentModal } from '@/components/financial/ReceivePaymentModal';
import { ProposalConfigDialog } from '@/components/quotes/ProposalConfigDialog';
import { PricingTab } from '@/components/pricing/PricingTab';
import { ServiceCostsTab } from '@/components/service-orders/ServiceCostsTab';
import { GlobalCostsTab } from '@/components/service-orders/GlobalCostsTab';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { FilterButton } from '@/components/ui/FilterButton';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { KPICard } from '@/components/dashboard/KPICard';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterCheckboxGroup, type FilterCheckboxOption } from '@/components/mobile/FilterCheckboxGroup';
import { buildProposalShareLink } from '@/utils/shareLinks';
import { useToast } from '@/hooks/use-toast';

// Tabs are built dynamically using i18n inside the Quotes component.
const ALL_SIDEBAR_TAB_KEYS = [
  { value: 'quotes', labelKey: 'tabQuotes' as const, icon: FileText },
  { value: 'service-costs', labelKey: 'tabServiceCosts' as const, icon: DollarSign },
  { value: 'global-costs', labelKey: 'tabGlobalCosts' as const, icon: Boxes, module: 'pricing_advanced' as const },
  { value: 'pricing', labelKey: 'tabPricing' as const, icon: Settings2, module: 'pricing_advanced' as const },
];

// Hex por status — usado no leading do MobileListItem.
const STATUS_HEX: Record<string, string> = {
  rascunho: '#94a3b8',     // slate-400
  enviado: '#0ea5e9',      // info
  aprovado: '#22c55e',     // success
  rejeitado: '#ef4444',    // destructive
  expirado: '#f59e0b',     // warning
  convertido: '#6366f1',   // primary-ish (indigo)
};

const STATUS_ICONS: Record<string, typeof FileText> = {
  rascunho: FileEdit,
  enviado: Send,
  aprovado: CheckCircle2,
  rejeitado: XCircle,
  expirado: Clock,
  convertido: ArrowRight,
};

// Indicador discreto de visualizações da proposta pública.
// view_count===0 => "Não visualizada" esmaecido. Senão: olho + nº + "visto há X"
// (tempo relativo PT-BR). last_viewed_at vem em UTC; date-fns calcula o delta
// contra o "agora" local (America/Sao_Paulo no aparelho), então o "há X" bate.
function QuoteViewsIndicator({ quote, className }: { quote: Quote; className?: string }) {
  const count = quote.view_count ?? 0;
  if (count === 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-[11px] text-muted-foreground/60', className)}>
        <Eye className="h-3 w-3" />
        Não visualizada
      </span>
    );
  }
  const rel = quote.last_viewed_at
    ? formatDistanceToNow(new Date(quote.last_viewed_at), { addSuffix: true, locale: ptBR })
    : null;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[11px] text-muted-foreground', className)}
      title={
        quote.last_viewed_at
          ? `Visualizada ${count}× · última vez ${format(new Date(quote.last_viewed_at), "dd/MM 'às' HH:mm", { locale: ptBR })}`
          : `Visualizada ${count}×`
      }
    >
      <Eye className="h-3 w-3" />
      {count}
      {rel && <span className="text-muted-foreground/70">· visto {rel}</span>}
    </span>
  );
}

function QuotesList() {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;
  const { hasModule } = useCompanyModules();
  const hasPricing = hasModule('pricing_advanced');
  const { quotes, isLoading, updateStatus, deleteQuote, kpis } = useQuotes();
  const { convertToServiceOrder, approveQuoteFinancial, isConverting, isApproving } = useQuoteConversion();
  const { toast } = useToast();

  // Gera o link público amigável da proposta e copia no ato (régua-lei: todo
  // fluxo que gera link já copia + toast "Link gerado e copiado!"). O token já
  // vem preenchido em toda quote (default server-side), então é só ler + montar.
  const copyProposalLink = async (q: Quote) => {
    const link = buildProposalShareLink({
      token: q.token,
      recipientName: q.customers?.name ?? q.prospect_name,
    });
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: tq.linkCopiedTitle, description: tq.linkCopiedDesc });
    } catch {
      // Fallback quando o navegador bloqueia clipboard (ex.: contexto não seguro):
      // mostra o link pra cópia manual.
      toast({
        title: tq.linkGeneratedTitle,
        description: link,
        variant: 'default',
      });
    }
  };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [approvingQuote, setApprovingQuote] = useState<Quote | null>(null);

  const filtered = useMemo(() => {
    let list = quotes;
    if (statusFilter.length > 0) list = list.filter((q) => statusFilter.includes(q.status));
    if (search) {
      list = list.filter(
        (q) =>
          fuzzyIncludes(q.customers?.name, search) ||
          fuzzyIncludes(q.prospect_name, search) ||
          fuzzyIncludes(String(q.quote_number), search)
      );
    }
    return list;
  }, [quotes, statusFilter, search]);

  const { sortedItems, sortConfig, handleSort } = useTableSort(filtered);
  const pagination = useDataPagination(sortedItems);

  // KPIs no padrão KPICard (mesmo visual da tela de Ordens de Serviço).
  // Valores monetários usam `formattedValue` formatado com moeda/locale da empresa.
  const fmtBRL = (v: number) =>
    formatMoney(Math.round(v), currency, locale);

  const kpiCards = useMemo(() => {
    const base: Array<{
      title: string;
      value: number;
      formattedValue?: string;
      icon: typeof FileText;
      bgClass: string;
      delay: number;
      onClick?: () => void;
    }> = [
      {
        title: tq.kpiOpen,
        value: kpis.totalOpen,
        formattedValue: fmtBRL(kpis.totalOpen),
        icon: Wallet,
        bgClass: 'bg-warning',
        delay: 0,
        onClick: () => setStatusFilter(['enviado']),
      },
      {
        title: tq.kpiConversion,
        value: kpis.conversionRate,
        formattedValue: `${kpis.conversionRate}%`,
        icon: TrendingUp,
        bgClass: 'bg-success',
        delay: 1,
        onClick: () => setStatusFilter(['aprovado']),
      },
      {
        title: tq.kpiAvgTicket,
        value: kpis.avgTicket,
        formattedValue: fmtBRL(kpis.avgTicket),
        icon: BarChart3,
        bgClass: 'bg-info',
        delay: 2,
      },
    ];

    return base;
  }, [kpis]);

  // Filtros ativos pro badge.
  const activeFilterCount = (search ? 1 : 0) + (statusFilter.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter([]);
  };

  // Opções pro FilterCheckboxGroup de status — usa STATUS_HEX como acento.
  const statusOptions: FilterCheckboxOption[] = useMemo(
    () =>
      Object.entries(STATUS_LABELS).map(([k, v]) => ({
        value: k,
        label: v,
        color: STATUS_HEX[k],
      })),
    []
  );

  // Conteúdo da Sheet de filtros (mobile only).
  const filterContent = (
    <div className="space-y-4">
      <FilterCheckboxGroup
        label={tq.filterStatus}
        options={statusOptions}
        selected={statusFilter}
        onChange={setStatusFilter}
        emptyLabel={tq.filterAll}
      />
      <div className="pt-2 border-t">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          {tq.filterConfig}
        </label>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setConfigOpen(true)}
          type="button"
        >
          <Settings2 className="h-4 w-4" />
          {tq.configureProposal}
        </Button>
      </div>
    </div>
  );

  // Filtros desktop — busca inline + FilterButton (Onda UI-2).
  const desktopFilters = (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={tq.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <FilterButton
        activeCount={statusFilter.length > 0 ? 1 : 0}
        onClear={() => setStatusFilter([])}
      >
        <FilterCheckboxGroup
          label={tq.filterStatus}
          options={statusOptions}
          selected={statusFilter}
          onChange={setStatusFilter}
          emptyLabel={tq.filterAll}
        />
      </FilterButton>
    </div>
  );

  // Helper: ações do MobileListItem por quote, respeitando status.
  const buildItemActions = (q: Quote): ItemAction[] => {
    const actions: ItemAction[] = [
      {
        key: 'view',
        label: tq.actionViewMobile,
        icon: <Eye className="h-4 w-4" />,
        onClick: () => setViewQuote(q),
      },
      {
        key: 'open-public',
        label: tq.actionOpenProposalMobile,
        icon: <ExternalLink className="h-4 w-4" />,
        // ?preview=1 => visualização do próprio dono não infla o contador de views.
        onClick: () => window.open(`${window.location.origin}/proposta/${q.token}?preview=1`, '_blank'),
      },
      {
        key: 'copy-link',
        label: tq.actionCopyLinkMobile,
        icon: <Link2 className="h-4 w-4" />,
        onClick: () => copyProposalLink(q),
      },
    ];

    if (q.status === 'enviado' || q.status === 'rascunho') {
      actions.push({
        key: 'approve',
        label: tq.actionApprove,
        icon: <CheckCircle2 className="h-4 w-4" />,
        onClick: () => setApprovingQuote(q),
      });
    }

    if (q.status === 'enviado') {
      actions.push({
        key: 'reject',
        label: tq.actionReject,
        icon: <XCircle className="h-4 w-4" />,
        onClick: () => updateStatus.mutate({ id: q.id, status: 'rejeitado' }),
      });
    }

    if (q.status === 'aprovado' && !q.converted_to_os_id) {
      actions.push({
        key: 'convert',
        label: tq.actionConvertOS,
        icon: <ArrowRight className="h-4 w-4" />,
        onClick: () => convertToServiceOrder.mutate(q),
      });
    }

    actions.push(
      {
        key: 'edit',
        label: tq.actionEdit,
        icon: <Pencil className="h-4 w-4" />,
        variant: 'edit',
        onClick: () => { setEditQuote(q); setFormOpen(true); },
      },
      {
        key: 'delete',
        label: tq.actionDelete,
        icon: <Trash2 className="h-4 w-4" />,
        variant: 'destructive',
        onClick: () => setDeleteId(q.id),
      },
    );

    return actions;
  };

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24 space-y-4')}>
      {/* Mobile: busca sempre visível + botão filtros. Desktop: actions bar + filtros inline. */}
      {isMobile ? (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tq.searchPlaceholderMobile}
                className="pl-10 h-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterSheet
              triggerLabel="Filtros"
              activeCount={activeFilterCount}
              onClear={clearFilters}
            >
              {filterContent}
            </FilterSheet>
          </div>

          <div className="relative -mx-3">
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-background to-transparent" />
            <div className="flex gap-3 overflow-x-auto px-3 pb-1 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {isLoading
                ? [0, 1, 2].map((i) => (
                    <div key={i} className="snap-start shrink-0 w-[78%]">
                      <Skeleton className="h-[108px] w-full rounded-2xl" />
                    </div>
                  ))
                : kpiCards.map((card) => (
                    <div key={card.title} className="snap-start shrink-0 w-[78%]">
                      <KPICard {...card} />
                    </div>
                  ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                {tq.configureProposal}
              </Button>
              <Button size="sm" onClick={() => { setEditQuote(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                {tq.newQuote}
              </Button>
            </div>
          </div>

          {/* KPIs desktop — padrão KPICard (mesmo da tela de Ordens de Serviço) */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            {isLoading
              ? [0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-[108px] w-full rounded-2xl" />
                ))
              : kpiCards.map((card) => (
                  <KPICard key={card.title} {...card} />
                ))}
          </div>

          {/* Filters desktop */}
          {desktopFilters}
        </>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className={isMobile ? 'h-16 w-full' : 'h-14 w-full'} />)}
        </div>
      ) : filtered.length === 0 ? (
        isMobile ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title={search || statusFilter.length > 0 ? tq.emptyTitleFiltered : tq.emptyTitle}
            description={search || statusFilter.length > 0 ? tq.emptyDescFilteredMobile : tq.emptyMobileDesc}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<FileText className="h-12 w-12" />}
                title={search || statusFilter.length > 0 ? tq.emptyTitleFiltered : tq.emptyTitle}
                description={
                  search || statusFilter.length > 0
                    ? tq.emptyDescFiltered
                    : tq.emptyDesc
                }
                action={
                  search || statusFilter.length > 0
                    ? undefined
                    : { label: tq.emptyActionLabel, onClick: () => { setEditQuote(null); setFormOpen(true); } }
                }
              />
            </CardContent>
          </Card>
        )
      ) : isMobile ? (
        <>
          <div className="rounded-xl border bg-card overflow-hidden">
            {pagination.paginatedItems.map((q) => {
              const StatusIcon = STATUS_ICONS[q.status] ?? FileText;
              const statusHex = STATUS_HEX[q.status] ?? '#64748b';
              const price = Number(q.final_price ?? q.total_value ?? 0);

              return (
                <MobileListItem
                  key={q.id}
                  onClick={() => setViewQuote(q)}
                  actions={buildItemActions(q)}
                  leading={
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: statusHex }}
                    >
                      <StatusIcon className="h-5 w-5" />
                    </div>
                  }
                  title={
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">#{q.quote_number}</span>
                      <span className="truncate">{q.customers?.name ?? q.prospect_name ?? '—'}</span>
                    </div>
                  }
                  subtitle={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {formatMoney(price, currency, locale)}
                      </span>
                      <span>•</span>
                      <span>{format(new Date(q.created_at), 'dd/MM/yy', { locale: ptBR })}</span>
                      <span>•</span>
                      <QuoteViewsIndicator quote={q} />
                    </div>
                  }
                  trailing={
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 whitespace-nowrap text-white border-0"
                      style={{ backgroundColor: statusHex }}
                    >
                      {STATUS_LABELS[q.status] ?? q.status}
                    </Badge>
                  }
                />
              );
            })}
          </div>
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
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="quote_number" sortConfig={sortConfig} onSort={handleSort}>{tq.colNumber}</SortableTableHead>
                <SortableTableHead sortKey="customers.name" sortConfig={sortConfig} onSort={handleSort}>{tq.colCustomer}</SortableTableHead>
                <SortableTableHead sortKey="created_at" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">{tq.colDate}</SortableTableHead>
                {hasPricing && <SortableTableHead sortKey="total_cost" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">{tq.colCost}</SortableTableHead>}
                <SortableTableHead sortKey="final_price" sortConfig={sortConfig} onSort={handleSort}>{tq.colValue}</SortableTableHead>
                {hasPricing && <TableHead className="hidden lg:table-cell">{tq.colMargin}</TableHead>}
                <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>{tq.colStatus}</SortableTableHead>
                <TableHead className="text-right">{tq.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedItems.map((q) => {
                const cost = Number(q.total_cost ?? 0);
                const price = Number(q.final_price ?? q.total_value ?? 0);
                const margin = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 100) : null;
                return (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">#{q.quote_number}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>
                        {q.customers?.name ?? q.prospect_name ?? '—'}
                        {!q.customer_id && q.prospect_name && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">{tq.prospectSuffix}</span>
                        )}
                      </span>
                      <QuoteViewsIndicator quote={q} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                    {format(new Date(q.created_at), 'dd/MM/yy', { locale: ptBR })}
                  </TableCell>
                  {hasPricing && (
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                      {cost > 0 ? formatMoney(cost, currency, locale) : '—'}
                    </TableCell>
                  )}
                  <TableCell className="font-semibold">
                    {formatMoney(price, currency, locale)}
                  </TableCell>
                  {hasPricing && (
                    <TableCell className="hidden lg:table-cell">
                      {margin !== null ? (
                        <Badge variant={margin >= 20 ? 'success' : margin >= 0 ? 'warning' : 'destructive'} className="text-[10px]">
                          {margin}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    {/* Selo de status saturado + texto branco (mesma régua do mobile). */}
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 whitespace-nowrap text-white border-0"
                      style={{ backgroundColor: STATUS_HEX[q.status] ?? '#64748b' }}
                    >
                      {STATUS_LABELS[q.status] ?? q.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {q.financial_transaction_id && (
                        <Badge variant="outline" className="h-7 gap-1 text-success border-success/40" title="Lançamento financeiro gerado">
                          <DollarSign className="h-3 w-3" /> {tq.received}
                        </Badge>
                      )}
                      <RowActionsMenu
                        actions={[
                          { label: tq.actionView, icon: Eye, onClick: () => setViewQuote(q) },
                          { label: tq.actionOpenProposal, icon: ExternalLink, onClick: () => window.open(`${window.location.origin}/proposta/${q.token}?preview=1`, '_blank') },
                          { label: tq.actionCopyLink, icon: Link2, onClick: () => copyProposalLink(q) },
                          {
                            label: tq.actionApprove,
                            icon: CheckCircle2,
                            onClick: () => setApprovingQuote(q),
                            hidden: q.status !== 'enviado' && q.status !== 'rascunho',
                          },
                          {
                            label: tq.actionReject,
                            icon: XCircle,
                            onClick: () => updateStatus.mutate({ id: q.id, status: 'rejeitado' }),
                            hidden: q.status !== 'enviado',
                          },
                          {
                            label: tq.actionConvertOS,
                            icon: ArrowRight,
                            onClick: () => convertToServiceOrder.mutate(q),
                            disabled: isConverting,
                            hidden: !(q.status === 'aprovado' && !q.converted_to_os_id),
                          },
                          {
                            label: tq.actionEdit,
                            icon: Pencil,
                            variant: 'edit',
                            onClick: () => { setEditQuote(q); setFormOpen(true); },
                          },
                          {
                            label: tq.actionDelete,
                            icon: Trash2,
                            variant: 'delete',
                            onClick: () => setDeleteId(q.id),
                          },
                        ]}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
        </Card>
      )}

      {/* FAB Novo Orçamento (mobile) */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={tq.newQuoteShort}
          onClick={() => { setEditQuote(null); setFormOpen(true); }}
        />
      )}

      {/* Modals */}
      <QuoteFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditQuote(null); }}
        quote={editQuote}
      />
      {viewQuote && (
        <QuoteViewDialog
          open={!!viewQuote}
          onOpenChange={(v) => { if (!v) setViewQuote(null); }}
          quote={viewQuote}
        />
      )}
      <ProposalConfigDialog open={configOpen} onOpenChange={setConfigOpen} />

      <ReceivePaymentModal
        open={!!approvingQuote}
        onOpenChange={(v) => { if (!v) setApprovingQuote(null); }}
        amount={Number(approvingQuote?.final_price ?? approvingQuote?.total_value ?? 0)}
        title={tq.approveTitle.replace('{number}', String(approvingQuote?.quote_number ?? ''))}
        description={tq.approveDesc}
        isSubmitting={isApproving}
        onConfirm={async (payment) => {
          if (!approvingQuote) return;
          await approveQuoteFinancial.mutateAsync({ quote: approvingQuote, payment });
          setApprovingQuote(null);
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tq.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tq.deleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tq.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteQuote.mutate(deleteId); setDeleteId(null); }}
            >
              {tq.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Quotes() {
  const [activeTab, setActiveTab] = useState('quotes');
  const { hasModule } = useCompanyModules();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const tq = MESSAGES[locale].app.crm.quotes;

  const sidebarTabs = ALL_SIDEBAR_TAB_KEYS
    .filter(t => !t.module || hasModule(t.module))
    .map(t => ({ value: t.value, label: tq[t.labelKey], icon: t.icon }));

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24')}>
      <MobilePageHeader
        title={tq.pageTitle}
        subtitle={tq.pageSubtitle}
        icon={FileText}
      />

      <SettingsSidebarLayout
        tabs={sidebarTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === 'quotes' && <QuotesList />}
        {activeTab === 'service-costs' && <ServiceCostsTab />}
        {activeTab === 'global-costs' && hasModule('pricing_advanced') && <GlobalCostsTab />}
        {activeTab === 'pricing' && hasModule('pricing_advanced') && <PricingTab />}
      </SettingsSidebarLayout>
    </div>
  );
}

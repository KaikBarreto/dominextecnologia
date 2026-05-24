import { useState, useMemo } from 'react';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  FileText, Plus, Search, Pencil, Trash2, Eye, CheckCircle2, XCircle,
  ExternalLink, DollarSign, ArrowRight, Settings2, TrendingUp, Calculator,
  Wallet, BarChart3, Hash, FileEdit, Send, Clock, Boxes,
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
import { useQuotes, STATUS_LABELS, STATUS_COLORS, type Quote } from '@/hooks/useQuotes';
import { useQuoteConversion } from '@/hooks/useQuoteConversion';
import { QuoteFormDialog } from '@/components/quotes/QuoteFormDialog';
import { QuoteViewDialog } from '@/components/quotes/QuoteViewDialog';
import { ReceivePaymentModal } from '@/components/financial/ReceivePaymentModal';
import { ProposalConfigDialog } from '@/components/quotes/ProposalConfigDialog';
import { PricingTab } from '@/components/pricing/PricingTab';
import { ServiceCostsTab } from '@/components/service-orders/ServiceCostsTab';
import { GlobalCostsTab } from '@/components/service-orders/GlobalCostsTab';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { FilterButton } from '@/components/ui/FilterButton';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterCheckboxGroup, type FilterCheckboxOption } from '@/components/mobile/FilterCheckboxGroup';

const ALL_SIDEBAR_TABS = [
  { value: 'quotes', label: 'Orçamentos', icon: FileText },
  { value: 'service-costs', label: 'Custos dos Serviços', icon: DollarSign },
  { value: 'global-costs', label: 'Custos Globais', icon: Boxes, module: 'pricing_advanced' as const },
  { value: 'pricing', label: 'Precificação', icon: Settings2, module: 'pricing_advanced' as const },
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

function QuotesList() {
  const isMobile = useIsMobile();
  const { hasModule } = useCompanyModules();
  const hasPricing = hasModule('pricing_advanced');
  const { quotes, isLoading, updateStatus, deleteQuote, kpis } = useQuotes();
  const { convertToServiceOrder, approveQuoteFinancial, isConverting, isApproving } = useQuoteConversion();
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

  // KPIs como chips do StatCarousel. StatCarousel renderiza `{item.count}` cru;
  // para valores monetários e percentuais, passamos string via cast — funciona
  // em runtime (JSX aceita string|number) sem precisar alterar o primitivo.
  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  const statItems: StatCarouselItem[] = useMemo(() => {
    const base: StatCarouselItem[] = [
      {
        key: 'totalOpen',
        label: 'Em Aberto',
        count: fmtBRL(kpis.totalOpen) as unknown as number,
        icon: <Wallet className="h-4 w-4" />,
        accentColor: '#0ea5e9',
      },
      {
        key: 'conversion',
        label: 'Conversão',
        count: `${kpis.conversionRate}%` as unknown as number,
        icon: <TrendingUp className="h-4 w-4" />,
        accentColor: '#22c55e',
      },
      {
        key: 'avgTicket',
        label: 'Ticket Médio',
        count: fmtBRL(kpis.avgTicket) as unknown as number,
        icon: <BarChart3 className="h-4 w-4" />,
        accentColor: '#6366f1',
      },
    ];

    if (hasPricing) {
      base.push(
        {
          key: 'margin',
          label: 'Margem Média',
          count: `${kpis.avgMarginPct}%` as unknown as number,
          icon: <TrendingUp className="h-4 w-4" />,
          accentColor: '#10b981',
        },
        {
          key: 'cost',
          label: 'Custo Total',
          count: fmtBRL(kpis.totalCostSum) as unknown as number,
          icon: <Calculator className="h-4 w-4" />,
          accentColor: '#f59e0b',
        },
      );
    }

    base.push({
      key: 'total',
      label: 'Total',
      count: kpis.total,
      icon: <Hash className="h-4 w-4" />,
      accentColor: '#475569',
    });

    return base;
  }, [kpis, hasPricing]);

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
        label="Status"
        options={statusOptions}
        selected={statusFilter}
        onChange={setStatusFilter}
        emptyLabel="Todos"
      />
      <div className="pt-2 border-t">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Configurações
        </label>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setConfigOpen(true)}
          type="button"
        >
          <Settings2 className="h-4 w-4" />
          Configurar Proposta
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
          placeholder="Buscar por cliente ou número..."
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
          label="Status"
          options={statusOptions}
          selected={statusFilter}
          onChange={setStatusFilter}
          emptyLabel="Todos"
        />
      </FilterButton>
    </div>
  );

  // Helper: ações do MobileListItem por quote, respeitando status.
  const buildItemActions = (q: Quote): ItemAction[] => {
    const actions: ItemAction[] = [
      {
        key: 'view',
        label: 'Visualizar',
        icon: <Eye className="h-4 w-4" />,
        onClick: () => setViewQuote(q),
      },
      {
        key: 'open-public',
        label: 'Abrir proposta',
        icon: <ExternalLink className="h-4 w-4" />,
        onClick: () => window.open(`${window.location.origin}/proposta/${q.token}`, '_blank'),
      },
    ];

    if (q.status === 'enviado' || q.status === 'rascunho') {
      actions.push({
        key: 'approve',
        label: 'Aprovar (registrar recebimento)',
        icon: <CheckCircle2 className="h-4 w-4" />,
        onClick: () => setApprovingQuote(q),
      });
    }

    if (q.status === 'enviado') {
      actions.push({
        key: 'reject',
        label: 'Rejeitar',
        icon: <XCircle className="h-4 w-4" />,
        onClick: () => updateStatus.mutate({ id: q.id, status: 'rejeitado' }),
      });
    }

    if (q.status === 'aprovado' && !q.converted_to_os_id) {
      actions.push({
        key: 'convert',
        label: 'Converter em OS',
        icon: <ArrowRight className="h-4 w-4" />,
        onClick: () => convertToServiceOrder.mutate(q),
      });
    }

    actions.push(
      {
        key: 'edit',
        label: 'Editar',
        icon: <Pencil className="h-4 w-4" />,
        variant: 'edit',
        onClick: () => { setEditQuote(q); setFormOpen(true); },
      },
      {
        key: 'delete',
        label: 'Excluir',
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
                placeholder="Buscar orçamento..."
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

          <StatCarousel items={statItems} loading={isLoading} />
        </>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-4">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                Configurar Proposta
              </Button>
              <Button size="sm" onClick={() => { setEditQuote(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Orçamento
              </Button>
            </div>
          </div>

          {/* KPIs desktop (preservado exatamente como antes) */}
          <div className={cn('grid gap-3', hasPricing ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 md:grid-cols-4')}>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Total em Aberto</p>
                <p className="text-sm sm:text-lg font-bold text-foreground truncate">
                  {kpis.totalOpen.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Taxa de Conversão</p>
                <p className="text-sm sm:text-lg font-bold text-foreground">{kpis.conversionRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Ticket Médio</p>
                <p className="text-sm sm:text-lg font-bold text-foreground truncate">
                  {kpis.avgTicket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </CardContent>
            </Card>
            {hasPricing && (
              <>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />Margem Média
                    </p>
                    <p className="text-sm sm:text-lg font-bold text-foreground">{kpis.avgMarginPct}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <p className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1">
                      <Calculator className="h-3 w-3" />Custo Total
                    </p>
                    <p className="text-sm sm:text-lg font-bold text-foreground truncate">
                      {kpis.totalCostSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
            <Card>
              <CardContent className="p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
                <p className="text-sm sm:text-lg font-bold text-foreground">{kpis.total}</p>
              </CardContent>
            </Card>
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
            title={search || statusFilter.length > 0 ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento cadastrado'}
            description={search || statusFilter.length > 0 ? 'Tente filtros diferentes' : 'Toque em "Novo Orçamento" para começar'}
          />
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum orçamento encontrado</p>
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
                        {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                      <span>•</span>
                      <span>{format(new Date(q.created_at), 'dd/MM/yy', { locale: ptBR })}</span>
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
                <SortableTableHead sortKey="quote_number" sortConfig={sortConfig} onSort={handleSort}>Nº</SortableTableHead>
                <SortableTableHead sortKey="customers.name" sortConfig={sortConfig} onSort={handleSort}>Cliente</SortableTableHead>
                <SortableTableHead sortKey="created_at" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">Data</SortableTableHead>
                {hasPricing && <SortableTableHead sortKey="total_cost" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">Custo</SortableTableHead>}
                <SortableTableHead sortKey="final_price" sortConfig={sortConfig} onSort={handleSort}>Valor</SortableTableHead>
                {hasPricing && <TableHead className="hidden lg:table-cell">Margem</TableHead>}
                <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                <TableHead className="text-right">Ações</TableHead>
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
                    {q.customers?.name ?? q.prospect_name ?? '—'}
                    {!q.customer_id && q.prospect_name && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">(prospecto)</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                    {format(new Date(q.created_at), 'dd/MM/yy', { locale: ptBR })}
                  </TableCell>
                  {hasPricing && (
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                      {cost > 0 ? cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                    </TableCell>
                  )}
                  <TableCell className="font-semibold">
                    {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
                    <Badge className={STATUS_COLORS[q.status] ?? ''}>
                      {STATUS_LABELS[q.status] ?? q.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      {q.financial_transaction_id && (
                        <Badge variant="outline" className="h-7 gap-1 text-success border-success/40" title="Lançamento financeiro gerado">
                          <DollarSign className="h-3 w-3" /> Recebido
                        </Badge>
                      )}
                      <RowActionsMenu
                        actions={[
                          { label: 'Visualizar', icon: Eye, onClick: () => setViewQuote(q) },
                          { label: 'Abrir proposta em nova guia', icon: ExternalLink, onClick: () => window.open(`${window.location.origin}/proposta/${q.token}`, '_blank') },
                          {
                            label: 'Aprovar (registrar recebimento)',
                            icon: CheckCircle2,
                            onClick: () => setApprovingQuote(q),
                            hidden: q.status !== 'enviado' && q.status !== 'rascunho',
                          },
                          {
                            label: 'Rejeitar',
                            icon: XCircle,
                            onClick: () => updateStatus.mutate({ id: q.id, status: 'rejeitado' }),
                            hidden: q.status !== 'enviado',
                          },
                          {
                            label: 'Converter em OS',
                            icon: ArrowRight,
                            onClick: () => convertToServiceOrder.mutate(q),
                            disabled: isConverting,
                            hidden: !(q.status === 'aprovado' && !q.converted_to_os_id),
                          },
                          {
                            label: 'Editar',
                            icon: Pencil,
                            variant: 'edit',
                            onClick: () => { setEditQuote(q); setFormOpen(true); },
                          },
                          {
                            label: 'Excluir',
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
          label="Orçamento"
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
        title={`Aprovar Orçamento #${approvingQuote?.quote_number}`}
        description="Como o cliente pagou? Vamos lançar a receita e os custos no financeiro."
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
            <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteQuote.mutate(deleteId); setDeleteId(null); }}
            >
              Excluir
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

  const sidebarTabs = ALL_SIDEBAR_TABS.filter(t => !t.module || hasModule(t.module));

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Orçamentos"
        subtitle="Gerencie orçamentos, custos e precificação"
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

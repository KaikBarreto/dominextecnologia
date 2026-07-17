import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ClipboardList,
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  CalendarDays,
  Eye,
  ExternalLink,
  Settings,
  LayoutList,
  LayoutGrid,
  Star,
  BarChart3,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatarTooltip } from '@/components/ui/UserAvatarTooltip';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { cn } from '@/lib/utils';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { ServiceOrderViewDialog } from '@/components/service-orders/ServiceOrderViewDialog';
import { OsStatusManagerDialog } from '@/components/service-orders/OsStatusManagerDialog';
import type { ServiceOrder, OsStatus } from '@/types/database';
import { osStatusLabels, getOsTypeLabel } from '@/types/database';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { NpsDashboard } from '@/components/service-orders/NpsDashboard';
import { OsReportDashboard } from '@/components/service-orders/OsReportDashboard';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { addDays, isBefore, parseISO, startOfDay } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { KPICard } from '@/components/dashboard/KPICard';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import { getIsPmocFromOrder } from '@/hooks/useIsPmocOrder';

export default function ServiceOrders() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { hasPermission, isAdminOrGestor } = useAuth();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os;
  const [activeTab, setActiveTab] = useState('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const location = useLocation();
  const [pendingFocusSearch, setPendingFocusSearch] = useState(false);

  // Captura intent ao chegar via /ordens-servico { state: { focusSearch | initialStatus } }
  useEffect(() => {
    const state = location.state as { focusSearch?: boolean; initialStatus?: string } | null;
    if (state?.focusSearch) {
      setPendingFocusSearch(true);
    }
    if (state?.initialStatus) {
      setStatusFilter([state.initialStatus]);
    }
    if (state?.focusSearch || state?.initialStatus) {
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  // Aplica o foco assim que o input mobile estiver montado (após isLoading=false)
  useEffect(() => {
    if (!pendingFocusSearch) return;
    const tryFocus = setTimeout(() => {
      if (mobileSearchInputRef.current) {
        mobileSearchInputRef.current.focus();
        setPendingFocusSearch(false);
      }
    }, 80);
    return () => clearTimeout(tryFocus);
  });
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<ServiceOrder | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [osToDelete, setOsToDelete] = useState<ServiceOrder | null>(null);
  const [deleteMode, setDeleteMode] = useState<'single' | 'group' | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingOsId, setViewingOsId] = useState<string | null>(null);
  const [statusConfigOpen, setStatusConfigOpen] = useState(false);
  // Default = kanban (preferência do CEO). Persiste a escolha do usuário em localStorage:
  // se ele alternar pra lista, fica em lista nas próximas visitas.
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'kanban';
    const saved = localStorage.getItem('os-view-mode');
    return saved === 'list' || saved === 'kanban' ? saved : 'kanban';
  });
  // Status pré-preenchido pra Nova OS quando criada via "+" do header de uma coluna do kanban.
  // undefined = botão global "Nova OS" (sem pré-seleção, form usa default do schema).
  const [initialStatus, setInitialStatus] = useState<OsStatus | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('os-view-mode', viewMode);
  }, [viewMode]);

  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');
  const { serviceOrders, isLoading, createServiceOrder, updateServiceOrder, deleteServiceOrder } = useServiceOrders();
  const { statuses } = useOsStatuses();

  const canCreateOS = isAdminOrGestor() || hasPermission('fn:create_os');
  const canEditOS = isAdminOrGestor() || hasPermission('fn:edit_os');
  const canDeleteOS = isAdminOrGestor() || hasPermission('fn:delete_os');

  const getOsCode = (os: ServiceOrder) => {
    const prefix = (os as any).service_type?.number_prefix || 'OS';
    const year = os.scheduled_date ? new Date(os.scheduled_date).getFullYear() : new Date(os.created_at).getFullYear();
    return `${prefix}-${year}-${String(os.order_number).padStart(6, '0')}`;
  };

  // Busca universal: com texto digitado, procuramos em TODAS as OS carregadas,
  // ignorando filtro de data ("este mês") E filtro de status. Sem isso, OS
  // antigas/de outro status "sumiam" e davam impressão de dado perdido.
  const hasSearch = searchTerm.trim().length > 0;

  const filteredOrders = useMemo(() => {
    if (hasSearch) {
      // Filtros pausados: base é o universo completo de OS, só a busca restringe.
      return serviceOrders.filter((os) => {
        const osCode = getOsCode(os);
        const orderNum = String(os.order_number).padStart(6, '0');
        return (
          fuzzyIncludes(os.customer?.name, searchTerm) ||
          fuzzyIncludes(osCode, searchTerm) ||
          fuzzyIncludes(orderNum, searchTerm) ||
          fuzzyIncludes((os as any).service_type?.name, searchTerm) ||
          fuzzyIncludes((os as any).task_title, searchTerm) ||
          fuzzyIncludes((os as any).equipment?.name, searchTerm)
        );
      });
    }

    // Sem busca: comportamento padrão. Filtro de data aplica em TUDO (kanban,
    // lista, KPIs) — DateRangeFilter no topo é a fonte da verdade do recorte
    // temporal da tela — combinado com o filtro de status.
    const baseOrders = filterByDate(serviceOrders, 'scheduled_date');
    return baseOrders.filter((os) => {
      return statusFilter.length === 0 || statusFilter.includes(os.status);
    });
  }, [serviceOrders, searchTerm, hasSearch, statusFilter, range, filterByDate]);

  // Ordem semântica do status pra que SortableTableHead consiga ordenar
  // por "fluxo de trabalho" (agendada → pendente → … → concluida → cancelada)
  // em vez de alfabético. Caller-pode-mudar; manter alinhado ao enum os_status.
  const STATUS_RANK: Record<string, number> = {
    agendada: 0,
    pendente: 1,
    a_caminho: 2,
    em_andamento: 3,
    pausada: 4,
    concluida: 5,
    cancelada: 6,
  };

  // Enriquece com campos derivados pro useTableSort (datas viram timestamp;
  // status vira rank semântico). Mesmo pattern usado em Contracts.tsx.
  const sortableOrders = useMemo(
    () =>
      filteredOrders.map((os) => ({
        ...os,
        _scheduled_sort: os.scheduled_date ? new Date(os.scheduled_date).getTime() : 0,
        _status_rank: STATUS_RANK[os.status] ?? 99,
      })),
    [filteredOrders],
  );

  const { sortedItems, sortConfig, handleSort } = useTableSort(sortableOrders);
  const pagination = useDataPagination(sortedItems);

  // Fallback do enum legado, localizado (só entra quando o tenant não tem
  // status configurados em os_statuses — os labels do catálogo NÃO são traduzidos).
  const statusOptions = statuses.length
    ? statuses.map((s) => ({ key: s.key as OsStatus, label: s.label, color: s.color }))
    : (Object.keys(osStatusLabels) as OsStatus[]).map((key) => ({ key, label: t.statusFallback[key], color: '#3b82f6' }));

  const getStatusLabel = (key: string) => statusOptions.find((s) => s.key === key)?.label || t.statusFallback[key as OsStatus] || key;
  const getStatusColor = (key: string) => statusOptions.find((s) => s.key === key)?.color || '#3b82f6';
  // Rótulo exibido considerando a marca de finalização parcial: OS pausada com
  // partial_finish vira "Parcialmente Concluída" (cor segue a do status pausada).
  const getOsDisplayStatusLabel = (os: { status: OsStatus; partial_finish?: boolean | null }) =>
    os.status === 'pausada' && os.partial_finish ? t.partialCompleted : getStatusLabel(os.status);

  const handleSubmit = async (data: any) => {
    if (editingOS) {
      await updateServiceOrder.mutateAsync({ ...data, id: editingOS.id });
    } else {
      await createServiceOrder.mutateAsync(data);
    }
    setEditingOS(null);
  };

  const handleEdit = (os: ServiceOrder) => {
    setEditingOS(os);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (osToDelete) {
      if (deleteMode === 'group') {
        const today = new Date().toISOString().slice(0, 10);
        const recurrenceGroupId = (osToDelete as any).recurrence_group_id;
        const contractId = (osToDelete as any).contract_id;
        let groupOrders: ServiceOrder[] = [];
        if (recurrenceGroupId) {
          groupOrders = serviceOrders.filter((o: any) => o.recurrence_group_id === recurrenceGroupId);
        } else if (contractId) {
          groupOrders = serviceOrders.filter((o: any) => o.contract_id === contractId);
        }
        const futureOrders = groupOrders.filter(o => (o.scheduled_date || '') >= today);
        for (const o of futureOrders) {
          await deleteServiceOrder.mutateAsync(o.id);
        }
      } else {
        await deleteServiceOrder.mutateAsync(osToDelete.id);
      }
      setOsToDelete(null);
      setDeleteDialogOpen(false);
      setDeleteMode(null);
    }
  };

  const handleDeleteClick = (os: ServiceOrder) => {
    setOsToDelete(os);
    const hasGroup = !!(os as any).recurrence_group_id || !!(os as any).contract_id;
    setDeleteMode(hasGroup ? null : 'single');
    setDeleteDialogOpen(true);
  };

  const handleStatusChange = async (os: ServiceOrder, newStatus: OsStatus) => {
    await updateServiceOrder.mutateAsync({ id: os.id, status: newStatus });
  };

  const kanbanColumns = statusOptions;

  // "+" no header da coluna só faz sentido em status NÃO-terminais.
  // Criar OS já "concluida" ou "cancelada" pelo atalho seria pegadinha pro gestor.
  const CREATE_NEW_BLOCKED_STATUSES: OsStatus[] = ['concluida', 'cancelada'];
  const canCreateNewInColumn = (status: OsStatus) =>
    canCreateOS && !CREATE_NEW_BLOCKED_STATUSES.includes(status);

  // Abre o modal de Nova OS com status pré-preenchido pela coluna do kanban.
  const handleNewOsWithStatus = (status: OsStatus) => {
    setEditingOS(null);
    setInitialStatus(status);
    setFormOpen(true);
  };

  // Quando o modal fecha (por qualquer motivo), zera o status pré-preenchido
  // pra que o próximo "Nova OS" (global) não herde um status antigo.
  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open) setInitialStatus(undefined);
  };

  const sidebarTabs: SettingsTab[] = [
    { value: 'orders', label: t.tabs.orders, icon: ClipboardList },
    { value: 'report', label: t.tabs.report, icon: BarChart3 },
    { value: 'nps', label: t.tabs.nps, icon: Star },
  ];

  // 4 KPIs no estilo Dashboard (substituem os 7 cards de status).
  // Todos respeitam `filteredOrders` (já filtrado pelo DateRangeFilter da tela).
  // Cards são read-only — controle de filtro por status migrou pra dentro do FilterButton/Sheet.
  // Helper local: parse YYYY-MM-DD como horário local pra evitar UTC shift.
  const parseLocalDate = (dateStr: string) => parseISO(dateStr + 'T12:00:00');
  const today = useMemo(() => startOfDay(new Date()), []);
  const next7 = useMemo(() => addDays(today, 7), [today]);

  const kpiData = useMemo(() => {
    const osAbertas = filteredOrders.filter(
      (o) => !['concluida', 'cancelada'].includes(o.status),
    ).length;
    const osConcluidas = filteredOrders.filter((o) => o.status === 'concluida').length;
    const osAtrasadas = filteredOrders.filter(
      (o) =>
        !['concluida', 'cancelada'].includes(o.status) &&
        o.scheduled_date &&
        isBefore(parseLocalDate(o.scheduled_date), today),
    ).length;
    const osProx7 = filteredOrders.filter(
      (o) =>
        !['concluida', 'cancelada'].includes(o.status) &&
        o.scheduled_date &&
        !isBefore(parseLocalDate(o.scheduled_date), today) &&
        isBefore(parseLocalDate(o.scheduled_date), next7),
    ).length;
    return { osAbertas, osConcluidas, osAtrasadas, osProx7 };
  }, [filteredOrders, today, next7]);

  const kpiCards = [
    { title: t.kpi.open, value: kpiData.osAbertas, icon: ClipboardList, bgClass: 'bg-warning', delay: 0 },
    { title: t.kpi.completed, value: kpiData.osConcluidas, icon: CheckCircle2, bgClass: 'bg-success', delay: 1 },
    { title: t.kpi.overdue, value: kpiData.osAtrasadas, icon: AlertTriangle, bgClass: 'bg-destructive', delay: 2 },
    { title: t.kpi.next7, value: kpiData.osProx7, icon: CalendarDays, bgClass: 'bg-info', delay: 3 },
  ];

  // Contagem de filtros ativos (busca, status, preset diferente do default).
  // Usada no FilterSheet mobile, que ainda inclui o controle de "Período".
  // Durante a busca, status e data ficam pausados — então o count reflete só a
  // busca (1), pra não sugerir filtros que não estão sendo aplicados.
  const activeFilterCount = hasSearch
    ? 1
    : (statusFilter.length > 0 ? 1 : 0) + (preset !== 'this_month' ? 1 : 0);

  // Filtros estruturados (sem contar a busca) — usado pelo FilterButton desktop,
  // que só consolida Status (o seletor de período fica inline acima).
  const structuredActiveCount = statusFilter.length > 0 ? 1 : 0;

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter([]);
    setPreset('this_month');
  };

  const clearStructuredFilters = () => {
    setStatusFilter([]);
  };

  // Conteúdo da Sheet de filtros no mobile (também usado pra renderizar inline no desktop).
  const filterContent = (
    <div className={cn(isMobile ? 'space-y-4' : 'flex flex-col gap-3 sm:flex-row sm:items-center flex-1')}>
      {!isMobile && (
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t.search.placeholderFull}
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}
      {isMobile && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t.filters.period}</label>
          <DateRangeFilter
            value={range}
            preset={preset}
            onPresetChange={setPreset}
            onRangeChange={setRange}
          />
        </div>
      )}
      <div className={isMobile ? '' : 'w-full sm:w-[260px]'}>
        <FilterCheckboxGroup
          label={t.filters.status}
          options={statusOptions.map((s) => ({ value: s.key, label: s.label, color: s.color }))}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
      </div>
      {isMobile && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t.filters.view}</label>
          <div className="flex rounded-lg border overflow-hidden w-fit">
            <button
              className={cn('flex items-center gap-2 px-3 py-2 text-sm transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              onClick={() => setViewMode('list')}
              type="button"
            >
              <LayoutList className="h-4 w-4" /> {t.view.list}
            </button>
            <button
              className={cn('flex items-center gap-2 px-3 py-2 text-sm transition-colors', viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              onClick={() => setViewMode('kanban')}
              type="button"
            >
              <LayoutGrid className="h-4 w-4" /> {t.view.kanban}
            </button>
          </div>
        </div>
      )}
      {isMobile && (
        <div className="pt-2 border-t">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t.filters.viewSettings}</label>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setStatusConfigOpen(true)}
            type="button"
          >
            <Settings className="h-4 w-4" />
            {t.filters.manageStatus}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('space-y-6', isMobile && 'min-h-[100dvh] pb-24')}>
      <MobilePageHeader
        title={t.header.title}
        subtitle={t.header.subtitle}
        icon={ClipboardList}
      />

      <SettingsSidebarLayout tabs={sidebarTabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'nps' && <NpsDashboard />}
        {activeTab === 'report' && <OsReportDashboard />}
        {activeTab === 'orders' && (
          <div className={cn('space-y-4', !isMobile && 'space-y-6')}>

            {/* Mobile: busca sempre visível + botão filtros + FAB. Desktop: actions bar atual. */}
            {isMobile ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      ref={mobileSearchInputRef}
                      placeholder={t.search.placeholderShort}
                      className="pl-10 h-11 rounded-lg"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <FilterSheet
                    triggerLabel={t.filters.button}
                    activeCount={activeFilterCount}
                    onClear={clearFilters}
                  >
                    {filterContent}
                  </FilterSheet>
                </div>

                {hasSearch && (
                  <p className="text-xs text-muted-foreground -mt-1 px-0.5">
                    {t.search.pausedFilters}
                  </p>
                )}

                <div className="relative -mx-3">
                  <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-background to-transparent" />
                  <div className="flex gap-3 overflow-x-auto px-3 pb-1 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {isLoading
                      ? [0, 1, 2, 3].map((i) => (
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
                <DateRangeFilter
                  value={range}
                  preset={preset}
                  onPresetChange={setPreset}
                  onRangeChange={setRange}
                />

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 sm:max-w-sm">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={t.search.placeholderFull}
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <FilterButton
                      activeCount={structuredActiveCount}
                      onClear={clearStructuredFilters}
                    >
                      <FilterCheckboxGroup
                        label={t.filters.status}
                        options={statusOptions.map((s) => ({ value: s.key, label: s.label, color: s.color }))}
                        selected={statusFilter}
                        onChange={setStatusFilter}
                      />
                    </FilterButton>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setStatusConfigOpen(true)}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">{t.filters.settings}</span>
                    </Button>
                    {canCreateOS && (
                      <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingOS(null); setFormOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t.actions.newOs}
                      </Button>
                    )}
                  </div>
                </div>

                {hasSearch && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    {t.search.pausedFilters}
                  </p>
                )}

                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                  {isLoading
                    ? [0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[108px] w-full rounded-2xl" />
                      ))
                    : kpiCards.map((card) => (
                        <KPICard key={card.title} {...card} />
                      ))}
                </div>
              </>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <>
                {!isMobile && (
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70">
                      {t.sections.listTitle}
                    </h2>
                    <div className="flex rounded-lg border overflow-hidden">
                      <button
                        className={cn('px-3 py-2 text-sm', 'bg-primary text-primary-foreground')}
                        onClick={() => setViewMode('list')}
                      >
                        <LayoutList className="h-4 w-4" />
                      </button>
                      <button
                        className={cn('px-3 py-2 text-sm', 'hover:bg-muted')}
                        onClick={() => setViewMode('kanban')}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
                {isMobile ? (
                  isLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-12 w-12" />}
                      title={searchTerm || statusFilter.length > 0 ? t.empty.noneFoundTitle : t.empty.noneTitle}
                      description={searchTerm || statusFilter.length > 0 ? t.empty.noneFoundDescription : t.empty.noneDescriptionMobile}
                    />
                  ) : (
                    <>
                      <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                        {pagination.paginatedItems.map((os) => {
                          const itemActions: ItemAction[] = [
                            {
                              key: 'view',
                              label: t.rowActions.view,
                              icon: <Eye className="h-4 w-4" />,
                              onClick: () => { setViewingOsId(os.id); setViewDialogOpen(true); },
                            },
                            {
                              key: 'open-tech',
                              label: t.rowActions.openAsTech,
                              icon: <ExternalLink className="h-4 w-4" />,
                              onClick: () => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank'),
                            },
                            ...(canEditOS ? [{
                              key: 'edit',
                              label: t.rowActions.edit,
                              icon: <Pencil className="h-4 w-4" />,
                              variant: 'edit' as const,
                              onClick: () => handleEdit(os),
                            }] : []),
                            ...(canDeleteOS ? [{
                              key: 'delete',
                              label: t.rowActions.delete,
                              icon: <Trash2 className="h-4 w-4" />,
                              variant: 'destructive' as const,
                              onClick: () => handleDeleteClick(os),
                            }] : []),
                          ];
                          return (
                            <MobileListItem
                              key={os.id}
                              onClick={() => { setViewingOsId(os.id); setViewDialogOpen(true); }}
                              actions={itemActions}
                              leading={
                                <div
                                  className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                                  style={{ backgroundColor: getStatusColor(os.status) }}
                                >
                                  <ClipboardList className="h-5 w-5" />
                                </div>
                              }
                              title={
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-muted-foreground">{getOsCode(os)}</span>
                                  <span className="truncate">{os.customer?.name || t.na}</span>
                                </div>
                              }
                              subtitle={
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getIsPmocFromOrder(os as any) && (
                                    <PmocComplianceBadge variant="chip" withTooltip />
                                  )}
                                  {os.service_type ? (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getIsPmocFromOrder(os as any) ? 'hsl(var(--info))' : os.service_type.color }} />
                                      {os.service_type.name}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1">{getOsTypeLabel(os as any, t.typeFallback)}</span>
                                  )}
                                  {os.scheduled_date && (
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {formatDate(os.scheduled_date, locale, timezone)}
                                    </span>
                                  )}
                                </div>
                              }
                              trailing={
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-2 py-0.5 whitespace-nowrap text-white border-0"
                                  style={{ backgroundColor: getStatusColor(os.status) }}
                                >
                                  {getOsDisplayStatusLabel(os as any)}
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
                  )
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      {isLoading ? (
                        <div className="space-y-4 p-6">
                          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                        </div>
                      ) : filteredOrders.length === 0 ? (
                        <EmptyState
                          icon={<ClipboardList className="h-12 w-12" />}
                          title={searchTerm || statusFilter.length > 0 ? t.empty.noneFoundTitle : t.empty.noneTitle}
                          description={searchTerm || statusFilter.length > 0 ? t.empty.noneFoundDescription : t.empty.noneDescriptionDesktop}
                        />
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <SortableTableHead sortKey="order_number" sortConfig={sortConfig} onSort={handleSort}>{t.table.os}</SortableTableHead>
                                  <TableHead className="text-xs uppercase tracking-wider w-[40px]">{t.table.creator}</TableHead>
                                  <SortableTableHead sortKey="customer.name" sortConfig={sortConfig} onSort={handleSort}>{t.table.customer}</SortableTableHead>
                                  <SortableTableHead sortKey="service_type.name" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">{t.table.type}</SortableTableHead>
                                  <SortableTableHead sortKey="_scheduled_sort" sortConfig={sortConfig} onSort={handleSort} className="hidden sm:table-cell">{t.table.date}</SortableTableHead>
                                  <SortableTableHead sortKey="_status_rank" sortConfig={sortConfig} onSort={handleSort}>{t.table.status}</SortableTableHead>
                                  <TableHead className="w-[100px] text-xs uppercase tracking-wider">{t.table.actions}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pagination.paginatedItems.map((os) => {
                                  return (
                                    <TableRow key={os.id}>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-medium text-sm">
                                            {getOsCode(os)}
                                          </span>
                                          {getIsPmocFromOrder(os as any) && (
                                            <PmocComplianceBadge variant="chip" withTooltip />
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <UserAvatarTooltip
                                          name={(os as any).created_by_profile?.full_name}
                                          email={(os as any).created_by_profile?.email}
                                          avatarUrl={(os as any).created_by_profile?.avatar_url}
                                          roleLabel={t.creatorRole}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <div>
                                          <p className="font-medium">{os.customer?.name || (os as any).snapshot_data?.customer?.name || t.na}</p>
                                          {(os.equipment || (os as any).snapshot_data?.equipment) && (
                                            <p className="text-xs text-muted-foreground">{os.equipment?.name || (os as any).snapshot_data?.equipment?.name}</p>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="hidden md:table-cell">
                                        {os.service_type ? (
                                          <div className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: getIsPmocFromOrder(os as any) ? 'hsl(var(--info))' : os.service_type.color }} />
                                            <span className="text-sm">{os.service_type.name}</span>
                                          </div>
                                        ) : (
                                          <span className="text-sm">{getOsTypeLabel(os as any, t.typeFallback)}</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="hidden sm:table-cell">
                                        {os.scheduled_date ? (
                                          <div className="flex items-center gap-1 text-sm">
                                            <Calendar className="h-3 w-3" />
                                            {formatDate(os.scheduled_date, locale, timezone)}
                                          </div>
                                        ) : '-'}
                                      </TableCell>
                                      <TableCell>
                                        <Select
                                          value={os.status}
                                          onValueChange={(value) => handleStatusChange(os, value as OsStatus)}
                                        >
                                          <SelectTrigger className="h-8 w-[140px] whitespace-nowrap" style={{ backgroundColor: getStatusColor(os.status), color: 'white' }}>
                                            <SelectValue>
                                              <span className="flex items-center gap-1 whitespace-nowrap text-white">
                                                {getOsDisplayStatusLabel(os as any)}
                                              </span>
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            {statusOptions.map((s) => (
                                              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell>
                                        <RowActionsMenu
                                          actions={[
                                            {
                                              label: t.rowActions.viewOs,
                                              icon: Eye,
                                              onClick: () => { setViewingOsId(os.id); setViewDialogOpen(true); },
                                            },
                                            {
                                              label: t.rowActions.openChecklist,
                                              icon: ExternalLink,
                                              onClick: () => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank'),
                                            },
                                            {
                                              label: t.rowActions.edit,
                                              icon: Pencil,
                                              variant: 'edit',
                                              onClick: () => handleEdit(os),
                                              hidden: !canEditOS,
                                            },
                                            {
                                              label: t.rowActions.delete,
                                              icon: Trash2,
                                              variant: 'delete',
                                              onClick: () => handleDeleteClick(os),
                                              hidden: !canDeleteOS,
                                            },
                                          ]}
                                        />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
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
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Kanban View */}
            {viewMode === 'kanban' && (
              <>
                {!isMobile && (
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70">
                      {t.sections.byStatus}
                    </h2>
                    <div className="flex rounded-lg border overflow-hidden">
                      <button
                        className={cn('px-3 py-2 text-sm', 'hover:bg-muted')}
                        onClick={() => setViewMode('list')}
                      >
                        <LayoutList className="h-4 w-4" />
                      </button>
                      <button
                        className={cn('px-3 py-2 text-sm', 'bg-primary text-primary-foreground')}
                        onClick={() => setViewMode('kanban')}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
                {isLoading ? (
                  <div className={cn(
                    'flex gap-4 overflow-x-auto pb-4',
                    // Snap horizontal por coluna no mobile dá feeling iOS (cada
                    // swipe encaixa numa coluna). No desktop, scroll livre.
                    isMobile && 'snap-x snap-mandatory'
                  )}>
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          'min-w-[280px] flex-1 flex flex-col rounded-2xl border bg-muted/30',
                          isMobile && 'snap-start'
                        )}
                      >
                        <div className="px-3 pt-3 pb-2 border-b">
                          <Skeleton className="h-1 w-full rounded-full mb-2.5" />
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-8" />
                          </div>
                        </div>
                        <div className="flex-1 p-2 space-y-2">
                          {[0, 1, 2].map((j) => (
                            <div key={j} className="rounded-lg border bg-card p-3 space-y-2">
                              <div className="flex justify-between">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-3 w-12" />
                              </div>
                              <Skeleton className="h-4 w-3/4" />
                              <Skeleton className="h-3 w-1/2" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                <div className={cn(
                  'flex gap-4 overflow-x-auto pb-4',
                  // Snap horizontal por coluna no mobile dá feeling iOS (cada
                  // swipe encaixa numa coluna). No desktop, scroll livre.
                  isMobile && 'snap-x snap-mandatory'
                )}>
                  {kanbanColumns.map((col) => {
                    const columnOrders = filteredOrders.filter((os) => os.status === col.key);
                    return (
                      <div
                        key={col.key}
                        className={cn(
                          'min-w-[280px] flex-1 flex flex-col rounded-2xl border bg-muted/30',
                          isMobile && 'snap-start'
                        )}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const osId = e.dataTransfer.getData('text/plain');
                          if (osId) handleStatusChange({ id: osId } as ServiceOrder, col.key);
                        }}
                      >
                        {/* Header coluna — padrão EcoSistema (barra colorida em cima + título uppercase + "+") */}
                        <div className="px-3 pt-3 pb-2 border-b">
                          <div
                            className="h-1 w-full rounded-full mb-2.5"
                            style={{ backgroundColor: col.color }}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-sm tracking-wide text-foreground uppercase truncate">
                              {col.label}
                            </h3>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {columnOrders.length}
                              </span>
                              {canCreateNewInColumn(col.key) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    'active:scale-[0.98] transition-transform',
                                    // Hit area 44pt no mobile (iOS guideline); compacto no desktop.
                                    isMobile ? 'h-11 w-11' : 'h-7 w-7'
                                  )}
                                  onClick={() => handleNewOsWithStatus(col.key)}
                                  title={t.kanban.createInColumn.replace('{status}', col.label)}
                                  aria-label={t.kanban.createInColumn.replace('{status}', col.label)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                          {columnOrders.map((os) => {
                            const creator = (os as any).created_by_profile as { full_name: string | null; avatar_url: string | null; email: string | null } | null;
                            return (
                            <Card
                              key={os.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', os.id)}
                              onClick={() => { setViewingOsId(os.id); setViewDialogOpen(true); }}
                              className="group relative cursor-pointer active:cursor-grabbing rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
                            >
                              {/* Editar + Excluir no canto superior direito — visíveis só no hover do card.
                                  Editar = hover laranja (warning), Excluir = hover vermelho (destructive). */}
                              <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {canEditOS && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-warning hover:text-white"
                                    onClick={(e) => { e.stopPropagation(); handleEdit(os); }}
                                    title={t.rowActions.edit}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                                {canDeleteOS && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:bg-destructive hover:text-white"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteClick(os); }}
                                    title={t.rowActions.delete}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                              <CardContent className="p-3 pr-10 space-y-1">
                                <span className="font-mono text-xs font-medium">{getOsCode(os)}</span>
                                <p className="text-sm font-medium">{os.customer?.name || t.na}</p>
                                {os.service_type && (
                                  <div className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: getIsPmocFromOrder(os as any) ? 'hsl(var(--info))' : os.service_type.color }} />
                                    <span className="text-xs text-muted-foreground">{os.service_type.name}</span>
                                  </div>
                                )}
                                {os.scheduled_date && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(os.scheduled_date, locale, timezone)}
                                  </p>
                                )}
                              </CardContent>
                              {/* Avatar do criador da OS — canto inferior direito do card.
                                  Tooltip mostra nome + email (espelhado de auth.users por
                                  trigger em profiles.email) + rótulo "Criador da OS". */}
                              <UserAvatarTooltip
                                name={creator?.full_name}
                                email={creator?.email}
                                avatarUrl={creator?.avatar_url}
                                roleLabel={t.creatorRole}
                                size={24}
                                side="left"
                                className="absolute bottom-2 right-2 ring-2 ring-background shadow-md"
                              />
                            </Card>
                            );
                          })}
                          {columnOrders.length === 0 && (
                            <EmptyState
                              size="compact"
                              icon={<ClipboardList className="h-10 w-10" />}
                              title={t.empty.columnEmpty}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </>
            )}

            {/* FAB Nova OS no mobile */}
            {isMobile && canCreateOS && (
              <FABButton
                icon={<Plus className="h-5 w-5" />}
                label={t.actions.fabLabel}
                onClick={() => { setEditingOS(null); setFormOpen(true); }}
              />
            )}

            <ServiceOrderFormDialog
              open={formOpen}
              onOpenChange={handleFormOpenChange}
              serviceOrder={editingOS}
              defaultStatus={initialStatus}
              onSubmit={handleSubmit}
              isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteMode(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.delete.title.replace('{number}', String(osToDelete?.order_number ?? ''))}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {((osToDelete as any)?.recurrence_group_id || (osToDelete as any)?.contract_id) && !deleteMode
                      ? t.delete.recurrenceQuestion
                      : t.delete.confirm}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className={((osToDelete as any)?.recurrence_group_id || (osToDelete as any)?.contract_id) && !deleteMode ? 'flex-col gap-2 sm:flex-col' : ''}>
                  {((osToDelete as any)?.recurrence_group_id || (osToDelete as any)?.contract_id) && !deleteMode ? (
                    <>
                      <Button variant="destructive" onClick={() => setDeleteMode('single')} className="w-full">
                        {t.delete.onlyThis}
                      </Button>
                      <Button variant="destructive" onClick={() => setDeleteMode('group')} className="w-full">
                        {t.delete.allRecurrence}
                      </Button>
                      <AlertDialogCancel className="w-full">{t.delete.cancel}</AlertDialogCancel>
                    </>
                  ) : (
                    <>
                      <AlertDialogCancel onClick={() => setDeleteMode(null)}>{t.delete.cancel}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {t.delete.delete}
                      </AlertDialogAction>
                    </>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <ServiceOrderViewDialog
              open={viewDialogOpen}
              onOpenChange={setViewDialogOpen}
              serviceOrderId={viewingOsId}
              onEdit={canEditOS && viewingOsId ? () => {
                const os = serviceOrders.find((o) => o.id === viewingOsId);
                if (os) handleEdit(os);
              } : undefined}
              onDelete={canDeleteOS && viewingOsId ? () => {
                const os = serviceOrders.find((o) => o.id === viewingOsId);
                if (os) handleDeleteClick(os);
              } : undefined}
              onStatusChange={viewingOsId ? async (newStatus) => {
                const os = serviceOrders.find((o) => o.id === viewingOsId);
                if (os) await handleStatusChange(os, newStatus);
              } : undefined}
            />

            <OsStatusManagerDialog
              open={statusConfigOpen}
              onOpenChange={setStatusConfigOpen}
            />
          </div>
        )}
      </SettingsSidebarLayout>
    </div>
  );
}

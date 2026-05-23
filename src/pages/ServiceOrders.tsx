import { useState, useMemo } from 'react';
import { fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  ClipboardList,
  Plus,
  Search,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Calendar,
  CalendarClock,
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
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { cn } from '@/lib/utils';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { ServiceOrderViewDialog } from '@/components/service-orders/ServiceOrderViewDialog';
import { OsStatusManagerDialog } from '@/components/service-orders/OsStatusManagerDialog';
import type { ServiceOrder, OsStatus } from '@/types/database';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { NpsDashboard } from '@/components/service-orders/NpsDashboard';
import { OsReportDashboard } from '@/components/service-orders/OsReportDashboard';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

const statusConfig: Record<OsStatus, { icon: any; color: string; bgColor: string; hex: string }> = {
  agendada: { icon: CalendarClock, color: 'text-white', bgColor: 'bg-violet-500', hex: '#8b5cf6' },
  pendente: { icon: Clock, color: 'text-white', bgColor: 'bg-warning', hex: '#f59e0b' },
  a_caminho: { icon: AlertCircle, color: 'text-white', bgColor: 'bg-indigo-500', hex: '#6366f1' },
  em_andamento: { icon: AlertCircle, color: 'text-white', bgColor: 'bg-info', hex: '#0ea5e9' },
  pausada: { icon: Clock, color: 'text-white', bgColor: 'bg-amber-600', hex: '#d97706' },
  concluida: { icon: CheckCircle2, color: 'text-white', bgColor: 'bg-success', hex: '#22c55e' },
  cancelada: { icon: XCircle, color: 'text-white', bgColor: 'bg-destructive', hex: '#ef4444' },
};

export default function ServiceOrders() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { hasPermission, isAdminOrGestor } = useAuth();
  const [activeTab, setActiveTab] = useState('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<ServiceOrder | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [osToDelete, setOsToDelete] = useState<ServiceOrder | null>(null);
  const [deleteMode, setDeleteMode] = useState<'single' | 'group' | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingOsId, setViewingOsId] = useState<string | null>(null);
  const [statusConfigOpen, setStatusConfigOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

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

  const filteredOrders = useMemo(() => {
    const baseOrders = viewMode === 'kanban' ? serviceOrders : filterByDate(serviceOrders, 'scheduled_date');
    return baseOrders.filter((os) => {
      const osCode = getOsCode(os);
      const orderNum = String(os.order_number).padStart(6, '0');
      const matchesSearch =
        fuzzyIncludes(os.customer?.name, searchTerm) ||
        fuzzyIncludes(osCode, searchTerm) ||
        fuzzyIncludes(orderNum, searchTerm);
      const matchesStatus = statusFilter === 'all' || os.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [serviceOrders, searchTerm, statusFilter, range, viewMode]);

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredOrders);
  const pagination = useDataPagination(sortedItems);

  const statusOptions = statuses.length
    ? statuses.map((s) => ({ key: s.key as OsStatus, label: s.label, color: s.color }))
    : (Object.keys(osStatusLabels) as OsStatus[]).map((key) => ({ key, label: osStatusLabels[key], color: '#3b82f6' }));

  const getStatusLabel = (key: string) => statusOptions.find((s) => s.key === key)?.label || osStatusLabels[key as OsStatus] || key;
  const getStatusColor = (key: string) => statusOptions.find((s) => s.key === key)?.color || '#3b82f6';

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

  const sidebarTabs: SettingsTab[] = [
    { value: 'orders', label: 'Ordens de Serviço', icon: ClipboardList },
    { value: 'report', label: 'Relatório', icon: BarChart3 },
    { value: 'nps', label: 'NPS e Satisfação', icon: Star },
  ];

  // Stat items para o StatCarousel — mesmos contadores/ícones/cores de antes.
  const statItems = (Object.keys(statusConfig) as OsStatus[]).map((status) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    const count = serviceOrders.filter((os) => os.status === status).length;
    return {
      key: status,
      label: getStatusLabel(status),
      count,
      icon: <Icon className="h-4 w-4" />,
      accentColor: config.hex,
      active: statusFilter === status,
      onClick: () => setStatusFilter(statusFilter === status ? 'all' : status),
    };
  });

  // Contagem de filtros ativos (busca, status, preset diferente do default).
  const activeFilterCount =
    (searchTerm ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (preset !== 'this_month' ? 1 : 0);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPreset('this_month');
  };

  // Conteúdo da Sheet de filtros no mobile (também usado pra renderizar inline no desktop).
  const filterContent = (
    <div className={cn(isMobile ? 'space-y-4' : 'flex flex-col gap-3 sm:flex-row sm:items-center flex-1')}>
      {!isMobile && (
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou número..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}
      {isMobile && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Período</label>
          <DateRangeFilter
            value={range}
            preset={preset}
            onPresetChange={setPreset}
            onRangeChange={setRange}
          />
        </div>
      )}
      <div className={isMobile ? '' : ''}>
        {isMobile && <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={isMobile ? 'w-full' : 'w-full sm:w-[180px]'}>
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status.key} value={status.key}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isMobile && (
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Visualização</label>
          <div className="flex rounded-lg border overflow-hidden w-fit">
            <button
              className={cn('flex items-center gap-2 px-3 py-2 text-sm transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              onClick={() => setViewMode('list')}
              type="button"
            >
              <LayoutList className="h-4 w-4" /> Lista
            </button>
            <button
              className={cn('flex items-center gap-2 px-3 py-2 text-sm transition-colors', viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              onClick={() => setViewMode('kanban')}
              type="button"
            >
              <LayoutGrid className="h-4 w-4" /> Kanban
            </button>
          </div>
        </div>
      )}
      {isMobile && (
        <div className="pt-2 border-t">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Configurações de visualização</label>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setStatusConfigOpen(true)}
            type="button"
          >
            <Settings className="h-4 w-4" />
            Gerenciar status de OS
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Ordens de Serviço"
        subtitle="Gerencie suas ordens de serviço"
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
                      placeholder="Buscar OS..."
                      className="pl-10 h-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
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
                <DateRangeFilter
                  value={range}
                  preset={preset}
                  onPresetChange={setPreset}
                  onRangeChange={setRange}
                />

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {filterContent}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => setStatusConfigOpen(true)}
                      className="bg-gradient-to-b from-gray-700 to-gray-900 text-white hover:from-gray-600 hover:to-gray-800"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Configurações</span>
                    </Button>
                    {canCreateOS && (
                      <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingOS(null); setFormOpen(true); }}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nova OS
                      </Button>
                    )}
                  </div>
                </div>

                <StatCarousel items={statItems} loading={isLoading} />
              </>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <>
                {!isMobile && (
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70">
                      Lista de OS
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
                      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-12 w-12" />}
                      title={searchTerm || statusFilter !== 'all' ? 'Nenhuma OS encontrada' : 'Nenhuma OS cadastrada'}
                      description={searchTerm || statusFilter !== 'all' ? 'Tente filtros diferentes' : 'Toque em "Nova OS" para começar'}
                    />
                  ) : (
                    <>
                      <div className="rounded-xl border bg-card overflow-hidden">
                        {pagination.paginatedItems.map((os) => {
                          const itemActions: ItemAction[] = [
                            {
                              key: 'view',
                              label: 'Visualizar',
                              icon: <Eye className="h-4 w-4" />,
                              onClick: () => { setViewingOsId(os.id); setViewDialogOpen(true); },
                            },
                            {
                              key: 'open-tech',
                              label: 'Abrir como técnico',
                              icon: <ExternalLink className="h-4 w-4" />,
                              onClick: () => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank'),
                            },
                            ...(canEditOS ? [{
                              key: 'edit',
                              label: 'Editar',
                              icon: <Pencil className="h-4 w-4" />,
                              variant: 'edit' as const,
                              onClick: () => handleEdit(os),
                            }] : []),
                            ...(canDeleteOS ? [{
                              key: 'delete',
                              label: 'Excluir',
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
                                  <span className="truncate">{os.customer?.name || 'N/A'}</span>
                                </div>
                              }
                              subtitle={
                                <div className="flex items-center gap-2 flex-wrap">
                                  {os.service_type && (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: os.service_type.color }} />
                                      {os.service_type.name}
                                    </span>
                                  )}
                                  {os.scheduled_date && (
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
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
                                  {getStatusLabel(os.status)}
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
                          title={searchTerm || statusFilter !== 'all' ? 'Nenhuma OS encontrada' : 'Nenhuma OS cadastrada'}
                          description={searchTerm || statusFilter !== 'all' ? 'Tente filtros diferentes' : 'Clique em "Nova OS" para começar'}
                        />
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <SortableTableHead sortKey="order_number" sortConfig={sortConfig} onSort={handleSort}>OS</SortableTableHead>
                                  <TableHead className="text-xs uppercase tracking-wider w-[40px]">Criador</TableHead>
                                  <SortableTableHead sortKey="customer.name" sortConfig={sortConfig} onSort={handleSort}>Cliente</SortableTableHead>
                                  <SortableTableHead sortKey="service_type.name" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">Tipo</SortableTableHead>
                                  <SortableTableHead sortKey="scheduled_date" sortConfig={sortConfig} onSort={handleSort} className="hidden sm:table-cell">Data</SortableTableHead>
                                  <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                                  <TableHead className="w-[100px] text-xs uppercase tracking-wider">Ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pagination.paginatedItems.map((os) => {
                                  return (
                                    <TableRow key={os.id}>
                                      <TableCell>
                                        <span className="font-mono font-medium text-sm">
                                          {getOsCode(os)}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        {(os as any).created_by_profile?.avatar_url ? (
                                          <img
                                            src={(os as any).created_by_profile.avatar_url}
                                            alt={(os as any).created_by_profile.full_name || ''}
                                            title={(os as any).created_by_profile.full_name || 'Usuário'}
                                            className="h-7 w-7 rounded-full object-cover"
                                          />
                                        ) : (
                                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground" title={(os as any).created_by_profile?.full_name || 'Usuário'}>
                                            {((os as any).created_by_profile?.full_name || '?').slice(0, 2).toUpperCase()}
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div>
                                          <p className="font-medium">{os.customer?.name || (os as any).snapshot_data?.customer?.name || 'N/A'}</p>
                                          {(os.equipment || (os as any).snapshot_data?.equipment) && (
                                            <p className="text-xs text-muted-foreground">{os.equipment?.name || (os as any).snapshot_data?.equipment?.name}</p>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="hidden md:table-cell">
                                        {os.service_type ? (
                                          <div className="flex items-center gap-2">
                                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: os.service_type.color }} />
                                            <span className="text-sm">{os.service_type.name}</span>
                                          </div>
                                        ) : (
                                          <span className="text-sm">{osTypeLabels[os.os_type]}</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="hidden sm:table-cell">
                                        {os.scheduled_date ? (
                                          <div className="flex items-center gap-1 text-sm">
                                            <Calendar className="h-3 w-3" />
                                            {format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
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
                                                {getStatusLabel(os.status)}
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
                                        <div className="flex gap-1">
                                          <Button variant="ghost" size="icon" title="Visualizar OS" onClick={() => { setViewingOsId(os.id); setViewDialogOpen(true); }}>
                                            <Eye className="h-4 w-4 text-muted-foreground" />
                                          </Button>
                                          <Button variant="ghost" size="icon" title="Abrir Questionário" onClick={() => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank')}>
                                            <ExternalLink className="h-4 w-4 text-primary" />
                                          </Button>
                                          {canEditOS && (
                                            <Button variant="edit-ghost" size="icon" onClick={() => handleEdit(os)}>
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                          )}
                                          {canDeleteOS && (
                                            <Button variant="destructive-ghost" size="icon" onClick={() => handleDeleteClick(os)}>
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </div>
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
                      OS por Status
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
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {kanbanColumns.map((col) => {
                    const columnOrders = filteredOrders.filter((os) => os.status === col.key);
                    return (
                      <div
                        key={col.key}
                        className="min-w-[280px] flex-1 flex flex-col rounded-lg border bg-muted/30"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const osId = e.dataTransfer.getData('text/plain');
                          if (osId) handleStatusChange({ id: osId } as ServiceOrder, col.key);
                        }}
                      >
                        <div className="flex items-center gap-2 p-3 border-b">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: col.color }} />
                          <span className="text-sm font-semibold">{col.label}</span>
                          <Badge variant="secondary" className="ml-auto text-xs">{columnOrders.length}</Badge>
                        </div>
                        <div className="flex-1 p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                          {columnOrders.map((os) => (
                            <Card
                              key={os.id}
                              draggable
                              onDragStart={(e) => e.dataTransfer.setData('text/plain', os.id)}
                              className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                            >
                              <CardContent className="p-3 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-xs font-medium">{getOsCode(os)}</span>
                                  <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setViewingOsId(os.id); setViewDialogOpen(true); }}>
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(os)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-sm font-medium">{os.customer?.name || 'N/A'}</p>
                                {os.service_type && (
                                  <div className="flex items-center gap-1">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: os.service_type.color }} />
                                    <span className="text-xs text-muted-foreground">{os.service_type.name}</span>
                                  </div>
                                )}
                                {os.scheduled_date && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                          {columnOrders.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma OS</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* FAB Nova OS no mobile */}
            {isMobile && canCreateOS && (
              <FABButton
                icon={<Plus className="h-5 w-5" />}
                label="OS"
                onClick={() => { setEditingOS(null); setFormOpen(true); }}
              />
            )}

            <ServiceOrderFormDialog
              open={formOpen}
              onOpenChange={setFormOpen}
              serviceOrder={editingOS}
              onSubmit={handleSubmit}
              isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
            />

            <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteMode(null); }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir OS #{osToDelete?.order_number}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {((osToDelete as any)?.recurrence_group_id || (osToDelete as any)?.contract_id) && !deleteMode
                      ? 'Esta OS faz parte de uma recorrência. O que deseja fazer?'
                      : 'Tem certeza que deseja excluir? Esta ação não pode ser desfeita.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className={((osToDelete as any)?.recurrence_group_id || (osToDelete as any)?.contract_id) && !deleteMode ? 'flex-col gap-2 sm:flex-col' : ''}>
                  {((osToDelete as any)?.recurrence_group_id || (osToDelete as any)?.contract_id) && !deleteMode ? (
                    <>
                      <Button variant="destructive" onClick={() => setDeleteMode('single')} className="w-full">
                        Excluir apenas esta
                      </Button>
                      <Button variant="destructive" onClick={() => setDeleteMode('group')} className="w-full">
                        Excluir todas da recorrência
                      </Button>
                      <AlertDialogCancel className="w-full">Cancelar</AlertDialogCancel>
                    </>
                  ) : (
                    <>
                      <AlertDialogCancel onClick={() => setDeleteMode(null)}>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Excluir
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

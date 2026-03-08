import { useState, useMemo } from 'react';
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
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { NpsDashboard } from '@/components/service-orders/NpsDashboard';
import { OsReportDashboard } from '@/components/service-orders/OsReportDashboard';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<OsStatus, { icon: any; color: string; bgColor: string }> = {
  pendente: { icon: Clock, color: 'text-white', bgColor: 'bg-warning' },
  a_caminho: { icon: AlertCircle, color: 'text-white', bgColor: 'bg-indigo-500' },
  em_andamento: { icon: AlertCircle, color: 'text-white', bgColor: 'bg-info' },
  concluida: { icon: CheckCircle2, color: 'text-white', bgColor: 'bg-success' },
  cancelada: { icon: XCircle, color: 'text-white', bgColor: 'bg-destructive' },
};

export default function ServiceOrders() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<ServiceOrder | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [osToDelete, setOsToDelete] = useState<ServiceOrder | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingOsId, setViewingOsId] = useState<string | null>(null);
  const [statusConfigOpen, setStatusConfigOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');
  const { serviceOrders, isLoading, createServiceOrder, updateServiceOrder, deleteServiceOrder } = useServiceOrders();
  const { statuses } = useOsStatuses();

  const filteredOrders = useMemo(() => {
    const dateFiltered = filterByDate(serviceOrders, 'scheduled_date');
    return dateFiltered.filter((os) => {
      const matchesSearch =
        os.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(os.order_number).includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || os.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [serviceOrders, searchTerm, statusFilter, range]);

  const pagination = useDataPagination(filteredOrders);

  const statusOptions = statuses.length
    ? statuses.map((s) => ({ key: s.key as OsStatus, label: s.label, color: s.color }))
    : (Object.keys(osStatusLabels) as OsStatus[]).map((key) => ({ key, label: osStatusLabels[key], color: '#3b82f6' }));

  const getStatusLabel = (key: string) => statusOptions.find((s) => s.key === key)?.label || osStatusLabels[key as OsStatus] || key;
  const getStatusColor = (key: string) => statusOptions.find((s) => s.key === key)?.color || '#3b82f6';

  const getOsCode = (os: ServiceOrder) => {
    const prefix = (os as any).service_type?.number_prefix || 'OS';
    const year = os.scheduled_date ? new Date(os.scheduled_date).getFullYear() : new Date(os.created_at).getFullYear();
    return `${prefix}-${year}-${String(os.order_number).padStart(4, '0')}`;
  };

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
      await deleteServiceOrder.mutateAsync(osToDelete.id);
      setOsToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleStatusChange = async (os: ServiceOrder, newStatus: OsStatus) => {
    await updateServiceOrder.mutateAsync({ id: os.id, status: newStatus });
  };

  // Kanban columns ordered by status position
  const kanbanColumns = statusOptions;

  const sidebarTabs: SettingsTab[] = [
    { value: 'orders', label: 'Ordens de Serviço', icon: ClipboardList },
    { value: 'report', label: 'Relatório', icon: BarChart3 },
    { value: 'nps', label: 'NPS e Satisfação', icon: Star },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
        <p className="text-muted-foreground">Gerencie suas ordens de serviço</p>
      </div>

      <SettingsSidebarLayout tabs={sidebarTabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'nps' && <NpsDashboard />}
        {activeTab === 'report' && <OsReportDashboard />}
        {activeTab === 'orders' && (
          <div className="space-y-6">

      <DateRangeFilter
        value={range}
        preset={preset}
        onPresetChange={setPreset}
        onRangeChange={setRange}
      />

      {/* Actions bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente ou número..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
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
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setStatusConfigOpen(true)}
            className="bg-gradient-to-b from-gray-700 to-gray-900 text-white hover:from-gray-600 hover:to-gray-800"
          >
            <Settings className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Configurações</span>
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingOS(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nova OS
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {(Object.keys(statusConfig) as OsStatus[]).map((status) => {
          const config = statusConfig[status];
          const count = serviceOrders.filter((os) => os.status === status).length;
          return (
            <Card
              key={status}
              className={`cursor-pointer transition-colors hover:bg-muted ${statusFilter === status ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">{getStatusLabel(status)}</p>
                    <p className="text-xl sm:text-2xl font-bold">{count}</p>
                  </div>
                  <div className={`rounded-full p-1.5 sm:p-2 ${config.bgColor}`}>
                    <config.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${config.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* List View */}
      {viewMode === 'list' && (
        <>
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
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-4 p-6">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="text-lg font-medium">
                    {searchTerm || statusFilter !== 'all' ? 'Nenhuma OS encontrada' : 'Nenhuma OS cadastrada'}
                  </h3>
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== 'all' ? 'Tente filtros diferentes' : 'Clique em "Nova OS" para começar'}
                  </p>
                </div>
              ) : (
                <>
                  {isMobile ? (
                    <div className="p-3 space-y-3">
                      {pagination.paginatedItems.map((os) => (
                        <Card key={os.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-medium">{getOsCode(os)}</span>
                              <Select value={os.status} onValueChange={(value) => handleStatusChange(os, value as OsStatus)}>
                                <SelectTrigger className="h-7 w-[130px] text-xs" style={{ backgroundColor: getStatusColor(os.status), color: 'white' }}>
                                  <SelectValue><span className="text-white">{getStatusLabel(os.status)}</span></SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {statusOptions.map((s) => (
                                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <p className="font-medium text-sm truncate">{os.customer?.name || 'N/A'}</p>
                            {os.equipment && <p className="text-xs text-muted-foreground truncate">{os.equipment.name}</p>}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              {os.service_type && (
                                <div className="flex items-center gap-1">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: os.service_type.color }} />
                                  <span>{os.service_type.name}</span>
                                </div>
                              )}
                              {os.scheduled_date && (
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                              )}
                            </div>
                            <div className="flex justify-end gap-1 pt-1 border-t">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setViewingOsId(os.id); setViewDialogOpen(true); }}><Eye className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank')}><ExternalLink className="h-3.5 w-3.5 text-primary" /></Button>
                              <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(os)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => { setOsToDelete(os); setDeleteDialogOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs uppercase tracking-wider">OS</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Cliente</TableHead>
                          <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider">Tipo</TableHead>
                          <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Data</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                          <TableHead className="w-[100px] text-xs uppercase tracking-wider">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagination.paginatedItems.map((os) => {
                          const status = statusConfig[os.status] || statusConfig.pendente;
                          return (
                            <TableRow key={os.id}>
                              <TableCell>
                                <span className="font-mono font-medium text-sm">
                                  {getOsCode(os)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{os.customer?.name || 'N/A'}</p>
                                  {os.equipment && (
                                    <p className="text-xs text-muted-foreground">{os.equipment.name}</p>
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
                                  <Button variant="edit-ghost" size="icon" onClick={() => handleEdit(os)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="destructive-ghost" size="icon" onClick={() => { setOsToDelete(os); setDeleteDialogOpen(true); }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
            </CardContent>
          </Card>
        </>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <>
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

      <ServiceOrderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        serviceOrder={editingOS}
        onSubmit={handleSubmit}
        isLoading={createServiceOrder.isPending || updateServiceOrder.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir OS</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a OS #{osToDelete?.order_number}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServiceOrderViewDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        serviceOrderId={viewingOsId}
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

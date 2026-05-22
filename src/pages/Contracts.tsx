import { useState, useMemo } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import {
  ScrollText,
  Plus,
  Search,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  Eye,
  Pencil,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContracts, getFrequencyLabel } from '@/hooks/useContracts';
import { ContractFormDialog } from '@/components/contracts/ContractFormDialog';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  active: { label: 'Ativo', variant: 'success' },
  paused: { label: 'Pausado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'secondary' },
};

// Hex equivalentes aos tokens semânticos — mesmo padrão de ServiceOrders.
const STATUS_HEX: Record<string, string> = {
  active: '#22c55e',     // success
  paused: '#64748b',     // muted slate
  cancelled: '#ef4444',  // destructive
  expired: '#94a3b8',    // secondary slate-400
};

export default function Contracts() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { contracts, isLoading, stats, updateContractStatus, deleteContract } = useContracts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  const filtered = useMemo(
    () =>
      contracts.filter((c) => {
        const matchesSearch =
          fuzzyIncludes(c.name, search) || fuzzyIncludes(c.customers?.name, search);
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [contracts, search, statusFilter]
  );

  const { sortedItems, sortConfig, handleSort } = useTableSort(filtered);
  const pagination = useDataPagination(sortedItems);

  const getNextOccurrence = (c: typeof contracts[0]) => {
    const next = (c.contract_occurrences || [])
      .filter((o) => o.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())[0];
    return next;
  };

  // ----------------------------------------------------------------
  // Stats para o StatCarousel mobile (chips coloridos).
  // ----------------------------------------------------------------
  const statItems = [
    {
      key: 'active',
      label: 'Contratos Ativos',
      count: stats.active,
      icon: <CheckCircle className="h-4 w-4" />,
      accentColor: '#22c55e',
      active: statusFilter === 'active',
      onClick: () => setStatusFilter(statusFilter === 'active' ? 'all' : 'active'),
    },
    {
      key: 'os_month',
      label: 'OSs Geradas (mês)',
      count: stats.osGeneratedThisMonth,
      icon: <Calendar className="h-4 w-4" />,
      accentColor: '#0ea5e9',
    },
    {
      key: 'upcoming',
      label: 'Próximas 7 dias',
      count: stats.upcomingOccurrences,
      icon: <Clock className="h-4 w-4" />,
      accentColor: '#f59e0b',
    },
    {
      key: 'expiring',
      label: 'Vencendo em 30d',
      count: stats.expiringContracts,
      icon: <AlertTriangle className="h-4 w-4" />,
      accentColor: '#ef4444',
    },
  ];

  const activeFilterCount = (search ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  // Conteúdo do FilterSheet (só status — busca fica fixa fora).
  const filterContent = (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  // ----------------------------------------------------------------
  // Helpers de render compartilhados (cor da próx. ocorrência).
  // ----------------------------------------------------------------
  const nextOccDateColor = (date?: string) => {
    if (!date) return 'text-muted-foreground';
    const daysUntil = differenceInDays(parseISO(date + 'T12:00:00'), new Date());
    if (daysUntil < 0) return 'text-destructive font-medium';
    if (daysUntil <= 7) return 'text-warning font-medium';
    return 'text-success';
  };

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24')}>
      {/* Header: mobile compacto / desktop completo com botão Novo Contrato. */}
      {isMobile ? (
        <MobilePageHeader
          title="Contratos"
          subtitle="Gerencie contratos e manutenções"
          icon={ScrollText}
        />
      ) : (
        <PageHeader
          title="Contratos"
          subtitle="Gerencie contratos recorrentes e manutenções programadas"
          icon={ScrollText}
          actions={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Contrato
            </Button>
          }
        />
      )}

      {/* Mobile: busca fixa + filtros + carrossel de KPIs. Desktop: KPIs em grid + filtros em linha. */}
      {isMobile ? (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar contrato ou cliente..."
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
          {/* Desktop KPIs — mantidos idênticos ao original. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Contratos Ativos</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-primary">{stats.active}</p>
                  )}
                </div>
                <CheckCircle className="h-8 w-8 text-primary" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">OSs Geradas (mês)</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold">{stats.osGeneratedThisMonth}</p>
                  )}
                </div>
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Próximas 7 dias</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-warning">{stats.upcomingOccurrences}</p>
                  )}
                </div>
                <Clock className="h-8 w-8 text-warning" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Vencendo em 30d</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-destructive">{stats.expiringContracts}</p>
                  )}
                </div>
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </CardContent>
            </Card>
          </div>

          {/* Desktop filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou cliente..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
                <SelectItem value="expired">Expirado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Lista: mobile nativo / desktop tabela. */}
      {isMobile ? (
        isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-12 w-12" />}
            title={search || statusFilter !== 'all' ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado'}
            description={
              search || statusFilter !== 'all'
                ? 'Tente outro termo ou filtro'
                : 'Toque em "Novo Contrato" para gerar OSs automaticamente.'
            }
          />
        ) : (
          <>
            <div className="rounded-xl border bg-card overflow-hidden">
              {pagination.paginatedItems.map((contract) => {
                const nextOcc = getNextOccurrence(contract);
                const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.active;
                const accent = STATUS_HEX[contract.status] || STATUS_HEX.active;
                const itemCount = contract.contract_items?.length || 0;
                const isActive = contract.status === 'active';

                const itemActions: ItemAction[] = [
                  {
                    key: 'view',
                    label: 'Visualizar',
                    icon: <Eye className="h-4 w-4" />,
                    onClick: () => navigate(`/contratos/${contract.id}`),
                  },
                  {
                    key: 'toggle',
                    label: isActive ? 'Pausar' : 'Retomar',
                    icon: isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />,
                    onClick: () =>
                      updateContractStatus.mutate({
                        id: contract.id,
                        status: isActive ? 'paused' : 'active',
                      }),
                  },
                  {
                    key: 'edit',
                    label: 'Editar',
                    icon: <Pencil className="h-4 w-4" />,
                    variant: 'edit' as const,
                    onClick: () => navigate(`/contratos/${contract.id}`),
                  },
                  {
                    key: 'delete',
                    label: 'Excluir',
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: 'destructive' as const,
                    onClick: () => {
                      setDeleteConfirmed(false);
                      setDeleteTarget(contract.id);
                    },
                  },
                ];

                const subtitleParts: string[] = [
                  getFrequencyLabel(contract.frequency_type, contract.frequency_value),
                  `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`,
                ];
                if (nextOcc) {
                  subtitleParts.push(
                    `Próx: ${format(parseISO(nextOcc.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy')}`
                  );
                }

                return (
                  <MobileListItem
                    key={contract.id}
                    onClick={() => navigate(`/contratos/${contract.id}`)}
                    actions={itemActions}
                    leading={
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: accent }}
                      >
                        <ScrollText className="h-5 w-5" />
                      </div>
                    }
                    title={
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{contract.name}</span>
                      </div>
                    }
                    subtitle={
                      <span className={cn('truncate', nextOcc && nextOccDateColor(nextOcc.scheduled_date))}>
                        {contract.customers?.name ? `${contract.customers.name} • ` : ''}
                        {subtitleParts.join(' • ')}
                      </span>
                    }
                    trailing={
                      <Badge variant={statusCfg.variant} className="text-[10px] px-2 py-0.5 whitespace-nowrap">
                        {statusCfg.label}
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
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ScrollText className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">
                  {search ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado'}
                </h3>
                <p className="text-muted-foreground mt-1">
                  {search
                    ? 'Tente outro termo de busca'
                    : 'Crie seu primeiro contrato para gerar OSs automaticamente.'}
                </p>
                {!search && (
                  <Button onClick={() => setDialogOpen(true)} className="mt-4 gap-2">
                    <Plus className="h-4 w-4" /> Criar Contrato
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>
                          Contrato
                        </SortableTableHead>
                        <SortableTableHead sortKey="customers.name" sortConfig={sortConfig} onSort={handleSort}>
                          Cliente
                        </SortableTableHead>
                        <SortableTableHead sortKey="frequency_type" sortConfig={sortConfig} onSort={handleSort}>
                          Frequência
                        </SortableTableHead>
                        <TableHead>Próxima OS</TableHead>
                        <TableHead className="text-center">Itens</TableHead>
                        <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                          Status
                        </SortableTableHead>
                        <TableHead className="w-[140px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.paginatedItems.map((contract) => {
                        const nextOcc = getNextOccurrence(contract);
                        const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.active;
                        const itemCount = contract.contract_items?.length || 0;

                        return (
                          <TableRow
                            key={contract.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/contratos/${contract.id}`)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
                                {contract.name}
                              </div>
                            </TableCell>
                            <TableCell>{contract.customers?.name || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {getFrequencyLabel(contract.frequency_type, contract.frequency_value)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {nextOcc ? (
                                <span className={nextOccDateColor(nextOcc.scheduled_date)}>
                                  {format(parseISO(nextOcc.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title={contract.status === 'active' ? 'Pausar' : 'Retomar'}
                                  onClick={() =>
                                    updateContractStatus.mutate({
                                      id: contract.id,
                                      status: contract.status === 'active' ? 'paused' : 'active',
                                    })
                                  }
                                >
                                  {contract.status === 'active' ? (
                                    <Pause className="h-4 w-4" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="destructive-ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setDeleteConfirmed(false);
                                    setDeleteTarget(contract.id);
                                  }}
                                >
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

      {/* FAB mobile-only — desktop usa botão inline no header. */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Novo Contrato"
          onClick={() => setDialogOpen(true)}
        />
      )}

      <ContractFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => navigate(`/contratos/${id}`)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmed(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Tem certeza? Todas as OSs, ocorrências e transações vinculadas serão excluídas.</p>
                <p className="text-sm font-medium text-destructive">Esta ação não pode ser desfeita.</p>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="delete-list-confirm"
                    checked={deleteConfirmed}
                    onCheckedChange={(v) => setDeleteConfirmed(!!v)}
                  />
                  <Label htmlFor="delete-list-confirm" className="text-sm cursor-pointer">
                    Tenho certeza que desejo excluir
                  </Label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteContract.mutate(deleteTarget);
                setDeleteTarget(null);
                setDeleteConfirmed(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

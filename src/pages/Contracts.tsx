import { useState, useMemo, useEffect } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Wind,
  Settings,
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
import { KPICard } from '@/components/dashboard/KPICard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContracts, getFrequencyLabel, getNextContractOS } from '@/hooks/useContracts';
import { useContractsHealth, type ContractHealthStatus } from '@/hooks/useContractHealth';
import { ContractFormDialog } from '@/components/contracts/ContractFormDialog';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { FilterCheckboxGroup, type FilterCheckboxOption } from '@/components/mobile/FilterCheckboxGroup';
import { ContractsFilterButton } from '@/components/contracts/ContractsFilterButton';

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

// Saúde do contrato (Onda A v1.9.0 — semáforo calculado pela view contract_health_status).
// Cores semânticas FIXAS: success=verde, warning=laranja/amarelo, destructive=vermelho.
// Tokens vivem no Badge; não usar Tailwind direto (regra `feedback_cores_acoes_padronizadas`).
const HEALTH_CONFIG: Record<
  ContractHealthStatus,
  { label: string; shortLabel: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  em_dia: { label: 'Em dia', shortLabel: 'Em dia', variant: 'success' },
  manutencao_pendente: {
    label: 'Manutenção Pendente',
    shortLabel: 'Manutenção Pendente',
    variant: 'warning',
  },
  necessita_atencao: {
    label: 'ATENÇÃO',
    shortLabel: 'ATENÇÃO',
    variant: 'destructive',
  },
};

export default function Contracts() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { contracts, isLoading, stats, updateContractStatus, deleteContract } = useContracts();
  const { healthByContractId } = useContractsHealth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  // Filtros novos da Onda A: saúde (semáforo) e tipo (PMOC / Comum / Todos).
  const [healthFilter, setHealthFilter] = useState<'all' | ContractHealthStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'pmoc' | 'common'>('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  // Suporte a `?tipo=pmoc` na URL (rota antiga /pmoc redireciona pra cá).
  // Pre-seleciona o filtro Tipo na primeira leitura e mantém sincronizado quando o
  // usuário muda o filtro pelo UI (sem deixar query string fantasma).
  useEffect(() => {
    const tipo = searchParams.get('tipo');
    if (tipo === 'pmoc' && typeFilter !== 'pmoc') {
      setTypeFilter('pmoc');
    } else if (tipo === 'comum' && typeFilter !== 'common') {
      setTypeFilter('common');
    }
    // intencional: só lê na montagem/mudança externa de query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // Mantém URL espelhando o filtro Tipo (UX: link compartilhável + back/forward).
    const current = searchParams.get('tipo');
    if (typeFilter === 'pmoc' && current !== 'pmoc') {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set('tipo', 'pmoc');
        return next;
      }, { replace: true });
    } else if (typeFilter === 'common' && current !== 'comum') {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set('tipo', 'comum');
        return next;
      }, { replace: true });
    } else if (typeFilter === 'all' && current) {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.delete('tipo');
        return next;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const filtered = useMemo(
    () =>
      contracts.filter((c) => {
        const matchesSearch =
          fuzzyIncludes(c.name, search) || fuzzyIncludes(c.customers?.name, search);
        const matchesStatus = statusFilter.length === 0 || statusFilter.includes(c.status);

        // Tipo: PMOC vs comum.
        const isPmoc = (c as any).is_pmoc === true;
        const matchesType =
          typeFilter === 'all' ||
          (typeFilter === 'pmoc' && isPmoc) ||
          (typeFilter === 'common' && !isPmoc);

        // Saúde: lookup via healthByContractId. Contratos sem entrada na view
        // (ex: pré-migration) caem em `em_dia` por padrão — semáforo nunca quebra a tela.
        const healthRow = healthByContractId[c.id];
        const health: ContractHealthStatus = healthRow?.health_status ?? 'em_dia';
        const matchesHealth = healthFilter === 'all' || health === healthFilter;

        return matchesSearch && matchesStatus && matchesType && matchesHealth;
      }),
    [contracts, search, statusFilter, typeFilter, healthFilter, healthByContractId]
  );

  // Enriquece cada contrato com campos derivados pra que `useTableSort` consiga
  // ordenar por Saúde, Próxima OS e Itens (esses dados moram em fontes externas:
  // healthByContractId e as service_orders do contrato). Sort lê via
  // getNestedValue — mantemos as chaves planas pra um lookup direto e barato.
  const sortableItems = useMemo(
    () =>
      filtered.map((c) => {
        // Próxima visita = OS ativa (não concluída/cancelada) com menor data.
        const next = getNextContractOS(c.service_orders);
        const healthRow = healthByContractId[c.id];
        const healthKey: ContractHealthStatus = healthRow?.health_status ?? 'em_dia';
        // Ordem semântica: em_dia (0) < manutencao_pendente (1) < necessita_atencao (2)
        const healthRank =
          healthKey === 'em_dia' ? 0 : healthKey === 'manutencao_pendente' ? 1 : 2;
        return {
          ...c,
          _next_occurrence_date: next?.scheduled_date ?? null,
          _health_rank: healthRank,
          _items_count: c.contract_items?.length ?? 0,
        };
      }),
    [filtered, healthByContractId],
  );

  const { sortedItems, sortConfig, handleSort } = useTableSort(sortableItems);
  const pagination = useDataPagination(sortedItems);

  // Próxima visita do contrato = OS ativa (não concluída/cancelada) com a menor
  // data agendada. Derivado de service_orders (a OS recorrente É a visita).
  const getNextOccurrence = (c: typeof contracts[0]) => getNextContractOS(c.service_orders);

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
      active: statusFilter.length === 1 && statusFilter[0] === 'active',
      onClick: () =>
        setStatusFilter(
          statusFilter.length === 1 && statusFilter[0] === 'active' ? [] : ['active']
        ),
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

  // Filtros estruturados = Status + Saúde + Tipo. Usado pelo badge do botão
  // "Filtros" do desktop (busca tem campo próprio fora do sheet).
  const structuredFilterCount =
    (statusFilter.length > 0 ? 1 : 0) +
    (healthFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0);
  // Total (inclui busca) usado pelo FilterSheet mobile, que abriga só os
  // estruturados mas mostra o agregado pra dar feedback global de "tem coisa
  // filtrada agora". Mantém comportamento herdado do mobile.
  const activeFilterCount = (search ? 1 : 0) + structuredFilterCount;
  const clearFilters = () => {
    setSearch('');
    setStatusFilter([]);
    setHealthFilter('all');
    setTypeFilter('all');
  };
  // Limpa só os filtros estruturados (preserva a busca em andamento).
  const clearStructuredFilters = () => {
    setStatusFilter([]);
    setHealthFilter('all');
    setTypeFilter('all');
  };

  // Opções pro FilterCheckboxGroup de status, com acento por hex.
  const statusOptions: FilterCheckboxOption[] = [
    { value: 'active', label: 'Ativo', color: STATUS_HEX.active },
    { value: 'paused', label: 'Pausado', color: STATUS_HEX.paused },
    { value: 'cancelled', label: 'Cancelado', color: STATUS_HEX.cancelled },
    { value: 'expired', label: 'Expirado', color: STATUS_HEX.expired },
  ];

  // Conteúdo do FilterSheet (status + saúde + tipo — busca fica fixa fora).
  const filterContent = (
    <div className="space-y-4">
      <FilterCheckboxGroup
        label="Status"
        options={statusOptions}
        selected={statusFilter}
        onChange={setStatusFilter}
        emptyLabel="Todos"
      />
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Saúde</label>
        <Select value={healthFilter} onValueChange={(v) => setHealthFilter(v as typeof healthFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="em_dia">Em dia</SelectItem>
            <SelectItem value="manutencao_pendente">Manutenção pendente</SelectItem>
            <SelectItem value="necessita_atencao">ATENÇÃO</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo</label>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pmoc">PMOC</SelectItem>
            <SelectItem value="common">Comum (não-PMOC)</SelectItem>
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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate('/configuracoes-contrato')}
                className="gap-2"
              >
                <Settings className="h-4 w-4" /> Configurações de Contrato
              </Button>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Novo Contrato
              </Button>
            </div>
          }
        />
      )}

      {/* Mobile: busca fixa + filtros + carrossel de KPIs. Desktop: KPIs em grid + filtros em linha. */}
      {isMobile ? (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
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
        </>
      ) : (
        <>

          {/* Desktop toolbar: busca + único botão "Filtros" (Sheet à direita).
              Substitui os 3 selects soltos da versão antiga — desentulha a tela
              e dá paridade com o mobile (FilterSheet). */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por nome ou cliente..."
                className="pl-10 h-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ContractsFilterButton
              statusOptions={statusOptions}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              healthFilter={healthFilter}
              onHealthChange={setHealthFilter}
              typeFilter={typeFilter}
              onTypeChange={setTypeFilter}
              activeCount={structuredFilterCount}
              onClear={clearStructuredFilters}
            />
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
            title={search || statusFilter.length > 0 ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado'}
            description={
              search || statusFilter.length > 0
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
                if (nextOcc?.scheduled_date) {
                  subtitleParts.push(
                    `Próx: ${format(parseISO(nextOcc.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy')}`
                  );
                }

                const isPmocContract = (contract as any).is_pmoc === true;
                const healthRow = healthByContractId[contract.id];
                const healthKey: ContractHealthStatus = healthRow?.health_status ?? 'em_dia';
                const healthCfg = HEALTH_CONFIG[healthKey];
                const overdueCount = healthRow?.overdue_count ?? 0;
                const healthTooltip =
                  overdueCount === 0
                    ? 'Nenhuma OS em atraso'
                    : `${overdueCount} OS${overdueCount === 1 ? '' : 's'} em atraso`;

                return (
                  <MobileListItem
                    key={contract.id}
                    onClick={() => navigate(`/contratos/${contract.id}`)}
                    actions={itemActions}
                    leading={
                      <div className="flex flex-col items-center gap-1 w-12 shrink-0">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: accent }}
                        >
                          <ScrollText className="h-5 w-5" />
                        </div>
                        <span
                          className="text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap leading-none"
                          style={{ color: accent }}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                    }
                    title={
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{contract.name}</span>
                        {isPmocContract && (
                          <Badge
                            variant="info"
                            className="text-[9px] px-1.5 py-0 h-4 gap-0.5 shrink-0"
                            title="Contrato PMOC — Lei 13.589/2018"
                          >
                            <Wind className="h-2.5 w-2.5" />
                            PMOC
                          </Badge>
                        )}
                      </div>
                    }
                    subtitle={
                      <div className="flex flex-col gap-1.5 [white-space:normal]">
                        <span className="truncate">
                          {contract.customers?.name ? `${contract.customers.name} • ` : ''}
                          {subtitleParts.join(' • ')}
                        </span>
                        <Badge
                          variant={healthCfg.variant}
                          className="self-start text-[10px] px-2 py-0.5 whitespace-nowrap"
                          title={healthTooltip}
                        >
                          {healthCfg.label}
                        </Badge>
                      </div>
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
                  <TooltipProvider delayDuration={150}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                          Status
                        </SortableTableHead>
                        <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>
                          Contrato
                        </SortableTableHead>
                        <SortableTableHead sortKey="customers.name" sortConfig={sortConfig} onSort={handleSort}>
                          Cliente
                        </SortableTableHead>
                        <SortableTableHead sortKey="frequency_type" sortConfig={sortConfig} onSort={handleSort}>
                          Frequência
                        </SortableTableHead>
                        <SortableTableHead sortKey="_health_rank" sortConfig={sortConfig} onSort={handleSort}>
                          Saúde
                        </SortableTableHead>
                        <SortableTableHead sortKey="_next_occurrence_date" sortConfig={sortConfig} onSort={handleSort}>
                          Próxima OS
                        </SortableTableHead>
                        <SortableTableHead sortKey="_items_count" sortConfig={sortConfig} onSort={handleSort} className="text-center">
                          Itens
                        </SortableTableHead>
                        <TableHead className="w-[140px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.paginatedItems.map((contract) => {
                        const nextOcc = getNextOccurrence(contract);
                        const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.active;
                        const itemCount = contract.contract_items?.length || 0;
                        const isPmocContract = (contract as any).is_pmoc === true;
                        const healthRow = healthByContractId[contract.id];
                        const healthKey: ContractHealthStatus = healthRow?.health_status ?? 'em_dia';
                        const healthCfg = HEALTH_CONFIG[healthKey];
                        const overdueCount = healthRow?.overdue_count ?? 0;
                        const healthTooltip =
                          overdueCount === 0
                            ? 'Nenhuma OS em atraso'
                            : `${overdueCount} OS${overdueCount === 1 ? '' : 's'} em atraso`;

                        return (
                          <TableRow
                            key={contract.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/contratos/${contract.id}`)}
                          >
                            <TableCell>
                              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2 min-w-0">
                                <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="truncate">{contract.name}</span>
                                {isPmocContract && (
                                  <Badge
                                    variant="info"
                                    className="text-[10px] px-1.5 py-0 h-5 gap-1 shrink-0"
                                    title="Contrato PMOC — Lei 13.589/2018"
                                  >
                                    <Wind className="h-3 w-3" />
                                    PMOC
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{contract.customers?.name || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {getFrequencyLabel(contract.frequency_type, contract.frequency_value)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-block">
                                    <Badge variant={healthCfg.variant} className="whitespace-nowrap">
                                      {healthCfg.label}
                                    </Badge>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{healthTooltip}</TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {nextOcc?.scheduled_date ? (
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
                              <div onClick={(e) => e.stopPropagation()}>
                                <RowActionsMenu
                                  actions={[
                                    {
                                      label: 'Visualizar',
                                      icon: Eye,
                                      onClick: () => navigate(`/contratos/${contract.id}`),
                                    },
                                    {
                                      label: contract.status === 'active' ? 'Pausar' : 'Retomar',
                                      icon: contract.status === 'active' ? Pause : Play,
                                      onClick: () =>
                                        updateContractStatus.mutate({
                                          id: contract.id,
                                          status: contract.status === 'active' ? 'paused' : 'active',
                                        }),
                                    },
                                    {
                                      label: 'Editar',
                                      icon: Pencil,
                                      variant: 'edit',
                                      onClick: () => navigate(`/contratos/${contract.id}`),
                                    },
                                    {
                                      label: 'Excluir',
                                      icon: Trash2,
                                      variant: 'delete',
                                      onClick: () => {
                                        setDeleteConfirmed(false);
                                        setDeleteTarget(contract.id);
                                      },
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
                  </TooltipProvider>
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
          label="Contrato"
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
                {(() => {
                  const target = contracts.find(c => c.id === deleteTarget);
                  const osCount = (target?.service_orders || []).length;
                  if (osCount === 0) return null;
                  return (
                    <p className="text-sm font-medium text-warning">
                      ⚠️ {osCount} OS{osCount > 1 ? 's vinculadas serão apagadas' : ' vinculada será apagada'} junto.
                    </p>
                  );
                })()}
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

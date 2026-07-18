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
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const STATUS_VARIANTS: Record<string, 'success' | 'outline' | 'destructive' | 'secondary'> = {
  active: 'success',
  paused: 'outline',
  cancelled: 'destructive',
  expired: 'secondary',
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
const HEALTH_VARIANTS: Record<
  ContractHealthStatus,
  { variant: 'success' | 'warning' | 'destructive' }
> = {
  em_dia: { variant: 'success' },
  manutencao_pendente: { variant: 'warning' },
  necessita_atencao: { variant: 'destructive' },
};

export default function Contracts() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pmoc.contracts;
  const { contracts, isLoading, stats, updateContractStatus, deleteContract } = useContracts();
  const { healthByContractId } = useContractsHealth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  // Filtros novos da Onda A: saúde (semáforo) e tipo (PMOC / Comum).
  // Multi-select com semântica "vazio = mostra tudo" (padrão FilterCheckboxGroup).
  const [healthFilter, setHealthFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  // Configs derivados das traduções (recalculados quando locale muda).
  const STATUS_CONFIG = useMemo(() => ({
    active: { label: t.status.active, variant: STATUS_VARIANTS.active },
    paused: { label: t.status.paused, variant: STATUS_VARIANTS.paused },
    cancelled: { label: t.status.cancelled, variant: STATUS_VARIANTS.cancelled },
    expired: { label: t.status.expired, variant: STATUS_VARIANTS.expired },
  }), [t]);

  const HEALTH_CONFIG = useMemo(() => ({
    em_dia: { label: t.health.em_dia, shortLabel: t.health.em_dia, variant: HEALTH_VARIANTS.em_dia.variant },
    manutencao_pendente: { label: t.health.manutencao_pendente, shortLabel: t.health.manutencao_pendente, variant: HEALTH_VARIANTS.manutencao_pendente.variant },
    necessita_atencao: { label: t.health.necessita_atencao, shortLabel: t.health.necessita_atencao, variant: HEALTH_VARIANTS.necessita_atencao.variant },
  }), [t]);

  // Suporte a `?tipo=pmoc` na URL (rota antiga /pmoc redireciona pra cá).
  // Pre-seleciona o filtro Tipo na primeira leitura e mantém sincronizado quando o
  // usuário muda o filtro pelo UI (sem deixar query string fantasma).
  useEffect(() => {
    const tipo = searchParams.get('tipo');
    // Deep-link filtra por um único tipo → array com o valor único.
    if (tipo === 'pmoc' && !(typeFilter.length === 1 && typeFilter[0] === 'pmoc')) {
      setTypeFilter(['pmoc']);
    } else if (tipo === 'comum' && !(typeFilter.length === 1 && typeFilter[0] === 'common')) {
      setTypeFilter(['common']);
    }
    // intencional: só lê na montagem/mudança externa de query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // Mantém URL espelhando o filtro Tipo (UX: link compartilhável + back/forward).
    // Só espelha quando há exatamente um tipo marcado (deep-link é single-valor).
    const current = searchParams.get('tipo');
    const onlyPmoc = typeFilter.length === 1 && typeFilter[0] === 'pmoc';
    const onlyCommon = typeFilter.length === 1 && typeFilter[0] === 'common';
    if (onlyPmoc && current !== 'pmoc') {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set('tipo', 'pmoc');
        return next;
      }, { replace: true });
    } else if (onlyCommon && current !== 'comum') {
      setSearchParams((p) => {
        const next = new URLSearchParams(p);
        next.set('tipo', 'comum');
        return next;
      }, { replace: true });
    } else if (!onlyPmoc && !onlyCommon && current) {
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

        // Tipo: PMOC vs comum. Vazio = mostra tudo.
        const isPmoc = (c as any).is_pmoc === true;
        const matchesType =
          typeFilter.length === 0 ||
          (typeFilter.includes('pmoc') && isPmoc) ||
          (typeFilter.includes('common') && !isPmoc);

        // Saúde: lookup via healthByContractId. Contratos sem entrada na view
        // (ex: pré-migration) caem em `em_dia` por padrão — semáforo nunca quebra a tela.
        // Vazio = mostra tudo.
        const healthRow = healthByContractId[c.id];
        const health: ContractHealthStatus = healthRow?.health_status ?? 'em_dia';
        const matchesHealth = healthFilter.length === 0 || healthFilter.includes(health);

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
  const statItems = useMemo(() => [
    {
      key: 'active',
      label: t.kpi.active,
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
      label: t.kpi.osMonth,
      count: stats.osGeneratedThisMonth,
      icon: <Calendar className="h-4 w-4" />,
      accentColor: '#0ea5e9',
    },
    {
      key: 'upcoming',
      label: t.kpi.upcoming,
      count: stats.upcomingOccurrences,
      icon: <Clock className="h-4 w-4" />,
      accentColor: '#f59e0b',
    },
    {
      key: 'expiring',
      label: t.kpi.expiring,
      count: stats.expiringContracts,
      icon: <AlertTriangle className="h-4 w-4" />,
      accentColor: '#ef4444',
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, stats, statusFilter]);

  // Filtros estruturados = Status + Saúde + Tipo. Usado pelo badge do botão
  // "Filtros" do desktop (busca tem campo próprio fora do sheet).
  const structuredFilterCount =
    (statusFilter.length > 0 ? 1 : 0) +
    (healthFilter.length > 0 ? 1 : 0) +
    (typeFilter.length > 0 ? 1 : 0);
  // Total (inclui busca) usado pelo FilterSheet mobile, que abriga só os
  // estruturados mas mostra o agregado pra dar feedback global de "tem coisa
  // filtrada agora". Mantém comportamento herdado do mobile.
  const activeFilterCount = (search ? 1 : 0) + structuredFilterCount;
  const clearFilters = () => {
    setSearch('');
    setStatusFilter([]);
    setHealthFilter([]);
    setTypeFilter([]);
  };
  // Limpa só os filtros estruturados (preserva a busca em andamento).
  const clearStructuredFilters = () => {
    setStatusFilter([]);
    setHealthFilter([]);
    setTypeFilter([]);
  };

  // Opções pro FilterCheckboxGroup de status, com acento por hex.
  const statusOptions: FilterCheckboxOption[] = useMemo(() => [
    { value: 'active', label: t.status.active, color: STATUS_HEX.active },
    { value: 'paused', label: t.status.paused, color: STATUS_HEX.paused },
    { value: 'cancelled', label: t.status.cancelled, color: STATUS_HEX.cancelled },
    { value: 'expired', label: t.status.expired, color: STATUS_HEX.expired },
  ], [t]);

  // Opções de Saúde e Tipo (multi-select, "vazio = mostra tudo").
  const healthOptions: FilterCheckboxOption[] = useMemo(() => [
    { value: 'em_dia', label: t.health.em_dia },
    { value: 'manutencao_pendente', label: t.health.manutencao_pendente },
    { value: 'necessita_atencao', label: t.health.necessita_atencao },
  ], [t]);
  const typeOptions: FilterCheckboxOption[] = useMemo(() => [
    { value: 'pmoc', label: t.type.pmoc },
    { value: 'common', label: t.type.common },
  ], [t]);

  // Conteúdo do FilterSheet (status + saúde + tipo — busca fica fixa fora).
  const filterContent = (
    <div className="space-y-4">
      <FilterCheckboxGroup
        label={t.filterLabels.status}
        options={statusOptions}
        selected={statusFilter}
        onChange={setStatusFilter}
        emptyLabel={t.filterLabels.allStatus}
      />
      <FilterCheckboxGroup
        label={t.filterLabels.health}
        options={healthOptions}
        selected={healthFilter}
        onChange={setHealthFilter}
        emptyLabel={t.filterLabels.allHealth}
      />
      <FilterCheckboxGroup
        label={t.filterLabels.type}
        options={typeOptions}
        selected={typeFilter}
        onChange={setTypeFilter}
        emptyLabel={t.filterLabels.allType}
      />
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
          title={t.title}
          subtitle={t.subtitle}
          icon={ScrollText}
          actions={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.contractSettings}
              onClick={() => navigate('/configuracoes-contrato')}
            >
              <Settings className="h-5 w-5" />
            </Button>
          }
        />
      ) : (
        <PageHeader
          title={t.title}
          subtitle={t.subtitleDesktop}
          icon={ScrollText}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate('/configuracoes-contrato')}
                className="gap-2"
              >
                <Settings className="h-4 w-4" /> {t.contractSettings}
              </Button>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> {t.newContract}
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
                placeholder={t.searchPlaceholderMobile}
                className="pl-10 h-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterSheet
              triggerLabel={t.filters}
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
                placeholder={t.searchPlaceholder}
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
            title={search || statusFilter.length > 0 ? t.emptySearchTitle : t.emptyNoneTitle}
            description={
              search || statusFilter.length > 0
                ? t.emptySearchDesc
                : t.emptyNoneDesc
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
                    label: t.actions.view,
                    icon: <Eye className="h-4 w-4" />,
                    onClick: () => navigate(`/contratos/${contract.id}`),
                  },
                  {
                    key: 'toggle',
                    label: isActive ? t.actions.pause : t.actions.resume,
                    icon: isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />,
                    onClick: () =>
                      updateContractStatus.mutate({
                        id: contract.id,
                        status: isActive ? 'paused' : 'active',
                      }),
                  },
                  {
                    key: 'edit',
                    label: t.actions.edit,
                    icon: <Pencil className="h-4 w-4" />,
                    variant: 'edit' as const,
                    onClick: () => navigate(`/contratos/${contract.id}`),
                  },
                  {
                    key: 'delete',
                    label: t.actions.delete,
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
                  `${itemCount} ${itemCount === 1 ? t.itemSingular : t.itemPlural}`,
                ];
                if (nextOcc?.scheduled_date) {
                  subtitleParts.push(
                    `${t.nextPrefix}: ${format(parseISO(nextOcc.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy')}`
                  );
                }

                const isPmocContract = (contract as any).is_pmoc === true;
                // "Acabando" = ativo e a última visita (maior scheduled_date)
                // está a ≤30 dias de hoje (ou já passou). Sinal pra renovar.
                const isEndingSoon = (() => {
                  if (!isActive) return false;
                  const lastDated = (contract.service_orders || [])
                    .map((o) => o.scheduled_date)
                    .filter((d): d is string => !!d)
                    .sort()
                    .pop();
                  if (!lastDated) return false;
                  const last = parseISO(lastDated + 'T12:00:00');
                  last.setHours(0, 0, 0, 0);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const in30 = new Date(today);
                  in30.setDate(in30.getDate() + 30);
                  return last <= in30;
                })();
                const healthRow = healthByContractId[contract.id];
                const healthKey: ContractHealthStatus = healthRow?.health_status ?? 'em_dia';
                const healthCfg = HEALTH_CONFIG[healthKey];
                const overdueCount = healthRow?.overdue_count ?? 0;
                const healthTooltip =
                  overdueCount === 0
                    ? t.noOsOverdue
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={healthCfg.variant}
                            className="self-start text-[10px] px-2 py-0.5 whitespace-nowrap"
                            title={healthTooltip}
                          >
                            {healthCfg.label}
                          </Badge>
                          {isEndingSoon && (
                            <Badge
                              variant="warning"
                              className="self-start text-[10px] px-2 py-0.5 whitespace-nowrap"
                              title="Última visita em ≤30 dias — renovar?"
                            >
                              {t.ending}
                            </Badge>
                          )}
                        </div>
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
              <EmptyState
                icon={<ScrollText className="h-12 w-12" />}
                title={
                  search || structuredFilterCount > 0
                    ? t.emptySearchTitle
                    : t.emptyNoneTitle
                }
                description={
                  search || structuredFilterCount > 0
                    ? t.emptyNoneDescFilter
                    : t.emptyNoneDescDesktop
                }
                action={
                  search || structuredFilterCount > 0
                    ? undefined
                    : { label: t.emptyNoneAction, onClick: () => setDialogOpen(true) }
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <TooltipProvider delayDuration={150}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                          {t.col.status}
                        </SortableTableHead>
                        <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>
                          {t.col.contract}
                        </SortableTableHead>
                        <SortableTableHead sortKey="customers.name" sortConfig={sortConfig} onSort={handleSort}>
                          {t.col.customer}
                        </SortableTableHead>
                        <SortableTableHead sortKey="frequency_type" sortConfig={sortConfig} onSort={handleSort}>
                          {t.col.frequency}
                        </SortableTableHead>
                        <SortableTableHead sortKey="_health_rank" sortConfig={sortConfig} onSort={handleSort}>
                          {t.col.health}
                        </SortableTableHead>
                        <SortableTableHead sortKey="_next_occurrence_date" sortConfig={sortConfig} onSort={handleSort}>
                          {t.col.nextOs}
                        </SortableTableHead>
                        <SortableTableHead sortKey="_items_count" sortConfig={sortConfig} onSort={handleSort} className="text-center">
                          {t.col.items}
                        </SortableTableHead>
                        <TableHead className="w-[140px]">{t.col.actions}</TableHead>
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
                            ? t.noOsOverdue
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
                              {itemCount} {itemCount === 1 ? t.itemSingular : t.itemPlural}
                            </TableCell>
                            <TableCell>
                              <div onClick={(e) => e.stopPropagation()}>
                                <RowActionsMenu
                                  actions={[
                                    {
                                      label: t.actions.view,
                                      icon: Eye,
                                      onClick: () => navigate(`/contratos/${contract.id}`),
                                    },
                                    {
                                      label: contract.status === 'active' ? t.actions.pause : t.actions.resume,
                                      icon: contract.status === 'active' ? Pause : Play,
                                      onClick: () =>
                                        updateContractStatus.mutate({
                                          id: contract.id,
                                          status: contract.status === 'active' ? 'paused' : 'active',
                                        }),
                                    },
                                    {
                                      label: t.actions.edit,
                                      icon: Pencil,
                                      variant: 'edit',
                                      onClick: () => navigate(`/contratos/${contract.id}`),
                                    },
                                    {
                                      label: t.actions.delete,
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
          label={t.newContractShort}
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
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t.deleteDesc}</p>
                {(() => {
                  const target = contracts.find(c => c.id === deleteTarget);
                  const osCount = (target?.service_orders || []).length;
                  if (osCount === 0) return null;
                  return (
                    <p className="text-sm font-medium text-warning">
                      ⚠️ {osCount} {osCount > 1 ? t.deleteOsWarning_other : t.deleteOsWarning_one}
                    </p>
                  );
                })()}
                <p className="text-sm font-medium text-destructive">{t.deleteIrreversible}</p>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="delete-list-confirm"
                    checked={deleteConfirmed}
                    onCheckedChange={(v) => setDeleteConfirmed(!!v)}
                  />
                  <Label htmlFor="delete-list-confirm" className="text-sm cursor-pointer">
                    {t.deleteCheckLabel}
                  </Label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteCancelBtn}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteContract.mutate(deleteTarget);
                setDeleteTarget(null);
                setDeleteConfirmed(false);
              }}
            >
              {t.deleteConfirmBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

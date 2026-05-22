import { useState } from 'react';
import { fuzzyIncludes } from '@/lib/utils';
import {
  FileText, Plus, Search, Calendar, DollarSign, CheckCircle, XCircle, Edit, Trash2, Pause,
  ClipboardList, CalendarClock, ExternalLink, ScrollText, CalendarPlus, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePmocPlans, type PmocPlan } from '@/hooks/usePmocPlans';
import { usePmocContracts, type PmocContract } from '@/hooks/usePmocContracts';
import { PmocPlanFormDialog } from '@/components/pmoc/PmocPlanFormDialog';
import { PmocContractFormDialog } from '@/components/pmoc/PmocContractFormDialog';
import { PmocPostponeDialog } from '@/components/pmoc/PmocPostponeDialog';
import type { PmocGeneratedOs } from '@/hooks/usePmocPlans';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { format, addMonths, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

const FREQ_LABELS: Record<number, string> = { 1: 'Mensal', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };
const CONTRACT_FREQ: Record<string, string> = { mensal: 'Mensal', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

type Section = 'planos' | 'contratos' | 'cronograma';

const SECTIONS: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: 'planos', label: 'Planos', icon: ClipboardList },
  { key: 'contratos', label: 'Contratos', icon: ScrollText },
  { key: 'cronograma', label: 'Cronograma', icon: CalendarClock },
];

export default function PMOC() {
  const isMobile = useIsMobile();
  const { plans, isLoading: plansLoading, stats: planStats, deletePlan } = usePmocPlans();
  const { contracts, isLoading: contractsLoading, stats: contractStats, deleteContract } = usePmocContracts();
  const { deleteServiceOrder } = useServiceOrders();

  const [activeSection, setActiveSection] = useState<Section>('planos');
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PmocPlan | null>(null);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<PmocContract | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteFutureOsDialog, setDeleteFutureOsDialog] = useState<PmocPlan | null>(null);
  const [deletingFutureOs, setDeletingFutureOs] = useState(false);
  const [postponeData, setPostponeData] = useState<{ plan: PmocPlan; os: PmocGeneratedOs } | null>(null);
  const [planToDelete, setPlanToDelete] = useState<PmocPlan | null>(null);
  const [contractToDelete, setContractToDelete] = useState<PmocContract | null>(null);

  const filteredPlans = plans.filter(p =>
    fuzzyIncludes(p.name, searchQuery) ||
    fuzzyIncludes(p.customers?.name, searchQuery)
  );
  const { sortedItems: sortedPlans, sortConfig: planSortConfig, handleSort: handlePlanSort } = useTableSort(filteredPlans);

  const filteredContracts = contracts.filter(c =>
    fuzzyIncludes(c.customers?.name, searchQuery) ||
    fuzzyIncludes(c.contract_number, searchQuery)
  );
  const { sortedItems: sortedContracts, sortConfig: contractSortConfig, handleSort: handleContractSort } = useTableSort(filteredContracts);

  // Timeline from active plans
  const timeline = plans
    .filter(p => p.status === 'ativo')
    .flatMap(p => {
      const entries = [];
      let date = new Date(p.next_generation_date);
      for (let i = 0; i < 12; i++) {
        entries.push({
          planId: p.id,
          planName: p.name,
          customerName: p.customers?.name || '',
          date: new Date(date),
          equipmentCount: p.pmoc_items?.filter(i => i.equipment?.status === 'active').length || 0,
        });
        date = addMonths(date, p.frequency_months);
      }
      return entries;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Generated OS history
  const generatedHistory = plans
    .flatMap(p => (p.pmoc_generated_os || []).map(g => ({ ...g, planName: p.name, customerName: p.customers?.name })))
    .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());

  const handleDeleteFutureOs = async (plan: PmocPlan) => {
    setDeletingFutureOs(true);
    try {
      const futureOs = (plan.pmoc_generated_os || []).filter(g => {
        const osStatus = g.service_orders?.status;
        return osStatus === 'pendente' && new Date(g.scheduled_for) > new Date();
      });
      for (const os of futureOs) {
        await deleteServiceOrder.mutateAsync(os.service_order_id);
      }
      setDeleteFutureOsDialog(null);
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingFutureOs(false);
    }
  };

  const futureOsCount = (plan: PmocPlan) => {
    return (plan.pmoc_generated_os || []).filter(g => {
      return g.service_orders?.status === 'pendente' && new Date(g.scheduled_for) > new Date();
    }).length;
  };

  // ------------------------------------------------------------------------
  // Stat items (KPIs) — usados no StatCarousel mobile e grid desktop.
  // ------------------------------------------------------------------------
  const statItems = [
    {
      key: 'total',
      label: 'Planos',
      count: planStats.total,
      icon: <ClipboardList className="h-4 w-4" />,
      accentColor: 'hsl(var(--primary))',
    },
    {
      key: 'active',
      label: 'Ativos',
      count: planStats.active,
      icon: <CheckCircle className="h-4 w-4" />,
      accentColor: '#22c55e',
    },
    {
      key: 'paused',
      label: 'Pausados',
      count: planStats.paused,
      icon: <Pause className="h-4 w-4" />,
      accentColor: '#64748b',
    },
  ];

  // KPI desktop tem o card de Receita Mensal (string formatada) — mantém separado.
  // Mobile mostra essa info no header da seção de Contratos pra não quebrar o StatCarousel (que espera number).

  // Botão criar muda conforme seção ativa.
  const fabAction = activeSection === 'contratos'
    ? () => { setEditingContract(null); setContractDialogOpen(true); }
    : () => { setEditingPlan(null); setPlanDialogOpen(true); };
  const fabLabel = activeSection === 'contratos' ? 'Novo Contrato' : 'Novo Plano';

  // ------------------------------------------------------------------------
  // Renderers de lista mobile
  // ------------------------------------------------------------------------
  const renderMobilePlans = () => {
    if (plansLoading) {
      return (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      );
    }
    if (filteredPlans.length === 0) {
      return (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title={searchQuery ? 'Nenhum plano encontrado' : 'Nenhum plano cadastrado'}
          description={searchQuery ? 'Tente outro termo de busca' : 'Toque em "Novo Plano" para começar'}
        />
      );
    }
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        {sortedPlans.map((plan) => {
          const isOverdue = isBefore(new Date(plan.next_generation_date), new Date()) && plan.status === 'ativo';
          const futureCount = futureOsCount(plan);
          const equipmentCount = plan.pmoc_items?.filter(i => i.equipment?.status === 'active').length || 0;
          const freqLabel = FREQ_LABELS[plan.frequency_months] || `${plan.frequency_months} meses`;
          const nextDate = format(new Date(plan.next_generation_date), 'dd/MM/yyyy', { locale: ptBR });

          const actions: ItemAction[] = [
            {
              key: 'edit',
              label: 'Editar',
              icon: <Edit className="h-4 w-4" />,
              variant: 'edit' as const,
              onClick: () => { setEditingPlan(plan); setPlanDialogOpen(true); },
            },
            ...(futureCount > 0
              ? [{
                  key: 'delete-future',
                  label: 'Excluir OSs futuras',
                  icon: <XCircle className="h-4 w-4" />,
                  onClick: () => setDeleteFutureOsDialog(plan),
                }]
              : []),
            {
              key: 'delete',
              label: 'Excluir plano',
              icon: <Trash2 className="h-4 w-4" />,
              variant: 'destructive' as const,
              onClick: () => setPlanToDelete(plan),
            },
          ];

          return (
            <MobileListItem
              key={plan.id}
              actions={actions}
              leading={
                <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <ClipboardList className="h-5 w-5" />
                </div>
              }
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{plan.name}</span>
                  <Badge
                    variant={plan.status === 'ativo' ? 'success' : 'outline'}
                    className="text-[10px] px-1.5 py-0 shrink-0"
                  >
                    {plan.status === 'ativo' ? 'Ativo' : 'Pausado'}
                  </Badge>
                </span>
              }
              subtitle={
                <span className="flex items-center gap-1">
                  <span className="truncate">{plan.customers?.name || 'Sem cliente'}</span>
                  <span>•</span>
                  <span className="shrink-0">{freqLabel}</span>
                  <span>•</span>
                  <span className={cn('shrink-0', isOverdue && 'text-destructive font-medium')}>
                    {nextDate}
                  </span>
                </span>
              }
              trailing={
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {equipmentCount} equip.
                </Badge>
              }
            />
          );
        })}
      </div>
    );
  };

  const renderMobileContracts = () => {
    if (contractsLoading) {
      return (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      );
    }
    if (filteredContracts.length === 0) {
      return (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title={searchQuery ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado'}
          description={searchQuery ? 'Tente outro termo de busca' : 'Cadastre contratos para o aspecto financeiro do PMOC'}
        />
      );
    }
    return (
      <>
        {/* Card resumo de receita mensal — só mobile, já que StatCarousel só aceita number. */}
        <div className="mb-3 rounded-xl border bg-card p-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Receita Mensal</p>
            {contractsLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-lg font-bold text-primary">{formatCurrency(contractStats.totalMonthlyValue)}</p>
            )}
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          {sortedContracts.map((contract) => {
            const freqLabel = CONTRACT_FREQ[contract.maintenance_frequency || ''] || contract.maintenance_frequency || '—';
            const period = `${format(new Date(contract.start_date), 'dd/MM/yy', { locale: ptBR })} – ${format(new Date(contract.end_date), 'dd/MM/yy', { locale: ptBR })}`;

            const actions: ItemAction[] = [
              {
                key: 'edit',
                label: 'Editar',
                icon: <Edit className="h-4 w-4" />,
                variant: 'edit' as const,
                onClick: () => { setEditingContract(contract); setContractDialogOpen(true); },
              },
              {
                key: 'delete',
                label: 'Excluir contrato',
                icon: <Trash2 className="h-4 w-4" />,
                variant: 'destructive' as const,
                onClick: () => setContractToDelete(contract),
              },
            ];

            return (
              <MobileListItem
                key={contract.id}
                actions={actions}
                leading={
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <ScrollText className="h-5 w-5" />
                  </div>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{contract.customers?.name || 'Sem cliente'}</span>
                    <Badge
                      variant={contract.is_active ? 'success' : 'outline'}
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {contract.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </span>
                }
                subtitle={
                  <span className="flex items-center gap-1">
                    <span className="truncate">{contract.contract_number || 'Sem nº'}</span>
                    <span>•</span>
                    <span className="shrink-0">{freqLabel}</span>
                    <span>•</span>
                    <span className="shrink-0">{period}</span>
                  </span>
                }
                trailing={
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {contract.monthly_value ? formatCurrency(contract.monthly_value) : '—'}
                  </Badge>
                }
              />
            );
          })}
        </div>
      </>
    );
  };

  const renderMobileCronograma = () => (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Próximas Gerações</h3>
        </div>
        {timeline.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8 px-4">
            Nenhum plano ativo para exibir cronograma.
          </p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-border/60">
            {timeline.slice(0, 24).map((entry, i) => {
              const isPast = isBefore(entry.date, new Date());
              return (
                <div
                  key={`${entry.planId}-${i}`}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    isPast && 'bg-destructive/5'
                  )}
                >
                  <div className={cn(
                    'text-center min-w-[48px] shrink-0',
                    isPast ? 'text-destructive' : 'text-foreground'
                  )}>
                    <p className="text-base font-bold leading-none">{format(entry.date, 'dd')}</p>
                    <p className="text-[10px] uppercase mt-0.5">{format(entry.date, 'MMM/yy', { locale: ptBR })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entry.planName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.customerName} • {entry.equipmentCount} equip.
                    </p>
                  </div>
                  {isPast && (
                    <Badge variant="destructive" className="text-[10px] shrink-0">
                      Atrasado
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {generatedHistory.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Histórico de OS Geradas</h3>
          </div>
          <div className="max-h-[320px] overflow-y-auto divide-y divide-border/60">
            {generatedHistory.slice(0, 20).map((g) => {
              const isPending = g.service_orders?.status === 'pendente';
              const parentPlan = plans.find(p => p.id === g.plan_id);

              const actions: ItemAction[] = [
                {
                  key: 'open',
                  label: 'Abrir OS',
                  icon: <Eye className="h-4 w-4" />,
                  onClick: () => window.open(`/os-tecnico/${g.service_order_id}`, '_blank', 'noopener,noreferrer'),
                },
                ...(isPending && parentPlan
                  ? [{
                      key: 'postpone',
                      label: 'Adiar OS',
                      icon: <CalendarPlus className="h-4 w-4" />,
                      onClick: () => setPostponeData({ plan: parentPlan, os: g }),
                    }]
                  : []),
              ];

              return (
                <MobileListItem
                  key={g.id}
                  actions={actions}
                  leading={
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <FileText className="h-5 w-5" />
                    </div>
                  }
                  title={g.planName}
                  subtitle={
                    <span>
                      {g.customerName} • {format(new Date(g.scheduled_for), 'dd/MM/yyyy')}
                    </span>
                  }
                  trailing={
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      OS #{g.service_orders?.order_number || '?'}
                    </Badge>
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ========================================================================
  // MOBILE LAYOUT
  // ========================================================================
  if (isMobile) {
    return (
      <div className="space-y-4 pb-24">
        <MobilePageHeader
          title="PMOC"
          subtitle="Plano de Manutenção, Operação e Controle"
          icon={ClipboardList}
        />

        {/* KPIs em carrossel */}
        <StatCarousel items={statItems} loading={plansLoading} />

        {/* Seção atual (segmented control via Select) */}
        <Select value={activeSection} onValueChange={(v) => setActiveSection(v as Section)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map(({ key, label }) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Busca — só nas seções Planos e Contratos */}
        {activeSection !== 'cronograma' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={activeSection === 'planos' ? 'Buscar plano ou cliente...' : 'Buscar contrato ou cliente...'}
              className="pl-10 h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Conteúdo */}
        {activeSection === 'planos' && renderMobilePlans()}
        {activeSection === 'contratos' && renderMobileContracts()}
        {activeSection === 'cronograma' && renderMobileCronograma()}

        {/* FAB — só nas seções de listagem (planos/contratos). Cronograma não cria. */}
        {activeSection !== 'cronograma' && (
          <FABButton
            icon={<Plus className="h-5 w-5" />}
            label={fabLabel}
            onClick={fabAction}
          />
        )}

        {/* Dialogs compartilhados */}
        <PmocPlanFormDialog open={planDialogOpen} onOpenChange={setPlanDialogOpen} plan={editingPlan} />
        <PmocContractFormDialog open={contractDialogOpen} onOpenChange={setContractDialogOpen} contract={editingContract} />
        {postponeData && (
          <PmocPostponeDialog
            open={!!postponeData}
            onOpenChange={(open) => !open && setPostponeData(null)}
            plan={postponeData.plan}
            generatedOs={postponeData.os}
          />
        )}

        {/* Excluir plano */}
        <AlertDialog open={!!planToDelete} onOpenChange={(open) => !open && setPlanToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir plano PMOC</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o plano "{planToDelete?.name}"? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (planToDelete) deletePlan.mutate(planToDelete.id);
                  setPlanToDelete(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Excluir contrato */}
        <AlertDialog open={!!contractToDelete} onOpenChange={(open) => !open && setContractToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir contrato PMOC</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o contrato "{contractToDelete?.contract_number || 'sem número'}"?
                Todas as OSs vinculadas serão excluídas. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (contractToDelete) deleteContract.mutate(contractToDelete.id);
                  setContractToDelete(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Excluir OSs futuras */}
        <AlertDialog open={!!deleteFutureOsDialog} onOpenChange={() => setDeleteFutureOsDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir OSs futuras</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir todas as OSs pendentes futuras do plano "{deleteFutureOsDialog?.name}"?
                ({deleteFutureOsDialog ? futureOsCount(deleteFutureOsDialog) : 0} OSs serão excluídas)
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletingFutureOs}
                onClick={() => deleteFutureOsDialog && handleDeleteFutureOs(deleteFutureOsDialog)}
              >
                {deletingFutureOs ? 'Excluindo...' : 'Excluir OSs'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ========================================================================
  // DESKTOP LAYOUT — inalterado em estrutura visual.
  // ========================================================================
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestão de PMOC</h1>
          <p className="text-muted-foreground">Plano de Manutenção, Operação e Controle</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Planos</p>
                {plansLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold">{planStats.total}</p>}
              </div>
              <ClipboardList className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-success/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ativos</p>
                {plansLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold text-success">{planStats.active}</p>}
              </div>
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pausados</p>
                {plansLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold">{planStats.paused}</p>}
              </div>
              <Pause className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Receita Mensal</p>
                {contractsLoading ? <Skeleton className="h-8 w-20 mt-1" /> : <p className="text-2xl font-bold text-primary">{formatCurrency(contractStats.totalMonthlyValue)}</p>}
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar + Content layout */}
      <div className="flex gap-6">
        {/* Vertical sidebar */}
        <nav className="flex flex-col gap-1 w-48 shrink-0">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                activeSection === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* ===== PLANOS ===== */}
          {activeSection === 'planos' && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar por nome ou cliente..." className="pl-10" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>
                <Button onClick={() => { setEditingPlan(null); setPlanDialogOpen(true); }} className="gap-2">
                  <Plus className="h-4 w-4" /> Novo Plano
                </Button>
              </div>

              <Card>
                <CardContent className="p-0">
                  {plansLoading ? (
                    <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : filteredPlans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground" />
                      <h3 className="text-lg font-medium">{searchQuery ? 'Nenhum plano encontrado' : 'Nenhum plano'}</h3>
                      <p className="text-muted-foreground">{searchQuery ? 'Tente outro termo' : 'Crie um plano PMOC para gerar OS automaticamente'}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableTableHead sortKey="name" sortConfig={planSortConfig} onSort={handlePlanSort}>Nome</SortableTableHead>
                            <SortableTableHead sortKey="customers.name" sortConfig={planSortConfig} onSort={handlePlanSort}>Cliente</SortableTableHead>
                            <SortableTableHead sortKey="frequency_months" sortConfig={planSortConfig} onSort={handlePlanSort}>Frequência</SortableTableHead>
                            <SortableTableHead sortKey="next_generation_date" sortConfig={planSortConfig} onSort={handlePlanSort}>Próxima Geração</SortableTableHead>
                            <SortableTableHead sortKey="" sortConfig={planSortConfig} onSort={() => {}} className="text-center">Equipamentos</SortableTableHead>
                            <SortableTableHead sortKey="status" sortConfig={planSortConfig} onSort={handlePlanSort}>Status</SortableTableHead>
                            <SortableTableHead sortKey="" sortConfig={planSortConfig} onSort={() => {}} className="w-[140px]">Ações</SortableTableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedPlans.map(plan => {
                            const isOverdue = isBefore(new Date(plan.next_generation_date), new Date()) && plan.status === 'ativo';
                            const futureCount = futureOsCount(plan);
                            return (
                              <TableRow key={plan.id}>
                                <TableCell className="font-medium">{plan.name}</TableCell>
                                <TableCell>{plan.customers?.name || '-'}</TableCell>
                                <TableCell><Badge variant="secondary">{FREQ_LABELS[plan.frequency_months] || `${plan.frequency_months} meses`}</Badge></TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-sm">
                                    <CalendarClock className={`h-3.5 w-3.5 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`} />
                                    <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                                      {format(new Date(plan.next_generation_date), 'dd/MM/yyyy', { locale: ptBR })}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">{plan.pmoc_items?.filter(i => i.equipment?.status === 'active').length || 0}</TableCell>
                                <TableCell>
                                  <Badge variant={plan.status === 'ativo' ? 'success' : 'outline'}>
                                    {plan.status === 'ativo' ? 'Ativo' : 'Pausado'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <Button variant="edit-ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingPlan(plan); setPlanDialogOpen(true); }}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    {futureCount > 0 && (
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-warning hover:text-warning" title="Excluir OSs futuras" onClick={() => setDeleteFutureOsDialog(plan)}>
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button variant="destructive-ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm('Excluir este plano?')) deletePlan.mutate(plan.id); }}>
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
                </CardContent>
              </Card>
            </>
          )}

          {/* ===== CONTRATOS ===== */}
          {activeSection === 'contratos' && (
            <>
              <div className="flex justify-end">
                <Button onClick={() => { setEditingContract(null); setContractDialogOpen(true); }} className="gap-2">
                  <Plus className="h-4 w-4" /> Novo Contrato
                </Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  {contractsLoading ? (
                    <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                  ) : filteredContracts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                      <h3 className="text-lg font-medium">Nenhum contrato</h3>
                      <p className="text-muted-foreground">Cadastre contratos para o aspecto financeiro do PMOC</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableTableHead sortKey="customers.name" sortConfig={contractSortConfig} onSort={handleContractSort}>Cliente</SortableTableHead>
                            <SortableTableHead sortKey="contract_number" sortConfig={contractSortConfig} onSort={handleContractSort}>Nº Contrato</SortableTableHead>
                            <SortableTableHead sortKey="start_date" sortConfig={contractSortConfig} onSort={handleContractSort}>Período</SortableTableHead>
                            <SortableTableHead sortKey="maintenance_frequency" sortConfig={contractSortConfig} onSort={handleContractSort}>Frequência</SortableTableHead>
                            <SortableTableHead sortKey="monthly_value" sortConfig={contractSortConfig} onSort={handleContractSort} className="text-right">Valor Mensal</SortableTableHead>
                            <SortableTableHead sortKey="is_active" sortConfig={contractSortConfig} onSort={handleContractSort}>Status</SortableTableHead>
                            <SortableTableHead sortKey="" sortConfig={contractSortConfig} onSort={() => {}} className="w-[100px]">Ações</SortableTableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedContracts.map(contract => (
                            <TableRow key={contract.id}>
                              <TableCell className="font-medium">{contract.customers?.name || '-'}</TableCell>
                              <TableCell className="text-muted-foreground">{contract.contract_number || '-'}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 text-sm">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  {format(new Date(contract.start_date), 'dd/MM/yy', { locale: ptBR })} - {format(new Date(contract.end_date), 'dd/MM/yy', { locale: ptBR })}
                                </div>
                              </TableCell>
                              <TableCell><Badge variant="secondary">{CONTRACT_FREQ[contract.maintenance_frequency || ''] || contract.maintenance_frequency || '-'}</Badge></TableCell>
                              <TableCell className="text-right font-medium">{contract.monthly_value ? formatCurrency(contract.monthly_value) : '-'}</TableCell>
                              <TableCell><Badge variant={contract.is_active ? 'success' : 'outline'}>{contract.is_active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Button variant="edit-ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingContract(contract); setContractDialogOpen(true); }}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="destructive-ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm('Excluir contrato PMOC e todas as OSs vinculadas?')) deleteContract.mutate(contract.id); }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* ===== CRONOGRAMA ===== */}
          {activeSection === 'cronograma' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Próximas Gerações</CardTitle>
                </CardHeader>
                <CardContent>
                  {timeline.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhum plano ativo para exibir cronograma.</p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {timeline.slice(0, 24).map((entry, i) => {
                        const isPast = isBefore(entry.date, new Date());
                        return (
                          <div key={`${entry.planId}-${i}`} className={`flex items-center gap-4 rounded-lg border p-3 ${isPast ? 'border-destructive/30 bg-destructive/5' : ''}`}>
                            <div className={`text-center min-w-[60px] ${isPast ? 'text-destructive' : ''}`}>
                              <p className="text-lg font-bold">{format(entry.date, 'dd')}</p>
                              <p className="text-xs uppercase">{format(entry.date, 'MMM/yy', { locale: ptBR })}</p>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{entry.planName}</p>
                              <p className="text-xs text-muted-foreground">{entry.customerName} • {entry.equipmentCount} equip.</p>
                            </div>
                            {isPast && <Badge variant="destructive" className="text-xs">Atrasado</Badge>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {generatedHistory.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Histórico de OS Geradas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {generatedHistory.slice(0, 20).map(g => {
                        const isPending = g.service_orders?.status === 'pendente';
                        const parentPlan = plans.find(p => p.id === g.plan_id);
                        return (
                          <div key={g.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                              <p className="text-sm font-medium">{g.planName}</p>
                              <p className="text-xs text-muted-foreground">{g.customerName} • Agendada para {format(new Date(g.scheduled_for), 'dd/MM/yyyy')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">OS #{g.service_orders?.order_number || '?'}</Badge>
                              {isPending && parentPlan && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-warning hover:text-warning"
                                  title="Adiar esta OS"
                                  onClick={() => setPostponeData({ plan: parentPlan, os: g })}
                                >
                                  <CalendarPlus className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a href={`/os-tecnico/${g.service_order_id}`} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <PmocPlanFormDialog open={planDialogOpen} onOpenChange={setPlanDialogOpen} plan={editingPlan} />
      <PmocContractFormDialog open={contractDialogOpen} onOpenChange={setContractDialogOpen} contract={editingContract} />
      {postponeData && (
        <PmocPostponeDialog
          open={!!postponeData}
          onOpenChange={(open) => !open && setPostponeData(null)}
          plan={postponeData.plan}
          generatedOs={postponeData.os}
        />
      )}

      {/* Delete future OSs confirmation */}
      <AlertDialog open={!!deleteFutureOsDialog} onOpenChange={() => setDeleteFutureOsDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir OSs futuras</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir todas as OSs pendentes futuras do plano "{deleteFutureOsDialog?.name}"?
              ({deleteFutureOsDialog ? futureOsCount(deleteFutureOsDialog) : 0} OSs serão excluídas)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingFutureOs}
              onClick={() => deleteFutureOsDialog && handleDeleteFutureOs(deleteFutureOsDialog)}
            >
              {deletingFutureOs ? 'Excluindo...' : 'Excluir OSs'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

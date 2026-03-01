import { useState } from 'react';
import { FileText, Plus, Search, Calendar, DollarSign, CheckCircle, XCircle, Edit, Trash2, Pause, Play, ClipboardList, CalendarClock, ExternalLink, LayoutList, ScrollText, Clock, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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

  const filteredPlans = plans.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredContracts = contracts.filter(c =>
    c.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contract_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestão de PMOC</h1>
          <p className="text-muted-foreground">Plano de Manutenção, Operação e Controle</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
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
        <nav className="hidden sm:flex flex-col gap-1 w-48 shrink-0">
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

        {/* Mobile horizontal nav */}
        <div className="sm:hidden flex gap-1 border-b overflow-x-auto no-scrollbar -mt-2 mb-2 w-full">
          {SECTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                activeSection === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

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
                            <TableHead>Nome</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Frequência</TableHead>
                            <TableHead>Próxima Geração</TableHead>
                            <TableHead className="text-center">Equipamentos</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[140px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredPlans.map(plan => {
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
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingPlan(plan); setPlanDialogOpen(true); }}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    {futureCount > 0 && (
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-warning hover:text-warning" title="Excluir OSs futuras" onClick={() => setDeleteFutureOsDialog(plan)}>
                                        <XCircle className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm('Excluir este plano?')) deletePlan.mutate(plan.id); }}>
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
                            <TableHead>Cliente</TableHead>
                            <TableHead>Nº Contrato</TableHead>
                            <TableHead>Período</TableHead>
                            <TableHead>Frequência</TableHead>
                            <TableHead className="text-right">Valor Mensal</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[100px]">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredContracts.map(contract => (
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
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingContract(contract); setContractDialogOpen(true); }}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm('Excluir contrato?')) deleteContract.mutate(contract.id); }}>
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

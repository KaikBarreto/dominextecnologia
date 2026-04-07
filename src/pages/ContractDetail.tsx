import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ScrollText, Calendar, CheckCircle, Clock, ExternalLink, SkipForward, Repeat, DollarSign, Plus, Loader2, Pencil, Trash2, MoreVertical, RefreshCw, MoreHorizontal, Check } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContractFormDialog } from '@/components/contracts/ContractFormDialog';
import { useContractDetail } from '@/hooks/useContractDetail';
import { useContracts, getFrequencyLabel } from '@/hooks/useContracts';
import { useFinancial } from '@/hooks/useFinancial';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format, isBefore, parseISO, addMonths, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

/** Parse a YYYY-MM-DD string as a local date (avoids UTC-offset shift) */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  active: { label: 'Ativo', variant: 'success' },
  paused: { label: 'Pausado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'secondary' },
};

const OCC_STATUS: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  scheduled: { label: 'Agendada', variant: 'outline' },
  completed: { label: 'Concluída', variant: 'success' },
  skipped: { label: 'Pulada', variant: 'secondary' },
  rescheduled: { label: 'Reagendada', variant: 'outline' },
};

const FREQUENCY_OPTIONS = [
  { value: 'unica', label: 'Única', months: 0 },
  { value: 'mensal', label: 'Mensal', months: 1 },
  { value: 'bimestral', label: 'Bimestral', months: 2 },
  { value: 'trimestral', label: 'Trimestral', months: 3 },
  { value: 'semestral', label: 'Semestral', months: 6 },
  { value: 'anual', label: 'Anual', months: 12 },
];

export default function ContractDetail() {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contract, isLoading, updateOccurrenceStatus, stats, linkedTransactions, isLoadingTransactions } = useContractDetail(id);
  const { createTransaction } = useFinancial();

  const { createContract } = useContracts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showReceivableModal, setShowReceivableModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);
  const [recDescription, setRecDescription] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDueDate, setRecDueDate] = useState('');
  const [recFrequency, setRecFrequency] = useState('unica');
  const [recInstallments, setRecInstallments] = useState('1');
  const [recSaving, setRecSaving] = useState(false);
  const [eqPage, setEqPage] = useState(1);

  const sortedOccurrences = useMemo(() => 
    (contract?.contract_occurrences || []).sort((a: any, b: any) => a.occurrence_number - b.occurrence_number), 
    [contract]
  );
  const { sortedItems: sortedOcc, sortConfig: occSortConfig, handleSort: handleOccSort } = useTableSort(sortedOccurrences);
  const occPagination = useDataPagination(sortedOcc);
  const recPagination = useDataPagination(linkedTransactions || []);

  const handleCreateReceivable = async () => {
    if (!recDescription || !recAmount || !contract) return;
    setRecSaving(true);
    try {
      const freqOption = FREQUENCY_OPTIONS.find(f => f.value === recFrequency);
      const numInstallments = recFrequency === 'unica' ? 1 : Math.max(1, parseInt(recInstallments) || 1);
      const amount = parseFloat(recAmount);
      const baseDate = recDueDate ? parseISO(recDueDate) : new Date();

      for (let i = 0; i < numInstallments; i++) {
        const dueDate = addMonths(baseDate, i * (freqOption?.months || 0));
        const suffix = numInstallments > 1 ? ` (${i + 1}/${numInstallments})` : '';
        const monthLabel = numInstallments > 1 ? ` - ${format(dueDate, 'MMM/yyyy', { locale: ptBR })}` : '';
        
        await createTransaction.mutateAsync({
          transaction_type: 'entrada',
          description: `${recDescription}${monthLabel}${suffix}`,
          amount,
          transaction_date: new Date().toISOString().split('T')[0],
          due_date: format(dueDate, 'yyyy-MM-dd'),
          is_paid: false,
          customer_id: contract.customer_id,
          notes: `Vinculado ao contrato: ${contract.name}`,
          contract_id: id,
        } as any);
      }

      setShowReceivableModal(false);
      setRecDescription('');
      setRecAmount('');
      setRecDueDate('');
      setRecFrequency('unica');
      setRecInstallments('1');
    } finally {
      setRecSaving(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!contract || !id) return;
    setIsDeleting(true);
    try {
      // Delete linked financial transactions
      await supabase.from('financial_transactions').delete().eq('contract_id', id);
      // Delete service orders linked to this contract
      const osIds = (contract.contract_occurrences || []).filter(o => o.service_order_id).map(o => o.service_order_id!);
      if (osIds.length > 0) {
        // Delete related service_order_equipment
        await supabase.from('service_order_equipment').delete().in('service_order_id', osIds);
        await supabase.from('service_orders').delete().in('id', osIds);
      }
      // Delete occurrences
      await supabase.from('contract_occurrences').delete().eq('contract_id', id);
      // Delete items
      await supabase.from('contract_items').delete().eq('contract_id', id);
      // Delete contract
      const { error } = await supabase.from('contracts').delete().eq('id', id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: 'Contrato excluído com sucesso!' });
      navigate('/contratos');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleRenewContract = async () => {
    if (!contract) return;
    setIsRenewing(true);
    try {
      const lastOcc = sortedOccurrences[sortedOccurrences.length - 1];
      const newStartDate = lastOcc
        ? format(addDays(parseISO(lastOcc.scheduled_date), 1), 'yyyy-MM-dd')
        : format(new Date(), 'yyyy-MM-dd');

      const result = await createContract.mutateAsync({
        name: contract.name,
        customer_id: contract.customer_id,
        technician_id: contract.technician_id || null,
        team_id: (contract as any).team_id || null,
        service_type_id: contract.service_type_id || null,
        form_template_id: contract.form_template_id || null,
        status: 'active',
        notes: contract.notes || null,
        frequency_type: contract.frequency_type,
        frequency_value: contract.frequency_value,
        start_date: newStartDate,
        horizon_months: contract.horizon_months,
        items: (contract.contract_items || []).map(i => ({
          equipment_id: i.equipment_id || null,
          item_name: i.item_name,
          item_description: i.item_description || null,
          form_template_id: i.form_template_id || null,
        })),
      });
      toast({ title: 'Contrato renovado com sucesso!' });
      if (result) navigate(`/contratos/${(result as any).id}`);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao renovar', description: err.message });
    } finally {
      setIsRenewing(false);
      setShowRenewDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Contrato não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/contratos')}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[contract.status] || STATUS_LABELS.active;
  const occurrences = sortedOccurrences;
  const items = contract.contract_items || [];

  const totalReceivable = (linkedTransactions || []).reduce((sum, t) => sum + Number(t.amount), 0);
  const totalPaid = (linkedTransactions || []).filter(t => t.is_paid).reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/contratos')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{contract.name}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-muted-foreground text-sm truncate">{contract.customers?.name || 'Cliente'}</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button variant="edit-ghost" size="icon" className="sm:hidden h-8 w-8" onClick={() => setShowEditForm(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="destructive-ghost" size="icon" className="sm:hidden h-8 w-8" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="edit-ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setShowEditForm(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button variant="destructive-ghost" size="sm" className="hidden sm:inline-flex" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info card */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> Informações</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Cliente</p>
                  <p className="font-medium mt-0.5">{(contract.customers as any)?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Frequência</p>
                  <p className="font-medium mt-0.5">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Início</p>
                  <p className="font-medium mt-0.5">{format(parseLocalDate(contract.start_date), 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Horizonte</p>
                  <p className="font-medium mt-0.5">{contract.horizon_months} meses</p>
                </div>
                {contract.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Observações</p>
                    <p className="mt-0.5">{contract.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Equipment */}
          <Card>
            <CardHeader><CardTitle>Equipamentos do Contrato ({items.length})</CardTitle></CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum equipamento vinculado</p>
              ) : (
                <div className="space-y-2">
                  {items.slice((eqPage - 1) * 5, eqPage * 5).map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-md border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.item_name}</p>
                        {item.item_description && <p className="text-xs text-muted-foreground">{item.item_description}</p>}
                      </div>
                      {item.equipment && (
                        <Badge variant="secondary" className="text-xs">Equipamento</Badge>
                      )}
                    </div>
                  ))}
                  {items.length > 5 && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        {(eqPage - 1) * 5 + 1}-{Math.min(eqPage * 5, items.length)} de {items.length}
                      </span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEqPage(p => p - 1)} disabled={eqPage <= 1}>Anterior</Button>
                        <Button size="sm" variant="outline" onClick={() => setEqPage(p => p + 1)} disabled={eqPage >= Math.ceil(items.length / 5)}>Próxima</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receivables */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Contas a Receber</CardTitle>
              <Button size="sm" variant="outline" onClick={() => {
                setRecDescription(`Mensalidade - ${contract.name}`);
                setShowReceivableModal(true);
              }}>
                <Plus className="h-4 w-4 mr-1" /> Nova Receita
              </Button>
            </CardHeader>
            <CardContent>
              {(linkedTransactions || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conta vinculada a este contrato</p>
              ) : (
                <div className="space-y-2">
                  {recPagination.paginatedItems.map(t => (
                    <div key={t.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-md border text-sm gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{t.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.due_date ? `Vence ${format(parseLocalDate(t.due_date), 'dd/MM/yyyy')}` : format(parseLocalDate(t.transaction_date), 'dd/MM/yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">R$ {formatBRL(Number(t.amount))}</span>
                        <Badge variant={t.is_paid ? 'success' : 'outline'}>{t.is_paid ? 'Pago' : 'Pendente'}</Badge>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t text-sm">
                    <span className="text-muted-foreground">Total: R$ {formatBRL(totalReceivable)}</span>
                    <span className="text-muted-foreground">Recebido: R$ {formatBRL(totalPaid)}</span>
                  </div>
                  <DataTablePagination page={recPagination.page} totalPages={recPagination.totalPages} totalItems={recPagination.totalItems} from={recPagination.from} to={recPagination.to} pageSize={recPagination.pageSize} onPageChange={recPagination.setPage} onPageSizeChange={recPagination.setPageSize} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Occurrences */}
          <Card>
            <CardHeader><CardTitle>Ocorrências ({occurrences.length})</CardTitle></CardHeader>
            <CardContent className={cn(isMobile ? 'p-3' : 'p-0')}>
              {isMobile ? (
                <div className="space-y-2">
                  {occPagination.paginatedItems.map(occ => {
                    const occDate = parseLocalDate(occ.scheduled_date);
                    const isPast = occ.status === 'scheduled' && isBefore(occDate, new Date());
                    const occStatusCfg = OCC_STATUS[occ.status] || OCC_STATUS.scheduled;
                    return (
                      <div key={occ.id} className={cn('p-3 rounded-md border space-y-2', isPast && 'border-warning/50 bg-warning/5')}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-muted-foreground">#{occ.occurrence_number}</span>
                          <Badge variant={occStatusCfg.variant}>{occStatusCfg.label}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className={cn('font-medium', isPast && 'text-warning')}>
                            {format(occDate, 'dd/MM/yyyy')} <span className="text-muted-foreground font-normal">({format(occDate, 'EEE', { locale: ptBR })})</span>
                          </span>
                          {occ.service_orders ? (
                            <Badge variant="secondary" className="text-xs">OS #{occ.service_orders.order_number}</Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          {occ.service_order_id && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                              <a href={`/os-tecnico/${occ.service_order_id}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          {occ.status === 'scheduled' && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-warning"
                              title="Pular esta ocorrência"
                              onClick={() => updateOccurrenceStatus.mutate({ id: occ.id, status: 'skipped' })}
                            >
                              <SkipForward className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <DataTablePagination page={occPagination.page} totalPages={occPagination.totalPages} totalItems={occPagination.totalItems} from={occPagination.from} to={occPagination.to} pageSize={occPagination.pageSize} onPageChange={occPagination.setPage} onPageSizeChange={occPagination.setPageSize} />
                </div>
              ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="occurrence_number" sortConfig={occSortConfig} onSort={handleOccSort} className="w-12">#</SortableTableHead>
                      <SortableTableHead sortKey="scheduled_date" sortConfig={occSortConfig} onSort={handleOccSort}>Data</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}}>Dia</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}}>OS</SortableTableHead>
                      <SortableTableHead sortKey="status" sortConfig={occSortConfig} onSort={handleOccSort}>Status</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={occSortConfig} onSort={() => {}} className="w-[100px]">Ações</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occPagination.paginatedItems.map(occ => {
                      const occDate = parseLocalDate(occ.scheduled_date);
                      const isPast = occ.status === 'scheduled' && isBefore(occDate, new Date());
                      const occStatusCfg = OCC_STATUS[occ.status] || OCC_STATUS.scheduled;

                      return (
                        <TableRow key={occ.id} className={cn(isPast && 'bg-warning/5')}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{occ.occurrence_number}</TableCell>
                          <TableCell className={cn(isPast && 'text-warning font-medium')}>
                            {format(occDate, 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(occDate, 'EEE', { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {occ.service_orders ? (
                              <Badge variant="secondary">OS #{occ.service_orders.order_number}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={occStatusCfg.variant}>{occStatusCfg.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {occ.service_order_id && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                  <a href={`/os-tecnico/${occ.service_order_id}`} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                              {occ.status === 'scheduled' && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-warning"
                                  title="Pular esta ocorrência"
                                  onClick={() => updateOccurrenceStatus.mutate({ id: occ.id, status: 'skipped' })}
                                >
                                  <SkipForward className="h-3.5 w-3.5" />
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
              )}
              {!isMobile && <DataTablePagination page={occPagination.page} totalPages={occPagination.totalPages} totalItems={occPagination.totalItems} from={occPagination.from} to={occPagination.to} pageSize={occPagination.pageSize} onPageChange={occPagination.setPage} onPageSizeChange={occPagination.setPageSize} />}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frequência</span>
                <span className="font-medium">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Início</span>
                <span className="font-medium">{format(parseLocalDate(contract.start_date), 'dd/MM/yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horizonte</span>
                <span className="font-medium">{contract.horizon_months} meses</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de ocorrências</span>
                <span className="font-medium">{stats.totalOccurrences}</span>
              </div>
              {stats.nextOccurrence && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Próxima OS</span>
                  <span className="font-medium">{format(parseLocalDate(stats.nextOccurrence.scheduled_date), 'dd/MM/yyyy')}</span>
                </div>
              )}
              <Button variant="outline" className="w-full mt-2" onClick={() => setShowRenewDialog(true)}>
                <RefreshCw className="h-4 w-4 mr-2" /> Renovar Contrato
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Financeiro</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total a receber</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">R$ {formatBRL(totalReceivable)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recebido</span>
                <span className="font-medium">R$ {formatBRL(totalPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pendente</span>
                <span className="font-medium text-orange-500 dark:text-orange-400">R$ {formatBRL(totalReceivable - totalPaid)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Progresso</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Progress value={stats.progressPercent} className="h-3" />
              <p className="text-sm text-muted-foreground text-center">
                {stats.completedOccurrences} de {stats.totalOccurrences} concluídas ({stats.progressPercent}%)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Receivable modal */}
      <ResponsiveModal open={showReceivableModal} onOpenChange={setShowReceivableModal} title="Nova Conta a Receber">
        <div className="space-y-4 p-1">
          <div>
            <Label>Descrição</Label>
            <Input value={recDescription} onChange={e => setRecDescription(e.target.value)} placeholder="Ex: Mensalidade Março" />
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" step="0.01" value={recAmount} onChange={e => setRecAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Data de Vencimento (1ª parcela)</Label>
            <Input type="date" value={recDueDate} onChange={e => setRecDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Recorrência</Label>
            <Select value={recFrequency} onValueChange={setRecFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {recFrequency !== 'unica' && (
            <div>
              <Label>Quantidade de parcelas</Label>
              <Input type="number" min="1" max="60" value={recInstallments} onChange={e => setRecInstallments(e.target.value)} placeholder="12" />
            </div>
          )}
          <Button className="w-full" onClick={handleCreateReceivable} disabled={recSaving || !recDescription || !recAmount}>
            {recSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {recFrequency !== 'unica' ? `Criar ${recInstallments || 1} Parcelas` : 'Criar Conta a Receber'}
          </Button>
        </div>
      </ResponsiveModal>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Tem certeza que deseja excluir o contrato <strong>{contract.name}</strong>?</p>
                <p className="text-sm">Serão excluídos junto com o contrato:</p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  <li>{occurrences.length} ocorrências</li>
                  <li>{occurrences.filter(o => o.service_order_id).length} ordens de serviço vinculadas</li>
                  <li>{(linkedTransactions || []).length} transações financeiras vinculadas</li>
                  <li>{items.length} itens do contrato</li>
                </ul>
                <p className="text-sm font-medium text-destructive">Esta ação não pode ser desfeita.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteContract} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renew confirmation dialog */}
      <AlertDialog open={showRenewDialog} onOpenChange={setShowRenewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renovar contrato</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Será criado um novo contrato com as mesmas configurações:</p>
                <ul className="text-sm list-disc pl-5 space-y-1">
                  <li>Cliente: {contract.customers?.name}</li>
                  <li>Frequência: {getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</li>
                  <li>Horizonte: {contract.horizon_months} meses</li>
                  <li>{items.length} itens</li>
                </ul>
                <p className="text-sm">A data de início será o dia seguinte à última ocorrência do contrato atual.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRenewing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRenewContract} disabled={isRenewing}>
              {isRenewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Renovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit contract */}
      <ContractFormDialog open={showEditForm} onOpenChange={setShowEditForm} editContract={contract} onCreated={(newId) => { if (newId !== id) navigate(`/contratos/${newId}`); else queryClient.invalidateQueries({ queryKey: ['contract-detail'] }); }} />
    </div>
  );
}

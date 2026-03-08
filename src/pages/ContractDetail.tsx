import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ScrollText, Calendar, CheckCircle, Clock, ExternalLink, SkipForward, Repeat, DollarSign, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useContractDetail } from '@/hooks/useContractDetail';
import { getFrequencyLabel } from '@/hooks/useContracts';
import { useFinancial } from '@/hooks/useFinancial';
import { format, isBefore, parseISO, addMonths } from 'date-fns';
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contract, isLoading, updateOccurrenceStatus, stats, linkedTransactions, isLoadingTransactions } = useContractDetail(id);
  const { createTransaction } = useFinancial();

  const [showReceivableModal, setShowReceivableModal] = useState(false);
  const [recDescription, setRecDescription] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDueDate, setRecDueDate] = useState('');
  const [recFrequency, setRecFrequency] = useState('unica');
  const [recInstallments, setRecInstallments] = useState('1');
  const [recSaving, setRecSaving] = useState(false);

  const sortedOccurrences = useMemo(() => 
    (contract?.contract_occurrences || []).sort((a: any, b: any) => a.occurrence_number - b.occurrence_number), 
    [contract]
  );
  const occPagination = useDataPagination(sortedOccurrences);
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
        <Button variant="ghost" size="icon" onClick={() => navigate('/contratos')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{contract.name}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-muted-foreground">{contract.customers?.name || 'Cliente'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info card */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> Informações</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
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

          {/* Items */}
          <Card>
            <CardHeader><CardTitle>Itens do Contrato ({items.length})</CardTitle></CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum item vinculado</p>
              ) : (
                <div className="space-y-2">
                  {items.map(item => (
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
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-md border text-sm">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{t.description}</p>
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
                  <DataTablePagination pagination={recPagination} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Occurrences */}
          <Card>
            <CardHeader><CardTitle>Ocorrências ({occurrences.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Dia</TableHead>
                      <TableHead>OS</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
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
              <DataTablePagination pagination={occPagination} />
            </CardContent>
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
    </div>
  );
}

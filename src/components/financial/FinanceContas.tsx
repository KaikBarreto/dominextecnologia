import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, AlertTriangle, Clock, DollarSign, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FABButton } from '@/components/mobile/FABButton';
import type { FinancialTransaction } from '@/types/database';
import { format, isBefore, addDays, startOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';

/** Parse a YYYY-MM-DD string as a local date (avoids UTC-offset shift) */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}
import { ContaFormDialog } from './ContaFormDialog';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import type { TransactionType } from '@/types/database';
import { useFinancial } from '@/hooks/useFinancial';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { EmployeePaymentModal, PaymentPayload } from '@/components/employees/EmployeePaymentModal';
import { useEmployeeMovements } from '@/hooks/useEmployeeMovements';
import { calculateEmployeeBalance } from '@/utils/employeeCalculations';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

type SubTab = 'pagar' | 'receber';
type FilterStatus = 'pendentes' | 'vencidas' | 'pagas' | 'todas';

type PayrollTxn = FinancialTransaction & { customer?: any; employee?: { id: string; name: string; salary: number; photo_url: string | null } };

interface FinanceContasProps {
  transactions: PayrollTxn[];
  isLoading: boolean;
  onMarkAsPaid: (params: any) => Promise<any>;
}

export function FinanceContas({ transactions, isLoading, onMarkAsPaid }: FinanceContasProps) {
  const [subTab, setSubTab] = useState<SubTab>('pagar');
  const [filter, setFilter] = useState<FilterStatus>('pendentes');
  const [contaFormOpen, setContaFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [receivingTxn, setReceivingTxn] = useState<PayrollTxn | null>(null);
  const [payingDespesaTxn, setPayingDespesaTxn] = useState<FinancialTransaction | null>(null);
  const [payrollTxn, setPayrollTxn] = useState<PayrollTxn | null>(null);
  const [payDespAccountId, setPayDespAccountId] = useState('');
  const [payDespDate, setPayDespDate] = useState('');
  const [payDespMethod, setPayDespMethod] = useState('pix');
  const [payDespNotes, setPayDespNotes] = useState('');
  const isMobile = useIsMobile();
  const { deleteTransaction, updateTransaction } = useFinancial();
  const { accounts: allAccounts } = useFinancialAccounts();
  const cashBankAccounts = allAccounts.filter(a => a.type !== 'cartao' && a.is_active);
  const { movements: payrollEmpMovements } = useEmployeeMovements(payrollTxn?.employee?.id);
  const payrollBalance = useMemo(() => {
    if (!payrollTxn?.employee) return calculateEmployeeBalance([], 0);
    return calculateEmployeeBalance(payrollEmpMovements ?? [], payrollTxn.employee.salary);
  }, [payrollEmpMovements, payrollTxn?.employee]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isPayrollSalaryRow = (t: PayrollTxn) =>
    t.payroll_kind === 'salary' && !!t.employee_id && !t.is_paid;

  const handleMarkAsPaidClick = (t: PayrollTxn) => {
    if (isPayrollSalaryRow(t)) {
      setPayrollTxn(t);
      return;
    }
    if (t.transaction_type === 'entrada') {
      setReceivingTxn(t);
    } else {
      setPayingDespesaTxn(t);
      setPayDespDate(new Date().toISOString().split('T')[0]);
      setPayDespAccountId(cashBankAccounts[0]?.id ?? '');
      setPayDespMethod('pix');
      setPayDespNotes('');
    }
  };

  const handleConfirmPayrollPayment = async (payload: PaymentPayload) => {
    if (!payrollTxn) return;
    const subtotal = (payrollTxn.employee?.salary ?? Number(payrollTxn.amount))
      + payrollBalance.totalBonus
      - payrollBalance.totalFaltas;
    const netAmount = subtotal - payload.valeDiscount;

    const { error } = await supabase.rpc('pay_payroll_transaction', {
      p_transaction_id: payrollTxn.id,
      p_account_id: payload.accountId,
      p_paid_date: new Date().toISOString().split('T')[0],
      p_vale_discount: payload.valeDiscount,
      p_net_amount: netAmount,
      p_notes: payload.description ?? null,
      p_payment_method: 'pix',
    });

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao pagar folha', description: error.message });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    queryClient.invalidateQueries({ queryKey: ['employee-movements'] });
    queryClient.invalidateQueries({ queryKey: ['all-employee-movements'] });
    setPayrollTxn(null);
    toast({ title: 'Folha quitada com sucesso' });
  };

  const today = startOfDay(new Date());
  const next7Days = addDays(today, 7);

  const contaDefaultType: TransactionType = subTab === 'pagar' ? 'saida' : 'entrada';

  const baseFiltered = useMemo(() => {
    return transactions.filter((t) =>
      subTab === 'pagar' ? t.transaction_type === 'saida' : t.transaction_type === 'entrada'
    );
  }, [transactions, subTab]);

  const filtered = useMemo(() => {
    return baseFiltered.filter((t) => {
      if (filter === 'todas') return true;
      if (filter === 'pagas') return t.is_paid;
      if (filter === 'pendentes') return !t.is_paid;
      if (filter === 'vencidas') {
        return !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), today);
      }
      return true;
    });
  }, [baseFiltered, filter, today]);

  const summary = useMemo(() => {
    const pendente = baseFiltered.filter((t) => !t.is_paid).reduce((s, t) => s + Number(t.amount), 0);
    const vencido = baseFiltered.filter((t) => !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), today)).reduce((s, t) => s + Number(t.amount), 0);
    const prox7 = baseFiltered.filter((t) => !t.is_paid && t.due_date && !isBefore(parseLocalDate(t.due_date), today) && isBefore(parseLocalDate(t.due_date), next7Days)).reduce((s, t) => s + Number(t.amount), 0);
    return { pendente, vencido, prox7 };
  }, [baseFiltered, today, next7Days]);

  const pagination = useDataPagination(filtered);

  const isOverdue = (t: FinancialTransaction) =>
    !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), today);

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'pendentes', label: 'Pendentes' },
    { key: 'vencidas', label: 'Vencidas' },
    { key: 'pagas', label: 'Pagas' },
    { key: 'todas', label: 'Todas' },
  ];

  const handleEdit = (t: FinancialTransaction) => {
    setEditingTransaction(t);
    setContaFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteTransaction.mutateAsync(deletingId);
    setDeletingId(null);
  };

  const handleCloseForm = () => {
    setContaFormOpen(false);
    setEditingTransaction(null);
  };

  return (
    <div className="space-y-5">
      {/* Header inline — desktop. Mobile usa o MobilePageHeader do parent + FAB. */}
      {!isMobile && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Contas</h2>
            <p className="text-sm text-muted-foreground">Programação financeira — contas a pagar e a receber</p>
          </div>
          <Button onClick={() => { setEditingTransaction(null); setContaFormOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Conta
          </Button>
        </div>
      )}

      {/* Sub-tab toggle */}
      <div className="flex gap-2">
        <Button
          variant={subTab === 'pagar' ? 'default' : 'outline'}
          onClick={() => { setSubTab('pagar'); setFilter('pendentes'); }}
          className={subTab === 'pagar' ? 'bg-destructive hover:bg-destructive/90 text-white' : ''}
        >
          A Pagar
        </Button>
        <Button
          variant={subTab === 'receber' ? 'default' : 'outline'}
          onClick={() => { setSubTab('receber'); setFilter('pendentes'); }}
          className={subTab === 'receber' ? 'bg-success hover:bg-success/90 text-white' : ''}
        >
          A Receber
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-warning p-2.5 shrink-0">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Pendente</p>
              <p className="text-lg font-bold truncate">{formatCurrency(summary.pendente)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-destructive p-2.5 shrink-0">
              <AlertTriangle className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Vencido</p>
              <p className="text-lg font-bold text-destructive truncate">{formatCurrency(summary.vencido)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-primary p-2.5 shrink-0">
              <DollarSign className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Próximos 7 dias</p>
              <p className="text-lg font-bold truncate">{formatCurrency(summary.prox7)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<DollarSign className="h-12 w-12" />}
          title="Nenhuma conta encontrada"
          description="Nenhum registro para o filtro selecionado"
        />
      ) : isMobile ? (
        <div className="space-y-3">
          <div className="rounded-xl border bg-card overflow-hidden">
            {pagination.paginatedItems.map((t) => {
              const overdue = isOverdue(t);
              const itemActions: ItemAction[] = [
                ...(!t.is_paid ? [{
                  key: 'mark-paid',
                  label: subTab === 'receber' ? 'Marcar recebido' : 'Marcar pago',
                  icon: <Check className="h-4 w-4" />,
                  onClick: () => handleMarkAsPaidClick(t),
                }] : []),
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => handleEdit(t),
                },
                {
                  key: 'delete',
                  label: 'Excluir',
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => setDeletingId(t.id),
                },
              ];
              const statusColor = t.is_paid
                ? 'bg-success'
                : overdue
                  ? 'bg-destructive'
                  : subTab === 'receber'
                    ? 'bg-success/70'
                    : 'bg-warning';
              return (
                <MobileListItem
                  key={t.id}
                  actions={itemActions}
                  className={cn(overdue && !t.is_paid && 'bg-destructive/5')}
                  leading={
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0', statusColor)}>
                      {t.payroll_kind === 'salary'
                        ? <Users className="h-5 w-5" />
                        : t.is_paid
                          ? <Check className="h-5 w-5" />
                          : overdue
                            ? <AlertTriangle className="h-5 w-5" />
                            : <Clock className="h-5 w-5" />}
                    </div>
                  }
                  title={
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{t.description}</span>
                    </div>
                  }
                  subtitle={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>
                        {t.due_date ? format(parseLocalDate(t.due_date), 'dd/MM/yyyy', { locale: ptBR }) : 'Sem vencimento'}
                      </span>
                      {t.employee && <span className="truncate">{t.employee.name}</span>}
                      {!t.employee && t.customer && <span className="truncate">{t.customer.name}</span>}
                    </div>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('font-semibold text-sm whitespace-nowrap', subTab === 'receber' ? 'text-success' : 'text-destructive')}>
                        {formatCurrency(t.amount)}
                      </span>
                      {t.is_paid ? (
                        <Badge className="bg-success text-white text-[10px] px-1.5 py-0">Pago</Badge>
                      ) : overdue ? (
                        <Badge className="bg-destructive text-white text-[10px] px-1.5 py-0">Vencida</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pendente</Badge>
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
          <DataTablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wider">Descrição</TableHead>
                    <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Categoria</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Vencimento</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Valor</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="w-[100px] text-xs uppercase tracking-wider">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((t) => (
                    <TableRow key={t.id} className={cn(isOverdue(t) && 'bg-destructive/5')}>
                      <TableCell>
                        <div>
                          <p className="font-medium flex items-center gap-1.5">
                            {t.payroll_kind === 'salary' && <Users className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                            <span>{t.description}</span>
                          </p>
                          {t.employee && <p className="text-xs text-muted-foreground">{t.employee.name}</p>}
                          {!t.employee && t.customer && <p className="text-xs text-muted-foreground">{t.customer.name}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {t.category && <Badge variant="outline">{t.category}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.due_date ? (
                          <span className={cn(isOverdue(t) && 'text-destructive font-semibold')}>
                            {format(parseLocalDate(t.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                            {isOverdue(t) && <AlertTriangle className="inline ml-1 h-3.5 w-3.5" />}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sem vencimento</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${subTab === 'receber' ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(t.amount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {t.is_paid ? (
                          <Badge className="bg-success text-white">Pago</Badge>
                        ) : isOverdue(t) ? (
                          <Badge className="bg-destructive text-white">Vencida</Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {!t.is_paid && (
                            <Button variant="ghost" size="icon" className="text-success h-8 w-8" onClick={() => handleMarkAsPaidClick(t)} title="Marcar como pago">
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(t)}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDeletingId(t.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DataTablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </CardContent>
        </Card>
      )}

      <ContaFormDialog
        open={contaFormOpen}
        onOpenChange={handleCloseForm}
        defaultType={contaDefaultType}
        editingTransaction={editingTransaction}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {payrollTxn?.employee && (
        <EmployeePaymentModal
          open={!!payrollTxn}
          onOpenChange={(v) => { if (!v) setPayrollTxn(null); }}
          employeeName={payrollTxn.employee.name}
          salary={payrollTxn.employee.salary}
          balance={payrollBalance}
          onSubmit={handleConfirmPayrollPayment}
          financialTransactionId={payrollTxn.id}
          payrollPeriodLabel={payrollTxn.payroll_period ?? undefined}
        />
      )}

      <ReceivePaymentModal
        open={!!receivingTxn}
        onOpenChange={(v) => { if (!v) setReceivingTxn(null); }}
        amount={Number(receivingTxn?.amount ?? 0)}
        title="Como foi recebido?"
        description={receivingTxn?.description}
        onConfirm={async (payment) => {
          if (!receivingTxn) return;
          await onMarkAsPaid({
            id: receivingTxn.id,
            account_id: payment.account_id,
            payment_method: payment.payment_method,
            paid_date: payment.paid_date,
            fee_amount: payment.fee_amount,
            notes: payment.notes,
            customer_id: (receivingTxn as any).customer_id,
          });
          setReceivingTxn(null);
        }}
      />

      {/* Modal: confirmar pagamento de despesa */}
      <ResponsiveModal
        open={!!payingDespesaTxn}
        onOpenChange={(v) => { if (!v) setPayingDespesaTxn(null); }}
        title="Confirmar pagamento"
        description={payingDespesaTxn ? `${payingDespesaTxn.description} — ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(payingDespesaTxn.amount))}` : undefined}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Pago com *</Label>
            <Select value={payDespAccountId} onValueChange={setPayDespAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione caixa ou conta" /></SelectTrigger>
              <SelectContent>
                {cashBankAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cashBankAccounts.length === 0 && (
              <p className="text-xs text-destructive">Cadastre um caixa ou conta primeiro.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={payDespMethod} onValueChange={setPayDespMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="debito">Cartão de Débito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data do pagamento *</Label>
              <Input type="date" value={payDespDate} onChange={e => setPayDespDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={payDespNotes}
              onChange={e => setPayDespNotes(e.target.value)}
              placeholder="Opcional"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPayingDespesaTxn(null)}>Cancelar</Button>
            <Button
              disabled={!payDespAccountId || !payDespDate}
              onClick={async () => {
                if (!payingDespesaTxn || !payDespAccountId) return;
                await onMarkAsPaid({
                  id: payingDespesaTxn.id,
                  account_id: payDespAccountId,
                  payment_method: payDespMethod,
                  paid_date: payDespDate,
                  notes: payDespNotes.trim() || undefined,
                });
                setPayingDespesaTxn(null);
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* FAB mobile — "Nova Conta". Desktop usa o botão inline do header. */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Nova Conta"
          onClick={() => { setEditingTransaction(null); setContaFormOpen(true); }}
        />
      )}
    </div>
  );
}

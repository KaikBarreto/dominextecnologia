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
import type { FinancialTransaction } from '@/types/database';
import { format, isBefore, addDays, startOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

type SubTab = 'pagar' | 'receber';
type FilterStatus = 'pendentes' | 'vencidas' | 'pagas' | 'todas';

interface FinanceContasProps {
  transactions: (FinancialTransaction & { customer?: any })[];
  isLoading: boolean;
  onMarkAsPaid: (params: any) => Promise<any>;
}

export function FinanceContas({ transactions, isLoading, onMarkAsPaid }: FinanceContasProps) {
  const [subTab, setSubTab] = useState<SubTab>('pagar');
  const [filter, setFilter] = useState<FilterStatus>('pendentes');
  const [contaFormOpen, setContaFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [receivingTxn, setReceivingTxn] = useState<(FinancialTransaction & { customer?: any }) | null>(null);
  const isMobile = useIsMobile();
  const { deleteTransaction, updateTransaction } = useFinancial();

  const handleMarkAsPaidClick = (t: FinancialTransaction & { customer?: any }) => {
    if (t.transaction_type === 'entrada') {
      setReceivingTxn(t);
    } else {
      onMarkAsPaid({ id: t.id });
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Contas</h2>
          <p className="text-sm text-muted-foreground">Programação financeira — contas a pagar e a receber</p>
        </div>
        <Button onClick={() => { setEditingTransaction(null); setContaFormOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Conta
        </Button>
      </div>

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
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">Nenhuma conta encontrada</h3>
          <p className="text-muted-foreground text-sm">Nenhum registro para o filtro selecionado</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {pagination.paginatedItems.map((t) => (
            <Card key={t.id} className={cn(isOverdue(t) && 'border-destructive/40')}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{t.description}</p>
                    {t.customer && <p className="text-xs text-muted-foreground truncate">{t.customer.name}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {t.is_paid ? (
                      <Badge className="bg-success text-white shrink-0 text-[10px]">Pago</Badge>
                    ) : isOverdue(t) ? (
                      <Badge className="bg-destructive text-white shrink-0 text-[10px]">Vencida</Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">Pendente</Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
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
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t.due_date ? format(parseLocalDate(t.due_date), 'dd/MM/yyyy', { locale: ptBR }) : 'Sem vencimento'}
                  </span>
                  <span className={`font-semibold text-sm ${subTab === 'receber' ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(t.amount)}
                  </span>
                </div>
                {!t.is_paid && (
                  <div className="flex justify-end pt-1 border-t">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-success gap-1" onClick={() => handleMarkAsPaidClick(t)}>
                      <Check className="h-3 w-3" /> Marcar pago
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
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
                          <p className="font-medium">{t.description}</p>
                          {t.customer && <p className="text-xs text-muted-foreground">{t.customer.name}</p>}
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
    </div>
  );
}

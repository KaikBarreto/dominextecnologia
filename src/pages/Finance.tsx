import { useState } from 'react';
import {
  DollarSign,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  Search,
  Check,
  Trash2,
  Pencil,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFinancial } from '@/hooks/useFinancial';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export default function Finance() {
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [defaultType, setDefaultType] = useState<TransactionType>('entrada');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<FinancialTransaction | null>(null);

  const {
    transactions,
    summary,
    isLoading,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    markAsPaid,
  } = useFinancial();

  const filteredTransactions = transactions.filter((t) =>
    t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const contasAPagar = transactions.filter((t) => t.transaction_type === 'saida' && !t.is_paid);
  const contasAReceber = transactions.filter((t) => t.transaction_type === 'entrada' && !t.is_paid);

  const handleSubmit = async (data: any) => {
    if (editingTransaction) {
      await updateTransaction.mutateAsync({ ...data, id: editingTransaction.id });
    } else {
      await createTransaction.mutateAsync(data);
    }
    setEditingTransaction(null);
  };

  const handleEdit = (transaction: FinancialTransaction) => {
    setEditingTransaction(transaction);
    setDefaultType(transaction.transaction_type);
    setFormOpen(true);
  };

  const handleNewTransaction = (type: TransactionType) => {
    setEditingTransaction(null);
    setDefaultType(type);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (transactionToDelete) {
      await deleteTransaction.mutateAsync(transactionToDelete.id);
      setTransactionToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleMarkAsPaid = async (id: string) => {
    await markAsPaid.mutateAsync(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="text-muted-foreground">Controle de entradas e saídas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleNewTransaction('saida')}>
            <TrendingDown className="mr-2 h-4 w-4 text-destructive" />
            Saída
          </Button>
          <Button onClick={() => handleNewTransaction('entrada')}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Entrada
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Entradas</p>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(summary.totalEntradas)}
                </p>
              </div>
              <div className="rounded-full bg-success p-3">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saídas</p>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(summary.totalSaidas)}
                </p>
              </div>
              <div className="rounded-full bg-destructive p-3">
                <TrendingDown className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className={`text-2xl font-bold ${summary.saldo >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(summary.saldo)}
                </p>
              </div>
              <div className="rounded-full bg-primary p-3">
                <Wallet className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">A Receber</p>
                <p className="text-2xl font-bold text-warning">
                  {formatCurrency(summary.aReceber)}
                </p>
              </div>
              <div className="rounded-full bg-warning p-3">
                <Calendar className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="transacoes">
        <TabsList>
          <TabsTrigger value="transacoes">Transações</TabsTrigger>
          <TabsTrigger value="contas-pagar">
            A Pagar ({contasAPagar.length})
          </TabsTrigger>
          <TabsTrigger value="contas-receber">
            A Receber ({contasAReceber.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transacoes" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar transação..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

           <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
                Todas as Transações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="text-lg font-medium">Nenhuma transação</h3>
                  <p className="text-muted-foreground">
                    Clique em "Entrada" ou "Saída" para registrar movimentações
                  </p>
                </div>
              ) : (
                <TransactionTable
                  transactions={filteredTransactions}
                  onEdit={handleEdit}
                  onDelete={(t) => {
                    setTransactionToDelete(t);
                    setDeleteDialogOpen(true);
                  }}
                  onMarkAsPaid={handleMarkAsPaid}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contas-pagar">
          <Card>
            <CardHeader>
              <CardTitle>Contas a Pagar</CardTitle>
            </CardHeader>
            <CardContent>
              {contasAPagar.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Nenhuma conta a pagar pendente
                </p>
              ) : (
                <TransactionTable
                  transactions={contasAPagar}
                  onEdit={handleEdit}
                  onDelete={(t) => {
                    setTransactionToDelete(t);
                    setDeleteDialogOpen(true);
                  }}
                  onMarkAsPaid={handleMarkAsPaid}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contas-receber">
          <Card>
            <CardHeader>
              <CardTitle>Contas a Receber</CardTitle>
            </CardHeader>
            <CardContent>
              {contasAReceber.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Nenhuma conta a receber pendente
                </p>
              ) : (
                <TransactionTable
                  transactions={contasAReceber}
                  onEdit={handleEdit}
                  onDelete={(t) => {
                    setTransactionToDelete(t);
                    setDeleteDialogOpen(true);
                  }}
                  onMarkAsPaid={handleMarkAsPaid}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editingTransaction}
        onSubmit={handleSubmit}
        isLoading={createTransaction.isPending || updateTransaction.isPending}
        defaultType={defaultType}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta transação?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TransactionTableProps {
  transactions: (FinancialTransaction & { customer?: any })[];
  onEdit: (t: FinancialTransaction) => void;
  onDelete: (t: FinancialTransaction) => void;
  onMarkAsPaid: (id: string) => void;
}

import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

function TransactionTable({ transactions, onEdit, onDelete, onMarkAsPaid }: TransactionTableProps) {
  const pagination = useDataPagination(transactions);
  return (
    <>
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wider">Data</TableHead>
            <TableHead className="text-xs uppercase tracking-wider">Descrição</TableHead>
            <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Categoria</TableHead>
            <TableHead className="text-xs uppercase tracking-wider">Valor</TableHead>
            <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
            <TableHead className="w-[120px] text-xs uppercase tracking-wider">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.paginatedItems.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <span className="text-sm">
                  {format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}
                </span>
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{t.description}</p>
                  {t.customer && (
                    <p className="text-xs text-muted-foreground">{t.customer.name}</p>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {t.category && (
                  <Badge variant="outline">{t.category}</Badge>
                )}
              </TableCell>
              <TableCell>
                <span
                  className={`font-medium ${
                    t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {t.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(t.amount)}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={t.is_paid ? 'default' : 'secondary'}>
                  {t.is_paid ? 'Pago' : 'Pendente'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {!t.is_paid && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-success"
                      onClick={() => onMarkAsPaid(t.id)}
                      title="Marcar como pago"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(t)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => onDelete(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
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
  );
}

import { useState } from 'react';
import { Search, Plus, Check, Trash2, Pencil, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface TransactionListPanelProps {
  title: string;
  type: TransactionType;
  transactions: (FinancialTransaction & { customer?: any })[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (t: FinancialTransaction) => void;
  onDelete: (id: string) => Promise<any>;
  onMarkAsPaid: (id: string) => Promise<any>;
  buttonColor?: string;
}

export function TransactionListPanel({
  title, type, transactions, isLoading,
  onNew, onEdit, onDelete, onMarkAsPaid, buttonColor,
}: TransactionListPanelProps) {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = transactions
    .filter((t) => t.transaction_type === type)
    .filter((t) =>
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category?.toLowerCase().includes(search.toLowerCase())
    );

  const pagination = useDataPagination(filtered);

  const handleDelete = async () => {
    if (deleteId) {
      await onDelete(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={onNew} className={buttonColor}>
          <Plus className="mr-2 h-4 w-4" />
          {type === 'entrada' ? 'Nova Receita' : 'Nova Despesa'}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">Nenhum registro</h3>
              <p className="text-muted-foreground text-sm">Clique no botão acima para adicionar</p>
            </div>
          ) : (
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
                        <TableCell className="text-sm">
                          {format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{t.description}</p>
                            {t.customer && <p className="text-xs text-muted-foreground">{t.customer.name}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {t.category && <Badge variant="outline">{t.category}</Badge>}
                        </TableCell>
                        <TableCell>
                          <span className={`font-medium ${type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                            {formatCurrency(t.amount)}
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
                              <Button variant="ghost" size="icon" className="text-success" onClick={() => onMarkAsPaid(t.id)} title="Marcar como pago">
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => onEdit(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(t.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4">
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
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

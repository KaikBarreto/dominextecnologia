import { useState } from 'react';
import { Search, Plus, Check, Trash2, Pencil, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { useIsMobile } from '@/hooks/use-mobile';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface TransactionListPanelProps {
  title: string;
  type?: TransactionType | 'all';
  transactions: (FinancialTransaction & { customer?: any })[];
  isLoading: boolean;
  onNew?: () => void;
  onEdit: (t: FinancialTransaction) => void;
  onDelete: (id: string) => Promise<any>;
  onMarkAsPaid: (id: string) => Promise<any>;
  buttonColor?: string;
}

export function TransactionListPanel({
  title, type = 'all', transactions, isLoading,
  onNew, onEdit, onDelete, onMarkAsPaid, buttonColor,
}: TransactionListPanelProps) {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const filtered = transactions
    .filter((t) => type === 'all' || t.transaction_type === type)
    .filter((t) =>
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category?.toLowerCase().includes(search.toLowerCase())
    );

  const { sortedItems, sortConfig, handleSort } = useTableSort(filtered);
  const pagination = useDataPagination(sortedItems);

  const handleDelete = async () => {
    if (deleteId) {
      await onDelete(deleteId);
      setDeleteId(null);
    }
  };

  const showTypeColumn = type === 'all';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {onNew && (
          <Button onClick={onNew} className={buttonColor}>
            <Plus className="mr-2 h-4 w-4" />
            {type === 'entrada' ? 'Nova Receita' : type === 'saida' ? 'Nova Despesa' : 'Nova Transação'}
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">Nenhum registro</h3>
          <p className="text-muted-foreground text-sm">Nenhuma movimentação encontrada</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {pagination.paginatedItems.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{t.description}</p>
                    {t.customer && <p className="text-xs text-muted-foreground truncate">{t.customer.name}</p>}
                  </div>
                  <Badge variant={t.is_paid ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                    {t.is_paid ? 'Pago' : 'Pendente'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                    {showTypeColumn && (
                      <Badge className={`text-[10px] ${t.transaction_type === 'entrada' ? 'bg-success text-white' : 'bg-destructive text-white'}`}>
                        {t.transaction_type === 'entrada' ? 'Receita' : 'Despesa'}
                      </Badge>
                    )}
                  </div>
                  <span className={`font-semibold text-sm ${t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                    {t.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(t.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-1 justify-end pt-1 border-t">
                  {!t.is_paid && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => onMarkAsPaid(t.id)}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <DataTablePagination
            page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems}
            from={pagination.from} to={pagination.to} pageSize={pagination.pageSize}
            onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wider">Data</TableHead>
                    {showTypeColumn && <TableHead className="text-xs uppercase tracking-wider">Tipo</TableHead>}
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
                      {showTypeColumn && (
                        <TableCell>
                          <Badge className={t.transaction_type === 'entrada' ? 'bg-success text-white' : 'bg-destructive text-white'}>
                            <span className="flex items-center gap-1">
                              {t.transaction_type === 'entrada' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {t.transaction_type === 'entrada' ? 'Receita' : 'Despesa'}
                            </span>
                          </Badge>
                        </TableCell>
                      )}
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
                        <span className={`font-medium ${t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
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
                            <Button variant="ghost" size="icon" className="text-success" onClick={() => onMarkAsPaid(t.id)} title="Marcar como pago">
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="edit-ghost" size="icon" onClick={() => onEdit(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive-ghost" size="icon" onClick={() => setDeleteId(t.id)}>
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
                page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems}
                from={pagination.from} to={pagination.to} pageSize={pagination.pageSize}
                onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
              />
            </div>
          </CardContent>
        </Card>
      )}

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

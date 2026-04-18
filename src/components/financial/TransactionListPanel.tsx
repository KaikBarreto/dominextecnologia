import { useState, useMemo } from 'react';
import { fuzzyIncludes } from '@/lib/utils';
import { Search, Plus, Check, Trash2, Pencil, DollarSign, TrendingUp, TrendingDown, FileDown, Paperclip, Landmark, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { SignedLink } from '@/components/ui/SignedLink';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function parseLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(dateStr: string) {
  return parseLocalDate(dateStr).toLocaleDateString('pt-BR');
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'entrada' | 'saida'>('all');
  const isMobile = useIsMobile();

  const categories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach((t) => { if (t.category) cats.add(t.category); });
    return Array.from(cats).sort();
  }, [transactions]);

  const accountNames = useMemo(() => {
    const map = new Map<string, { name: string; type: string; color: string }>();
    transactions.forEach((t) => {
      const acc = (t as any).account;
      if (acc) map.set(acc.id, { name: acc.name, type: acc.type, color: acc.color });
    });
    return map;
  }, [transactions]);

  const effectiveType = type === 'all' ? typeFilter : type;

  const filtered = transactions
    .filter((t) => effectiveType === 'all' || t.transaction_type === effectiveType)
    .filter((t) => categoryFilter === 'all' || t.category === categoryFilter)
    .filter((t) => statusFilter === 'all' || (statusFilter === 'paid' ? t.is_paid : !t.is_paid))
    .filter((t) => accountFilter === 'all' || (t as any).account_id === accountFilter)
    .filter((t) => fuzzyIncludes(t.description, search) || fuzzyIncludes(t.category, search));

  const { sortedItems, sortConfig, handleSort } = useTableSort(filtered);
  const pagination = useDataPagination(sortedItems);

  const handleDelete = async () => {
    if (deleteId) { await onDelete(deleteId); setDeleteId(null); selectedIds.delete(deleteId); setSelectedIds(new Set(selectedIds)); }
  };
  const handleBulkDelete = async () => {
    for (const id of selectedIds) await onDelete(id);
    setSelectedIds(new Set()); setBulkDeleteOpen(false);
  };
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((t) => t.id)));
  };

  const handleExportCSV = () => {
    const headers = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Status', 'Conta', 'Parcela'];
    const rows = filtered.map((t) => [
      t.transaction_date,
      t.transaction_type === 'entrada' ? 'Receita' : 'Despesa',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.category || '',
      Number(t.amount).toFixed(2).replace('.', ','),
      t.is_paid ? 'Pago' : 'Pendente',
      (t as any).account?.name || '',
      (t as any).installment_number ? `${(t as any).installment_number}/${(t as any).installment_total}` : '',
    ]);
    const csv = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${title.toLowerCase()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;
  const showTypeColumn = type === 'all';

  const renderInstallmentBadge = (t: any) => {
    if (!t.installment_number) return null;
    return <Badge variant="outline" className="text-[10px] ml-1">{t.installment_number}/{t.installment_total}</Badge>;
  };

  const renderReceiptLink = (t: any) => {
    if (!t.receipt_url) return null;
    return (
      <SignedLink src={t.receipt_url} className="text-primary hover:text-primary/80" title="Ver comprovante">
        <Paperclip className="h-3.5 w-3.5" />
      </SignedLink>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {someSelected && (
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir {selectedIds.size}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1">
            <FileDown className="h-4 w-4" /> CSV
          </Button>
          {onNew && (
            <Button onClick={onNew} className={buttonColor}>
              <Plus className="mr-2 h-4 w-4" />
              {type === 'entrada' ? 'Nova Receita' : type === 'saida' ? 'Nova Despesa' : 'Nova Transação'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {type === 'all' && (
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="entrada">Receitas</SelectItem>
              <SelectItem value="saida">Despesas</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Conta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas contas</SelectItem>
            {Array.from(accountNames.entries()).map(([id, acc]) => (
              <SelectItem key={id} value={id}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                  {acc.type === 'caixa' ? `${acc.name} (dinheiro)` : acc.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">Nenhum registro</h3>
          <p className="text-muted-foreground text-sm">Nenhuma movimentação encontrada</p>
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {type !== 'all' && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              <span className="text-xs text-muted-foreground">Selecionar todos</span>
            </div>
          )}
          {pagination.paginatedItems.map((t) => (
            <Card key={t.id} className={selectedIds.has(t.id) ? 'ring-2 ring-primary' : ''}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {type !== 'all' && <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} className="mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {t.description}
                        {renderInstallmentBadge(t)}
                      </p>
                      {t.customer && <p className="text-xs text-muted-foreground truncate">{t.customer.name}</p>}
                      <div className="flex items-center gap-1 mt-0.5">
                        {(t as any).account && (
                          <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: (t as any).account.color }} />
                            {(t as any).account.type === 'caixa' ? `${(t as any).account.name} (dinheiro)` : (t as any).account.name}
                          </Badge>
                        )}
                        {renderReceiptLink(t)}
                      </div>
                    </div>
                  </div>
                  <Badge variant={t.is_paid ? 'default' : 'secondary'} className="shrink-0 text-[10px]">{t.is_paid ? 'Pago' : 'Pendente'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDate(t.transaction_date)}</span>
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
                  {!t.is_paid && <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => onMarkAsPaid(t.id)}><Check className="h-3.5 w-3.5" /></Button>}
                  <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
                    {type !== 'all' && (
                      <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[40px]">
                        <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                      </SortableTableHead>
                    )}
                    <SortableTableHead sortKey="transaction_date" sortConfig={sortConfig} onSort={handleSort}>Data</SortableTableHead>
                    {showTypeColumn && <SortableTableHead sortKey="transaction_type" sortConfig={sortConfig} onSort={handleSort}>Tipo</SortableTableHead>}
                    <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={handleSort}>Descrição</SortableTableHead>
                    <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">Categoria</SortableTableHead>
                    <SortableTableHead sortKey="account_id" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">Conta</SortableTableHead>
                    <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={handleSort}>Valor</SortableTableHead>
                    <SortableTableHead sortKey="is_paid" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[130px]">Ações</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((t) => (
                    <TableRow key={t.id} className={selectedIds.has(t.id) ? 'bg-primary/5' : ''}>
                      {type !== 'all' && <TableCell><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></TableCell>}
                      <TableCell className="text-sm">{formatDate(t.transaction_date)}</TableCell>
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
                          <p className="font-medium flex items-center gap-1">
                            {t.description}
                            {renderInstallmentBadge(t)}
                            {renderReceiptLink(t)}
                          </p>
                          {t.customer && <p className="text-xs text-muted-foreground">{t.customer.name}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {t.category && <Badge variant="outline">{t.category}</Badge>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {(t as any).account && (
                          <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit">
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: (t as any).account.color }} />
                            {(t as any).account.type === 'caixa' ? `${(t as any).account.name} (dinheiro)` : (t as any).account.name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                          {t.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(t.amount)}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant={t.is_paid ? 'default' : 'secondary'}>{t.is_paid ? 'Pago' : 'Pendente'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!t.is_paid && <Button variant="ghost" size="icon" className="text-success" onClick={() => onMarkAsPaid(t.id)} title="Marcar como pago"><Check className="h-4 w-4" /></Button>}
                          <Button variant="edit-ghost" size="icon" onClick={() => onEdit(t)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="destructive-ghost" size="icon" onClick={() => setDeleteId(t.id)}><Trash2 className="h-4 w-4" /></Button>
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} transações</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir {selectedIds.size} transações selecionadas?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir {selectedIds.size}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

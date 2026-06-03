import { useState, useMemo, useEffect } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { Search, Plus, Check, Trash2, Pencil, DollarSign, TrendingUp, TrendingDown, FileDown, Paperclip, X, Wallet, Landmark, CreditCard } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTransactionAttachmentsCounts } from '@/hooks/useTransactionAttachments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { SignedLink } from '@/components/ui/SignedLink';
import { FilterButton } from '@/components/ui/FilterButton';
import { Label } from '@/components/ui/label';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { getErrorMessage } from '@/utils/errorMessages';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { formatBRL } from '@/utils/currency';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import { RelatedTransactionsDialog } from './RelatedTransactionsDialog';
import { findRelatedTransactions, deleteTransactionCascade } from '@/hooks/useRelatedTransactions';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
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
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FABButton } from '@/components/mobile/FABButton';
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
  onMarkAsPaid: (params: any) => Promise<any>;
  buttonColor?: string;
  /** Pré-aplica o filtro de conta (deep-link a partir da tela "Contas e Cartões"). */
  initialAccountFilter?: string | null;
  /** Chamado quando o usuário remove o filtro de conta vindo do deep-link. */
  onClearAccountFilter?: () => void;
}

function getAccIcon(type: string) {
  if (type === 'caixa') return Wallet;
  if (type === 'cartao') return CreditCard;
  return Landmark;
}

export function TransactionListPanel({
  title, type = 'all', transactions, isLoading,
  onNew, onEdit, onDelete, onMarkAsPaid, buttonColor,
  initialAccountFilter, onClearAccountFilter,
}: TransactionListPanelProps) {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState(initialAccountFilter || 'all');

  // Mantém o filtro sincronizado com o deep-link (ex: usuário muda de conta na URL).
  useEffect(() => {
    if (initialAccountFilter) setAccountFilter(initialAccountFilter);
  }, [initialAccountFilter]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'entrada' | 'saida'>('all');
  const [receivingTxn, setReceivingTxn] = useState<(FinancialTransaction & { customer?: any }) | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ txn: FinancialTransaction; related: FinancialTransaction[]; linkedQuote: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isMobile = useIsMobile();
  const { accounts: allAccounts, balances: accountBalances } = useFinancialAccounts();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const categories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach((t) => { if (t.category) cats.add(t.category); });
    return Array.from(cats).sort();
  }, [transactions]);

  // Combine accounts from transactions + master list (so empty accounts also show)
  const accountNames = useMemo(() => {
    const map = new Map<string, { name: string; type: string; color: string }>();
    allAccounts.filter(a => a.is_active).forEach((a) => {
      map.set(a.id, { name: a.name, type: a.type, color: a.color });
    });
    transactions.forEach((t) => {
      const acc = (t as any).account;
      if (acc && !map.has(acc.id)) map.set(acc.id, { name: acc.name, type: acc.type, color: acc.color });
    });
    return map;
  }, [transactions, allAccounts]);

  const activeFiltersCount = [
    categoryFilter !== 'all',
    statusFilter !== 'all',
    accountFilter !== 'all',
    type === 'all' && typeFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setCategoryFilter('all');
    setStatusFilter('all');
    setAccountFilter('all');
    setTypeFilter('all');
    onClearAccountFilter?.();
  };

  const clearAccountFilterOnly = () => {
    setAccountFilter('all');
    onClearAccountFilter?.();
  };

  const effectiveType = type === 'all' ? typeFilter : type;

  const filtered = transactions
    .filter((t) => effectiveType === 'all' || t.transaction_type === effectiveType)
    .filter((t) => categoryFilter === 'all' || t.category === categoryFilter)
    .filter((t) => statusFilter === 'all' || (statusFilter === 'paid' ? t.is_paid : !t.is_paid))
    .filter((t) => accountFilter === 'all' || (t as any).account_id === accountFilter)
    .filter((t) => fuzzyIncludes(t.description, search) || fuzzyIncludes(t.category, search));

  // Resumo financeiro da conta filtrada (visível só quando há filtro ativo de conta).
  // Considera apenas as transações já filtradas (respeita período, tipo, categoria, status).
  // - Entradas no período: somatório de receitas pagas;
  // - Saídas no período: somatório de despesas pagas;
  // - Saldo inicial: vem do cadastro da conta;
  // - Saldo atual: usa o cálculo global do hook (atemporal — todas as transações pagas).
  const filteredAccount = accountFilter !== 'all'
    ? allAccounts.find((a) => a.id === accountFilter) ?? null
    : null;

  const accountSummary = useMemo(() => {
    if (!filteredAccount) return null;
    let entradas = 0;
    let saidas = 0;
    filtered.forEach((t) => {
      if (!t.is_paid) return;
      if (t.transaction_type === 'entrada') entradas += Number(t.amount);
      else saidas += Number(t.amount);
    });
    return {
      initialBalance: Number(filteredAccount.initial_balance),
      entradas,
      saidas,
      currentBalance: accountBalances[filteredAccount.id] ?? Number(filteredAccount.initial_balance),
    };
  }, [filtered, filteredAccount, accountBalances]);

  // Contagem de anexos da nova tabela — pra exibir paperclip quando há anexos
  const visibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  const { data: attachmentCounts = {} } = useTransactionAttachmentsCounts(visibleIds);

  const { sortedItems, sortConfig, handleSort } = useTableSort(filtered);
  const pagination = useDataPagination(sortedItems);

  const requestDelete = async (id: string) => {
    const txn = transactions.find((t) => t.id === id);
    if (!txn) return;
    const { related, linkedQuote } = await findRelatedTransactions(id);
    if (related.length === 0 && !linkedQuote) {
      // Plain delete
      setPendingDelete({ txn, related: [], linkedQuote: null });
    } else {
      setPendingDelete({ txn, related, linkedQuote });
    }
  };
  const confirmDelete = async (deleteAllRelated: boolean) => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteTransactionCascade(pendingDelete.txn.id, deleteAllRelated);
      const removedIds = new Set([pendingDelete.txn.id]);
      if (deleteAllRelated) pendingDelete.related.forEach((r) => removedIds.add(r.id));
      const next = new Set(selectedIds);
      removedIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({ title: deleteAllRelated ? 'Lançamentos excluídos!' : 'Lançamento excluído!' });
      setPendingDelete(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: getErrorMessage(e) });
    } finally {
      setIsDeleting(false);
    }
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

  // Mostra paperclip se tem comprovante legado (receipt_url) OU anexos na nova tabela.
  // Linka pro receipt_url quando existe (compatibilidade); senão um indicador estático
  // (a edição mostra a lista completa de anexos).
  const renderReceiptLink = (t: any) => {
    const hasLegacy = !!t.receipt_url;
    const newCount = attachmentCounts[t.id] ?? 0;
    if (!hasLegacy && newCount === 0) return null;

    if (hasLegacy) {
      return (
        <SignedLink src={t.receipt_url} className="text-primary hover:text-primary/80" title="Ver comprovante">
          <Paperclip className="h-3.5 w-3.5" />
        </SignedLink>
      );
    }
    // Sem legado, mas tem anexos novos: ícone + contagem (abrir pela edição)
    return (
      <span className="inline-flex items-center gap-0.5 text-primary" title={`${newCount} anexo${newCount !== 1 ? 's' : ''}`}>
        <Paperclip className="h-3.5 w-3.5" />
        {newCount > 1 && <span className="text-[10px] font-medium">{newCount}</span>}
      </span>
    );
  };

  // Para parcelas de cartão, exibe a data da fatura (credit_card_bill_date) com tooltip
  // da data original da compra. Para outras transações, exibe transaction_date normalmente.
  const renderTransactionDate = (t: any) => {
    const billDate: string | null = t.credit_card_bill_date ?? null;
    if (billDate) {
      const original = formatDate(t.transaction_date);
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              <span>{formatDate(billDate)}</span>
              <CreditCard className="h-3 w-3 text-muted-foreground" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Compra em {original}</p>
            <p className="text-[10px] text-muted-foreground">Data exibida: vencimento da fatura</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return <span>{formatDate(t.transaction_date)}</span>;
  };

  const newLabel = type === 'entrada' ? 'Receita' : type === 'saida' ? 'Despesa' : 'Transação';

  return (
    <div className="space-y-4">
      {/* Header inline — desktop. Mobile usa MobilePageHeader do parent + FAB. */}
      {!isMobile && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {someSelected && (
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} className="min-h-11 rounded-xl">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir {selectedIds.size}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1 min-h-11 rounded-xl">
              <FileDown className="h-4 w-4" /> CSV
            </Button>
            {onNew && (
              <Button onClick={onNew} className={cn('min-h-11 rounded-xl', buttonColor)}>
                <Plus className="mr-2 h-4 w-4" />
                {newLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Mobile: contagem compacta + ação de excluir em massa (quando tem seleção). */}
      {isMobile && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </p>
          {someSelected ? (
            <Button variant="destructive" size="sm" className="h-8" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir {selectedIds.size}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={handleExportCSV}>
              <FileDown className="h-3.5 w-3.5" /> CSV
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* FilterButton standard: tipo (quando type==='all') + categoria + status + conta.
            Drawer de baixo no mobile, sheet lateral no desktop (pattern v1.9.9). */}
        <FilterButton activeCount={activeFiltersCount} onClear={clearFilters}>
          {type === 'all' && (
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="entrada">Receitas</SelectItem>
                  <SelectItem value="saida">Despesas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Caixa / Conta bancária</Label>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos caixas e contas</SelectItem>
                {Array.from(accountNames.entries()).map(([id, acc]) => {
                  const Icon = getAccIcon(acc.type);
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full p-1" style={{ backgroundColor: acc.color }}>
                          <Icon className="h-3 w-3 text-white" />
                        </span>
                        {acc.type === 'caixa' ? `${acc.name} (dinheiro)` : acc.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </FilterButton>
      </div>

      {filteredAccount && accountSummary && (
        <Card className="border-primary/30 bg-primary/5 rounded-2xl shadow-sm">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="rounded-full p-1.5 shrink-0"
                  style={{ backgroundColor: filteredAccount.color }}
                >
                  {(() => { const Icon = getAccIcon(filteredAccount.type); return <Icon className="h-3.5 w-3.5 text-white" />; })()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground leading-tight">Filtrado por conta</p>
                  <p className="font-semibold text-sm truncate">{filteredAccount.name}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs rounded-lg"
                onClick={clearAccountFilterOnly}
              >
                <X className="h-3.5 w-3.5" /> Remover filtro
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Saldo inicial</p>
                <p className="font-semibold tabular-nums">{formatBRL(accountSummary.initialBalance)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Entradas no período</p>
                <p className="font-semibold text-success tabular-nums">+ {formatBRL(accountSummary.entradas)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saídas no período</p>
                <p className="font-semibold text-destructive tabular-nums">− {formatBRL(accountSummary.saidas)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Saldo atual</p>
                <p className={`font-semibold tabular-nums ${accountSummary.currentBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatBRL(accountSummary.currentBalance)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<DollarSign className="h-12 w-12" />}
          title="Nenhum registro"
          description={search || activeFiltersCount > 0 ? 'Tente filtros diferentes' : 'Nenhuma movimentação encontrada'}
        />
      ) : isMobile ? (
        <div className="space-y-3">
          {type !== 'all' && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              <span className="text-xs text-muted-foreground">Selecionar todos</span>
            </div>
          )}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            {pagination.paginatedItems.map((t) => {
              const isEntrada = t.transaction_type === 'entrada';
              const itemActions: ItemAction[] = [
                ...(!t.is_paid ? [{
                  key: 'mark-paid',
                  label: isEntrada ? 'Marcar recebido' : 'Marcar pago',
                  icon: <Check className="h-4 w-4" />,
                  onClick: () => isEntrada ? setReceivingTxn(t) : onMarkAsPaid({ id: t.id }),
                }] : []),
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => onEdit(t),
                },
                {
                  key: 'delete',
                  label: 'Excluir',
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => requestDelete(t.id),
                },
              ];
              return (
                <MobileListItem
                  key={t.id}
                  actions={itemActions}
                  className={cn(
                    'transition-transform active:scale-[0.98]',
                    selectedIds.has(t.id) && 'bg-primary/5',
                  )}
                  leading={
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0',
                        isEntrada ? 'bg-success' : 'bg-destructive',
                      )}
                    >
                      {isEntrada ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </div>
                  }
                  title={
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{t.description}</span>
                      {renderInstallmentBadge(t)}
                      {renderReceiptLink(t)}
                    </div>
                  }
                  subtitle={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{renderTransactionDate(t)}</span>
                      {(t as any).account && (
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: (t as any).account.color }} />
                          {(t as any).account.type === 'caixa' ? `${(t as any).account.name} (dinheiro)` : (t as any).account.name}
                        </span>
                      )}
                      {t.customer && <span className="truncate">{t.customer.name}</span>}
                    </div>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('font-semibold text-sm whitespace-nowrap tabular-nums', isEntrada ? 'text-success' : 'text-destructive')}>
                        {isEntrada ? '+' : '-'} {formatCurrency(t.amount)}
                      </span>
                      <Badge variant={t.is_paid ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                        {t.is_paid ? 'Pago' : 'Pendente'}
                      </Badge>
                    </div>
                  }
                />
              );
            })}
          </div>
          <DataTablePagination
            page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems}
            from={pagination.from} to={pagination.to} pageSize={pagination.pageSize}
            onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
          />
        </div>
      ) : (
        <Card className="rounded-2xl shadow-sm overflow-hidden">
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
                      <TableCell className="text-sm">{renderTransactionDate(t)}</TableCell>
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
                        <span className={`font-medium tabular-nums ${t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                          {t.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(t.amount)}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant={t.is_paid ? 'default' : 'secondary'}>{t.is_paid ? 'Pago' : 'Pendente'}</Badge></TableCell>
                      <TableCell>
                        <RowActionsMenu
                          actions={[
                            {
                              label: t.transaction_type === 'entrada' ? 'Marcar como recebido' : 'Marcar como pago',
                              icon: Check,
                              onClick: () => t.transaction_type === 'entrada' ? setReceivingTxn(t) : onMarkAsPaid({ id: t.id }),
                              hidden: t.is_paid,
                            },
                            { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => onEdit(t) },
                            { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => requestDelete(t.id) },
                          ] satisfies RowAction[]}
                        />
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

      <RelatedTransactionsDialog
        open={!!pendingDelete}
        onOpenChange={(v) => { if (!v) setPendingDelete(null); }}
        transaction={pendingDelete?.txn ?? null}
        related={pendingDelete?.related ?? []}
        linkedQuote={pendingDelete?.linkedQuote ?? null}
        mode="delete"
        onConfirm={confirmDelete}
        isProcessing={isDeleting}
      />

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

      <ReceivePaymentModal
        open={!!receivingTxn}
        onOpenChange={(v) => { if (!v) setReceivingTxn(null); }}
        amount={Number(receivingTxn?.amount ?? 0)}
        amountReceived={Number((receivingTxn as any)?.amount_received ?? 0)}
        allowPartial
        installmentTotal={receivingTxn?.installment_total ?? 1}
        currentDueDate={receivingTxn?.due_date}
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
            amountReceived: payment.amount_received,
            newDueDate: payment.new_due_date,
          });
          setReceivingTxn(null);
        }}
      />

      {/* FAB mobile (fora do header). Desktop usa o botão inline acima. */}
      {isMobile && onNew && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={newLabel}
          onClick={onNew}
        />
      )}
    </div>
  );
}

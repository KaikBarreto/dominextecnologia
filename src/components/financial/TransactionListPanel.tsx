import { useState, useMemo, useEffect } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { Search, Plus, Trash2, Pencil, DollarSign, TrendingUp, TrendingDown, FileDown, Paperclip, CreditCard, FileText, FileSpreadsheet, ChevronDown, ArrowLeftRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatarTooltip } from '@/components/ui/UserAvatarTooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { type MovimentacaoReportRow } from '@/utils/movimentacoesReportHtmlGenerator';
import { generateMovimentacoesReportPdf } from '@/utils/movimentacoesPdfGenerator';
import { generateMovimentacoesExcel } from '@/utils/movimentacoesExcelGenerator';
import { useTransactionAttachmentsCounts } from '@/hooks/useTransactionAttachments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { SignedLink } from '@/components/ui/SignedLink';
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { getErrorMessage } from '@/utils/errorMessages';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { RelatedTransactionsDialog } from './RelatedTransactionsDialog';
import { findRelatedTransactions, deleteTransactionCascade } from '@/hooks/useRelatedTransactions';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
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
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FABButton } from '@/components/mobile/FABButton';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

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
  buttonColor?: string;
  /** Pré-aplica o filtro de conta (deep-link a partir da tela "Contas e Cartões"). */
  initialAccountFilter?: string | null;
  /** Chamado quando o usuário remove o filtro de conta vindo do deep-link. */
  onClearAccountFilter?: () => void;
  /**
   * Esconde a coluna CONTA (desktop) e o badge de conta (mobile). Usado quando
   * uma única conta está selecionada — redundante, toda linha é da mesma conta.
   */
  hideAccountColumn?: boolean;
  /**
   * Mapa id-da-transação → saldo da conta DEPOIS daquela movimentação.
   * Quando fornecido (só na conta bancária/caixa específica), exibe a coluna
   * "Saldo Após" logo após "Valor". Ausente no ALL_TAB e no cartão.
   */
  balanceAfterById?: Map<string, number>;
}

export function TransactionListPanel({
  title, type = 'all', transactions, isLoading,
  onNew, onEdit, onDelete, buttonColor,
  initialAccountFilter, onClearAccountFilter, hideAccountColumn,
  balanceAfterById,
}: TransactionListPanelProps) {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  // Filtros multi-select: vazio = "todos" (mostra tudo). Pattern FilterCheckboxGroup.
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  // Deep-link de conta vem como string única do parent → vira array de 1.
  const [accountFilter, setAccountFilter] = useState<string[]>(initialAccountFilter ? [initialAccountFilter] : []);

  // Mantém o filtro sincronizado com o deep-link (ex: usuário muda de conta na URL).
  useEffect(() => {
    if (initialAccountFilter) setAccountFilter([initialAccountFilter]);
  }, [initialAccountFilter]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ txn: FinancialTransaction; related: FinancialTransaction[]; linkedQuote: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const { accounts: allAccounts } = useFinancialAccounts();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
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
    categoryFilter.length > 0,
    accountFilter.length > 0,
    type === 'all' && typeFilter.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setCategoryFilter([]);
    setAccountFilter([]);
    setTypeFilter([]);
    onClearAccountFilter?.();
  };

  const filtered = transactions
    .filter((t) => (type === 'all'
      ? (typeFilter.length === 0 || typeFilter.includes(t.transaction_type))
      : t.transaction_type === type))
    .filter((t) => categoryFilter.length === 0 || (t.category != null && categoryFilter.includes(t.category)))
    .filter((t) => accountFilter.length === 0 || accountFilter.includes((t as any).account_id))
    .filter((t) => fuzzyIncludes(t.description, search) || fuzzyIncludes(t.category, search));

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

  // Monta as linhas do export a partir do conjunto exibido (respeita período +
  // busca + filtros vigentes). Mesma data exibida na tabela: quando a transação
  // é parcela de cartão, usa a data da fatura (credit_card_bill_date).
  const buildExportRows = (): MovimentacaoReportRow[] =>
    filtered.map((t) => ({
      date: (t as any).credit_card_bill_date ?? t.transaction_date,
      type: t.transaction_type === 'entrada' ? 'entrada' : 'saida',
      description: t.description || '',
      category: t.category || '',
      account: (t as any).account?.name || '',
      amount: Number(t.amount),
      isPaid: !!t.is_paid,
    }));

  const handleExportPDF = async () => {
    try {
      await generateMovimentacoesReportPdf({
        company: companySettings,
        whiteLabel: whiteLabelEnabled,
        title,
        rows: buildExportRows(),
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao gerar PDF', description: getErrorMessage(e) });
    }
  };

  const handleExportExcel = async () => {
    try {
      await generateMovimentacoesExcel({ title, rows: buildExportRows() });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao gerar Excel', description: getErrorMessage(e) });
    }
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
            <p className="text-xs">{fin.transactionList.tooltip.purchaseOn} {original}</p>
            <p className="text-[10px] text-muted-foreground">{fin.transactionList.tooltip.invoiceDueDate}</p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return <span>{formatDate(t.transaction_date)}</span>;
  };

  // Avatar de quem criou a movimentação (creator vem resolvido do hook useFinancial).
  // Tooltip com nome completo + e-mail; fallback neutro quando não identificado.
  const renderCreatorAvatar = (t: any) => {
    const creator = t.creator as { full_name: string | null; email: string | null; avatar_url: string | null } | null;
    return (
      <UserAvatarTooltip
        name={creator?.full_name}
        email={creator?.email}
        avatarUrl={creator?.avatar_url}
      />
    );
  };

  const newLabel = type === 'entrada' ? fin.transactionList.newLabel.revenue : type === 'saida' ? fin.transactionList.newLabel.expense : fin.transactionList.newLabel.transaction;

  return (
    <div className="space-y-4">
      {/* Header inline — desktop. Mobile usa MobilePageHeader do parent + FAB. */}
      {!isMobile && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground">{filtered.length} {filtered.length !== 1 ? fin.transactionList.countPlural : fin.transactionList.countSingular}</p>
          </div>
          <div className="flex items-center gap-2">
            {someSelected && (
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} className="min-h-11 rounded-xl">
                <Trash2 className="mr-2 h-4 w-4" /> {fin.transactionList.deleteSelected} {selectedIds.size}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 min-h-11 rounded-xl">
                  <FileDown className="h-4 w-4" /> {fin.transactionList.export} <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={handleExportPDF}
                  className="gap-2 cursor-pointer focus:bg-info focus:text-white hover:bg-info hover:text-white"
                >
                  <FileText className="h-4 w-4" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportExcel}
                  className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            {filtered.length} {filtered.length !== 1 ? fin.transactionList.countPlural : fin.transactionList.countSingular}
          </p>
          {someSelected ? (
            <Button variant="destructive" size="sm" className="h-8" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {fin.transactionList.deleteSelected} {selectedIds.size}
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1">
                  <FileDown className="h-3.5 w-3.5" /> {fin.transactionList.export} <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={handleExportPDF}
                  className="gap-2 cursor-pointer focus:bg-info focus:text-white hover:bg-info hover:text-white"
                >
                  <FileText className="h-4 w-4" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportExcel}
                  className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={fin.transactionList.search} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* FilterButton standard: tipo (quando type==='all') + categoria + conta.
            Sem filtro de Status: Movimentações = só realizado (is_paid), todo registro é "Pago".
            Drawer de baixo no mobile, sheet lateral no desktop (pattern v1.9.9). */}
        <FilterButton activeCount={activeFiltersCount} onClear={clearFilters}>
          {type === 'all' && (
            <FilterCheckboxGroup
              label={fin.transactionList.filters.type}
              selected={typeFilter}
              onChange={setTypeFilter}
              emptyLabel={fin.transactionList.filters.typeAll}
              options={[
                { value: 'entrada', label: fin.transactionList.filters.typeRevenue },
                { value: 'saida', label: fin.transactionList.filters.typeExpense },
              ]}
            />
          )}
          <FilterCheckboxGroup
            label={fin.transactionList.filters.category}
            selected={categoryFilter}
            onChange={setCategoryFilter}
            emptyLabel={fin.transactionList.filters.categoryAll}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
          <FilterCheckboxGroup
            label={fin.transactionList.filters.account}
            selected={accountFilter}
            onChange={setAccountFilter}
            emptyLabel={fin.transactionList.filters.accountAll}
            options={Array.from(accountNames.entries()).map(([id, acc]) => ({
              value: id,
              label: acc.type === 'caixa' ? `${acc.name} ${fin.transactionList.filters.cash}` : acc.name,
              color: acc.color,
            }))}
          />
        </FilterButton>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        (search || activeFiltersCount > 0) ? (
          <EmptyState
            size="compact"
            icon={<ArrowLeftRight className="h-10 w-10" />}
            title={fin.transactionList.empty.notFoundTitle}
            description={fin.transactionList.empty.notFoundDescription}
          />
        ) : (
          <EmptyState
            size="compact"
            icon={<ArrowLeftRight className="h-10 w-10" />}
            title={fin.transactionList.empty.noneTitle}
            description={fin.transactionList.empty.noneDescription}
            action={onNew ? { label: `Nova ${newLabel.toLowerCase()}`, onClick: onNew } : undefined}
          />
        )
      ) : isMobile ? (
        <div className="space-y-3">
          {type !== 'all' && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              <span className="text-xs text-muted-foreground">{fin.transactionList.selectAll}</span>
            </div>
          )}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            {pagination.paginatedItems.map((t) => {
              const isEntrada = t.transaction_type === 'entrada';
              const itemActions: ItemAction[] = [
                {
                  key: 'edit',
                  label: fin.transactionList.rowActions.edit,
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => onEdit(t),
                },
                {
                  key: 'delete',
                  label: fin.transactionList.rowActions.delete,
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
                      {renderCreatorAvatar(t)}
                      <span>{renderTransactionDate(t)}</span>
                      {!hideAccountColumn && (t as any).account && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: (t as any).account.color }} />
                          {(t as any).account.type === 'caixa' ? `${(t as any).account.name} (dinheiro)` : (t as any).account.name}
                        </span>
                      )}
                      {t.customer && <span className="truncate">{t.customer.name}</span>}
                    </div>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn('font-semibold text-sm whitespace-nowrap tabular-nums', isEntrada ? 'text-success' : 'text-destructive')}>
                        {isEntrada ? '+' : '-'} {fmt(t.amount)}
                      </span>
                      {balanceAfterById?.has(t.id) && (
                        <span className={cn(
                          'text-[11px] whitespace-nowrap tabular-nums text-muted-foreground',
                          (balanceAfterById.get(t.id) ?? 0) < 0 && 'text-destructive',
                        )}>
                          {fin.transactionList.balance}: {fmt(balanceAfterById.get(t.id) ?? 0)}
                        </span>
                      )}
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
                    <SortableTableHead sortKey="transaction_date" sortConfig={sortConfig} onSort={handleSort}>{fin.transactionList.table.date}</SortableTableHead>
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[80px] text-center">{fin.transactionList.table.user}</SortableTableHead>
                    {showTypeColumn && <SortableTableHead sortKey="transaction_type" sortConfig={sortConfig} onSort={handleSort}>{fin.transactionList.table.type}</SortableTableHead>}
                    <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={handleSort}>{fin.transactionList.table.description}</SortableTableHead>
                    <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">{fin.transactionList.table.category}</SortableTableHead>
                    {!hideAccountColumn && (
                      <SortableTableHead sortKey="account_id" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">{fin.transactionList.table.account}</SortableTableHead>
                    )}
                    <SortableTableHead sortKey="amount" sortConfig={sortConfig} onSort={handleSort}>{fin.transactionList.table.amount}</SortableTableHead>
                    {balanceAfterById && (
                      <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="text-right">{fin.transactionList.table.balanceAfter}</SortableTableHead>
                    )}
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[130px]">{fin.transactionList.table.actions}</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((t) => (
                    <TableRow key={t.id} className={selectedIds.has(t.id) ? 'bg-primary/5' : ''}>
                      {type !== 'all' && <TableCell><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></TableCell>}
                      <TableCell className="text-sm">{renderTransactionDate(t)}</TableCell>
                      <TableCell className="text-center"><div className="flex justify-center">{renderCreatorAvatar(t)}</div></TableCell>
                      {showTypeColumn && (
                        <TableCell>
                          <Badge className={t.transaction_type === 'entrada' ? 'bg-success text-white' : 'bg-destructive text-white'}>
                            <span className="flex items-center gap-1">
                              {t.transaction_type === 'entrada' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {t.transaction_type === 'entrada' ? fin.transactionList.badges.revenue : fin.transactionList.badges.expense}
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
                      {!hideAccountColumn && (
                        <TableCell className="hidden lg:table-cell">
                          {(t as any).account && (
                            <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit whitespace-nowrap">
                              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: (t as any).account.color }} />
                              <span className="whitespace-nowrap">
                                {(t as any).account.type === 'caixa' ? `${(t as any).account.name} (dinheiro)` : (t as any).account.name}
                              </span>
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <span className={`font-medium tabular-nums whitespace-nowrap ${t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                          {t.transaction_type === 'entrada' ? '+' : '-'} {fmt(t.amount)}
                        </span>
                      </TableCell>
                      {balanceAfterById && (
                        <TableCell className="text-right">
                          {balanceAfterById.has(t.id) ? (
                            <span className={cn(
                              'font-medium tabular-nums whitespace-nowrap',
                              (balanceAfterById.get(t.id) ?? 0) < 0 && 'text-destructive',
                            )}>
                              {fmt(balanceAfterById.get(t.id) ?? 0)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <RowActionsMenu
                          actions={[
                            { label: fin.transactionList.rowActions.edit, icon: Pencil, variant: 'edit', onClick: () => onEdit(t) },
                            { label: fin.transactionList.rowActions.delete, icon: Trash2, variant: 'delete', onClick: () => requestDelete(t.id) },
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
            <AlertDialogTitle>{fin.transactionList.bulkDeleteDialog.titlePrefix} {selectedIds.size} {fin.transactionList.bulkDeleteDialog.titleSuffix}</AlertDialogTitle>
            <AlertDialogDescription>{fin.transactionList.bulkDeleteDialog.descriptionPrefix} {selectedIds.size} {fin.transactionList.bulkDeleteDialog.descriptionSuffix}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{fin.transactionList.bulkDeleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{fin.transactionList.bulkDeleteDialog.confirm} {selectedIds.size}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

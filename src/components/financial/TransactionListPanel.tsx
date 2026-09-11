import { useState, useMemo, useEffect, useRef } from 'react';
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
import { useCostCenters } from '@/hooks/useCostCenters';
import { filterByCostCenters, NO_COST_CENTER } from '@/lib/cost-center-breakdown';
import { getErrorMessage } from '@/utils/errorMessages';
// Estorno de pagamento de fatura é feito por RPC, que devolve mensagem já em PT-BR
// no SQLSTATE P0001. `getRpcErrorMessage` entrega essa mensagem limpa (o
// `getErrorMessage` genérico deixa o ` | P0001` colado no fim).
import { getRpcErrorMessage } from '@/hooks/useCreditCardBills';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { RelatedTransactionsDialog } from './RelatedTransactionsDialog';
import { findRelatedTransactions, deleteTransactionCascade } from '@/hooks/useRelatedTransactions';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
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

/**
 * Rótulo do divisor de dia: "28 de julho" (ano corrente) ou "28 de julho de
 * 2025" (ano diferente). `locale` (pt-br/en/es/fr) já é aceito CRU pelo
 * `Intl.DateTimeFormat` neste repo — mesmo padrão do Schedule.tsx, sem mapear
 * pra tag BCP47 (a especificação é case-insensitive). SEMPRE `parseLocalDate`,
 * nunca `new Date(str)` cru — vira UTC e joga o dia pro anterior no fuso de SP.
 */
function formatDayDividerLabel(dateKey: string, locale: string) {
  const date = parseLocalDate(dateKey);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  }).format(date);
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
   * Mapa id-da-transação → saldo DEPOIS daquela movimentação. Quando fornecido
   * (conta bancária/caixa específica OU Visão Geral consolidada), exibe a
   * coluna "Saldo Após" logo após "Valor". Ausente no cartão.
   */
  balanceAfterById?: Map<string, number>;
  /**
   * Rótulo da coluna de saldo (desktop). Default: `fin.transactionList.table.balanceAfter`
   * ("Saldo Após"). A Visão Geral passa "Saldo Total Após" — o mapa ali é
   * CONSOLIDADO (soma de todas as contas), rótulo "Saldo Após" sozinho
   * sugeriria erroneamente o extrato de uma única conta.
   */
  balanceAfterLabel?: string;
  /**
   * Rótulo curto do saldo (mobile, trailing do MobileListItem). Default:
   * `fin.transactionList.balance` ("Saldo").
   */
  balanceAfterShortLabel?: string;
  /**
   * Agrupa as linhas por dia com uma faixa divisória mostrando o saldo de
   * fechamento do dia (estilo extrato Mercado Pago). Só ligado em
   * Movimentações — NÃO ligar em telas de Contas a Pagar/Receber (lista por
   * vencimento, saldo de dia não faz sentido lá).
   */
  groupByDay?: boolean;
  /**
   * dateKey ('YYYY-MM-DD') → saldo de fechamento daquele dia. Sem isso, o
   * divisor mostra só a data (sem valor). A dateKey tem que bater com a data
   * que a LINHA exibe (`credit_card_bill_date ?? transaction_date`), a mesma
   * regra de `renderTransactionDate` — senão o divisor briga com a data
   * mostrada na linha logo abaixo dele.
   */
  dayClosingBalance?: Map<string, number>;
  /**
   * Deep-link `?txn=ID` (Finance.tsx): destaca a linha e rola até ela, pulando
   * pra página da paginação onde ela está. `null`/ausente = comportamento normal.
   */
  highlightTransactionId?: string | null;
}

export function TransactionListPanel({
  title, type = 'all', transactions, isLoading,
  onNew, onEdit, onDelete, buttonColor,
  initialAccountFilter, onClearAccountFilter, hideAccountColumn,
  balanceAfterById, balanceAfterLabel, balanceAfterShortLabel,
  groupByDay, dayClosingBalance, highlightTransactionId,
}: TransactionListPanelProps) {
  const { hasPermission, isAdminOrGestor, hasPermissionRecord } = useAuth();
  // Espelha `public.can_delete_finance` (RLS de DELETE em financial_transactions):
  // admin/gestor sempre; para os demais, SÓ com registro em user_permissions
  // contendo a permissão (ou o curinga '*'). O fallback legado do
  // `hasPermission` (sem registro => libera por ter qualquer role) NÃO vale
  // aqui: mostraria o botão pra quem o banco recusa. UX; a trava é a RLS.
  const canDeleteFinance = isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:delete_finance'));
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
  // 4o filtro: centro de custo. Mesma semântica dos outros (vazio = todos), com
  // um balde explícito pra lançamento SEM centro — sem ele, filtrar esconderia
  // esses lançamentos e ninguém entenderia por que a lista encolheu.
  const [costCenterFilter, setCostCenterFilter] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ txn: FinancialTransaction; related: FinancialTransaction[]; linkedQuote: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  // Rótulos de saldo resolvidos: o caller (FinanceMovimentacoes) só passa
  // `balanceAfterLabel`/`balanceAfterShortLabel` na Visão Geral consolidada;
  // na conta selecionada cai no default ("Saldo Após" / "Saldo").
  const resolvedBalanceAfterLabel = balanceAfterLabel ?? fin.transactionList.table.balanceAfter;
  const resolvedBalanceAfterShortLabel = balanceAfterShortLabel ?? fin.transactionList.balance;
  const { accounts: allAccounts } = useFinancialAccounts();
  const { costCenters } = useCostCenters();
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

  // Centros ofertados no filtro: todos os ativos + qualquer um já usado nas
  // transações da tela (mesmo desativado depois) — senão o lançamento antigo
  // ficaria impossível de filtrar.
  const costCenterOptions = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    costCenters.filter((c) => c.is_active).forEach((c) => map.set(c.id, { name: c.name, color: c.color }));
    transactions.forEach((t) => {
      const id = t.cost_center_id;
      if (!id || map.has(id)) return;
      const known = costCenters.find((c) => c.id === id);
      // Id que não está na lista da empresa (ou lista ainda carregando) não vira
      // opção: um rótulo genérico seria pior que não oferecer o filtro.
      if (!known) return;
      map.set(id, { name: `${known.name} (${fin.costCenters.inactiveSuffix})`, color: known.color });
    });
    return Array.from(map.entries()).map(([value, c]) => ({ value, label: c.name, color: c.color }));
  }, [costCenters, transactions, fin.costCenters.inactiveSuffix]);

  const activeFiltersCount = [
    categoryFilter.length > 0,
    accountFilter.length > 0,
    costCenterFilter.length > 0,
    type === 'all' && typeFilter.length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setCategoryFilter([]);
    setAccountFilter([]);
    setCostCenterFilter([]);
    setTypeFilter([]);
    onClearAccountFilter?.();
  };

  // `filterByCostCenters` (motor puro, com teste) aplica a semântica do balde
  // "Sem centro de custo" — a mesma usada pela DRE, pra as duas telas nunca
  // discordarem sobre o que é "sem centro".
  const filtered = filterByCostCenters(transactions, costCenterFilter)
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

  // Divisor de dia só faz sentido em ordem cronológica: agrupar por dia numa
  // lista ordenada por valor/descrição/categoria/conta seria mentira (o "dia"
  // deixaria de corresponder a um bloco contíguo de linhas). `sortConfig.key
  // === ''` é o default (sem clique manual do usuário) — a ordem então vem do
  // hook (`transaction_date desc`), também cronológica.
  const canGroupByDay = groupByDay === true
    && (sortConfig.key === '' || sortConfig.key === 'transaction_date');

  type PagedTxn = (typeof pagination.paginatedItems)[number];
  type DayOrRow = { kind: 'day'; dateKey: string } | { kind: 'row'; txn: PagedTxn };

  // Intercala divisores de dia com as linhas da PÁGINA ATUAL — única fonte de
  // verdade da regra de agrupamento; os dois renders (mobile e desktop)
  // percorrem esta MESMA lista, então nunca dessincronizam entre si. Se um dia
  // é cortado entre páginas, o divisor reaparece no topo da página seguinte
  // (comportamento aceito, não é bug).
  const rowsWithDayDividers: DayOrRow[] = useMemo(() => {
    if (!canGroupByDay) {
      return pagination.paginatedItems.map((txn) => ({ kind: 'row' as const, txn }));
    }
    const out: DayOrRow[] = [];
    let lastKey: string | null = null;
    for (const txn of pagination.paginatedItems) {
      // Mesma regra de `renderTransactionDate`: parcela de cartão mostra a
      // data da FATURA, não a da compra — o divisor tem que bater com o que a
      // linha exibe, senão brigam entre si.
      const dateKey = String((txn as any).credit_card_bill_date ?? txn.transaction_date);
      if (dateKey !== lastKey) {
        out.push({ kind: 'day', dateKey });
        lastKey = dateKey;
      }
      out.push({ kind: 'row', txn });
    }
    return out;
  }, [canGroupByDay, pagination.paginatedItems]);

  // Nº de colunas de fato renderizadas na tabela desktop — MESMAS flags que
  // montam o <TableHeader> abaixo. Const única usada nos dois lugares pra
  // nunca dessincronizar o colSpan do divisor de dia do cabeçalho real.
  // NOTA: usa `type === 'all'` cru (não a const `showTypeColumn`, que só é
  // declarada mais abaixo, perto do JSX) pra não criar dependência de ordem
  // de declaração — ambas resolvem pro mesmo valor.
  const visibleColumnCount =
    (type !== 'all' && canDeleteFinance ? 1 : 0) // checkbox
    + 1 // data
    + 1 // usuário
    + (type === 'all' ? 1 : 0) // tipo (== showTypeColumn)
    + 1 // descrição
    + 1 // categoria (hidden md:table-cell — some visualmente, mas a coluna existe)
    + (!hideAccountColumn ? 1 : 0) // conta (hidden lg:table-cell)
    + 1 // valor
    + (balanceAfterById ? 1 : 0) // saldo após
    + 1; // ações

  // ── Deep-link `?txn=ID`: leva o usuário até a linha ───────────────────────
  //
  // Dois refs, um por layout. O painel renderiza mobile OU desktop (`isMobile`),
  // mas ref ÚNICO compartilhado entre layouts responsivos já quebrou rolagem
  // neste repo: o layout escondido sobrescreve o ref e o `scrollIntoView` roda
  // num elemento `display:none` (no-op silencioso, só no celular). Por isso
  // guardamos os dois e rolamos no que estiver de fato visível (`offsetParent`).
  const highlightMobileRef = useRef<HTMLDivElement | null>(null);
  const highlightDesktopRef = useRef<HTMLTableRowElement | null>(null);
  // Marca o id já atendido: sem isso o efeito (que roda a cada render, porque
  // `sortedItems`/`pagination` são recriados) desfaria a troca de página feita
  // pelo próprio usuário depois de chegar na linha.
  const scrolledToHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (!highlightTransactionId) {
      scrolledToHighlightRef.current = null;
      return;
    }
    if (scrolledToHighlightRef.current === highlightTransactionId) return;

    // A lista é paginada: destacar sem trocar de página não adianta nada, a
    // linha simplesmente não está montada. Acha o índice no conjunto ORDENADO
    // (o mesmo que a paginação fatia) e vai pra página dela.
    const index = sortedItems.findIndex((t) => t.id === highlightTransactionId);
    if (index < 0) return; // ainda carregando / fora do filtro: tenta no próximo render
    const size = pagination.pageSize === 'all'
      ? Math.max(sortedItems.length, 1)
      : pagination.pageSize;
    const targetPage = Math.floor(index / size) + 1;
    if (targetPage !== pagination.page) {
      pagination.setPage(targetPage);
      return; // a linha ainda não existe no DOM; rola no render seguinte
    }

    const node = [highlightMobileRef.current, highlightDesktopRef.current]
      .find((n): n is HTMLDivElement | HTMLTableRowElement => !!n && n.offsetParent !== null);
    if (!node) return;
    scrolledToHighlightRef.current = highlightTransactionId;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

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
      toast({ title: deleteAllRelated ? fin.transactionList.toastDeletedPlural : fin.transactionList.toastDeleted });
      setPendingDelete(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: fin.transactionList.toastDeleteError, description: getRpcErrorMessage(e) });
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
        locale,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: fin.transactionList.toastPdfError, description: getErrorMessage(e) });
    }
  };

  const handleExportExcel = async () => {
    try {
      await generateMovimentacoesExcel({ title, rows: buildExportRows(), locale });
    } catch (e: any) {
      toast({ variant: 'destructive', title: fin.transactionList.toastExcelError, description: getErrorMessage(e) });
    }
  };

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = canDeleteFinance && selectedIds.size > 0;
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
          {costCenterOptions.length > 0 && (
            <FilterCheckboxGroup
              label={fin.costCenters.filterLabel}
              selected={costCenterFilter}
              onChange={setCostCenterFilter}
              emptyLabel={fin.costCenters.filterEmptyLabel}
              options={[
                ...costCenterOptions,
                { value: NO_COST_CENTER, label: fin.costCenters.dreNoCenter },
              ]}
            />
          )}
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
            {rowsWithDayDividers.map((item) => {
              if (item.kind === 'day') {
                // Faixa dentro do MESMO card branco (não é um card à parte) —
                // pattern do extrato Mercado Pago. `min-w-0 truncate` na data
                // + `shrink-0` no valor pra não estourar em 320px (rede de
                // segurança: `gap-2` some antes de quebrar layout).
                const closing = dayClosingBalance?.get(item.dateKey);
                return (
                  <div
                    key={`day-${item.dateKey}`}
                    className="flex items-center justify-between gap-2 bg-muted/40 px-4 py-2 border-y"
                  >
                    <span className="text-xs font-semibold truncate min-w-0">
                      {formatDayDividerLabel(item.dateKey, locale)}
                    </span>
                    {closing !== undefined && (
                      <span className={cn(
                        'text-xs text-muted-foreground tabular-nums shrink-0',
                        closing < 0 && 'text-destructive',
                      )}>
                        {/* Rótulo curto ("Saldo") em vez de "Saldo do dia": em
                            320px o par rótulo+valor não cabe numa linha só
                            com a data à esquerda sem quebrar/truncar o valor
                            (que é o dado mais importante aqui). */}
                        {fin.transactionList.dayDivider.titleShort} {fmt(closing)}
                      </span>
                    )}
                  </div>
                );
              }

              const t = item.txn;
              const isEntrada = t.transaction_type === 'entrada';
              const isHighlighted = t.id === highlightTransactionId;
              const itemActions: ItemAction[] = [
                {
                  key: 'edit',
                  label: fin.transactionList.rowActions.edit,
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => onEdit(t),
                },
                ...(canDeleteFinance ? [{
                  key: 'delete',
                  label: fin.transactionList.rowActions.delete,
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => requestDelete(t.id),
                }] : []),
              ];
              const listItem = (
                <MobileListItem
                  key={t.id}
                  actions={itemActions}
                  className={cn(
                    'transition-transform active:scale-[0.98]',
                    selectedIds.has(t.id) && 'bg-primary/5',
                    isHighlighted && 'bg-primary/10 ring-2 ring-inset ring-primary',
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
                          {(t as any).account.type === 'caixa' ? `${(t as any).account.name} ${fin.transactionList.cashSuffix}` : (t as any).account.name}
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
                          {resolvedBalanceAfterShortLabel}: {fmt(balanceAfterById.get(t.id) ?? 0)}
                        </span>
                      )}
                    </div>
                  }
                />
              );

              // A linha do deep-link ganha um wrapper só pra carregar o ref
              // (MobileListItem não repassa ref). O divisor migra pro wrapper:
              // dentro dele o `last:border-b-0` do item passa a valer sempre e a
              // linha perderia a borda de baixo. O realce (ring) fica no item, não
              // aqui: `ring-inset` do pai seria coberto pelo fundo do filho.
              if (!isHighlighted) return listItem;
              return (
                <div key={t.id} ref={highlightMobileRef} className="border-b border-border/60 last:border-b-0">
                  {listItem}
                </div>
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
                    {type !== 'all' && canDeleteFinance && (
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
                      <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="text-right">{resolvedBalanceAfterLabel}</SortableTableHead>
                    )}
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[130px]">{fin.transactionList.table.actions}</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsWithDayDividers.map((item) => {
                    if (item.kind === 'day') {
                      // Uma única célula cobrindo TODAS as colunas visíveis —
                      // `visibleColumnCount` é a MESMA const que conta os
                      // <SortableTableHead> acima, nunca dessincroniza. Sem
                      // `position: sticky` (a tabela vive num `overflow-x-auto`,
                      // sticky quebra dentro dele). Sem hover: não é uma linha
                      // clicável.
                      const closing = dayClosingBalance?.get(item.dateKey);
                      return (
                        <TableRow key={`day-${item.dateKey}`} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={visibleColumnCount} className="py-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {formatDayDividerLabel(item.dateKey, locale)}
                              </span>
                              {closing !== undefined && (
                                <span className={cn(
                                  'text-xs text-muted-foreground tabular-nums',
                                  closing < 0 && 'text-destructive',
                                )}>
                                  {fin.transactionList.dayDivider.title} {fmt(closing)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const t = item.txn;
                    return (
                    <TableRow
                      key={t.id}
                      ref={t.id === highlightTransactionId ? highlightDesktopRef : undefined}
                      className={cn(
                        selectedIds.has(t.id) && 'bg-primary/5',
                        t.id === highlightTransactionId && 'bg-primary/10 outline outline-2 -outline-offset-2 outline-primary',
                      )}
                    >
                      {type !== 'all' && canDeleteFinance && <TableCell><Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></TableCell>}
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
                                {(t as any).account.type === 'caixa' ? `${(t as any).account.name} ${fin.transactionList.cashSuffix}` : (t as any).account.name}
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
                            { label: fin.transactionList.rowActions.delete, icon: Trash2, variant: 'delete', onClick: () => requestDelete(t.id), hidden: !canDeleteFinance },
                          ] satisfies RowAction[]}
                        />
                      </TableCell>
                    </TableRow>
                    );
                  })}
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

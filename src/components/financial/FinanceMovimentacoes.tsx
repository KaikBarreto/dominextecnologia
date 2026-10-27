import { useEffect, useMemo, useState } from 'react';
import { TransactionListPanel } from './TransactionListPanel';
import { AccountFormDialog } from './AccountFormDialog';
import { AdjustBalanceDialog } from './AdjustBalanceDialog';
import { CreditCardBillPanel } from './CreditCardBillPanel';
import { TransferFormDialog } from './TransferFormDialog';
import { ImportSpreadsheetDialog } from './ImportSpreadsheetDialog';
import { BankLogo } from './BankInstitutionCombobox';
import { ReconciliationTab } from '@/components/reconciliation/ReconciliationTab';
import { useFinancialAccounts, type FinancialAccount } from '@/hooks/useFinancialAccounts';
import type { ReconciliationTabState } from '@/lib/reconciliation/types';
import { useRecalculateBills } from '@/hooks/useRecalculateBills';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterButton } from '@/components/ui/FilterButton';
import { SearchField, SearchFieldAction } from '@/components/ui/search-field-actions';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreVertical, Pencil, Trash2, ArrowLeftRight, Plus, CreditCard,
  Landmark, Wallet, LayoutDashboard, Calculator, Loader2, SlidersHorizontal, Scale,
  Upload, Search, ArrowDownUp, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorContrast';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { FinancialTransaction } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { walkAccountBalance } from '@/lib/finance-balance';
import { buildPaymentGroupIndex } from '@/lib/finance-batch-payment';

const ALL_TAB = '__all__';
/** Aba neutra "Conciliação" — vive logo depois de "Visão Geral", sem accentColor. */
const RECONCILE_TAB = '__reconcile__';

function getTypeIcon(type: string) {
  if (type === 'caixa') return Wallet;
  if (type === 'cartao') return CreditCard;
  return Landmark;
}

/**
 * Tooltip do donut de distribuição entre contas: nome, valor e % do total.
 * `totalDonut` é a soma dos saldos das fatias (passada via closure no render).
 */
function AccountDistributionTooltip({
  active,
  payload,
  totalDonut,
  formatValue,
}: {
  active?: boolean;
  payload?: any[];
  totalDonut: number;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item.value ?? 0);
  const pct = totalDonut > 0 ? (value / totalDonut) * 100 : 0;
  return (
    <div className="min-w-44 rounded-xl border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-xl">
      <p className="max-w-64 truncate font-semibold">{item.payload?.name}</p>
      <p className="mt-1.5 flex items-center justify-between gap-5">
        <span className="text-muted-foreground">Saldo</span>
        <strong className="tabular-nums">{formatValue(value)}</strong>
      </p>
      <p className="mt-1 flex items-center justify-between gap-5">
        <span className="text-muted-foreground">Participação</span>
        <strong className="tabular-nums">{pct.toFixed(1)}%</strong>
      </p>
    </div>
  );
}

interface FinanceMovimentacoesProps {
  transactions: (FinancialTransaction & { customer?: any })[];
  /**
   * Conjunto COMPLETO de transações (todos os períodos), independente do filtro
   * de período da tela. Usado para calcular o "Saldo Após" de cada movimentação
   * na conta bancária — o cálculo é retroativo a partir do saldo atual da conta,
   * então precisa enxergar tudo, não só o período exibido.
   */
  allTransactions?: (FinancialTransaction & { customer?: any })[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (t: FinancialTransaction) => void;
  onDelete: (id: string) => Promise<any>;
  /**
   * Mantido por compatibilidade com a tela pai (Finance.tsx ainda passa), mas
   * NÃO usado aqui: marcar como pago/recebido vive só na tela Contas a
   * Pagar/Receber. Movimentações só edita/exclui.
   */
  onMarkAsPaid?: (params: any) => Promise<any>;
  /** Deep-link `?account=ID` — pré-seleciona a conta no sidebar uma vez. */
  initialAccountId?: string | null;
  /** Chamado após consumir o deep-link (limpa o param na URL). */
  onConsumeInitialAccount?: () => void;
  /**
   * Deep-link `?txn=ID` — a movimentação que o usuário veio ver (ex: vindo do
   * orçamento que gerou o recebimento). Destaca e rola até a linha.
   */
  highlightTransactionId?: string | null;
}

/**
 * Tela "Movimentações Financeiras" — funde as antigas "Movimentações" e
 * "Contas e Cartões" num só lugar. Sidebar lateral (desktop) / pills roláveis
 * (mobile) com "Todas" + Contas Bancárias + Cartões. Cada conta mostra o
 * extrato filtrado; cada cartão mostra suas faturas.
 */
export function FinanceMovimentacoes({
  transactions, allTransactions, isLoading, onNew, onEdit, onDelete,
  initialAccountId, onConsumeInitialAccount, highlightTransactionId,
}: FinanceMovimentacoesProps) {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const {
    accounts, balances, cardBillTotals,
    deleteAccount, transfer, canManageBankAccounts,
  } = useFinancialAccounts();
  const recalculateBills = useRecalculateBills();

  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string[]>([]);
  const [accountSort, setAccountSort] = useState<'name' | 'balance-desc' | 'balance-asc'>('name');
  const [accountPage, setAccountPage] = useState(1);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  // Estado da conciliação (conta + import em aberto) controlado AQUI, não
  // dentro do ReconciliationTab: trocar para "Visão Geral" e voltar não pode
  // perder a conciliação em andamento.
  const [reconciliationState, setReconciliationState] = useState<ReconciliationTabState>({
    accountId: null,
    importId: null,
  });

  // Compra no cartão NÃO é movimento de caixa: o caixa só mexeu quando a fatura
  // foi paga. Desde que pagar a fatura por inteiro passou a quitar as compras
  // (is_paid = true), elas entrariam nesta lista e o gasto pareceria dobrado
  // (a compra + o pagamento da fatura). Critério ESTRUTURAL: `credit_card_bill_date`
  // preenchido = perna do cartão. Nunca por tipo de conta (olhar `accounts`)
  // nem por `category`, que é texto livre.
  // A preferência abaixo (desligada por padrão) reabre a lista completa pra
  // quem quer ver todas as despesas num lugar só. Mesmo desligada, selecionar
  // explicitamente um cartão no filtro "Conta" revela as compras dele. Vale
  // SÓ pra Visão Geral: o extrato de uma conta bancária e o painel de faturas
  // do cartão não passam por aqui. Movida pro card "Movimentações financeiras"
  // em Configurações > Usabilidade (o CEO pediu pra não poluir esta tela) —
  // por isso é preferência PESSOAL em `user_preferences` (segue o usuário entre
  // aparelhos), não `useState` local nem `localStorage`. Ver useUserPreferences.
  const { includeCardPurchasesInMovements: includeCardPurchases, setIncludeCardPurchasesInMovements: setIncludeCardPurchases } = useUserPreferences();
  // Compra no cartão fica FORA da Visão Geral por padrão (preferência acima).
  // Se o deep-link aponta justamente pra uma delas, o destaque cairia numa
  // linha que não está na tela — então liga a preferência uma vez, só nesse
  // caso. Guard `!includeCardPurchases` evita disparar o upsert de novo a
  // cada re-render (transactions muda de referência a cada refetch).
  useEffect(() => {
    if (!highlightTransactionId || includeCardPurchases) return;
    const target = transactions.find((t) => t.id === highlightTransactionId);
    if (target?.credit_card_bill_date) setIncludeCardPurchases(true);
  }, [highlightTransactionId, transactions, includeCardPurchases, setIncludeCardPurchases]);

  // Consome o deep-link `?account=ID` uma vez: seleciona a aba da conta e
  // limpa o param na URL (senão o sidebar fica "preso" naquela conta).
  useEffect(() => {
    if (!initialAccountId) return;
    if (accounts.some(a => a.id === initialAccountId)) {
      setActiveTab(initialAccountId);
      setMobileDetailOpen(true);
      onConsumeInitialAccount?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccountId, accounts]);

  // Form de conta/cartão (criar/editar) — reusa AccountFormDialog.
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [formDefaultType, setFormDefaultType] = useState('banco');
  // Importação financeira por planilha (.xlsx) — upload/conferência/gravação vivem no próprio dialog.
  const [importSpreadsheetOpen, setImportSpreadsheetOpen] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<FinancialAccount | null>(null);
  const [recalcCard, setRecalcCard] = useState<FinancialAccount | null>(null);
  // Conta cujo saldo será ajustado (abre o AdjustBalanceDialog).
  const [adjustingAccount, setAdjustingAccount] = useState<FinancialAccount | null>(null);
  // Drawer de ações da conta no mobile (editar/excluir/ajustar/transferir).
  const [mobileActionsAccount, setMobileActionsAccount] = useState<FinancialAccount | null>(null);
  const [activeDistributionIndex, setActiveDistributionIndex] = useState<number | null>(null);

  const cashBankAccounts = useMemo(() => accounts.filter(a => a.type !== 'cartao'), [accounts]);
  // Saldo em contas = soma dos saldos de todas as contas/caixa (cartão fica de
  // fora, não tem "saldo de conta"). Alimenta o card consolidado da Visão Geral.
  const totalBalance = useMemo(
    () => cashBankAccounts.reduce((sum, a) => sum + (balances[a.id] ?? Number(a.initial_balance ?? 0)), 0),
    [cashBankAccounts, balances]
  );
  const cardAccounts = useMemo(() => accounts.filter((account) => account.type === 'cartao'), [accounts]);
  const totalOpenCardBills = useMemo(
    () => cardAccounts.reduce((sum, account) => sum + (cardBillTotals[account.id] ?? 0), 0),
    [cardAccounts, cardBillTotals],
  );
  const negativeAccountCount = useMemo(
    () => cashBankAccounts.filter((account) => (
      balances[account.id] ?? Number(account.initial_balance ?? 0)
    ) < 0).length,
    [cashBankAccounts, balances],
  );

  // Distribuição do saldo entre as contas de caixa/banco (cartão fica de fora).
  // Só contas com saldo POSITIVO entram no donut — fatia negativa não tem
  // representação coerente numa rosca. Alimenta o bloco "Distribuição entre
  // contas" da Visão Geral, que só aparece com 2+ contas positivas.
  const pieData = useMemo(
    () =>
      cashBankAccounts
        .map(a => ({
          name: a.name,
          value: balances[a.id] ?? Number(a.initial_balance ?? 0),
          color: a.color || '#3B82F6',
        }))
        .filter(d => d.value > 0),
    [cashBankAccounts, balances]
  );

  // A legenda nunca cresce indefinidamente: preserva as quatro maiores contas
  // e consolida o restante em uma única fatia. O valor individual continua
  // disponível na lista lateral e o agregado aparece completo no tooltip.
  const compactPieData = useMemo(() => {
    const sorted = [...pieData].sort((a, b) => b.value - a.value);
    if (sorted.length <= 5) return sorted;
    const visible = sorted.slice(0, 4);
    const remaining = sorted.slice(4);
    return [
      ...visible,
      {
        name: `Outras (${remaining.length})`,
        value: remaining.reduce((sum, item) => sum + item.value, 0),
        color: '#64748b',
      },
    ];
  }, [pieData]);

  const openNewAccount = (initialType: string) => {
    if (!canManageBankAccounts) return;
    setEditingAccount(null);
    setFormDefaultType(initialType);
    setFormOpen(true);
  };

  const openEditAccount = (a: FinancialAccount) => {
    if (!canManageBankAccounts) return;
    setEditingAccount(a);
    setFormOpen(true);
  };

  // "Ajustar saldo": abre o dialog dedicado que gera UMA transação de ajuste
  // pela diferença até o saldo desejado. Só faz sentido pra conta/caixa
  // (cartão não tem saldo de conta) — o UI já condiciona a exibição do item.
  const handleAdjustBalance = (a: FinancialAccount) => {
    if (!canManageBankAccounts || a.type === 'cartao') return;
    setAdjustingAccount(a);
  };

  const handleConfirmDelete = async () => {
    if (!canManageBankAccounts || !deletingAccount) return;
    const wasActive = activeTab === deletingAccount.id;
    await deleteAccount.mutateAsync(deletingAccount.id);
    setDeletingAccount(null);
    if (wasActive) setActiveTab(ALL_TAB);
  };

  // Menu de 3 pontinhos (desktop) de cada conta/cartão.
  const renderRightMenu = (a: FinancialAccount) => {
    if (!canManageBankAccounts) return null;
    const isCard = a.type === 'cartao';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              'h-6 w-6 pointer-events-auto',
              // Aba ativa usa fundo saturado da conta + texto branco: o botão
              // herda currentColor (branco) e hover só dá um leve realce.
              // Inativa: cinza, mas no hover da aba o fundo fica colorido →
              // herda branco via currentColor.
              activeTab === a.id
                ? 'text-current hover:bg-white/20 hover:text-current'
                : 'text-muted-foreground group-hover/tab:text-current hover:bg-white/20'
            )}
            onClick={(e) => e.stopPropagation()}
            aria-label={fin.movements.actionsAriaLabel.replace('{name}', a.name)}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" sideOffset={4} onClick={(e) => e.stopPropagation()}>
          {!isCard && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              disabled={cashBankAccounts.length < 2}
              onClick={() => setTransferOpen(true)}
            >
              <ArrowLeftRight className="h-4 w-4" />
              {fin.movements.accountMenu.transfer}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="gap-2 cursor-pointer focus:bg-warning focus:text-white hover:bg-warning hover:text-white data-[highlighted]:bg-warning data-[highlighted]:text-white"
            onClick={() => openEditAccount(a)}
          >
            <Pencil className="h-4 w-4" />
            {fin.movements.accountMenu.edit}
          </DropdownMenuItem>
          {!isCard && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white data-[highlighted]:bg-success data-[highlighted]:text-white"
              onClick={() => handleAdjustBalance(a)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {fin.movements.accountMenu.adjustBalance}
            </DropdownMenuItem>
          )}
          {isCard && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={() => setRecalcCard(a)}
            >
              <Calculator className="h-4 w-4" />
              {fin.movements.accountMenu.recalculateBills}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="gap-2 cursor-pointer focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white data-[highlighted]:bg-destructive data-[highlighted]:text-white"
            onClick={() => setDeletingAccount(a)}
          >
            <Trash2 className="h-4 w-4" />
            {fin.movements.accountMenu.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const filteredAccounts = useMemo(() => {
    const term = accountSearch.trim().toLocaleLowerCase(locale);
    return accounts
      .filter((account) => accountTypeFilter.length === 0
        || accountTypeFilter.includes(account.type === 'cartao' ? 'card' : 'account'))
      .filter((account) => !term
        || `${account.name} ${account.institution_name ?? ''} ${account.bank_name ?? ''}`
          .toLocaleLowerCase(locale)
          .includes(term))
      .slice()
      .sort((a, b) => {
        if (accountSort === 'name') return a.name.localeCompare(b.name, locale, { sensitivity: 'base' });
        const aValue = a.type === 'cartao'
          ? cardBillTotals[a.id] ?? 0
          : balances[a.id] ?? Number(a.initial_balance ?? 0);
        const bValue = b.type === 'cartao'
          ? cardBillTotals[b.id] ?? 0
          : balances[b.id] ?? Number(b.initial_balance ?? 0);
        return accountSort === 'balance-desc' ? bValue - aValue : aValue - bValue;
      });
  }, [accounts, accountSearch, accountTypeFilter, accountSort, locale, balances, cardBillTotals]);

  const filteredCashBankAccounts = filteredAccounts.filter((account) => account.type !== 'cartao');
  const filteredCardAccounts = filteredAccounts.filter((account) => account.type === 'cartao');
  const hasBothAccountGroups = filteredCashBankAccounts.length > 0 && filteredCardAccounts.length > 0;
  // Quando os dois grupos existem, reserva espaço para cartões na primeira
  // página; eles não ficam escondidos depois de uma lista longa de contas.
  const cashPageSize = hasBothAccountGroups ? 5 : 10;
  const cardPageSize = hasBothAccountGroups ? 2 : 10;
  const accountTotalPages = Math.max(
    1,
    Math.ceil(filteredCashBankAccounts.length / cashPageSize),
    Math.ceil(filteredCardAccounts.length / cardPageSize),
  );
  const pagedCashBankAccounts = filteredCashBankAccounts.slice(
    (accountPage - 1) * cashPageSize,
    accountPage * cashPageSize,
  );
  const pagedCardAccounts = filteredCardAccounts.slice(
    (accountPage - 1) * cardPageSize,
    accountPage * cardPageSize,
  );
  const pagedAccounts = [...pagedCashBankAccounts, ...pagedCardAccounts];

  useEffect(() => {
    setAccountPage(1);
  }, [accountSearch, accountTypeFilter, accountSort]);

  useEffect(() => {
    setAccountPage((current) => Math.min(current, accountTotalPages));
  }, [accountTotalPages]);

  const selectedAccount = activeTab === ALL_TAB
    ? null
    : accounts.find(a => a.id === activeTab) ?? null;

  // ids de conta caixa/banco — o universo que `walkAccountBalance` aceita.
  // NUNCA usar `(t as any).account` (objeto embutido na transação) pra decidir
  // isso: confiar na lista real `accounts` é o que impede uma perna de cartão
  // (account_id = conta do CARTÃO) de vazar pro cálculo de saldo de caixa.
  const cashBankAccountIds = useMemo(
    () => new Set(cashBankAccounts.map((a) => a.id)),
    [cashBankAccounts],
  );

  // "Saldo Após" + divisor de dia da conta bancária/caixa SELECIONADA —
  // âncora = saldo ATUAL da própria conta (balances[id]). Usa o conjunto
  // COMPLETO de transações (todos os períodos), não o filtrado por período.
  const selectedAccountWalk = useMemo(() => {
    if (!selectedAccount || selectedAccount.type === 'cartao') return undefined;
    const anchor = balances[selectedAccount.id] ?? Number(selectedAccount.initial_balance ?? 0);
    return walkAccountBalance(allTransactions ?? transactions, anchor, selectedAccount.id, cashBankAccountIds);
  }, [selectedAccount, allTransactions, transactions, cashBankAccountIds, balances]);
  const balanceAfterById = selectedAccountWalk?.balanceById;
  const dayClosingBalanceForAccount = selectedAccountWalk?.dayClosingBalance;

  // "Saldo Total Após" + divisor de dia da Visão Geral — âncora = `totalBalance`
  // (soma dos saldos de TODAS as contas caixa/banco, já calculado acima).
  // `accountId` undefined = caminhada CONSOLIDADA, não de uma conta só.
  // Tamanho REAL de cada lote de pagamento, sem filtro de período. A lista usa
  // isso só pra avisar quando o período filtrado parte um lote ao meio — o
  // total exibido não pode passar por linha de extrato se metade ficou de fora.
  const paymentGroupTotals = useMemo(
    () => buildPaymentGroupIndex((allTransactions ?? transactions) as any),
    [allTransactions, transactions],
  );

  const overviewWalk = useMemo(
    () => walkAccountBalance(allTransactions ?? transactions, totalBalance, undefined, cashBankAccountIds),
    [allTransactions, transactions, totalBalance, cashBankAccountIds],
  );
  const overviewBalanceAfterById = overviewWalk.balanceById;
  const overviewDayClosingBalance = overviewWalk.dayClosingBalance;

  // Header da conta selecionada — card-herói colorido (estilo EcoSistema).
  // Regra de fundo dirigida pelo saldo: positivo = cor da conta; zero = degradê
  // escuro; negativo = degradê vermelho. Texto contrastante via idealForeground
  // quando o fundo é a cor da conta (evita branco-no-branco). Mobile concentra
  // as ações num botão "Ações"; desktop deixa-as no menu de 3 pontinhos.
  const renderAccountHeader = (a: FinancialAccount) => {
    const Icon = getTypeIcon(a.type);
    const hasInst = !!(a.institution_name || a.bank_name);
    if (!canManageBankAccounts) {
      return (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          {hasInst ? (
            <BankLogo plated code={a.institution_code} name={a.institution_name || a.bank_name} size={36} />
          ) : (
            <div className="rounded-full bg-muted p-2.5"><Icon className="h-5 w-5" /></div>
          )}
          <p className="truncate font-semibold">{a.name}</p>
        </div>
      );
    }
    const balance = balances[a.id] ?? a.initial_balance;

    const useAccountColor = balance > 0 && !!a.color;
    const fg = useAccountColor ? idealForeground(a.color) : '#ffffff';
    const heroClass = useAccountColor
      ? 'shadow-lg'
      : balance === 0
      ? 'bg-gradient-to-r from-gray-900 to-gray-700 shadow-lg'
      : balance < 0
      ? 'bg-gradient-to-r from-red-900 to-red-700 shadow-lg'
      // Saldo positivo sem cor da conta: degradê escuro neutro.
      : 'bg-gradient-to-r from-gray-900 to-gray-700 shadow-lg';

    return (
      <div
        className={cn('rounded-2xl p-5 sm:p-6 flex items-start justify-between gap-3', heroClass)}
        style={{ backgroundColor: useAccountColor ? a.color : undefined, color: fg }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {hasInst ? (
            <BankLogo plated code={a.institution_code} name={a.institution_name || a.bank_name} size={36} />
          ) : (
            <div className="rounded-full p-2.5 shrink-0 bg-white/20">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-sm truncate opacity-90">{a.name}</p>
            <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight">
              {fmt(balance)}
            </p>
          </div>
        </div>

        {/* Mobile concentra tudo no "Ações". Desktop: ações no menu de 3 pontinhos
            do sidebar — o card fica limpo. */}
        {isMobile && (
          <Button
            size="sm"
            className="gap-2 shrink-0 bg-white/20 text-current border-0 hover:bg-white/30"
            onClick={() => setMobileActionsAccount(a)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {fin.movements.hero.actionsButton}
          </Button>
        )}
      </div>
    );
  };

  // No mobile, criação fica no topo porque a coluna da lista pode sair de cena
  // ao abrir o detalhe. No desktop ela vive apenas no rodapé da lista, evitando
  // duas portas de entrada concorrentes.
  const globalActions = canManageBankAccounts && isMobile ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5 shrink-0" aria-label={fin.movements.header.addButton}>
          <Plus className="h-4 w-4" />
          {fin.movements.header.addButton}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openNewAccount('banco')}>
          <Landmark className="h-4 w-4" /> {fin.movements.sidebar.addMenuNewAccount}
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openNewAccount('cartao')}>
          <CreditCard className="h-4 w-4" /> {fin.movements.sidebar.addMenuNewCard}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  // A importação pertence ao mesmo grupo operacional de Exportar e Nova
  // movimentação. O painel recebe este botão como ação contextual; assim ele
  // não fica órfão no cabeçalho geral da página.
  const importSpreadsheetButton = (
    <Button
      variant="outline"
      size="sm"
      className={cn('shrink-0 gap-1.5', isMobile ? 'h-10 w-10 p-0' : 'h-9')}
      aria-label={fin.spreadsheetImport.headerButton}
      onClick={() => setImportSpreadsheetOpen(true)}
    >
      <Upload className="h-4 w-4" />
      {!isMobile && fin.spreadsheetImport.headerButton}
    </Button>
  );

  const selectNavigatorItem = (value: string) => {
    setActiveTab(value);
    if (isMobile) setMobileDetailOpen(true);
  };

  const renderNavigatorItem = ({
    value,
    label,
    sublabel,
    icon: Icon,
    color,
    iconColor,
    account,
  }: {
    value: string;
    label: string;
    sublabel?: string;
    icon: typeof LayoutDashboard;
    color?: string | null;
    iconColor?: string;
    account?: FinancialAccount;
  }) => {
    const selected = activeTab === value;
    const useColor = selected && !!color;
    const resolvedIconColor = color && idealForeground(color) === '#ffffff'
      ? color
      : iconColor ?? '#2563eb';
    return (
      <div
        key={value}
        className={cn(
          'group/tab flex min-w-0 items-center gap-2 border-b border-border/60 px-2 py-2 transition-colors last:border-b-0',
          selected && !useColor ? 'bg-primary text-primary-foreground' : !selected && 'hover:bg-muted/60',
        )}
        style={useColor ? { backgroundColor: color!, color: idealForeground(color!) } : undefined}
      >
        <button
          type="button"
          onClick={() => selectNavigatorItem(value)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          aria-current={selected ? 'page' : undefined}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ring-1 ring-inset ring-white/35"
            style={{ backgroundColor: resolvedIconColor }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{label}</span>
            {sublabel && (
              <span className={cn(
                'mt-0.5 block truncate text-xs tabular-nums',
                selected ? 'opacity-80' : 'text-muted-foreground',
              )}>
                {sublabel}
              </span>
            )}
          </span>
        </button>
        {account && <span className="shrink-0">{renderRightMenu(account)}</span>}
      </div>
    );
  };

  const accountNavigator = (
    <aside className="flex min-h-[32rem] flex-col overflow-hidden border-r border-border lg:sticky lg:top-4 lg:h-[calc(100dvh-8rem)]" aria-label="Contas e cartões">
      <div className="space-y-2 border-b border-border/60 pb-3 pr-4">
        <div>
          <h3 className="text-sm font-semibold">Contas e cartões</h3>
          <p className="text-xs text-muted-foreground">Selecione para abrir o extrato e as ações.</p>
        </div>
        <SearchField
            value={accountSearch}
            onChange={(event) => setAccountSearch(event.target.value)}
            placeholder="Buscar conta ou cartão"
            actions={
              <>
                <FilterButton
                  activeCount={accountTypeFilter.length > 0 ? 1 : 0}
                  onClear={() => setAccountTypeFilter([])}
                  embedded
                >
                  <FilterCheckboxGroup
                    label="Tipo"
                    selected={accountTypeFilter}
                    onChange={setAccountTypeFilter}
                    emptyLabel="Todos os tipos"
                    options={[
                      { value: 'account', label: 'Contas bancárias e caixa' },
                      { value: 'card', label: 'Cartões' },
                    ]}
                  />
                </FilterButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SearchFieldAction icon={ArrowDownUp} label="Ordenar" tooltip="Ordenar contas" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuRadioGroup value={accountSort} onValueChange={(value) => setAccountSort(value as typeof accountSort)}>
                      <DropdownMenuRadioItem value="name">Nome (A–Z)</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="balance-desc">Maior valor</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="balance-asc">Menor valor</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-4">
        {renderNavigatorItem({
          value: ALL_TAB,
          label: 'Geral (Todos)',
          sublabel: canManageBankAccounts ? fmt(totalBalance) : undefined,
          icon: LayoutDashboard,
          iconColor: '#047857',
        })}
        {renderNavigatorItem({
          value: RECONCILE_TAB,
          label: fin.reconciliation.tabLabel,
          icon: Scale,
          iconColor: '#2563eb',
        })}
        {pagedAccounts.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
        ) : null}
        {pagedCashBankAccounts.length > 0 && (
          <div className="flex items-center justify-between border-b border-border/60 px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Contas</span>
            <span className="tabular-nums">{filteredCashBankAccounts.length}</span>
          </div>
        )}
        {pagedCashBankAccounts.map((account) => {
          const value = balances[account.id] ?? Number(account.initial_balance ?? 0);
          return renderNavigatorItem({
            value: account.id,
            label: account.name,
            sublabel: !canManageBankAccounts ? undefined : `Saldo ${fmt(value)}`,
            icon: getTypeIcon(account.type),
            color: account.color,
            iconColor: account.type === 'caixa' ? '#b45309' : '#0369a1',
            account,
          });
        })}
        {pagedCardAccounts.length > 0 && (
          <div className="flex items-center justify-between border-b border-border/60 px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Cartões</span>
            <span className="tabular-nums">{filteredCardAccounts.length}</span>
          </div>
        )}
        {pagedCardAccounts.map((account) => {
          const value = cardBillTotals[account.id] ?? 0;
          return renderNavigatorItem({
            value: account.id,
            label: account.name,
            sublabel: !canManageBankAccounts
              ? undefined
              : `${fin.movements.hero.openInvoice} ${fmt(value)}`,
            icon: getTypeIcon(account.type),
            color: account.color,
            iconColor: '#7c3aed',
            account,
          });
        })}
      </div>

      <div className="space-y-2 border-t border-border/60 py-3 pr-4">
        {filteredAccounts.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="min-w-0 whitespace-normal">
              Mostrando {pagedAccounts.length} de {filteredAccounts.length} itens
            </span>
            <span className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={accountPage === 1} onClick={() => setAccountPage((page) => Math.max(1, page - 1))} aria-label="Página anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={accountPage === accountTotalPages} onClick={() => setAccountPage((page) => Math.min(accountTotalPages, page + 1))} aria-label="Próxima página">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </span>
          </div>
        )}
        {canManageBankAccounts && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => openNewAccount('banco')}>
              <Landmark className="h-3.5 w-3.5" /> Nova conta
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => openNewAccount('cartao')}>
              <CreditCard className="h-3.5 w-3.5" /> Novo cartão
            </Button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="space-y-4">
      {isMobile ? (
        /* Mobile: faixa compacta — título + "+" Adicionar (o consolidado de saldo
           agora vive no card da aba Visão Geral, não mais aqui no topo). */
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">{fin.movements.header.titleMobile}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {globalActions}
          </div>
        </div>
      ) : (
        <h2 className="text-lg font-bold">{fin.movements.header.titleDesktop}</h2>
      )}

      {isMobile && !mobileDetailOpen ? (
        <div className="overflow-hidden rounded-2xl border bg-card pl-4">
          {accountNavigator}
        </div>
      ) : (
        <div className="min-w-0 lg:grid lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:gap-5">
          {!isMobile && accountNavigator}
          <section className="min-w-0 space-y-3" aria-label="Detalhes da conta selecionada">
            {isMobile && (
              <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => setMobileDetailOpen(false)}>
                <ChevronLeft className="h-4 w-4" /> Contas e cartões
              </Button>
            )}
        {activeTab === RECONCILE_TAB ? (
          <ReconciliationTab state={reconciliationState} onStateChange={setReconciliationState} />
        ) : activeTab === ALL_TAB ? (
          <div className="space-y-4">
            {/* Resumo único e limitado: a lista completa de contas já vive na
                navegação. Aqui entram apenas total, agregados e até cinco
                fatias/legendas, independentemente do número de contas. */}
            {canManageBankAccounts && cashBankAccounts.length > 0 && (() => {
              const totalDonut = compactPieData.reduce((sum, item) => sum + item.value, 0);
              return (
                <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
                  <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1.35fr)] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white">
                            <Wallet className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold">Resumo financeiro</h3>
                            <p className="text-xs text-muted-foreground">Saldo consolidado das contas</p>
                          </div>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {cashBankAccounts.length} {cashBankAccounts.length === 1 ? 'conta' : 'contas'}
                        </span>
                      </div>

                      <p className="mt-4 break-words text-2xl font-bold leading-tight tabular-nums sm:text-3xl">
                        {fmt(totalBalance)}
                      </p>

                      <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-3 text-xs">
                        <div className="min-w-0">
                          <p className="text-muted-foreground">Saldos positivos</p>
                          <p className="mt-0.5 font-semibold tabular-nums">{pieData.length}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-muted-foreground">Faturas em aberto</p>
                          <p className={cn(
                            'mt-0.5 truncate font-semibold tabular-nums',
                            totalOpenCardBills > 0 && 'text-destructive',
                          )} title={fmt(totalOpenCardBills)}>
                            {fmt(totalOpenCardBills)}
                          </p>
                        </div>
                      </div>

                      {negativeAccountCount > 0 && (
                        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                          {negativeAccountCount} {negativeAccountCount === 1 ? 'conta está' : 'contas estão'} com saldo negativo.
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 lg:border-l lg:pl-5">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distribuição do saldo</h4>
                          <p className="text-xs text-muted-foreground">Somente valores positivos</p>
                        </div>
                      </div>

                      {compactPieData.length > 0 ? (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                          <div className="relative h-[148px] w-full shrink-0 sm:w-[168px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={compactPieData}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius={45}
                                  outerRadius={69}
                                  paddingAngle={2}
                                  strokeWidth={0}
                                  isAnimationActive={false}
                                  onMouseEnter={(_, index) => setActiveDistributionIndex(index)}
                                  onMouseLeave={() => setActiveDistributionIndex(null)}
                                >
                                  {compactPieData.map((entry, index) => (
                                    <Cell
                                      key={entry.name}
                                      fill={entry.color}
                                      opacity={activeDistributionIndex === null || activeDistributionIndex === index ? 1 : 0.2}
                                      stroke={activeDistributionIndex === index ? 'hsl(var(--background))' : 'transparent'}
                                      strokeWidth={activeDistributionIndex === index ? 4 : 0}
                                      style={{
                                        filter: activeDistributionIndex === index ? 'drop-shadow(0 8px 12px rgb(15 23 42 / 0.22))' : 'none',
                                        transition: 'opacity 160ms ease, filter 160ms ease',
                                      }}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip
                                  content={<AccountDistributionTooltip totalDonut={totalDonut} formatValue={fmt} />}
                                  allowEscapeViewBox={{ x: true, y: true }}
                                  wrapperStyle={{ zIndex: 80, pointerEvents: 'none' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                              <span className="text-lg font-bold tabular-nums">{pieData.length}</span>
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">saldos</span>
                            </div>
                          </div>
                          <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                            {compactPieData.map((entry, index) => {
                              const percentage = totalDonut > 0 ? Math.round((entry.value / totalDonut) * 100) : 0;
                              return (
                                <div
                                  key={entry.name}
                                  tabIndex={0}
                                  className={cn(
                                    'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-opacity hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    activeDistributionIndex !== null && activeDistributionIndex !== index && 'opacity-35',
                                  )}
                                  title={`${entry.name}: ${fmt(entry.value)}`}
                                  onMouseEnter={() => setActiveDistributionIndex(index)}
                                  onMouseLeave={() => setActiveDistributionIndex(null)}
                                  onFocus={() => setActiveDistributionIndex(index)}
                                  onBlur={() => setActiveDistributionIndex(null)}
                                  aria-label={`${entry.name}: ${fmt(entry.value)}, ${percentage}%`}
                                >
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                                  <span className="min-w-0 flex-1 truncate text-foreground">{entry.name}</span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">{percentage}%</span>
                                </div>
                              );
                            })}
                            {pieData.length > compactPieData.length && (
                              <p className="col-span-full text-xs text-muted-foreground">As menores contas foram agrupadas em “Outras”.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-28 items-center justify-center rounded-lg bg-muted/40 px-4 text-center text-sm text-muted-foreground">
                          Nenhuma conta com saldo positivo para distribuir.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Card "Incluir compras no cartão" mudou de endereço: agora vive
                em Configurações > Usabilidade > Movimentações financeiras
                (pedido do CEO pra não poluir esta tela). O estado
                (includeCardPurchases) continua vivo aqui via useUserPreferences,
                só a UI de alternar saiu daqui. */}
            <TransactionListPanel
              title={fin.movements.header.titleMobile}
              embedded
              type="all"
              transactions={transactions}
              isLoading={isLoading}
              onNew={onNew}
              headerAction={importSpreadsheetButton}
              onEdit={onEdit}
              onDelete={onDelete}
              // Consolidado (soma de todas as contas), não o extrato de uma
              // conta só — rótulo "Saldo Total Após" evita a leitura errada.
              balanceAfterById={overviewBalanceAfterById}
              balanceAfterLabel={fin.transactionList.table.balanceTotalAfter}
              balanceAfterShortLabel={fin.transactionList.balanceTotal}
              groupByDay
              dayClosingBalance={overviewDayClosingBalance}
              highlightTransactionId={highlightTransactionId}
              // Contas quitadas no mesmo lote viram UMA linha com o total,
              // expansível: é assim que o extrato do banco bate 1-pra-1.
              collapsePaymentGroups
              paymentGroupTotals={paymentGroupTotals}
              hideCardPurchasesUnlessAccountFiltered={!includeCardPurchases}
            />
          </div>
        ) : selectedAccount ? (
          selectedAccount.type === 'cartao' ? (
            <div className="space-y-4">
              {renderCardHeader(selectedAccount)}
              <CreditCardBillPanel
                account={selectedAccount}
                accounts={accounts}
                hideHeader
              />
            </div>
          ) : (
            <div className="space-y-4">
              {renderAccountHeader(selectedAccount)}
              <TransactionListPanel
                title={selectedAccount.name}
                embedded
                type="all"
                transactions={transactions}
                isLoading={isLoading}
                onNew={onNew}
                headerAction={importSpreadsheetButton}
                onEdit={onEdit}
                onDelete={onDelete}
                initialAccountFilter={selectedAccount.id}
                hideAccountColumn
                balanceAfterById={balanceAfterById}
                groupByDay
                dayClosingBalance={dayClosingBalanceForAccount}
                highlightTransactionId={highlightTransactionId}
                collapsePaymentGroups
                paymentGroupTotals={paymentGroupTotals}
              />
            </div>
          )
        ) : (
          <EmptyState
            icon={<Landmark className="h-11 w-11" />}
            title="Selecione uma conta ou cartão"
            description="Escolha um item na lista para ver saldo, extrato, faturas e ações."
          />
        )}
          </section>
        </div>
      )}

      {/* Form de conta/cartão (criar/editar) — fonte única em AccountFormDialog */}
      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editingAccount}
        defaultType={formDefaultType}
      />

      {/* Ajustar saldo da conta — gera transação de ajuste pela diferença */}
      <AdjustBalanceDialog
        open={!!adjustingAccount}
        onOpenChange={(v) => { if (!v) setAdjustingAccount(null); }}
        account={adjustingAccount}
      />

      {/* Transferência entre contas */}
      <TransferFormDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={cashBankAccounts}
        onSubmit={async (d) => { await transfer.mutateAsync(d); }}
        isLoading={transfer.isPending}
      />

      {/* Importação financeira por planilha (.xlsx) */}
      <ImportSpreadsheetDialog open={importSpreadsheetOpen} onOpenChange={setImportSpreadsheetOpen} />

      {/* Drawer de ações da conta (mobile) */}
      <ResponsiveModal
        open={!!mobileActionsAccount}
        onOpenChange={(v) => { if (!v) setMobileActionsAccount(null); }}
        title={mobileActionsAccount ? mobileActionsAccount.name : fin.movements.actionsFallback}
        className="sm:max-w-[400px]"
      >
        {mobileActionsAccount && (
          <div className="space-y-2">
            {mobileActionsAccount.type !== 'cartao' && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={cashBankAccounts.length < 2}
                onClick={() => { setMobileActionsAccount(null); setTransferOpen(true); }}
              >
                <ArrowLeftRight className="h-4 w-4" />
                {fin.movements.accountMenu.transfer}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 hover:bg-warning hover:text-white hover:border-warning"
              onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); openEditAccount(a); }}
            >
              <Pencil className="h-4 w-4" />
              {fin.movements.accountMenu.edit}
            </Button>
            {mobileActionsAccount.type !== 'cartao' && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 hover:bg-success hover:text-white hover:border-success"
                onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); handleAdjustBalance(a); }}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {fin.movements.accountMenu.adjustBalance}
              </Button>
            )}
            {mobileActionsAccount.type === 'cartao' && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); setRecalcCard(a); }}
              >
                <Calculator className="h-4 w-4" />
                {fin.movements.accountMenu.recalculateBills}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-destructive hover:bg-destructive hover:text-white hover:border-destructive"
              onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); setDeletingAccount(a); }}
            >
              <Trash2 className="h-4 w-4" />
              {fin.movements.accountMenu.delete}
            </Button>
          </div>
        )}
      </ResponsiveModal>

      {/* Confirmar exclusão de conta/cartão */}
      <AlertDialog open={!!deletingAccount} onOpenChange={(o) => { if (!o) setDeletingAccount(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingAccount?.type === 'cartao' ? fin.movements.deleteAccountDialog.titleCard : fin.movements.deleteAccountDialog.titleAccount}
            </AlertDialogTitle>
            <AlertDialogDescription>{fin.movements.deleteAccountDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{fin.movements.deleteAccountDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">{fin.movements.deleteAccountDialog.confirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar recálculo de faturas */}
      <AlertDialog open={!!recalcCard} onOpenChange={(o) => { if (!o && !recalculateBills.isPending) setRecalcCard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fin.movements.recalcDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {fin.movements.recalcDialog.description}{recalcCard ? ` "${recalcCard.name}"` : ''}.
              {fin.movements.recalcDialog.descriptionSuffix}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recalculateBills.isPending}>{fin.movements.recalcDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={recalculateBills.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!recalcCard) return;
                try {
                  await recalculateBills.mutateAsync(recalcCard.id);
                } finally {
                  setRecalcCard(null);
                }
              }}
            >
              {recalculateBills.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {fin.movements.recalcDialog.recalculating}
                </>
              ) : (
                fin.movements.recalcDialog.confirm
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // Header do cartão selecionado — card-herói largo NA COR DO CARTÃO.
  // Resolve as 3 perguntas do dono sem clique nenhum: quanto devo (valor
  // gigante da fatura aberta), quanto posso (barra de limite + disponível) e
  // quando vence (fecha/vence embaixo). Cartão NÃO tem "saldo de conta" (tem
  // fatura), então não vale a regra de saldo do renderAccountHeader: usa
  // sempre a cor do cartão como fundo (texto contrastante via
  // idealForeground), com degradê escuro neutro só quando não há cor.
  function renderCardHeader(a: FinancialAccount) {
    const hasInst = !!(a.institution_name || a.bank_name);
    if (!canManageBankAccounts) {
      return (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          {hasInst ? (
            <BankLogo plated code={a.institution_code} name={a.institution_name || a.bank_name} size={36} />
          ) : (
            <div className="rounded-full bg-muted p-2.5"><CreditCard className="h-5 w-5" /></div>
          )}
          <p className="truncate font-semibold">{a.name}</p>
        </div>
      );
    }
    const billTotal = cardBillTotals[a.id] ?? 0;
    const hasLimit = !!a.credit_limit;
    const availableLimit = hasLimit ? a.credit_limit! - billTotal : null;
    // Limite estourado: barra trava em 100% (nunca passa do fim do card) e o
    // disponível vira um selo vermelho — legível em cima de QUALQUER cor de
    // cartão, ao contrário de só colorir o texto.
    const overLimit = hasLimit && availableLimit! < 0;
    const usedPct = hasLimit ? Math.min(100, Math.max(0, (billTotal / a.credit_limit!) * 100)) : 0;

    const useCardColor = !!a.color;
    const fg = useCardColor ? idealForeground(a.color) : '#ffffff';

    const closesDueLine = a.closing_day
      ? (a.due_day
          ? fin.movements.hero.closesDueLine
              .replace('{closing}', String(a.closing_day))
              .replace('{due}', String(a.due_day))
          : fin.movements.hero.closesAfterLine
              .replace('{closing}', String(a.closing_day))
              .replace('{days}', String(a.payment_due_days ?? 10)))
      : null;

    return (
      <div
        className={cn(
          'rounded-2xl p-5 sm:p-6 space-y-4',
          useCardColor ? 'shadow-lg' : 'bg-gradient-to-r from-gray-900 to-gray-700 shadow-lg',
        )}
        style={{ backgroundColor: useCardColor ? a.color : undefined, color: fg }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {hasInst ? (
              <BankLogo plated code={a.institution_code} name={a.institution_name || a.bank_name} size={36} />
            ) : (
              <div className="rounded-full p-2.5 shrink-0 bg-white/20">
                <CreditCard className="h-5 w-5" />
              </div>
            )}
            <p className="font-medium text-sm truncate opacity-90">{a.name}</p>
          </div>

          {/* Desktop: ações no menu de 3 pontinhos do sidebar — card limpo.
              Mobile concentra tudo no "Ações". */}
          {isMobile && (
            <Button
              size="sm"
              className="gap-2 shrink-0 bg-white/20 text-current border-0 hover:bg-white/30"
              onClick={() => setMobileActionsAccount(a)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {fin.movements.hero.actionsButton}
            </Button>
          )}
        </div>

        {/* O valor que o dono quer ver primeiro: a fatura em aberto, gigante. */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider opacity-80">
            {fin.movements.hero.openInvoice}
          </p>
          <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight mt-0.5">
            {fmt(billTotal)}
          </p>
        </div>

        {/* Barra de limite + linha "Limite total · Disponível". Some por
            inteiro sem limite cadastrado — nada de "R$ 0,00" nem barra vazia. */}
        {hasLimit && (
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-white/25 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', overLimit ? 'bg-red-400' : 'bg-white')}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <p className="text-xs sm:text-sm opacity-90 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>{fin.movements.hero.creditLimitLabel}: {fmt(a.credit_limit!)}</span>
              <span aria-hidden="true">·</span>
              {overLimit ? (
                <span className="inline-flex items-center rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] sm:text-xs font-semibold text-white">
                  {fin.movements.hero.availableFull}: {fmt(availableLimit!)}
                </span>
              ) : (
                <span>{fin.movements.hero.availableFull}: {fmt(availableLimit!)}</span>
              )}
            </p>
          </div>
        )}

        {/* Quando vence — menor, embaixo de tudo. */}
        {closesDueLine && (
          <p className="text-xs opacity-70">{closesDueLine}</p>
        )}
      </div>
    );
  }
}

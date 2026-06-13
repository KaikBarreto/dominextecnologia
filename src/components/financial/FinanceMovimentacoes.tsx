import { useEffect, useMemo, useState } from 'react';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { TransactionListPanel } from './TransactionListPanel';
import { AccountFormDialog } from './AccountFormDialog';
import { AdjustBalanceDialog } from './AdjustBalanceDialog';
import { CreditCardBillPanel } from './CreditCardBillPanel';
import { TransferFormDialog } from './TransferFormDialog';
import { FinanceCategorias } from './FinanceCategorias';
import { BankLogo } from './BankInstitutionCombobox';
import { useFinancialAccounts, type FinancialAccount } from '@/hooks/useFinancialAccounts';
import { useRecalculateBills } from '@/hooks/useRecalculateBills';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MoreVertical, Pencil, Trash2, ArrowLeftRight, Tags, Plus, CreditCard,
  Landmark, Wallet, LayoutDashboard, Calculator, Loader2, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { idealForeground } from '@/lib/colorContrast';
import type { FinancialTransaction } from '@/types/database';

const ALL_TAB = '__all__';

function getTypeIcon(type: string) {
  if (type === 'caixa') return Wallet;
  if (type === 'cartao') return CreditCard;
  return Landmark;
}

interface FinanceMovimentacoesProps {
  transactions: (FinancialTransaction & { customer?: any })[];
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
}

/**
 * Tela "Movimentações Financeiras" — funde as antigas "Movimentações" e
 * "Contas e Cartões" num só lugar. Sidebar lateral (desktop) / pills roláveis
 * (mobile) com "Todas" + Contas Bancárias + Cartões. Cada conta mostra o
 * extrato filtrado; cada cartão mostra suas faturas.
 */
export function FinanceMovimentacoes({
  transactions, isLoading, onNew, onEdit, onDelete,
  initialAccountId, onConsumeInitialAccount,
}: FinanceMovimentacoesProps) {
  const isMobile = useIsMobile();
  const {
    accounts, balances, cardBillTotals,
    deleteAccount, transfer,
  } = useFinancialAccounts();
  const recalculateBills = useRecalculateBills();

  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);

  // Consome o deep-link `?account=ID` uma vez: seleciona a aba da conta e
  // limpa o param na URL (senão o sidebar fica "preso" naquela conta).
  useEffect(() => {
    if (!initialAccountId) return;
    if (accounts.some(a => a.id === initialAccountId)) {
      setActiveTab(initialAccountId);
      onConsumeInitialAccount?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccountId, accounts]);

  // Form de conta/cartão (criar/editar) — reusa AccountFormDialog.
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [formDefaultType, setFormDefaultType] = useState('banco');

  const [transferOpen, setTransferOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<FinancialAccount | null>(null);
  const [recalcCard, setRecalcCard] = useState<FinancialAccount | null>(null);
  // Conta cujo saldo será ajustado (abre o AdjustBalanceDialog).
  const [adjustingAccount, setAdjustingAccount] = useState<FinancialAccount | null>(null);
  // Drawer de ações da conta no mobile (editar/excluir/ajustar/transferir).
  const [mobileActionsAccount, setMobileActionsAccount] = useState<FinancialAccount | null>(null);

  const cashBankAccounts = useMemo(() => accounts.filter(a => a.type !== 'cartao'), [accounts]);
  const cardAccounts = useMemo(() => accounts.filter(a => a.type === 'cartao'), [accounts]);

  // Saldo em contas = soma dos saldos de todas as contas/caixa (cartão fica de
  // fora, não tem "saldo de conta"). Alimenta o card consolidado da Visão Geral.
  const totalBalance = useMemo(
    () => cashBankAccounts.reduce((sum, a) => sum + (balances[a.id] ?? Number(a.initial_balance ?? 0)), 0),
    [cashBankAccounts, balances]
  );

  // Total das faturas ABERTAS dos cartões. REGRA: nunca somar fatura de cartão
  // dentro do saldo de caixa — é uma figura distinta no card da Visão Geral.
  const totalCardBills = useMemo(
    () => cardAccounts.reduce((sum, a) => sum + (cardBillTotals[a.id] ?? 0), 0),
    [cardAccounts, cardBillTotals]
  );

  const openNewAccount = (initialType: string) => {
    setEditingAccount(null);
    setFormDefaultType(initialType);
    setFormOpen(true);
  };

  const openEditAccount = (a: FinancialAccount) => {
    setEditingAccount(a);
    setFormOpen(true);
  };

  // "Ajustar saldo": abre o dialog dedicado que gera UMA transação de ajuste
  // pela diferença até o saldo desejado. Só faz sentido pra conta/caixa
  // (cartão não tem saldo de conta) — o UI já condiciona a exibição do item.
  const handleAdjustBalance = (a: FinancialAccount) => {
    if (a.type === 'cartao') return;
    setAdjustingAccount(a);
  };

  const handleConfirmDelete = async () => {
    if (!deletingAccount) return;
    const wasActive = activeTab === deletingAccount.id;
    await deleteAccount.mutateAsync(deletingAccount.id);
    setDeletingAccount(null);
    if (wasActive) setActiveTab(ALL_TAB);
  };

  // Menu de 3 pontinhos (desktop) de cada conta/cartão.
  const renderRightMenu = (a: FinancialAccount) => {
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
            aria-label={`Ações de ${a.name}`}
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
              Transferir
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="gap-2 cursor-pointer focus:bg-warning focus:text-white hover:bg-warning hover:text-white data-[highlighted]:bg-warning data-[highlighted]:text-white"
            onClick={() => openEditAccount(a)}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </DropdownMenuItem>
          {!isCard && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white data-[highlighted]:bg-success data-[highlighted]:text-white"
              onClick={() => handleAdjustBalance(a)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Ajustar saldo
            </DropdownMenuItem>
          )}
          {isCard && (
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={() => setRecalcCard(a)}
            >
              <Calculator className="h-4 w-4" />
              Recalcular faturas
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="gap-2 cursor-pointer focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white data-[highlighted]:bg-destructive data-[highlighted]:text-white"
            onClick={() => setDeletingAccount(a)}
          >
            <Trash2 className="h-4 w-4" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Monta as abas do sidebar: "Todas" + grupo Contas Bancárias + grupo Cartões.
  const tabs: SettingsTab[] = useMemo(() => {
    const result: SettingsTab[] = [
      // Visão Geral: aba neutra (sem cor) — card consolidado + todas as movimentações.
      { value: ALL_TAB, label: 'Visão Geral', icon: LayoutDashboard },
    ];
    for (const a of cashBankAccounts) {
      const balance = balances[a.id] ?? a.initial_balance;
      result.push({
        value: a.id,
        label: a.name,
        icon: getTypeIcon(a.type),
        group: 'Contas Bancárias',
        sublabel: formatBRL(balance),
        // No mobile a pill mostra só o saldo (cabe ao lado do nome).
        mobileSublabel: formatBRL(balance),
        rightElement: renderRightMenu(a),
        // Ativo/hover usa a cor da conta com fundo SATURADO + texto branco (estilo EcoSistema).
        accentColor: a.color || undefined,
        useColorBackground: !!a.color,
      });
    }
    for (const a of cardAccounts) {
      const billTotal = cardBillTotals[a.id] ?? 0;
      const availableLimit = a.credit_limit ? a.credit_limit - billTotal : null;
      result.push({
        value: a.id,
        label: a.name,
        icon: CreditCard,
        group: 'Cartões',
        sublabel: availableLimit !== null
          ? `Fatura ${formatBRL(billTotal)} · Disp. ${formatBRL(availableLimit)}`
          : `Fatura ${formatBRL(billTotal)}`,
        // Pill mobile: só a fatura (o "Disp." fica longo demais pra pill).
        mobileSublabel: formatBRL(billTotal),
        rightElement: renderRightMenu(a),
        // Cartão também assume sua cor no ativo/hover (fundo saturado + branco).
        accentColor: a.color || undefined,
        useColorBackground: !!a.color,
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashBankAccounts, cardAccounts, balances, cardBillTotals, activeTab]);

  const selectedAccount = activeTab === ALL_TAB
    ? null
    : accounts.find(a => a.id === activeTab) ?? null;

  // Header da conta selecionada — card-herói colorido (estilo EcoSistema).
  // Regra de fundo dirigida pelo saldo: positivo = cor da conta; zero = degradê
  // escuro; negativo = degradê vermelho. Texto contrastante via idealForeground
  // quando o fundo é a cor da conta (evita branco-no-branco). Mobile concentra
  // as ações num botão "Ações"; desktop deixa-as no menu de 3 pontinhos.
  const renderAccountHeader = (a: FinancialAccount) => {
    const Icon = getTypeIcon(a.type);
    const hasInst = !!(a.institution_name || a.bank_name);
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
            <div className="rounded-lg p-1 shrink-0 bg-white border border-white/20">
              <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={36} />
            </div>
          ) : (
            <div className="rounded-full p-2.5 shrink-0 bg-white/20">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-sm truncate opacity-90">{a.name}</p>
            <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight">
              R$ {formatBRL(balance)}
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
            Ações
          </Button>
        )}
      </div>
    );
  };

  // Botões globais do topo da tela. No mobile vira um único "+" com menu
  // (Nova Conta / Novo Cartão / Categorias) pra não poluir o topo; no desktop
  // sobra só "Categorias" — criar conta/cartão vive no footer de cada grupo do
  // sidebar (evita botão duplicado no topo).
  const globalActions = isMobile ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5 shrink-0" aria-label="Adicionar">
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openNewAccount('banco')}>
          <Landmark className="h-4 w-4" /> Nova Conta
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => openNewAccount('cartao')}>
          <CreditCard className="h-4 w-4" /> Novo Cartão
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => setCategoriesOpen(true)}>
          <Tags className="h-4 w-4" /> Categorias
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setCategoriesOpen(true)}>
        <Tags className="h-4 w-4" />
        Categorias
      </Button>
    </div>
  );

  // Botão tracejado de "adicionar" no fim de cada seção do sidebar (desktop).
  const addButton = (label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );

  // Footer POR GRUPO: "+ Nova Conta" ao fim das Contas Bancárias e "+ Novo Cartão"
  // ao fim dos Cartões (desktop). Só renderiza os grupos que existem nas abas.
  const groupFooters = !isMobile ? {
    'Contas Bancárias': addButton('Nova Conta', () => openNewAccount('banco')),
    'Cartões': addButton('Novo Cartão', () => openNewAccount('cartao')),
  } : undefined;

  return (
    <div className="space-y-4">
      {isMobile ? (
        /* Mobile: faixa compacta — título + "+" Adicionar (o consolidado de saldo
           agora vive no card da aba Visão Geral, não mais aqui no topo). */
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold">Movimentações</h2>
          {globalActions}
        </div>
      ) : (
        /* Barra de ações globais (o card "Saldo Total" saiu do topo — virou o
           card consolidado da aba Visão Geral). */
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Movimentações Financeiras</h2>
          {globalActions}
        </div>
      )}

      <SettingsSidebarLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        groupFooters={groupFooters}
        // Garante que os grupos (e seus footers "+ Nova Conta"/"+ Novo Cartão")
        // sempre apareçam no sidebar, inclusive pra tenant sem nenhuma conta/cartão.
        placeholderGroups={!isMobile ? ['Contas Bancárias', 'Cartões'] : undefined}
      >
        {activeTab === ALL_TAB ? (
          <div className="space-y-4">
            {/* Card consolidado: saldo em contas/caixa e, DISTINTO, total das
                faturas abertas dos cartões. Nunca somar fatura no saldo de caixa. */}
            {(cashBankAccounts.length > 0 || cardAccounts.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cashBankAccounts.length > 0 && (
                  /* Card-herói do SALDO TOTAL. Sem cor de conta única na Visão
                     Geral → degradê pela semântica: positivo verde, zero escuro,
                     negativo vermelho. Texto sempre branco. */
                  <div
                    className={cn(
                      'rounded-2xl p-5 sm:p-6 text-white shadow-lg flex flex-col justify-between gap-3',
                      totalBalance > 0
                        ? 'bg-gradient-to-r from-emerald-700 to-emerald-600'
                        : totalBalance === 0
                        ? 'bg-gradient-to-r from-gray-900 to-gray-700'
                        : 'bg-gradient-to-r from-red-900 to-red-700',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-full bg-white/20 p-2 shrink-0">
                        <Wallet className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wider opacity-90">
                        Saldo total em contas
                      </span>
                    </div>
                    <span className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight">
                      R$ {formatBRL(totalBalance)}
                    </span>
                  </div>
                )}
                {cardAccounts.length > 0 && (
                  <div className="rounded-xl border bg-card px-4 py-3 flex items-center justify-between gap-3 sm:self-stretch">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="rounded-full bg-primary/10 p-2 shrink-0">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Faturas de cartão
                      </span>
                    </div>
                    <span className={cn('text-lg font-bold tabular-nums shrink-0', totalCardBills > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      R$ {formatBRL(totalCardBills)}
                    </span>
                  </div>
                )}
              </div>
            )}
            <TransactionListPanel
              title="Movimentações"
              type="all"
              transactions={transactions}
              isLoading={isLoading}
              onNew={onNew}
              onEdit={onEdit}
              onDelete={onDelete}
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
                type="all"
                transactions={transactions}
                isLoading={isLoading}
                onNew={onNew}
                onEdit={onEdit}
                onDelete={onDelete}
                initialAccountFilter={selectedAccount.id}
                hideAccountColumn
              />
            </div>
          )
        ) : (
          <TransactionListPanel
            title="Movimentações"
            type="all"
            transactions={transactions}
            isLoading={isLoading}
            onNew={onNew}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )}
      </SettingsSidebarLayout>

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

      {/* Gerenciar Categorias */}
      <ResponsiveModal
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        title="Categorias do Financeiro"
        className="sm:max-w-4xl"
      >
        <FinanceCategorias />
      </ResponsiveModal>

      {/* Drawer de ações da conta (mobile) */}
      <ResponsiveModal
        open={!!mobileActionsAccount}
        onOpenChange={(v) => { if (!v) setMobileActionsAccount(null); }}
        title={mobileActionsAccount ? mobileActionsAccount.name : 'Ações'}
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
                Transferir
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 hover:bg-warning hover:text-white hover:border-warning"
              onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); openEditAccount(a); }}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            {mobileActionsAccount.type !== 'cartao' && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 hover:bg-success hover:text-white hover:border-success"
                onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); handleAdjustBalance(a); }}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Ajustar saldo
              </Button>
            )}
            {mobileActionsAccount.type === 'cartao' && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); setRecalcCard(a); }}
              >
                <Calculator className="h-4 w-4" />
                Recalcular faturas
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-destructive hover:bg-destructive hover:text-white hover:border-destructive"
              onClick={() => { const a = mobileActionsAccount; setMobileActionsAccount(null); setDeletingAccount(a); }}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        )}
      </ResponsiveModal>

      {/* Confirmar exclusão de conta/cartão */}
      <AlertDialog open={!!deletingAccount} onOpenChange={(o) => { if (!o) setDeletingAccount(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deletingAccount?.type === 'cartao' ? 'cartão' : 'conta'}</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Transações vinculadas perderão a referência à conta.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar recálculo de faturas */}
      <AlertDialog open={!!recalcCard} onOpenChange={(o) => { if (!o && !recalculateBills.isPending) setRecalcCard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular faturas</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Isso vai recalcular a fatura de todas as despesas deste cartão{recalcCard ? ` "${recalcCard.name}"` : ''}.
              As suas despesas e valores não serão alterados, só a fatura em que cada uma aparece.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recalculateBills.isPending}>Cancelar</AlertDialogCancel>
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
                  Recalculando...
                </>
              ) : (
                'Recalcular'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // Header do cartão selecionado — card-herói. Cartão NÃO tem "saldo de conta"
  // (tem fatura), então não vale a regra de saldo: usa a cor do cartão como
  // fundo se houver (texto contrastante via idealForeground), senão degradê
  // escuro neutro. Mostra o valor da FATURA em destaque + disponível.
  function renderCardHeader(a: FinancialAccount) {
    const hasInst = !!(a.institution_name || a.bank_name);
    const billTotal = cardBillTotals[a.id] ?? 0;
    const availableLimit = a.credit_limit ? a.credit_limit - billTotal : null;

    const useCardColor = !!a.color;
    const fg = useCardColor ? idealForeground(a.color) : '#ffffff';

    return (
      <div
        className={cn(
          'rounded-2xl p-5 sm:p-6 flex items-start justify-between gap-3',
          useCardColor ? 'shadow-lg' : 'bg-gradient-to-r from-gray-900 to-gray-700 shadow-lg',
        )}
        style={{ backgroundColor: useCardColor ? a.color : undefined, color: fg }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {hasInst ? (
            <div className="rounded-lg p-1 shrink-0 bg-white border border-white/20">
              <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={36} />
            </div>
          ) : (
            <div className="rounded-full p-2.5 shrink-0 bg-white/20">
              <CreditCard className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-sm truncate opacity-90">{a.name}</p>
            <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight">
              R$ {formatBRL(billTotal)}
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              Fatura aberta
              {availableLimit !== null && <> · Disp. R$ {formatBRL(availableLimit)}</>}
            </p>
          </div>
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
            Ações
          </Button>
        )}
      </div>
    );
  }
}

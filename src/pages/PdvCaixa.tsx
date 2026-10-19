import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, MinusCircle, PlusCircle, ShoppingCart, Store } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { MESSAGES } from '@/lib/i18n/messages';
import { useCustomers } from '@/hooks/useCustomers';
import { useFinancial } from '@/hooks/useFinancial';
import { useFinancialAccounts, type FinancialAccount } from '@/hooks/useFinancialAccounts';
import {
  usePdvCashRegister,
  usePdvCashSessionDetail,
  usePdvLedgerTransaction,
} from '@/hooks/usePdvCashRegister';
import { useTransactionAttachmentsCounts } from '@/hooks/useTransactionAttachments';
import { deleteTransactionCascade } from '@/hooks/useRelatedTransactions';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { AdjustBalanceDialog } from '@/components/financial/AdjustBalanceDialog';
import { PdvCashClosedCard } from '@/components/pdv/caixa/PdvCashClosedCard';
import { PdvCashIndicators } from '@/components/pdv/caixa/PdvCashIndicators';
import { PdvCashSummaryCards } from '@/components/pdv/caixa/PdvCashSummaryCards';
import { PdvCashHistoryPanel } from '@/components/pdv/caixa/PdvCashHistoryPanel';
import { PdvLedgerDeleteDialog } from '@/components/pdv/caixa/PdvLedgerDeleteDialog';
import { PdvOpenCashDialog } from '@/components/pdv/caixa/PdvOpenCashDialog';
import { PdvCloseCashDialog } from '@/components/pdv/caixa/PdvCloseCashDialog';
import { PdvCashMovementDialog } from '@/components/pdv/caixa/PdvCashMovementDialog';
import {
  buildPdvLedger,
  computeExpectedCash,
  computeSessionResult,
  planLedgerReversal,
  type PdvLedgerEntry,
} from '@/lib/pdv/cash';
import { pdvCashErrorMessage } from '@/lib/pdv/cash-errors';

/**
 * Rota da tela de VENDA (o carrinho), acionada por "Nova venda".
 *
 * Caminho pt-br escrito literal de propósito: o registro de rotas
 * (`src/lib/i18n/appRouteSlugs.ts`) e o `App.tsx` são do 🛡️ Plataforma, e a lei
 * do i18n de rotas garante que "o path pt-br continua válido em TODOS os
 * idiomas" (o AppLayout redireciona pro path canônico do idioma do usuário).
 * Quando a key `pdvSale` entrar no registro, isto pode virar
 * `localizeAppPath('/pdv/venda', locale)` sem mudar o comportamento.
 */
const PDV_SALE_PATH = '/pdv/venda';

const VALUES_VISIBLE_KEY = 'pdv_cash_values_visible';

/** Linha avulsa pendente de espelho na gaveta (ver `cashSync`). */
interface PendingDrawerSync {
  kind: 'sangria' | 'suprimento';
  amount: number;
  description: string;
  accountName: string;
}

/**
 * PAINEL DO CAIXA (PDV e Loja) — a tela que o operador vê ao entrar em Caixa.
 *
 * Anatomia:
 *  • caixa FECHADO: card grande pra abrir + resumo do último caixa fechado;
 *  • caixa ABERTO: dois indicadores (dinheiro em caixa com a linha do cofre,
 *    saldo em conta), botões de ação, resumo do caixa atual com LUCRO REAL e o
 *    histórico único de transações.
 *
 * A venda (carrinho) é SUB-TELA, acionada por "Nova venda".
 *
 * Nenhum número de dinheiro é inventado aqui: saldo do cofre vem de
 * `pdv_cofre_balance()`, abertura/fechamento/sangria/suprimento são RPCs, e a
 * conta de conferência que a tela PREVÊ vive em `src/lib/pdv/cash.ts` (função
 * pura, testada, espelhando a fórmula do servidor).
 */
export default function PdvCaixa() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const { money, dateTime, number } = useLocaleFormatters();
  const t = MESSAGES[locale].app.pdv.cashPanel;
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();

  // Mesmo critério do resto do Financeiro: quem cria lançamento é admin/gestor
  // ou quem tem `fn:manage_finance` explícito. Abrir e fechar o caixa NÃO pede
  // isso (é ação de operador de balcão e não cria lançamento por si).
  const canManageFinance = isAdminOrGestor() || hasPermission('fn:manage_finance');

  // Espelha `public.can_delete_finance` (RLS de DELETE em
  // financial_transactions): admin/gestor sempre; os demais SÓ com registro em
  // `user_permissions`. O fallback legado do `hasPermission` (sem registro
  // libera por ter qualquer role) NÃO vale aqui, senão a tela oferece uma
  // exclusão que o banco recusa. Mesma linha do TransactionListPanel.
  const canDeleteFinance =
    isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:delete_finance'));

  const {
    terminals,
    session,
    lastClosed,
    operators,
    cofre,
    isLoading,
    isLoadingCofre,
    isError,
    error: loadError,
    refetch,
    openSession,
    closeSession,
    registerMovement,
    revertMovement,
    cancelOrder,
    refetchCash,
  } = usePdvCashRegister();
  const detail = usePdvCashSessionDetail(session);
  const { accounts, balances, isLoadingBalances } = useFinancialAccounts();
  const { customers } = useCustomers();
  const { createTransaction, updateTransaction } = useFinancial();

  const [valuesVisible, setValuesVisible] = useState(true);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [movementKind, setMovementKind] = useState<'sangria' | 'suprimento' | null>(null);
  const [txnType, setTxnType] = useState<'entrada' | 'saida' | null>(null);
  const [adjustAccount, setAdjustAccount] = useState<FinancialAccount | null>(null);
  const [pendingSync, setPendingSync] = useState<PendingDrawerSync | null>(null);
  /** Linha do histórico aguardando confirmação de exclusão. */
  const [pendingDelete, setPendingDelete] = useState<PdvLedgerEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  /** Id do lançamento avulso em EDIÇÃO (o formulário do Financeiro recebe a linha inteira). */
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const { transaction: editingTransaction } = usePdvLedgerTransaction(editingTxnId);

  // Preferência de privacidade do operador (balcão é lugar público).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VALUES_VISIBLE_KEY);
      if (saved === '0') setValuesVisible(false);
    } catch {
      // localStorage bloqueado (modo privado): segue visível, sem quebrar.
    }
  }, []);

  function toggleValues() {
    setValuesVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VALUES_VISIBLE_KEY, next ? '1' : '0');
      } catch {
        // idem
      }
      return next;
    });
  }

  const terminalName = useMemo(
    () => terminals.find((term) => term.id === session?.terminal_id)?.name ?? null,
    [terminals, session?.terminal_id],
  );
  const lastClosedTerminalName = useMemo(
    () => terminals.find((term) => term.id === lastClosed?.terminal_id)?.name ?? null,
    [terminals, lastClosed?.terminal_id],
  );

  const customerNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of (customers ?? []) as Array<{ id: string; name: string }>) map[c.id] = c.name;
    return map;
  }, [customers]);

  const accountNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const acc of accounts) map[acc.id] = acc.name;
    return map;
  }, [accounts]);

  /**
   * Contas que recebem sangria e mandam suprimento: banco e dinheiro, nunca
   * cartão de crédito, e nunca a própria conta do cofre (a RPC recusa as duas
   * coisas, então a tela nem oferece).
   */
  const transferableAccounts = useMemo(
    () =>
      accounts
        .filter((acc) => acc.is_active && acc.type !== 'cartao' && acc.id !== cofre?.conta_id)
        .map((acc) => ({ id: acc.id, name: acc.name })),
    [accounts, cofre?.conta_id],
  );

  const accountLines = useMemo(
    () =>
      accounts
        .filter((acc) => acc.is_active && acc.type !== 'cartao' && acc.id !== cofre?.conta_id)
        .map((acc) => ({
          id: acc.id,
          name: acc.name,
          balance: balances[acc.id] ?? Number(acc.initial_balance ?? 0),
        })),
    [accounts, balances, cofre?.conta_id],
  );
  const accountsTotal = useMemo(
    () => accountLines.reduce((sum, acc) => sum + acc.balance, 0),
    [accountLines],
  );

  // ── Composição da gaveta: as MESMAS parcelas que a RPC de fechamento usa ──
  //
  // `!m.cancelled_at` NÃO É DETALHE: `pdv_close_cash_session` só soma movimento
  // não cancelado, e `pdv_revert_cash_movement` desfaz marcando `cancelled_at`
  // (nada é apagado). Sem este filtro a tela previa um esperado e o servidor
  // cobrava outro — divergência de dinheiro na cara do operador.
  const breakdown = useMemo(() => {
    const cashSales = detail.payments
      .filter((p) => p.method === 'dinheiro')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const supplies = detail.movements
      .filter((m) => m.kind === 'suprimento' && !m.cancelled_at)
      .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    const bleeds = detail.movements
      .filter((m) => m.kind === 'sangria' && !m.cancelled_at)
      .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    return {
      openingAmount: Number(session?.opening_amount) || 0,
      cashSales,
      supplies,
      bleeds,
    };
  }, [detail.payments, detail.movements, session?.opening_amount]);

  const drawerAmount = computeExpectedCash(breakdown);

  const sessionResult = useMemo(
    () =>
      computeSessionResult({
        orders: detail.orders.map((o) => ({ total: Number(o.total) || 0 })),
        items: detail.items.map((i) => ({
          quantity: Number(i.quantity) || 0,
          unitCost: Number(i.unit_cost) || 0,
          // Serviço avulso de balcão (mão de obra, carga de gás) não tem
          // produto no catálogo, então não tem custo de mercadoria.
          isService: !i.inventory_id,
        })),
        revenues: detail.transactions
          .filter((tx) => tx.transaction_type === 'entrada')
          .map((tx) => ({ amount: Number(tx.amount) || 0 })),
        expenses: detail.transactions
          .filter((tx) => tx.transaction_type === 'saida')
          .map((tx) => ({ amount: Number(tx.amount) || 0 })),
      }),
    [detail.orders, detail.items, detail.transactions],
  );

  // Quantos anexos cada lançamento avulso tem, pro expansível de receita/despesa.
  const ledgerTxnIds = useMemo(() => detail.transactions.map((tx) => tx.id), [detail.transactions]);
  const { data: attachmentCounts } = useTransactionAttachmentsCounts(ledgerTxnIds);

  const ledger = useMemo(() => {
    const methodsByOrder: Record<string, string[]> = {};
    for (const p of detail.payments) {
      methodsByOrder[p.order_id] = [...(methodsByOrder[p.order_id] ?? []), p.method];
    }
    // Itens e pagamentos por pedido: é o que o expansível da venda mostra.
    const itemsByOrder: Record<string, Array<{ description: string; quantity: number; unitPrice: number; total: number }>> = {};
    for (const i of detail.items) {
      itemsByOrder[i.order_id] = [
        ...(itemsByOrder[i.order_id] ?? []),
        {
          description: i.description,
          quantity: Number(i.quantity) || 0,
          unitPrice: Number(i.unit_price) || 0,
          total: Number(i.total) || 0,
        },
      ];
    }
    const paymentsByOrder: Record<string, Array<{ method: string; amount: number; changeAmount: number; accountName: string | null }>> = {};
    for (const p of detail.payments) {
      paymentsByOrder[p.order_id] = [
        ...(paymentsByOrder[p.order_id] ?? []),
        {
          method: p.method,
          amount: Number(p.amount) || 0,
          changeAmount: Number(p.change_amount) || 0,
          accountName: p.financial_account_id
            ? (accountNames[p.financial_account_id] ?? null)
            : null,
        },
      ];
    }
    return buildPdvLedger({
      orders: detail.orders.map((o) => ({
        id: o.id,
        number: o.number,
        total: Number(o.total) || 0,
        customerName: o.customer_id ? (customerNames[o.customer_id] ?? null) : null,
        occurredAt: o.paid_at || o.created_at,
        methods: methodsByOrder[o.id] ?? [],
        items: itemsByOrder[o.id] ?? [],
        payments: paymentsByOrder[o.id] ?? [],
      })),
      transactions: detail.transactions.map((tx) => ({
        id: tx.id,
        description: tx.description,
        amount: Number(tx.amount) || 0,
        transactionType: tx.transaction_type,
        paymentMethod: tx.payment_method,
        customerName: tx.customer_id ? (customerNames[tx.customer_id] ?? null) : null,
        occurredAt: tx.created_at,
        category: tx.category,
        accountName: tx.account_id ? (accountNames[tx.account_id] ?? null) : null,
        notes: tx.notes,
        attachmentCount: attachmentCounts?.[tx.id] ?? 0,
        // Lançado NA CONTA DO COFRE: a exclusão tem que avisar que o espelho
        // na gaveta (se o operador criou) não some junto.
        onCofreAccount: !!cofre?.conta_id && tx.account_id === cofre.conta_id,
      })),
      // Movimento desfeito ENTRA aqui e `buildPdvLedger` tira da lista. O filtro
      // é de EXIBIÇÃO, nunca da consulta (ver o comentário dele): o id da perna
      // cancelada precisa continuar em `linkedIds` no hook, senão ela volta ao
      // extrato como "despesa avulsa do caixa".
      movements: detail.movements.map((m) => ({
        id: m.id,
        kind: m.kind,
        amount: Number(m.amount) || 0,
        reason: m.reason,
        toAccountName: m.to_account_id ? (accountNames[m.to_account_id] ?? null) : null,
        hasAccount: !!m.to_account_id,
        occurredAt: m.created_at,
        cancelledAt: m.cancelled_at,
      })),
      labels: {
        sale: t.history.labelSale,
        bleed: t.history.labelBleed,
        supply: t.history.labelSupply,
        bleedTo: t.history.labelBleedTo,
        supplyFrom: t.history.labelSupplyFrom,
      },
      cofreAccountName: cofre?.conta_nome ?? t.history.detailDrawer,
    });
  }, [
    detail.orders,
    detail.items,
    detail.payments,
    detail.transactions,
    detail.movements,
    customerNames,
    accountNames,
    attachmentCounts,
    cofre?.conta_id,
    cofre?.conta_nome,
    t.history,
  ]);

  // ── Ações ────────────────────────────────────────────────────────────────

  async function handleOpenCash(args: { terminalId: string; openingAmount: number }) {
    // Erro NÃO é engolido aqui: o diálogo precisa dele pra decidir se mostra as
    // duas saídas do cofre ("abrir com valor menor" / "ajustar o cofre").
    await openSession.mutateAsync(args);
    toast({
      title: t.openDialog.success,
      description: t.openDialog.successDescription.replace('{value}', money(args.openingAmount)),
    });
  }

  async function handleCloseCash(args: { countedAmount: number; notes: string | null }) {
    const result = await closeSession.mutateAsync({
      sessionId: session.id,
      countedAmount: args.countedAmount,
      notes: args.notes ?? undefined,
    });
    const diff = Number(result?.diferenca) || 0;
    toast({
      title: t.closeDialog.success,
      description:
        diff === 0
          ? t.closeDialog.successExact.replace('{value}', money(Number(result?.contado) || 0))
          : t.closeDialog.successDifference
              .replace('{expected}', money(Number(result?.esperado) || 0))
              .replace('{counted}', money(Number(result?.contado) || 0))
              .replace('{difference}', money(diff)),
    });
  }

  async function handleMovement(args: {
    kind: 'sangria' | 'suprimento';
    amount: number;
    toAccountId: string | null;
    reason: string | null;
  }) {
    await registerMovement.mutateAsync({ sessionId: session.id, ...args });
    toast({
      title:
        args.kind === 'sangria' ? t.movementDialog.bleedSuccess : t.movementDialog.supplySuccess,
    });
  }

  /**
   * "Nova receita" e "Nova despesa" REUSAM o formulário do Financeiro
   * (`TransactionFormDialog`). O que o PDV acrescenta é só o carimbo
   * `origin = 'pdv'`, pra o lançamento nascer classificado como da Loja (lei de
   * faseamento do plano: dado tem que nascer classificado, backfill depois é
   * chute).
   */
  async function handleSubmitTransaction(data: Record<string, unknown>) {
    // `origin` não está em `TransactionInput` (é coluna com default no banco),
    // e o insert do hook espalha o input inteiro — então o carimbo viaja. O
    // cast existe só pra atravessar o tipo do hook, não pra esconder erro.
    const payload = { ...data, origin: 'pdv' } as unknown;
    const result = await createTransaction.mutateAsync(payload as never);

    // Lançamento em DINHEIRO na conta do cofre, com caixa aberto: o saldo da
    // conta já mudou, mas o ESPERADO da gaveta não, porque não existe FK entre
    // `financial_transactions` e `pdv_cash_sessions`. Em vez de adivinhar, a
    // tela PERGUNTA e, se foi da gaveta, registra o movimento espelho.
    const installments = Number(data.installment_count) || 1;
    if (
      session &&
      cofre?.conta_id &&
      data.account_id === cofre.conta_id &&
      data.is_paid === true &&
      installments <= 1
    ) {
      setPendingSync({
        kind: data.transaction_type === 'entrada' ? 'suprimento' : 'sangria',
        amount: Number(data.amount) || 0,
        description: String(data.description ?? ''),
        accountName: cofre.conta_nome ?? '',
      });
    }
    return result;
  }

  async function confirmDrawerSync() {
    if (!pendingSync || !session) return;
    const reasonTemplate =
      pendingSync.kind === 'sangria' ? t.cashSync.bleedReason : t.cashSync.supplyReason;
    try {
      await registerMovement.mutateAsync({
        sessionId: session.id,
        kind: pendingSync.kind,
        amount: pendingSync.amount,
        toAccountId: null,
        reason: reasonTemplate.replace('{description}', pendingSync.description),
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t.cashSync.failedTitle,
        description: `${t.cashSync.failedDescription} ${pdvCashErrorMessage(error)}`,
      });
    } finally {
      setPendingSync(null);
    }
  }

  // ── Desfazer e editar linha do histórico ─────────────────────────────────

  /**
   * O plano de reversão da linha vive em `src/lib/pdv/cash.ts` (função pura,
   * testada): é ele quem diz QUAL caminho existente desfaz esta linha e o que
   * exatamente muda. A página só executa — nenhum estorno é escrito aqui.
   */
  function reversalOf(entry: PdvLedgerEntry) {
    return planLedgerReversal(entry, { canManageFinance, canDeleteFinance });
  }

  function handleLedgerEdit(entry: PdvLedgerEntry) {
    if (!reversalOf(entry).canEdit) return;
    setEditingTxnId(entry.id);
  }

  function handleLedgerDelete(entry: PdvLedgerEntry) {
    if (!reversalOf(entry).canDelete) return;
    setPendingDelete(entry);
  }

  async function confirmLedgerDelete(reason: string | null) {
    if (!pendingDelete) return;
    const entry = pendingDelete;
    const plan = reversalOf(entry);
    setIsDeleting(true);
    try {
      if (plan.path === 'cancel_order') {
        await cancelOrder.mutateAsync({ orderId: entry.id, reason });
        toast({ title: t.history.deleteSuccessSale });
      } else if (plan.path === 'delete_transaction') {
        // CAMINHO DO FINANCEIRO, de propósito: `deleteTransactionCascade` é o
        // mesmo que a tela de Movimentações usa no menu da linha (ela trata o
        // par de pagamento de fatura e o vínculo com orçamento). Estorno novo
        // por fora criaria DOIS jeitos de desfazer a mesma coisa.
        //
        // O saldo da conta volta sozinho: `useFinancialAccounts` DERIVA o saldo
        // da soma dos lançamentos, não guarda coluna de saldo.
        await deleteTransactionCascade(entry.id, false);
        refetchCash();
        toast({ title: t.history.deleteSuccessTransaction });
      } else if (plan.path === 'revert_movement') {
        // SANGRIA/SUPRIMENTO: uma RPC só marca `cancelled_at` no movimento e
        // cancela as duas pernas do par. As três recusas (caixa fechado,
        // movimento já desfeito, perna conciliada) vêm do servidor em PT-BR e
        // caem no `catch` abaixo, com `pdvCashErrorMessage` preservando o texto.
        const result = await revertMovement.mutateAsync({
          movementId: entry.id,
          reason,
        });
        // O antes/depois é LIDO DA TABELA pela RPC nas duas vezes: é a prova,
        // na tela, de que o dinheiro voltou pro esperado da gaveta.
        toast({
          title:
            entry.kind === 'suprimento'
              ? t.history.undoSuccessSupply
              : t.history.undoSuccessBleed,
          description: t.history.undoSuccessDrawer
            .replace('{before}', money(Number(result?.na_gaveta_antes) || 0))
            .replace('{after}', money(Number(result?.na_gaveta_depois) || 0)),
        });
      } else {
        // Caminho sem reversão conhecida. A ação já chega desabilitada no menu;
        // isto é o cinto, pra nunca "desfazer" em silêncio sem fazer nada.
        return;
      }
      setPendingDelete(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t.history.deleteError,
        description: pdvCashErrorMessage(error),
      });
    } finally {
      setIsDeleting(false);
    }
  }

  /**
   * Editar lançamento avulso REUSA o formulário do Financeiro, que já sabe
   * reverter e reaplicar (saldo é derivado; parcela e vínculo são tratados lá).
   * Venda NÃO entra aqui de propósito: mexer em item, estoque e pagamento ao
   * mesmo tempo é caro e reverteria pela metade — o caminho honesto é cancelar
   * e refazer.
   */
  async function handleUpdateTransaction(data: Record<string, unknown>) {
    if (!editingTxnId) return null;
    const result = await updateTransaction.mutateAsync({
      ...(data as Record<string, unknown>),
      id: editingTxnId,
    } as never);
    refetchCash();
    setEditingTxnId(null);
    return result;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const header = <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />;

  // Carregando NUNCA é vazio: Skeleton até os dados chegarem.
  if (isLoading) {
    return (
      <div className="space-y-4">
        {header}
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  // Erro de leitura NÃO é "nada cadastrado". Card de ESTADO: fundo branco, cor
  // saturada só no ícone e no título (régua da casa).
  if (isError) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-bold text-destructive">{t.loadError.title}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t.loadError.description}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {pdvCashErrorMessage(loadError)}
            </p>
            <Button type="button" variant="outline" className="mt-2" onClick={refetch}>
              {t.loadError.retry}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (terminals.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Store className="h-12 w-12" />}
              title={t.noTerminal.title}
              description={t.noTerminal.description}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const financeDeniedReason = canManageFinance ? undefined : t.actions.financeDenied;

  return (
    <div className="space-y-4 pb-6">
      {header}

      {!session ? (
        <PdvCashClosedCard
          texts={t.closed}
          canOpen
          onOpen={() => setOpenDialogOpen(true)}
          lastClosed={
            lastClosed
              ? {
                  terminalName: lastClosedTerminalName,
                  operatorName: lastClosed.closed_by
                    ? (operators[lastClosed.closed_by] ?? null)
                    : null,
                  openedAt: lastClosed.opened_at,
                  closedAt: lastClosed.closed_at,
                  countedAmount: lastClosed.counted_amount,
                  difference: lastClosed.difference,
                }
              : null
          }
          money={money}
          dateTime={dateTime}
        />
      ) : (
        <>
          {isLoadingCofre || isLoadingBalances || detail.isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <PdvCashIndicators
              cashTexts={t.cashCard}
              accountTexts={t.accountCard}
              drawerAmount={drawerAmount}
              openedAt={session.opened_at}
              operatorName={session.opened_by ? (operators[session.opened_by] ?? null) : null}
              terminalName={terminalName}
              cofre={cofre}
              accounts={accountLines}
              accountsTotal={accountsTotal}
              valuesVisible={valuesVisible}
              onToggleValues={toggleValues}
              onClose={() => setCloseDialogOpen(true)}
              onBleed={() => setMovementKind('sangria')}
              onSupply={() => setMovementKind('suprimento')}
              money={money}
              dateTime={dateTime}
            />
          )}

          {/* Ações do caixa. "Nova compra" NÃO existe aqui de propósito:
              compra de material no Dominex vive em Estoque → Compras. */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              className="flex-1 gap-2 sm:flex-none"
              onClick={() => navigate(PDV_SALE_PATH)}
            >
              <ShoppingCart className="h-4 w-4" />
              {t.actions.newSale}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 gap-2 sm:flex-none"
              disabled={!canManageFinance}
              title={financeDeniedReason}
              onClick={() => setTxnType('entrada')}
            >
              <PlusCircle className="h-4 w-4" />
              {t.actions.newRevenue}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1 gap-2 sm:flex-none"
              disabled={!canManageFinance}
              title={financeDeniedReason}
              onClick={() => setTxnType('saida')}
            >
              <MinusCircle className="h-4 w-4" />
              {t.actions.newExpense}
            </Button>
            {/* Sangria e suprimento NÃO se repetem aqui: eles já são as ações
                do card "Saldo em conta", que no mobile fica logo acima desta
                fileira. Botão duplicado na mesma tela é antipadrão cobrado
                pelo CEO (medido em 390px: os dois cards e esta fileira cabem
                na mesma dobra). */}
          </div>

          {detail.isLoading ? (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <PdvCashSummaryCards
              texts={t.summary}
              result={sessionResult}
              valuesVisible={valuesVisible}
              money={money}
              number={number}
            />
          )}

          <PdvCashHistoryPanel
            texts={t.history}
            entries={ledger}
            isLoading={detail.isLoading}
            valuesVisible={valuesVisible}
            money={money}
            dateTime={dateTime}
            number={number}
            canManageFinance={canManageFinance}
            canDeleteFinance={canDeleteFinance}
            onEdit={handleLedgerEdit}
            onDelete={handleLedgerDelete}
          />
        </>
      )}

      <PdvOpenCashDialog
        open={openDialogOpen}
        onOpenChange={setOpenDialogOpen}
        texts={t.openDialog}
        terminals={terminals}
        cofre={cofre}
        lastClosedCounted={lastClosed?.counted_amount ?? null}
        canAdjustCofre={canManageFinance && !!cofre?.conta_id}
        onAdjustCofre={() => {
          const account = accounts.find((acc) => acc.id === cofre?.conta_id) ?? null;
          setAdjustAccount(account);
        }}
        onConfirm={handleOpenCash}
      />

      {session && (
        <PdvCloseCashDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          texts={t.closeDialog}
          breakdown={breakdown}
          cofreAccountName={cofre?.conta_nome ?? null}
          onConfirm={handleCloseCash}
        />
      )}

      {session && (
        <PdvCashMovementDialog
          open={movementKind != null}
          onOpenChange={(v) => {
            if (!v) setMovementKind(null);
          }}
          kind={movementKind ?? 'sangria'}
          texts={t.movementDialog}
          accounts={transferableAccounts}
          drawerAmount={drawerAmount}
          canChooseAccount={canManageFinance}
          onConfirm={handleMovement}
        />
      )}

      {/* Lançamento avulso: formulário do FINANCEIRO, sem formulário novo. */}
      <TransactionFormDialog
        open={txnType != null}
        onOpenChange={(v) => {
          if (!v) setTxnType(null);
        }}
        defaultType={txnType ?? 'saida'}
        isLoading={createTransaction.isPending}
        onSubmit={handleSubmitTransaction}
        prefill={{
          account_id: cofre?.conta_id ?? undefined,
          payment_method: 'dinheiro',
          is_paid: true,
        }}
      />

      {/* Desfazer linha do histórico: a confirmação LISTA o que vai ser
          revertido, nunca um "tem certeza?" genérico. */}
      <PdvLedgerDeleteDialog
        open={pendingDelete != null}
        onOpenChange={(v) => {
          if (!v) setPendingDelete(null);
        }}
        texts={t.history}
        entry={pendingDelete}
        plan={pendingDelete ? reversalOf(pendingDelete) : null}
        money={money}
        isPending={isDeleting}
        onConfirm={confirmLedgerDelete}
      />

      {/* Editar lançamento avulso: formulário do FINANCEIRO, sem formulário novo. */}
      {editingTransaction && (
        <TransactionFormDialog
          open
          onOpenChange={(v) => {
            if (!v) setEditingTxnId(null);
          }}
          transaction={editingTransaction}
          isLoading={updateTransaction.isPending}
          onSubmit={handleUpdateTransaction}
        />
      )}

      <AdjustBalanceDialog
        open={adjustAccount != null}
        onOpenChange={(v) => {
          if (!v) setAdjustAccount(null);
        }}
        account={adjustAccount}
      />

      {/* Espelho na gaveta do lançamento avulso em dinheiro. */}
      <ResponsiveModal
        open={pendingSync != null}
        onOpenChange={(v) => {
          if (!v) setPendingSync(null);
        }}
        title={
          pendingSync?.kind === 'sangria' ? t.cashSync.bleedTitle : t.cashSync.supplyTitle
        }
        className="sm:max-w-[440px]"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setPendingSync(null)}>
              {t.cashSync.dismiss}
            </Button>
            <Button type="button" onClick={confirmDrawerSync} disabled={registerMovement.isPending}>
              {pendingSync?.kind === 'sangria'
                ? t.cashSync.confirmBleed
                : t.cashSync.confirmSupply}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            {(pendingSync?.kind === 'sangria'
              ? t.cashSync.bleedDescription
              : t.cashSync.supplyDescription
            ).replace('{account}', pendingSync?.accountName ?? '')}
          </p>
          <p className="text-lg font-extrabold tabular-nums">
            {money(pendingSync?.amount ?? 0)}
          </p>
        </div>
      </ResponsiveModal>
    </div>
  );
}

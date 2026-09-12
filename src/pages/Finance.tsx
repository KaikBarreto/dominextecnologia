import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useFinancial } from '@/hooks/useFinancial';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { ChargeDialog } from '@/components/financial/ChargeDialog';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { FinanceRelatorio } from '@/components/financial/FinanceRelatorio';
import { FinanceMovimentacoes } from '@/components/financial/FinanceMovimentacoes';
import { FinanceContas } from '@/components/financial/FinanceContas';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { getEffectiveTransactionMonthRange, isTransactionInDateRange } from '@/lib/finance-date';
import { useTransactionEditSubmit } from '@/hooks/useTransactionEditSubmit';
import { DollarSign } from 'lucide-react';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { resolveAppSlug, localizeAppPath } from '@/lib/i18n/appRouteSlugs';

// "Financeiro" virou um GRUPO no menu com 3 telas próprias, cada uma com no
// máximo 1 nível de navegação (acaba o duplo-carrossel no mobile):
//   /financeiro/relatorio     → Relatório (Visão Geral + DRE em abas)
//   /financeiro/contas        → Contas a Pagar/Receber
//   /financeiro/movimentacoes → Movimentações (carrossel de contas)
// As URLs antigas (/financeiro, /financeiro/dre, /caixas-bancos, /categorias,
// /configuracoes) redirecionam no App.tsx pra não dar 404.
type FinanceScreen = 'relatorio' | 'contas' | 'movimentacoes';

// A sub-tela é decidida pela KEY canônica da rota (idioma-agnóstica), não pelo
// pathname pt-br hardcoded. Com as rotas traduzidas (Fase 2), o usuário `en` está
// em /finance/report, /finance/movements, /finance/accounts — resolveAppSlug()
// devolve a mesma KEY em qualquer idioma. (Regressão corrigida: sub-abas sempre
// caíam na Overview em en/es/fr.)
const KEY_SCREEN_MAP: Record<string, FinanceScreen> = {
  finance: 'relatorio',
  financeReport: 'relatorio',
  financeMovements: 'movimentacoes',
  financeAccounts: 'contas',
};

export default function Finance() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const routeKey = resolveAppSlug(location.pathname, locale);
  const screen: FinanceScreen = (routeKey && KEY_SCREEN_MAP[routeKey]) || 'relatorio';

  // Aba interna do Relatório (Visão Geral / DRE) via `?tab=`.
  const relatorioTab = searchParams.get('tab') || 'visao-geral';
  const setRelatorioTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'visao-geral') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // Deep-link `?account=ID` → seleciona a conta no carrossel de "Movimentações
  // Financeiras". Após consumir, limpamos o param pra não "travar" o sidebar.
  const accountFilterParam = searchParams.get('account');
  const clearAccountFilterParam = () => {
    if (!searchParams.get('account')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('account');
    setSearchParams(next, { replace: true });
  };

  // Deep-link `?txn=ID` → abre "Movimentações Financeiras" já no MÊS daquela
  // movimentação e com a linha destacada. Existe porque a tela nasce em "este
  // mês": um recebimento lançado em julho é invisível em setembro e o usuário
  // não tinha como chegar nele a partir do orçamento que o gerou.
  // Mesmo padrão do `?account=`: consome uma vez e limpa o param da URL.
  const focusTransactionParam = searchParams.get('txn');
  const clearFocusTransactionParam = () => {
    if (!searchParams.get('txn')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('txn');
    setSearchParams(next, { replace: true });
  };

  const [formOpen, setFormOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [defaultType, setDefaultType] = useState<TransactionType>('entrada');
  // Linha a destacar na lista (vem do `?txn=`). Fica até o usuário sair da tela.
  const [highlightTransactionId, setHighlightTransactionId] = useState<string | null>(null);
  const { preset, range, setPreset, setRange } = useDateRangeFilter('this_month');
  const { hasModule } = useCompanyModules();
  // Cobrança avulsa (recebimento do cliente final via Asaas): o botão "Cobrar"
  // só aparece com o add-on `cobrancas` contratado E a conta de recebimentos
  // ativa. Se o módulo está ativo mas a conta não foi configurada, mostramos um
  // botão desabilitado com tooltip direcional (UX > silêncio). Gate real é server-side.
  const { isActive: canCharge } = useTenantPaymentAccount();
  const hasChargeModule = hasModule('cobrancas');
  const showChargeButton = hasChargeModule && canCharge;
  // Módulo contratado mas conta Asaas não configurada/ativa.
  const showChargeInactiveHint = hasChargeModule && !canCharge;

  // "Contas a Pagar/Receber" exige finance_advanced (mesmo gate que antes
  // escondia a aba). Acesso direto por URL sem o módulo → cai no Relatório.
  useEffect(() => {
    if (screen === 'contas' && !hasModule('finance_advanced')) {
      navigate(localizeAppPath('/financeiro/relatorio', locale), { replace: true });
    }
  }, [screen, hasModule, navigate, locale]);

  const {
    // `transactions` = só as RAÍZES. É o que toda listagem desta tela consome.
    // `transactionsWithChildren` = raízes + filhas (tarifa do recebimento,
    // recebimento parcial). Vai SÓ pro DRE, que precisa fechar o resultado
    // contábil: a tarifa da maquininha é despesa real e não aparece em nenhuma
    // outra linha — sem ela o lucro saía inflado em toda venda com tarifa.
    transactions, transactionsWithChildren, isLoading,
    createTransaction, updateTransaction, deleteTransaction, markAsPaid,
  } = useFinancial();

  // Consome o `?txn=ID`: acha a movimentação na lista que o hook já trouxe
  // (todos os períodos, com RLS aplicada), joga o filtro de período pro mês
  // dela e marca a linha pra destacar. O mês vem de
  // `getEffectiveTransactionMonthRange`, a MESMA regra do filtro logo abaixo:
  // em compra de cartão a data que vale é a da fatura, não a da compra.
  // Id inexistente, sem permissão (RLS) ou linha filha (o hook só lista raízes)
  // cai no caminho silencioso: limpa o param e segue a vida, sem erro nem toast.
  useEffect(() => {
    if (!focusTransactionParam || screen !== 'movimentacoes' || isLoading) return;
    const target = transactions.find((t) => t.id === focusTransactionParam);
    if (target) {
      const monthRange = getEffectiveTransactionMonthRange(target, 'caixa');
      if (monthRange) {
        setPreset('custom');
        setRange(monthRange);
      }
      setHighlightTransactionId(target.id);
    }
    clearFocusTransactionParam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTransactionParam, screen, isLoading, transactions]);

  // Para transações de cartão de crédito (com `credit_card_bill_date` preenchido),
  // o filtro de período deve usar o mês da fatura, não a data da compra/parcela.
  // Isso alinha a tela "Movimentações" com a tela "Contas e Cartões" (faturas).
  // Sem essa regra, parcelas de cartão aparecem no mês da compra em vez do mês da fatura.
  // Regra centralizada em `@/lib/finance-date`.
  const filteredTransactions = useMemo(
    () => transactions.filter((t) => isTransactionInDateRange(t, range, 'caixa')),
    [transactions, range]
  );

  // Movimentações = só o que JÁ FOI REALIZADO (is_paid). Pendentes/parcelas
  // futuras vivem em "Contas a Pagar/Receber", não aqui. Sem isso, parcelas
  // futuras poluíam a tela e o export.
  // ATENÇÃO: desde que pagar a fatura por inteiro passou a quitar as compras do
  // cartão (is_paid = true), `is_paid` sozinho não exclui mais essas compras. O
  // corte delas na lista geral, e o switch "Incluir compras no cartão", vive
  // em `FinanceMovimentacoes`, que é quem sabe qual painel está na tela (Visão
  // Geral × extrato de conta × faturas do cartão).
  const movimentacoesTransactions = useMemo(
    () => filteredTransactions.filter((t) => t.is_paid),
    [filteredTransactions]
  );

  // Resumo: despesas de cartão entram no mês da fatura; demais itens pagos
  // usam transaction_date e não pagos usam due_date.
  const summaryTransactions = useMemo(
    () => transactions.filter((t) => isTransactionInDateRange(t, range, 'caixa-misto')),
    [transactions, range]
  );

  // Contas a Pagar/Receber: vencimento individual da parcela, exceto cartões
  // (esses caem na data da fatura, igual ao filtro de Movimentações).
  const contasTransactions = useMemo(
    () => transactions.filter((t) => isTransactionInDateRange(t, range, 'pagar')),
    [transactions, range]
  );

  const summary = useMemo(() => {
    const s = { totalEntradas: 0, totalSaidas: 0, saldo: 0, aPagar: 0, aReceber: 0 };
    summaryTransactions.forEach((t) => {
      // Movimento interno (transferência entre contas e pagamento de fatura de
      // cartão) fica fora do resumo: é balanço, não resultado. O par de
      // lançamentos compartilha `transfer_pair_id` — sem esse corte, transferir
      // R$ 10.000 de um banco pro outro apareceria como R$ 10.000 de entrada.
      // Critério estrutural (mesmo do DRE), nunca por nome de categoria.
      if (t.transfer_pair_id) return;
      if (t.transaction_type === 'entrada') {
        if (t.is_paid) {
          s.totalEntradas += Number(t.amount);
        } else {
          s.aReceber += Number(t.amount);
        }
      } else {
        if (t.is_paid) {
          s.totalSaidas += Number(t.amount);
        } else {
          s.aPagar += Number(t.amount);
        }
      }
    });
    s.saldo = s.totalEntradas - s.totalSaidas;
    return s;
  }, [summaryTransactions]);

  // Atalhos da Visão Geral (cards "A Pagar"/"A Receber"/contas) → telas próprias.
  const handleNavigateShortcut = (target: 'historico' | 'contas') => {
    navigate(
      localizeAppPath(
        target === 'contas' ? '/financeiro/contas' : '/financeiro/movimentacoes',
        locale,
      ),
    );
  };

  /**
   * "Salvar" do formulário. Toda a regra (UPDATE x recriar, relink de anexos,
   * delete de UMA linha só, fatura do cartão, toasts de falha parcial) vive em
   * `useTransactionEditSubmit`, compartilhada com a aba Financeiro da ficha do
   * cliente. Antes cada tela tinha a sua cópia e só esta estava corrigida: a da
   * ficha do cliente continuava apagando o grupo de parcelas inteiro.
   */
  const submitTransaction = useTransactionEditSubmit({
    createTransaction,
    updateTransaction,
    deleteTransaction,
  });

  const handleSubmit = async (data: any) => {
    const result = await submitTransaction(data, editingTransaction);
    setEditingTransaction(null);
    return result;
  };

  const handleEdit = (t: FinancialTransaction) => {
    setEditingTransaction(t);
    setDefaultType(t.transaction_type);
    setFormOpen(true);
  };

  const handleNew = (type: TransactionType) => {
    setEditingTransaction(null);
    setDefaultType(type);
    setFormOpen(true);
  };

  // No mobile, telas com FAB (movimentações, contas) precisam de padding extra
  // pra última linha não ficar coberta pelo botão.
  const screenHasFab = screen === 'movimentacoes' || screen === 'contas';

  // Subtítulo do header por tela (cada tela é própria agora).
  const screenSubtitle =
    screen === 'contas'
      ? fin.page.subtitles.accounts
      : screen === 'movimentacoes'
      ? fin.page.subtitles.movements
      : fin.page.subtitles.report;

  return (
    // min-h-[100dvh] garante que empty states + transição de tela ocupem toda
    // a viewport real (respeitando barras dinâmicas do iOS Safari).
    <div className={cn('min-h-[100dvh] space-y-4 sm:space-y-6', isMobile && screenHasFab && 'pb-24')}>
      <MobilePageHeader
        title={fin.page.title}
        subtitle={screenSubtitle}
        icon={DollarSign}
        actions={
          showChargeButton ? (
            <Button size="sm" onClick={() => setChargeOpen(true)}>
              <Wallet className="mr-2 h-4 w-4" />
              {MESSAGES[locale].app.charges.cobrar.button}
            </Button>
          ) : showChargeInactiveHint ? (
            // Módulo contratado mas conta Asaas não ativa: botão direcional
            // (não some silenciosamente — orienta o usuário).
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate(localizeAppPath('/configuracoes/integracoes', locale))
              }
            >
              <Wallet className="mr-2 h-4 w-4" />
              {MESSAGES[locale].app.charges.cobrar.notActivated.cta}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4">
        <DateRangeFilter
          value={range}
          preset={preset}
          onPresetChange={setPreset}
          onRangeChange={setRange}
        />

        {screen === 'relatorio' && (
          <FinanceRelatorio
            transactions={filteredTransactions}
            allTransactions={transactionsWithChildren}
            dateRange={range}
            summary={summary}
            activeTab={relatorioTab}
            onTabChange={setRelatorioTab}
            onNavigateShortcut={handleNavigateShortcut}
            onNewReceita={() => handleNew('entrada')}
            onNewDespesa={() => handleNew('saida')}
          />
        )}

        {screen === 'movimentacoes' && (
          <FinanceMovimentacoes
            transactions={movimentacoesTransactions}
            // Saldo corrente do extrato precisa das linhas FILHAS (tarifa de
            // maquina, recebimento parcial): a ancora vem de useFinancialAccounts,
            // que sempre somou todas as linhas pagas. Alimentar a caminhada com a
            // lista so-raizes deslocava o "Saldo Apos" de cada linha pelo valor das
            // tarifas. Quem vira LINHA na tela continua sendo `transactions`.
            allTransactions={transactionsWithChildren}
            isLoading={isLoading}
            onNew={() => handleNew('entrada')}
            onEdit={handleEdit}
            onDelete={(id) => deleteTransaction.mutateAsync(id)}
            onMarkAsPaid={(params) => markAsPaid.mutateAsync(params)}
            initialAccountId={accountFilterParam}
            onConsumeInitialAccount={clearAccountFilterParam}
            highlightTransactionId={highlightTransactionId}
          />
        )}

        {screen === 'contas' && (
          <FinanceContas
            transactions={contasTransactions}
            allTransactions={transactions}
            isLoading={isLoading}
            onMarkAsPaid={(params) => markAsPaid.mutateAsync(params)}
            dateRange={range}
          />
        )}
      </div>

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editingTransaction}
        onSubmit={handleSubmit}
        isLoading={createTransaction.isPending || updateTransaction.isPending}
        defaultType={defaultType}
      />

      {showChargeButton && <ChargeDialog open={chargeOpen} onOpenChange={setChargeOpen} />}
    </div>
  );
}

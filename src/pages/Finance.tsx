import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useFinancial } from '@/hooks/useFinancial';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { FinanceRelatorio } from '@/components/financial/FinanceRelatorio';
import { FinanceMovimentacoes } from '@/components/financial/FinanceMovimentacoes';
import { FinanceContas } from '@/components/financial/FinanceContas';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { isTransactionInDateRange } from '@/lib/finance-date';
import { DollarSign } from 'lucide-react';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import type { FinancialTransaction, TransactionType } from '@/types/database';

// "Financeiro" virou um GRUPO no menu com 3 telas próprias, cada uma com no
// máximo 1 nível de navegação (acaba o duplo-carrossel no mobile):
//   /financeiro/relatorio     → Relatório (Visão Geral + DRE em abas)
//   /financeiro/contas        → Contas a Pagar/Receber
//   /financeiro/movimentacoes → Movimentações (carrossel de contas)
// As URLs antigas (/financeiro, /financeiro/dre, /caixas-bancos, /categorias,
// /configuracoes) redirecionam no App.tsx pra não dar 404.
type FinanceScreen = 'relatorio' | 'contas' | 'movimentacoes';

const ROUTE_SCREEN_MAP: Record<string, FinanceScreen> = {
  '/financeiro/relatorio': 'relatorio',
  '/financeiro/contas': 'contas',
  '/financeiro/movimentacoes': 'movimentacoes',
};

export default function Finance() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const screen: FinanceScreen = ROUTE_SCREEN_MAP[location.pathname] || 'relatorio';

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

  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [defaultType, setDefaultType] = useState<TransactionType>('entrada');
  const { preset, range, setPreset, setRange } = useDateRangeFilter('this_month');
  const { toast } = useToast();
  const { hasModule } = useCompanyModules();

  // "Contas a Pagar/Receber" exige finance_advanced (mesmo gate que antes
  // escondia a aba). Acesso direto por URL sem o módulo → cai no Relatório.
  useEffect(() => {
    if (screen === 'contas' && !hasModule('finance_advanced')) {
      navigate('/financeiro/relatorio', { replace: true });
    }
  }, [screen, hasModule, navigate]);

  const {
    transactions, isLoading,
    createTransaction, updateTransaction, deleteTransaction, markAsPaid,
  } = useFinancial();

  // Para transações de cartão de crédito (com `credit_card_bill_date` preenchido),
  // o filtro de período deve usar o mês da fatura, não a data da compra/parcela.
  // Isso alinha a tela "Movimentações" com a tela "Contas e Cartões" (faturas).
  // Sem essa regra, parcelas de cartão aparecem no mês da compra em vez do mês da fatura.
  // Regra centralizada em `@/lib/finance-date`.
  const filteredTransactions = useMemo(
    () => transactions.filter((t) => isTransactionInDateRange(t, range, 'caixa')),
    [transactions, range]
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
    navigate(target === 'contas' ? '/financeiro/contas' : '/financeiro/movimentacoes');
  };

  // Duplica linhas de `financial_transaction_attachments` da transação original
  // pra cada nova parcela, apontando pro MESMO `storage_path` (arquivo físico
  // único, várias rows referenciando). Não copia o arquivo no Storage —
  // alinhado ao padrão usado em `useUploadTransactionAttachmentShared`.
  const relinkAttachments = async (oldTransactionId: string, newIds: string[]) => {
    if (newIds.length === 0) return;
    const { data: existing, error: selErr } = await supabase
      .from('financial_transaction_attachments')
      .select('storage_path, file_name, mime_type, size_bytes, uploaded_by')
      .eq('transaction_id', oldTransactionId);
    if (selErr) throw selErr;
    if (!existing || existing.length === 0) return;

    const rows = newIds.flatMap((newId) =>
      existing.map((att) => ({
        transaction_id: newId,
        storage_path: att.storage_path,
        file_name: att.file_name,
        mime_type: att.mime_type,
        size_bytes: att.size_bytes,
        uploaded_by: att.uploaded_by,
      }))
    );
    const { error: insErr } = await supabase
      .from('financial_transaction_attachments')
      .insert(rows);
    if (insErr) throw insErr;
  };

  const handleSubmit = async (data: any) => {
    let result: any = null;
    if (editingTransaction) {
      const wasOnePayment =
        !editingTransaction.installment_total || editingTransaction.installment_total <= 1;
      const willBeMultiple = (data.installment_count ?? 1) > 1;
      const originalPaymentMethod = editingTransaction.payment_method;
      const paymentMethodChanged = originalPaymentMethod !== data.payment_method;

      // Caminho "recriar": precisamos reescrever a despesa do zero quando
      //  (a) à vista virou parcelada (estrutura muda) OU
      //  (b) método de pagamento mudou (ex: PIX → Cartão, vira lançamento de fatura).
      // Em ambos os casos o UPDATE plano do hook não dá conta.
      const needsReplace = (wasOnePayment && willBeMultiple) || paymentMethodChanged;

      if (needsReplace) {
        // 1. Cria a(s) nova(s) transação(ões) primeiro pra não perder dados se falhar.
        const created = await createTransaction.mutateAsync(data);

        // 2. Relink dos anexos: precisa rodar antes do delete, senão perdem o
        //    storage_path referenciado pela transação original.
        try {
          await relinkAttachments(editingTransaction.id, created.ids);
        } catch (e) {
          toast({
            variant: 'destructive',
            title: 'Anexos não foram preservados',
            description: 'A nova despesa foi criada, mas os comprovantes da original não puderam ser vinculados. Reanexe manualmente.',
          });
        }

        // 3. Delete da original. Se ela faz parte de um grupo de parcelas
        //    (installment_group_id), tem que apagar TODAS as parcelas do grupo,
        //    senão sobram irmãs órfãs que confundem extrato e cartão.
        const installmentGroupId = editingTransaction.installment_group_id;
        try {
          if (installmentGroupId) {
            // Apaga todas as parcelas do grupo de uma vez. Não usa
            // deleteTransaction.mutateAsync (que processa uma por uma + cascata
            // de quote/fatura) porque queremos a operação atômica e mais barata.
            const { error: delErr } = await supabase
              .from('financial_transactions')
              .delete()
              .eq('installment_group_id', installmentGroupId);
            if (delErr) throw delErr;
          } else {
            await deleteTransaction.mutateAsync(editingTransaction.id);
          }
        } catch (e: any) {
          toast({
            variant: 'destructive',
            title: 'Transação original não foi removida',
            description: 'A nova despesa foi criada, mas a original ainda está na lista. Remova manualmente.',
          });
        }
        result = created;
      } else {
        // Caminho normal: update simples. Embrulha pra manter o contrato
        // { ids, primary } que o form espera.
        const updated = await updateTransaction.mutateAsync({ ...data, id: editingTransaction.id });
        result = { ids: [editingTransaction.id], primary: updated };
      }
    } else {
      // Create: já retorna { ids: string[]; primary } — funciona pra à vista E parcelado.
      result = await createTransaction.mutateAsync(data);
    }
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
      ? 'Contas a pagar e a receber'
      : screen === 'movimentacoes'
      ? 'Movimentações por conta'
      : 'Gerencie suas finanças';

  return (
    // min-h-[100dvh] garante que empty states + transição de tela ocupem toda
    // a viewport real (respeitando barras dinâmicas do iOS Safari).
    <div className={cn('min-h-[100dvh] space-y-4 sm:space-y-6', isMobile && screenHasFab && 'pb-24')}>
      <MobilePageHeader
        title="Financeiro"
        subtitle={screenSubtitle}
        icon={DollarSign}
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
            transactions={filteredTransactions}
            isLoading={isLoading}
            onNew={() => handleNew('entrada')}
            onEdit={handleEdit}
            onDelete={(id) => deleteTransaction.mutateAsync(id)}
            onMarkAsPaid={(params) => markAsPaid.mutateAsync(params)}
            initialAccountId={accountFilterParam}
            onConsumeInitialAccount={clearAccountFilterParam}
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
    </div>
  );
}

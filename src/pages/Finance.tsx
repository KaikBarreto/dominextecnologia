import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useFinancial } from '@/hooks/useFinancial';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { FinanceOverview } from '@/components/financial/FinanceOverview';
import { TransactionListPanel } from '@/components/financial/TransactionListPanel';
import { FinanceCategorias } from '@/components/financial/FinanceCategorias';
import { FinanceDRE } from '@/components/financial/FinanceDRE';
import { FinanceContas } from '@/components/financial/FinanceContas';
import { FinanceBanks } from '@/components/financial/FinanceBanks';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { isTransactionInDateRange } from '@/lib/finance-date';
import {
  DollarSign,
  LayoutDashboard,
  History as HistoryIcon,
  CalendarClock,
  Landmark,
  FileBarChart,
  Settings as SettingsIcon,
} from 'lucide-react';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import type { FinancialTransaction, TransactionType } from '@/types/database';

const ROUTE_TAB_MAP: Record<string, string> = {
  '/financeiro': 'visao-geral',
  '/financeiro/movimentacoes': 'historico',
  '/financeiro/contas': 'contas',
  '/financeiro/caixas-bancos': 'bancos',
  '/financeiro/categorias': 'configuracoes', // legacy alias → config
  '/financeiro/configuracoes': 'configuracoes',
  '/financeiro/dre': 'dre',
};

const TAB_ROUTE_MAP: Record<string, string> = {
  'visao-geral': '/financeiro',
  'historico': '/financeiro/movimentacoes',
  'contas': '/financeiro/contas',
  'bancos': '/financeiro/caixas-bancos',
  'configuracoes': '/financeiro/configuracoes',
  'dre': '/financeiro/dre',
};

export default function Finance() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const activeTab = ROUTE_TAB_MAP[location.pathname] || 'visao-geral';
  // Deep-link de "Contas e Cartões" → "Movimentações" pré-filtrada por conta.
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

  // Lista completa de abas + filtragem por módulo. Abas marcadas com
  // requiresAdvanced só aparecem se o tenant tem finance_advanced.
  const TABS: Array<SettingsTab & { requiresAdvanced?: boolean }> = [
    { value: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
    { value: 'historico', label: 'Movimentações', icon: HistoryIcon },
    { value: 'contas', label: 'Contas a Pagar/Receber', icon: CalendarClock, requiresAdvanced: true },
    { value: 'bancos', label: 'Contas e Cartões', icon: Landmark, requiresAdvanced: true },
    { value: 'dre', label: 'DRE - Resultado', icon: FileBarChart, requiresAdvanced: true },
    { value: 'configuracoes', label: 'Configurações', icon: SettingsIcon },
  ];

  const visibleTabs = TABS.filter(t => !t.requiresAdvanced || hasModule('finance_advanced'));

  // Se o usuário acessou uma rota que ele não tem permissão (deep-link expirado,
  // downgrade de plano), redireciona pra Visão Geral sem aviso ruidoso.
  useEffect(() => {
    const isVisible = visibleTabs.some(t => t.value === activeTab);
    if (!isVisible) navigate('/financeiro', { replace: true });
  }, [activeTab, visibleTabs, navigate]);

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

  const handleNavigate = (tab: string) => {
    const route = TAB_ROUTE_MAP[tab];
    if (route) navigate(route);
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

  // No mobile, tabs que tem FAB (movimentações, contas) precisam de padding extra
  // pra última linha não ficar coberta pelo botão.
  const tabHasFab = activeTab === 'historico' || activeTab === 'contas' || activeTab === 'bancos';

  return (
    <div className={cn('space-y-4 sm:space-y-6', isMobile && tabHasFab && 'pb-24')}>
      <MobilePageHeader
        title="Financeiro"
        subtitle="Gerencie suas finanças"
        icon={DollarSign}
      />

      <SettingsSidebarLayout
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabChange={handleNavigate}
      >
        <div className="space-y-4">
          <DateRangeFilter
            value={range}
            preset={preset}
            onPresetChange={setPreset}
            onRangeChange={setRange}
          />

          {activeTab === 'visao-geral' && (
            <FinanceOverview
              transactions={filteredTransactions}
              summary={summary}
              onNavigate={handleNavigate}
              onNewReceita={() => handleNew('entrada')}
              onNewDespesa={() => handleNew('saida')}
            />
          )}

          {activeTab === 'historico' && (
            <TransactionListPanel
              title="Movimentações"
              type="all"
              transactions={filteredTransactions}
              isLoading={isLoading}
              onNew={() => handleNew('entrada')}
              onEdit={handleEdit}
              onDelete={(id) => deleteTransaction.mutateAsync(id)}
              onMarkAsPaid={(params) => markAsPaid.mutateAsync(params)}
              initialAccountFilter={accountFilterParam}
              onClearAccountFilter={clearAccountFilterParam}
            />
          )}

          {activeTab === 'contas' && (
            <FinanceContas
              transactions={contasTransactions}
              isLoading={isLoading}
              onMarkAsPaid={(params) => markAsPaid.mutateAsync(params)}
            />
          )}

          {activeTab === 'bancos' && <FinanceBanks />}

          {activeTab === 'configuracoes' && (
            <div className="space-y-6">
              <FinanceCategorias />
            </div>
          )}

          {activeTab === 'dre' && <FinanceDRE transactions={filteredTransactions} />}
        </div>
      </SettingsSidebarLayout>

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

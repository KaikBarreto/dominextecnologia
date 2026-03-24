import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFinancial } from '@/hooks/useFinancial';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { FinanceOverview } from '@/components/financial/FinanceOverview';
import { TransactionListPanel } from '@/components/financial/TransactionListPanel';
import { FinanceCategorias } from '@/components/financial/FinanceCategorias';
import { FinanceDRE } from '@/components/financial/FinanceDRE';
import { FinanceContas } from '@/components/financial/FinanceContas';
import { FinanceBanks } from '@/components/financial/FinanceBanks';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import type { FinancialTransaction, TransactionType } from '@/types/database';

const ROUTE_TAB_MAP: Record<string, string> = {
  '/financeiro': 'visao-geral',
  '/financeiro/movimentacoes': 'historico',
  '/financeiro/contas': 'contas',
  '/financeiro/caixas-bancos': 'bancos',
  '/financeiro/categorias': 'categorias',
  '/financeiro/dre': 'dre',
};

const TAB_ROUTE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(ROUTE_TAB_MAP).map(([k, v]) => [v, k])
);

export default function Finance() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = ROUTE_TAB_MAP[location.pathname] || 'visao-geral';

  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [defaultType, setDefaultType] = useState<TransactionType>('entrada');
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  const {
    transactions, isLoading,
    createTransaction, updateTransaction, deleteTransaction, markAsPaid,
  } = useFinancial();

  const filteredTransactions = filterByDate(transactions, 'transaction_date');

  const summary = useMemo(() => {
    const s = { totalEntradas: 0, totalSaidas: 0, saldo: 0, aPagar: 0, aReceber: 0 };
    filteredTransactions.forEach((t) => {
      if (t.transaction_type === 'entrada') {
        s.totalEntradas += Number(t.amount);
        if (!t.is_paid) s.aReceber += Number(t.amount);
      } else {
        s.totalSaidas += Number(t.amount);
        if (!t.is_paid) s.aPagar += Number(t.amount);
      }
    });
    s.saldo = s.totalEntradas - s.totalSaidas;
    return s;
  }, [filteredTransactions]);

  const handleNavigate = (tab: string) => {
    const route = TAB_ROUTE_MAP[tab];
    if (route) navigate(route);
  };

  const handleSubmit = async (data: any) => {
    if (editingTransaction) {
      await updateTransaction.mutateAsync({ ...data, id: editingTransaction.id });
    } else {
      await createTransaction.mutateAsync(data);
    }
    setEditingTransaction(null);
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

  const PAGE_META: Record<string, { title: string; description: string }> = {
    'visao-geral': { title: 'Visão Geral', description: 'Resumo financeiro da sua empresa' },
    'historico': { title: 'Movimentações', description: 'Histórico completo de receitas e despesas' },
    'contas': { title: 'Contas a Pagar / Receber', description: 'Gerencie vencimentos e cobranças' },
    'bancos': { title: 'Caixas e Bancos', description: 'Gerencie suas contas bancárias e saldos' },
    'categorias': { title: 'Categorias', description: 'Organize suas receitas e despesas por categoria' },
    'dre': { title: 'DRE — Demonstrativo de Resultado', description: 'Análise de resultado do exercício' },
  };

  const meta = PAGE_META[activeTab] || PAGE_META['visao-geral'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{meta.title}</h1>
        <p className="text-muted-foreground">{meta.description}</p>
      </div>

      <DateRangeFilter
        value={range}
        preset={preset}
        onPresetChange={setPreset}
        onRangeChange={setRange}
      />

      <div className="flex-1 min-w-0">
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
            onMarkAsPaid={(id) => markAsPaid.mutateAsync(id)}
          />
        )}

        {activeTab === 'contas' && (
          <FinanceContas
            transactions={filteredTransactions}
            isLoading={isLoading}
            onMarkAsPaid={(id) => markAsPaid.mutateAsync(id)}
          />
        )}

        {activeTab === 'bancos' && <FinanceBanks />}

        {activeTab === 'categorias' && <FinanceCategorias />}

        {activeTab === 'dre' && <FinanceDRE transactions={filteredTransactions} />}
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

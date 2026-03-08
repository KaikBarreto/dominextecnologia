import { useState, useMemo } from 'react';
import {
  LayoutDashboard, TrendingUp, TrendingDown, Tag, FileBarChart, History, CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFinancial } from '@/hooks/useFinancial';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { FinanceOverview } from '@/components/financial/FinanceOverview';
import { TransactionListPanel } from '@/components/financial/TransactionListPanel';
import { FinanceCategorias } from '@/components/financial/FinanceCategorias';
import { FinanceDRE } from '@/components/financial/FinanceDRE';
import { FinanceContas } from '@/components/financial/FinanceContas';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import type { FinancialTransaction, TransactionType } from '@/types/database';

const tabs = [
  { key: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
  { key: 'receitas', label: 'Receitas', icon: TrendingUp },
  { key: 'despesas', label: 'Despesas', icon: TrendingDown },
  { key: 'historico', label: 'Histórico', icon: History },
  { key: 'contas', label: 'Contas', icon: CalendarClock },
  { key: 'categorias', label: 'Categorias', icon: Tag },
  { key: 'dre', label: 'DRE - Resultado', icon: FileBarChart },
];

export default function Finance() {
  const [activeTab, setActiveTab] = useState('visao-geral');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [defaultType, setDefaultType] = useState<TransactionType>('entrada');
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  const {
    transactions, isLoading,
    createTransaction, updateTransaction, deleteTransaction, markAsPaid,
  } = useFinancial();

  const filteredTransactions = filterByDate(transactions, 'transaction_date');

  // Compute summary from filtered transactions
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

  const filteredTransactions = filterByDate(transactions, 'transaction_date');

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-muted-foreground">Controle completo de receitas, despesas e resultados</p>
      </div>

      <DateRangeFilter
        value={range}
        preset={preset}
        onPresetChange={setPreset}
        onRangeChange={setRange}
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-52 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {tabs.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 text-left whitespace-nowrap lg:whitespace-normal w-full',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === 'visao-geral' && (
            <FinanceOverview
              transactions={filteredTransactions}
              summary={summary}
              onNavigate={setActiveTab}
              onNewReceita={() => handleNew('entrada')}
              onNewDespesa={() => handleNew('saida')}
            />
          )}

          {activeTab === 'receitas' && (
            <TransactionListPanel
              title="Receitas"
              type="entrada"
              transactions={filteredTransactions}
              isLoading={isLoading}
              onNew={() => handleNew('entrada')}
              onEdit={handleEdit}
              onDelete={(id) => deleteTransaction.mutateAsync(id)}
              onMarkAsPaid={(id) => markAsPaid.mutateAsync(id)}
              buttonColor="bg-success hover:bg-success/90 text-white"
            />
          )}

          {activeTab === 'despesas' && (
            <TransactionListPanel
              title="Despesas"
              type="saida"
              transactions={filteredTransactions}
              isLoading={isLoading}
              onNew={() => handleNew('saida')}
              onEdit={handleEdit}
              onDelete={(id) => deleteTransaction.mutateAsync(id)}
              onMarkAsPaid={(id) => markAsPaid.mutateAsync(id)}
              buttonColor="bg-destructive hover:bg-destructive/90 text-white"
            />
          )}

          {activeTab === 'historico' && (
            <TransactionListPanel
              title="Histórico"
              type="all"
              transactions={filteredTransactions}
              isLoading={isLoading}
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

          {activeTab === 'categorias' && <FinanceCategorias />}

          {activeTab === 'dre' && <FinanceDRE transactions={filteredTransactions} />}
        </div>
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

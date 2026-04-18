import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, TrendingUp, TrendingDown, History, LayoutDashboard, BarChart3, FileText, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminFinancialMovementModal } from '@/components/admin/AdminFinancialMovementModal';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { FinancialSummaryCards } from '@/components/admin/financial/FinancialSummaryCards';
import { FinancialCharts } from '@/components/admin/financial/FinancialCharts';
import { FinancialMovementSection } from '@/components/admin/financial/FinancialMovementSection';
import { FinancialDRESection } from '@/components/admin/financial/FinancialDRESection';
import { FinancialSettingsSection } from '@/components/admin/financial/FinancialSettingsSection';
import { useAdminFinancialCategories } from '@/hooks/useAdminFinancialCategories';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { cn } from '@/lib/utils';

export default function AdminFinancial() {
  const { hasFunctionAccess } = useAdminPermissions();
  const canSeeTotals = hasFunctionAccess('admin_financeiro_totais');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<'income' | 'expense'>('income');
  const [activeSection, setActiveSection] = useState('overview');

  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  const tabs: SettingsTab[] = [
    ...(canSeeTotals ? [{ value: 'overview', label: 'Visão Geral', icon: LayoutDashboard, group: 'Análise' }] : []),
    { value: 'income', label: 'Receitas', icon: TrendingUp, group: 'Movimentações' },
    { value: 'expenses', label: 'Despesas', icon: TrendingDown, group: 'Movimentações' },
    { value: 'history', label: 'Histórico', icon: History, group: 'Movimentações' },
    ...(canSeeTotals ? [
      { value: 'charts', label: 'Gráficos', icon: BarChart3, group: 'Análise' },
      { value: 'dre', label: 'Resultado (DRE)', icon: FileText, group: 'Análise' },
    ] : []),
    { value: 'settings', label: 'Configurações', icon: Settings2, group: 'Sistema' },
  ];

  const { data: allTransactions = [] } = useQuery({
    queryKey: ['admin-financial-transactions-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_financial_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useAdminFinancialCategories();

  const transactions = useMemo(() => filterByDate(allTransactions as any[], 'transaction_date'), [allTransactions, filterByDate]);

  const income = transactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const expenses = transactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);

  const periodLabel = useMemo(() => {
    if (!range.from && !range.to) return 'Todos os tempos';
    const f = range.from ? format(range.from, 'dd/MM/yyyy') : '...';
    const t = range.to ? format(range.to, 'dd/MM/yyyy') : '...';
    return `${f} → ${t}`;
  }, [range]);

  const openModal = (type: 'income' | 'expense') => { setModalDefaultType(type); setIsModalOpen(true); };

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-4 lg:space-y-6">
            <FinancialSummaryCards
              income={income} expenses={expenses} transactionsCount={transactions.length}
              onOpenIncome={() => setActiveSection('income')}
              onOpenExpense={() => setActiveSection('expenses')}
              onCreateIncome={() => openModal('income')}
              onCreateExpense={() => openModal('expense')}
            />
            <FinancialCharts transactions={transactions} categories={categories} />
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-muted/30 py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />Últimas Movimentações
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveSection('history')} className="text-primary text-xs">Ver todas</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0"><TransactionsTable transactions={transactions.slice(0, 10)} categories={categories} /></CardContent>
            </Card>
          </div>
        );
      case 'income':
        return <FinancialMovementSection transactions={transactions} categories={categories} type="income" onCreate={() => openModal('income')} />;
      case 'expenses':
        return <FinancialMovementSection transactions={transactions} categories={categories} type="expense" onCreate={() => openModal('expense')} />;
      case 'history':
        return (
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-muted/30 py-3">
              <CardTitle className="text-base font-semibold">Histórico</CardTitle>
            </CardHeader>
            <CardContent className="p-0"><TransactionsTable transactions={transactions} categories={categories} /></CardContent>
          </Card>
        );
      case 'charts':
        return <FinancialCharts transactions={transactions} categories={categories} />;
      case 'dre':
        return <FinancialDRESection transactions={transactions} categories={categories} periodLabel={periodLabel} />;
      case 'settings':
        return <FinancialSettingsSection />;
      default: return null;
    }
  };

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10"><Wallet className="h-5 w-5 text-primary" /></div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">Financeiro</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Controle financeiro do SaaS</p>
            </div>
          </div>
        </div>
        <DateRangeFilter value={range} preset={preset} onPresetChange={setPreset} onRangeChange={setRange} />
      </div>

      <SettingsSidebarLayout tabs={tabs} activeTab={activeSection} onTabChange={setActiveSection}>
        {renderContent()}
      </SettingsSidebarLayout>

      <AdminFinancialMovementModal open={isModalOpen} onOpenChange={setIsModalOpen} defaultType={modalDefaultType} />
    </div>
  );
}

function TransactionsTable({ transactions, categories }: { transactions: any[]; categories: any[] }) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const labelFor = (n: string) => categories.find((c) => c.name === n)?.label ?? n;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t: any) => (
            <TableRow key={t.id}>
              <TableCell className="text-sm">{format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
              <TableCell>
                <Badge className={t.type === 'income' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/30' : 'bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/30'}>
                  {t.type === 'income' ? 'Receita' : 'Despesa'}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{labelFor(t.category) || '-'}</TableCell>
              <TableCell className="text-sm max-w-[200px] truncate">{t.description || '-'}</TableCell>
              <TableCell className={cn('text-right font-medium', t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {t.type === 'income' ? '+' : '-'}{fmt(Number(t.amount))}
              </TableCell>
            </TableRow>
          ))}
          {transactions.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma transação</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

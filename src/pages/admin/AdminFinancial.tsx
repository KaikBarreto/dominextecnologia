import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Wallet, TrendingUp, TrendingDown, History, LayoutDashboard } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { startOfMonth, subDays, startOfYear } from 'date-fns';
import { AdminFinancialMovementModal } from '@/components/admin/AdminFinancialMovementModal';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { cn } from '@/lib/utils';

const financialTabs: SettingsTab[] = [
  { value: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { value: 'income', label: 'Receitas', icon: TrendingUp },
  { value: 'expenses', label: 'Despesas', icon: TrendingDown },
  { value: 'history', label: 'Histórico', icon: History },
];

export default function AdminFinancial() {
  const queryClient = useQueryClient();
  const [dateFilter, setDateFilter] = useState('thisMonth');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<'income' | 'expense'>('income');
  const [activeSection, setActiveSection] = useState('overview');

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateFilter) {
      case '7days': return { startDate: subDays(now, 7), endDate: now };
      case 'thisMonth': return { startDate: startOfMonth(now), endDate: now };
      case 'thisYear': return { startDate: startOfYear(now), endDate: now };
      default: return { startDate: startOfMonth(now), endDate: now };
    }
  }, [dateFilter]);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['admin-financial-transactions', dateFilter],
    queryFn: async () => {
      const endOfDay = new Date(endDate); endOfDay.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('admin_financial_transactions')
        .select('*')
        .gte('transaction_date', startDate.toISOString())
        .lte('transaction_date', endOfDay.toISOString())
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const income = transactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const expenses = transactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const netResult = income - expenses;

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const openModal = (type: 'income' | 'expense') => {
    setModalDefaultType(type);
    setIsModalOpen(true);
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-4 lg:space-y-6">
            {/* Summary Card */}
            <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-card to-muted/20">
              <CardContent className="p-6 md:p-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-border/50">
                  <div className="text-center space-y-1 p-4 rounded-xl bg-muted/40 border border-border/50">
                    <div className="flex items-center justify-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Saldo do Período</span>
                    </div>
                    <p className={cn('text-2xl md:text-3xl font-bold tracking-tight', netResult >= 0 ? 'text-foreground' : 'text-destructive')}>
                      {formatCurrency(netResult)}
                    </p>
                  </div>
                  <div className="text-center space-y-1 p-4 rounded-xl bg-muted/40 border border-border/50">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Transações</span>
                    <p className="text-2xl md:text-3xl font-bold tracking-tight">{transactions.length}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6">
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setActiveSection('income')}
                      className="w-full flex flex-col sm:flex-row items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer group"
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500 ring-4 ring-emerald-600/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <TrendingUp className="h-6 w-6 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Receitas</p>
                        <p className="text-lg md:text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(income)}</p>
                      </div>
                    </button>
                    <Button size="sm" className="w-full gap-2 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => openModal('income')}>
                      <Plus className="h-4 w-4" />Nova Receita
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setActiveSection('expenses')}
                      className="w-full flex flex-col sm:flex-row items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer group"
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500 ring-4 ring-red-600/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <TrendingDown className="h-6 w-6 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Despesas</p>
                        <p className="text-lg md:text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(expenses)}</p>
                      </div>
                    </button>
                    <Button size="sm" className="w-full gap-2 bg-red-500 hover:bg-red-600 text-white" onClick={() => openModal('expense')}>
                      <Plus className="h-4 w-4" />Nova Despesa
                    </Button>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-xl bg-muted/50 border border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Resultado do período</span>
                    <span className={cn('text-lg font-bold', netResult >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {netResult >= 0 ? '+' : ''}{formatCurrency(netResult)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-muted/30 py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />Últimas Movimentações
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveSection('history')} className="text-primary text-xs">Ver todas</Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <TransactionsTable transactions={transactions.slice(0, 10)} />
              </CardContent>
            </Card>
          </div>
        );

      case 'income':
        return (
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-muted/30 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Receitas</CardTitle>
                <Button size="sm" onClick={() => openModal('income')} className="gap-2"><Plus className="h-4 w-4" />Nova Receita</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TransactionsTable transactions={transactions.filter((t: any) => t.type === 'income')} />
            </CardContent>
          </Card>
        );

      case 'expenses':
        return (
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-muted/30 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Despesas</CardTitle>
                <Button size="sm" onClick={() => openModal('expense')} className="gap-2"><Plus className="h-4 w-4" />Nova Despesa</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TransactionsTable transactions={transactions.filter((t: any) => t.type === 'expense')} />
            </CardContent>
          </Card>
        );

      case 'history':
        return (
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-muted/30 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Histórico</CardTitle>
                <Button size="sm" onClick={() => setIsModalOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Nova Mov.</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TransactionsTable transactions={transactions} />
            </CardContent>
          </Card>
        );

      default: return null;
    }
  };

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold">Financeiro</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Controle financeiro do SaaS</p>
            </div>
          </div>
        </div>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Últimos 7 dias</SelectItem>
            <SelectItem value="thisMonth">Este mês</SelectItem>
            <SelectItem value="thisYear">Este ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SettingsSidebarLayout tabs={financialTabs} activeTab={activeSection} onTabChange={setActiveSection}>
        {renderContent()}
      </SettingsSidebarLayout>

      <AdminFinancialMovementModal open={isModalOpen} onOpenChange={setIsModalOpen} defaultType={modalDefaultType} />
    </div>
  );
}

function TransactionsTable({ transactions }: { transactions: any[] }) {
  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
              <TableCell className="text-sm">{t.category || '-'}</TableCell>
              <TableCell className="text-sm max-w-[200px] truncate">{t.description || '-'}</TableCell>
              <TableCell className={cn('text-right font-medium', t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {t.type === 'income' ? '+' : '-'}{formatCurrency(Number(t.amount))}
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

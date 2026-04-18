import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminDashboardStats } from '@/components/admin/AdminDashboardStats';
import { AdminDashboardCharts } from '@/components/admin/AdminDashboardCharts';
import { AdminTopClientsLTV } from '@/components/admin/AdminTopClientsLTV';
import { AdminClientsByPlanChart } from '@/components/admin/AdminClientsByPlanChart';
import { AdminBrazilMapChart } from '@/components/admin/AdminBrazilMapChart';
import { AdminSegmentDistributionChart } from '@/components/admin/AdminSegmentDistributionChart';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'Admin';

  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');
  const startDate = range.from ?? new Date(0);
  const endDate = range.to ?? new Date();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_payments').select('*').order('payment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['admin-financial-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('admin_financial_transactions').select('*').order('transaction_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const income = useMemo(() => {
    return filterByDate(transactions as any[], 'transaction_date')
      .filter((t: any) => t.type === 'income')
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
  }, [transactions, filterByDate]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">Olá, {firstName}!</h1>
          <p className="text-sm text-muted-foreground">Visão geral do sistema</p>
        </div>

        <DateRangeFilter value={range} preset={preset} onPresetChange={setPreset} onRangeChange={setRange} />
      </div>

      {/* 1. Stats */}
      <AdminDashboardStats companies={companies} payments={payments} income={income} />

      {/* 2. Pies (Origem + Forma de Pagamento) */}
      <AdminDashboardCharts companies={companies} transactions={transactions} startDate={startDate} endDate={endDate} sections={['pies']} />

      {/* 3. Funil de Retenção */}
      <AdminDashboardCharts companies={companies} transactions={transactions} startDate={startDate} endDate={endDate} sections={['funnel']} />

      {/* 4. Mapa do Brasil */}
      <AdminBrazilMapChart companies={companies} />

      {/* 5. Top 3 LTV + Clientes por Plano */}
      <AdminTopClientsLTV companies={companies} />
      <AdminClientsByPlanChart companies={companies} />

      {/* 6. Evolução da Receita */}
      <AdminDashboardCharts companies={companies} transactions={transactions} startDate={startDate} endDate={endDate} sections={['revenue']} />

      {/* 7. Taxa de Churn */}
      <AdminDashboardCharts companies={companies} transactions={transactions} startDate={startDate} endDate={endDate} sections={['churn']} />

      {/* 8. Clientes por Segmento */}
      <AdminSegmentDistributionChart companies={companies} />
    </div>
  );
}

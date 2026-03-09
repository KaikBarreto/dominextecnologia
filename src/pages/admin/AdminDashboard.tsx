import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminDashboardStats } from '@/components/admin/AdminDashboardStats';
import { AdminDashboardCharts } from '@/components/admin/AdminDashboardCharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { startOfMonth, subDays, startOfYear } from 'date-fns';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'Admin';
  const [dateRange, setDateRange] = useState('thisMonth');

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case '7days': return { startDate: subDays(now, 7), endDate: now };
      case 'thisMonth': return { startDate: startOfMonth(now), endDate: now };
      case 'thisYear': return { startDate: startOfYear(now), endDate: now };
      default: return { startDate: startOfMonth(now), endDate: now };
    }
  }, [dateRange]);

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
    return (transactions || [])
      .filter((t: any) => {
        if (t.type !== 'income') return false;
        const d = new Date(t.transaction_date);
        return d >= startDate && d <= endDate;
      })
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
  }, [transactions, startDate, endDate]);

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

        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Últimos 7 dias</SelectItem>
            <SelectItem value="thisMonth">Este mês</SelectItem>
            <SelectItem value="thisYear">Este ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AdminDashboardStats companies={companies} payments={payments} income={income} />
      <AdminDashboardCharts companies={companies} transactions={transactions} startDate={startDate} endDate={endDate} />
    </div>
  );
}

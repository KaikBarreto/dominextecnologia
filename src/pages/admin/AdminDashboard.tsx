import { endOfDay, startOfDay } from 'date-fns';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminDashboardData } from '@/hooks/useAdminDashboardData';
import { AdminDashboardStats } from '@/components/admin/AdminDashboardStats';
import { AdminDashboardCharts } from '@/components/admin/AdminDashboardCharts';
import { AdminTopClientsLTV } from '@/components/admin/AdminTopClientsLTV';
import { AdminClientsByPlanChart } from '@/components/admin/AdminClientsByPlanChart';
import { AdminBrazilMapChart } from '@/components/admin/AdminBrazilMapChart';
import { AdminSegmentDistributionChart } from '@/components/admin/AdminSegmentDistributionChart';
import { AdminCrmLeadsFunnelChart } from '@/components/admin/AdminCrmLeadsFunnelChart';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { Button } from '@/components/ui/button';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'Admin';

  const { preset, range, setPreset, setRange } = useDateRangeFilter('this_month');
  const startDate = range.from ? startOfDay(range.from) : new Date(0);
  const endDate = range.to ? endOfDay(range.to) : new Date();
  const {
    companies,
    payments,
    transactions,
    companyOrigins,
    isLoading,
    isError,
    refetch,
  } = useAdminDashboardData();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <h1 className="font-semibold">Não foi possível carregar o dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Verifique sua conexão e tente novamente.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">Olá, {firstName}!</h1>
          <p className="text-sm text-muted-foreground">Visão geral do sistema Dominex</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangeFilter value={range} preset={preset} onPresetChange={setPreset} onRangeChange={setRange} />
        </div>
      </div>

      {/* 1. Stats */}
      <AdminDashboardStats
        companies={companies}
        transactions={transactions}
        startDate={startDate}
        endDate={endDate}
      />

      {/* 2. Pies (Origem + Forma de Pagamento) */}
      <AdminDashboardCharts
        companies={companies}
        transactions={transactions}
        companyOrigins={companyOrigins}
        allCompanyPayments={payments}
        startDate={startDate}
        endDate={endDate}
        sections={['pies']}
      />

      {/* 3. Funil de Leads por Origem (CRM) */}
      <AdminCrmLeadsFunnelChart startDate={startDate} endDate={endDate} />

      {/* 4. Funil de Retenção */}
      <AdminDashboardCharts
        companies={companies}
        transactions={transactions}
        companyOrigins={companyOrigins}
        allCompanyPayments={payments}
        startDate={startDate}
        endDate={endDate}
        sections={['funnel']}
      />

      {/* 5. Mapa do Brasil */}
      <AdminBrazilMapChart companies={companies} />

      {/* 6. Top 3 LTV + Clientes por Plano */}
      <AdminTopClientsLTV companies={companies} payments={payments} />
      <AdminClientsByPlanChart companies={companies} />

      {/* 7. Evolução da Receita */}
      <AdminDashboardCharts
        companies={companies}
        transactions={transactions}
        companyOrigins={companyOrigins}
        allCompanyPayments={payments}
        startDate={startDate}
        endDate={endDate}
        sections={['revenue']}
      />

      {/* 8. Taxa de Churn */}
      <AdminDashboardCharts
        companies={companies}
        transactions={transactions}
        companyOrigins={companyOrigins}
        allCompanyPayments={payments}
        startDate={startDate}
        endDate={endDate}
        sections={['churn']}
      />

      {/* 9. Clientes por Segmento — exclusivo Dominex */}
      <AdminSegmentDistributionChart companies={companies} />
    </div>
  );
}

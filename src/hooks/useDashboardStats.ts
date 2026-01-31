import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      // Fetch OS counts by status
      const { data: osData, error: osError } = await supabase
        .from('service_orders')
        .select('status');
      
      if (osError) throw osError;

      const osByStatus = {
        pendente: 0,
        em_andamento: 0,
        concluida: 0,
        cancelada: 0,
      };

      osData?.forEach((os) => {
        osByStatus[os.status as keyof typeof osByStatus]++;
      });

      // Fetch customer count
      const { count: customerCount, error: customerError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });
      
      if (customerError) throw customerError;

      // Fetch financial summary for current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: financialData, error: financialError } = await supabase
        .from('financial_transactions')
        .select('transaction_type, amount')
        .gte('transaction_date', startOfMonth.toISOString().split('T')[0]);
      
      if (financialError) throw financialError;

      let faturamentoMes = 0;
      let despesasMes = 0;

      financialData?.forEach((t) => {
        if (t.transaction_type === 'entrada') {
          faturamentoMes += Number(t.amount);
        } else {
          despesasMes += Number(t.amount);
        }
      });

      // Fetch recent OS
      const { data: recentOS, error: recentOSError } = await supabase
        .from('service_orders')
        .select(`
          id,
          order_number,
          status,
          os_type,
          scheduled_date,
          customer:customers(name)
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (recentOSError) throw recentOSError;

      // Calculate completion rate
      const totalOS = osByStatus.pendente + osByStatus.em_andamento + osByStatus.concluida;
      const taxaConclusao = totalOS > 0 ? Math.round((osByStatus.concluida / totalOS) * 100) : 0;

      // Monthly data for chart
      const { data: monthlyData, error: monthlyError } = await supabase
        .from('financial_transactions')
        .select('transaction_type, amount, transaction_date')
        .order('transaction_date');

      if (monthlyError) throw monthlyError;

      // Group by month
      const monthlyChart: { month: string; entradas: number; saidas: number }[] = [];
      const monthMap = new Map<string, { entradas: number; saidas: number }>();

      monthlyData?.forEach((t) => {
        const date = new Date(t.transaction_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, { entradas: 0, saidas: 0 });
        }
        
        const current = monthMap.get(monthKey)!;
        if (t.transaction_type === 'entrada') {
          current.entradas += Number(t.amount);
        } else {
          current.saidas += Number(t.amount);
        }
      });

      // Convert to array and get last 6 months
      const sortedMonths = Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6);

      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      
      sortedMonths.forEach(([key, values]) => {
        const [, month] = key.split('-');
        monthlyChart.push({
          month: monthNames[parseInt(month) - 1],
          entradas: values.entradas,
          saidas: values.saidas,
        });
      });

      // OS by type for pie chart
      const { data: osTypeData, error: osTypeError } = await supabase
        .from('service_orders')
        .select('os_type');

      if (osTypeError) throw osTypeError;

      const osByType = {
        manutencao_preventiva: 0,
        manutencao_corretiva: 0,
        instalacao: 0,
        visita_tecnica: 0,
      };

      osTypeData?.forEach((os) => {
        osByType[os.os_type as keyof typeof osByType]++;
      });

      return {
        osAbertas: osByStatus.pendente + osByStatus.em_andamento,
        osPendentes: osByStatus.pendente,
        osEmAndamento: osByStatus.em_andamento,
        osConcluidas: osByStatus.concluida,
        clientesAtivos: customerCount ?? 0,
        faturamentoMes,
        despesasMes,
        taxaConclusao,
        recentOS: recentOS ?? [],
        monthlyChart,
        osByType,
        osByStatus,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

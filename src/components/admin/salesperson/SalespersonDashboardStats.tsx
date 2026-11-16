import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, DollarSign, TrendingUp, Target } from 'lucide-react';
import type { Salesperson, SalespersonSale, SalespersonAdvance } from '@/hooks/useSalespersonData';
import { adminKpiClass } from '@/components/admin/adminKpiStyles';

interface Props {
  salespeople: Salesperson[];
  sales: SalespersonSale[];
  advances: SalespersonAdvance[];
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function SalespersonDashboardStats({ salespeople, sales, advances }: Props) {
  const active = salespeople.filter((s) => s.is_active !== false);
  const activeCommercial = active.filter((s) => s.can_receive_sales !== false);
  const totalSales = sales.length;
  const totalCommission = sales.reduce((sum, s) => sum + (s.commission_amount || 0), 0);
  const avgPerSeller = activeCommercial.length > 0 ? totalSales / activeCommercial.length : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className={adminKpiClass('violet')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total de Vendas</CardTitle>
          <TrendingUp className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalSales}</div>
          <p className="text-xs text-white/75">vendas no período</p>
        </CardContent>
      </Card>
      <Card className={adminKpiClass('amber')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Comissão Total</CardTitle>
          <DollarSign className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(totalCommission)}</div>
          <p className="text-xs text-white/75">em comissões</p>
        </CardContent>
      </Card>
      <Card className={adminKpiClass('blue')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pessoas ativas</CardTitle>
          <Users className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{active.length}</div>
          <p className="text-xs text-white/75">de {salespeople.length} cadastrados</p>
        </CardContent>
      </Card>
      <Card className={adminKpiClass('cyan')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Média comercial</CardTitle>
          <Target className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgPerSeller.toFixed(1)}</div>
          <p className="text-xs text-white/75">vendas por pessoa comercial</p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Target, DollarSign, Wallet } from 'lucide-react';
import { type Salesperson, type SalespersonSale, type SalespersonAdvance, commissionForPerson } from '@/hooks/useSalespersonData';
import { adminKpiClass } from '@/components/admin/adminKpiStyles';

interface Props {
  salesperson: Salesperson;
  sales: SalespersonSale[];
  advances: SalespersonAdvance[];
  totalSalesCount?: number;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function SalespersonDetailStats({ salesperson, sales, advances, totalSalesCount }: Props) {
  const periodSalesCount = sales.length;
  const goal = salesperson.monthly_goal || 30;
  const goalPercent = Math.min((periodSalesCount / goal) * 100, 100);
  // Comissão do vendedor-dono em cada venda (parcela de closer OU de SDR).
  const totalCommission = sales.reduce((s, x) => s + commissionForPerson(x, salesperson.id), 0);
  const totalAdvances = advances.reduce((s, x) => s + (x.amount || 0), 0);
  const balance = (Number(salesperson.salary) || 0) + totalCommission - totalAdvances;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className={adminKpiClass('violet')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vendas no Período</CardTitle>
          <TrendingUp className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{periodSalesCount}</div>
          <p className="text-xs text-white/75">
            {totalSalesCount !== undefined && totalSalesCount !== periodSalesCount
              ? `de ${totalSalesCount} total`
              : `de ${goal} meta`}
          </p>
        </CardContent>
      </Card>

      <Card className={adminKpiClass('cyan')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Meta do Mês</CardTitle>
          <Target className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{goalPercent.toFixed(0)}%</div>
          <Progress value={goalPercent} className="mt-2 h-2 bg-white/25 [&>div]:bg-white" />
        </CardContent>
      </Card>

      <Card className={adminKpiClass('amber')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Comissão no Período</CardTitle>
          <DollarSign className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(totalCommission)}</div>
          <p className="text-xs text-white/75">filtrado pelo período</p>
        </CardContent>
      </Card>

      <Card className={adminKpiClass(balance >= 0 ? 'emerald' : 'rose')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Saldo a Receber</CardTitle>
          <Wallet className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{fmt(balance)}</div>
          <p className="text-xs text-white/75">salário + comissão − vales</p>
        </CardContent>
      </Card>
    </div>
  );
}

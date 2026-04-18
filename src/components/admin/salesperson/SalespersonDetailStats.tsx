import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Target, DollarSign, Wallet } from 'lucide-react';
import type { Salesperson, SalespersonSale, SalespersonAdvance } from '@/hooks/useSalespersonData';

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
  const totalCommission = sales.reduce((s, x) => s + (x.commission_amount || 0), 0);
  const totalAdvances = advances.reduce((s, x) => s + (x.amount || 0), 0);
  const balance = (Number(salesperson.salary) || 0) + totalCommission - totalAdvances;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Vendas no Período</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{periodSalesCount}</div>
          <p className="text-xs text-muted-foreground">
            {totalSalesCount !== undefined && totalSalesCount !== periodSalesCount
              ? `de ${totalSalesCount} total`
              : `de ${goal} meta`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Meta do Mês</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{goalPercent.toFixed(0)}%</div>
          <Progress value={goalPercent} className="h-2 mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Comissão no Período</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">{fmt(totalCommission)}</div>
          <p className="text-xs text-muted-foreground">filtrado pelo período</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Saldo a Receber</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{fmt(balance)}</div>
          <p className="text-xs text-muted-foreground">salário + comissão − vales</p>
        </CardContent>
      </Card>
    </div>
  );
}

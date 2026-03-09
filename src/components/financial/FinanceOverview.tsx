import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Wallet, Plus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { FinancialTransaction } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface FinanceOverviewProps {
  transactions: (FinancialTransaction & { customer?: any })[];
  summary: {
    totalEntradas: number;
    totalSaidas: number;
    saldo: number;
    aPagar: number;
    aReceber: number;
  };
  onNavigate: (tab: string) => void;
  onNewReceita: () => void;
  onNewDespesa: () => void;
}

const CHART_COLORS = [
  'hsl(210, 79%, 42%)', 'hsl(145, 65%, 42%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)', 'hsl(200, 85%, 45%)', 'hsl(280, 60%, 50%)',
  'hsl(160, 60%, 45%)', 'hsl(30, 80%, 55%)',
];

export function FinanceOverview({ transactions, summary, onNavigate, onNewReceita, onNewDespesa }: FinanceOverviewProps) {
  // Category breakdown for chart
  const categoryMap = new Map<string, number>();
  transactions.forEach((t) => {
    const cat = t.category || 'Sem categoria';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(t.amount));
  });
  const chartData = Array.from(categoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const recentTransactions = transactions.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Summary Cards - 3 columns */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card className={`border-0 ${summary.saldo >= 0 ? 'bg-info' : 'bg-destructive'}`}>
          <CardContent className="p-3 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-white/80 uppercase tracking-wider">Saldo</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white truncate">
                  {formatCurrency(summary.saldo)}
                </p>
              </div>
              <div className="rounded-full bg-white/20 p-2 sm:p-3 shrink-0">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-success border-0">
          <CardContent className="p-3 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-white/80 uppercase tracking-wider">Receitas</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white truncate">{formatCurrency(summary.totalEntradas)}</p>
              </div>
              <div className="rounded-full bg-white/20 p-2 sm:p-3 shrink-0">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-destructive border-0">
          <CardContent className="p-3 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-white/80 uppercase tracking-wider">Despesas</p>
                <p className="text-lg sm:text-2xl font-bold mt-1 text-white truncate">{formatCurrency(summary.totalSaidas)}</p>
              </div>
              <div className="rounded-full bg-white/20 p-2 sm:p-3 shrink-0">
                <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button size="sm" className="bg-success hover:bg-success/90 text-white gap-2" onClick={onNewReceita}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova</span> Receita
        </Button>
        <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-white gap-2" onClick={onNewDespesa}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova</span> Despesa
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              Distribuição por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum dado disponível</p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center">
                  {chartData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              Últimas Movimentações
            </CardTitle>
            <button
              onClick={() => onNavigate('receitas')}
              className="text-xs text-primary hover:underline font-medium"
            >
              Ver todas →
            </button>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma movimentação</p>
            ) : (
              <div className="space-y-3">
                {recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-1.5 ${t.transaction_type === 'entrada' ? 'bg-success' : 'bg-destructive'}`}>
                        {t.transaction_type === 'entrada' ? (
                          <TrendingUp className="h-3.5 w-3.5 text-white" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}
                          {t.category && ` • ${t.category}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                        {t.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(t.amount)}
                      </p>
                      <Badge variant={t.is_paid ? 'default' : 'secondary'} className="text-[10px]">
                        {t.is_paid ? 'Pago' : 'Pendente'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

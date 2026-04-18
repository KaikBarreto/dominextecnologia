import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { AdminFinancialCategory } from '@/hooks/useAdminFinancialCategories';

interface Props {
  transactions: any[];
  categories: AdminFinancialCategory[];
}

export function FinancialCharts({ transactions, categories }: Props) {
  const [type, setType] = useState<'income' | 'expense'>('income');

  const data = useMemo(() => {
    const filtered = transactions.filter((t) => t.type === type);
    const map = new Map<string, number>();
    for (const t of filtered) {
      const key = t.category || 'other';
      map.set(key, (map.get(key) ?? 0) + Number(t.amount));
    }
    return Array.from(map.entries()).map(([name, value]) => {
      const cat = categories.find((c) => c.name === name);
      return { name: cat?.label ?? name, value, color: cat?.color ?? 'hsl(var(--muted-foreground))' };
    }).sort((a, b) => b.value - a.value);
  }, [transactions, type, categories]);

  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-muted/30 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold">Distribuição por categoria</CardTitle>
          <Tabs value={type} onValueChange={(v) => setType(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="income" className="text-xs h-6">Receitas</TabsTrigger>
              <TabsTrigger value="expense" className="text-xs h-6">Despesas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">Sem dados no período</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-auto">
              {data.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="truncate">{d.name}</span>
                  </div>
                  <div className="flex gap-3 flex-shrink-0">
                    <span className="font-medium">{fmt(d.value)}</span>
                    <span className="text-muted-foreground text-xs w-10 text-right">{((d.value / total) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

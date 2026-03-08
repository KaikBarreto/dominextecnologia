import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { FinancialTransaction } from '@/types/database';
import { format, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// DRE classification by category name
function classifyCategory(category: string | null): 'impostos' | 'cpv' | 'opex' | 'receita' {
  const lower = (category || '').toLowerCase();
  if (/imposto|taxa|tributo|icms|iss|pis|cofins/.test(lower)) return 'impostos';
  if (/custo|material|peça|peca|fornecedor|insumo/.test(lower)) return 'cpv';
  return 'opex';
}

interface FinanceDREProps {
  transactions: (FinancialTransaction & { customer?: any })[];
}

export function FinanceDRE({ transactions }: FinanceDREProps) {
  const dre = useMemo(() => {
    let receitaBruta = 0;
    let impostos = 0;
    let cpv = 0;
    let opex = 0;

    transactions.forEach((t) => {
      const amount = Number(t.amount);
      if (t.transaction_type === 'entrada') {
        receitaBruta += amount;
      } else {
        const cls = classifyCategory(t.category);
        if (cls === 'impostos') impostos += amount;
        else if (cls === 'cpv') cpv += amount;
        else opex += amount;
      }
    });

    const receitaLiquida = receitaBruta - impostos;
    const lucroBruto = receitaLiquida - cpv;
    const resultadoLiquido = lucroBruto - opex;
    const margem = receitaBruta > 0 ? (resultadoLiquido / receitaBruta) * 100 : 0;

    return { receitaBruta, impostos, receitaLiquida, cpv, lucroBruto, opex, resultadoLiquido, margem };
  }, [transactions]);

  // Monthly chart data
  const monthlyData = useMemo(() => {
    const map = new Map<string, { receitas: number; despesas: number }>();
    transactions.forEach((t) => {
      const monthKey = format(startOfMonth(parseISO(t.transaction_date)), 'yyyy-MM');
      const entry = map.get(monthKey) || { receitas: 0, despesas: 0 };
      if (t.transaction_type === 'entrada') entry.receitas += Number(t.amount);
      else entry.despesas += Number(t.amount);
      map.set(monthKey, entry);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        month: format(parseISO(`${key}-01`), 'MMM/yy', { locale: ptBR }),
        ...val,
      }));
  }, [transactions]);

  const dreRows = [
    { label: '(+) RECEITA BRUTA', value: dre.receitaBruta, highlight: false, indent: false },
    { label: '(-) Impostos e Deduções', value: -dre.impostos, highlight: false, indent: true },
    { label: '(=) RECEITA LÍQUIDA', value: dre.receitaLiquida, highlight: true, indent: false },
    { label: '(-) CPV (Custo do Serviço)', value: -dre.cpv, highlight: false, indent: true },
    { label: '(=) LUCRO BRUTO', value: dre.lucroBruto, highlight: true, indent: false },
    { label: '(-) Despesas Operacionais (OPEX)', value: -dre.opex, highlight: false, indent: true },
    { label: '(=) RESULTADO LÍQUIDO (EBITDA)', value: dre.resultadoLiquido, highlight: true, indent: false, final: true },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={`${dre.margem >= 0 ? 'bg-success' : 'bg-destructive'} border-0`}>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-white/80 uppercase tracking-wider">Margem de Lucro</p>
            <p className="text-3xl font-bold mt-1 text-white">
              {dre.margem.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Receita Líquida</p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(dre.receitaLiquida)}</p>
          </CardContent>
        </Card>
        <Card className={`${dre.resultadoLiquido >= 0 ? 'bg-success' : 'bg-destructive'} border-0`}>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-white/80 uppercase tracking-wider">Resultado (EBITDA)</p>
            <p className="text-3xl font-bold mt-1 text-white">
              {formatCurrency(dre.resultadoLiquido)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {monthlyData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              Evolução Receita × Despesas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area type="monotone" dataKey="receitas" name="Receitas" stroke="hsl(145, 65%, 42%)" fill="hsl(145, 65%, 42%)" fillOpacity={0.15} />
                <Area type="monotone" dataKey="despesas" name="Despesas" stroke="hsl(0, 84%, 60%)" fill="hsl(0, 84%, 60%)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* DRE Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
            Demonstrativo de Resultado (DRE)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {dreRows.map((row) => (
              <div
                key={row.label}
                className={`flex items-center justify-between px-6 py-3 ${
                  row.highlight && !row.final ? 'bg-muted/50 font-bold' : ''
                } ${row.final ? (row.value >= 0 ? 'bg-success text-white' : 'bg-destructive text-white') : ''} ${
                  row.indent ? 'pl-10' : ''
                }`}
              >
                <span className={`text-sm ${row.final ? 'font-bold text-white' : row.highlight ? 'font-bold' : 'text-muted-foreground'}`}>
                  {row.label}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    row.final
                      ? 'text-white'
                      : row.value < 0
                      ? 'text-destructive'
                      : ''
                  }`}
                >
                  {formatCurrency(Math.abs(row.value))}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        * O DRE é calculado automaticamente com base nas categorias das transações. 
        Categorias com "imposto/taxa" são classificadas como deduções, "custo/material/fornecedor" como CPV, e demais como OPEX.
      </p>
    </div>
  );
}

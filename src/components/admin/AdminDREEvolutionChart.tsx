import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, setMonth, setYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';

interface Transaction {
  id: string;
  type: string;
  category: string | null;
  amount: number;
  transaction_date: string;
}

const REVENUE_CATEGORIES = ['sale', 'first_sale', 'renewal', 'partner_contribution', 'other_income', 'upgrade'];
const TAX_CATEGORIES = ['asaas_fee', 'tax', 'impostos'];

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function AdminDREEvolutionChart({ transactions }: { transactions: Transaction[] }) {
  const isMobile = useIsMobile();

  const chartData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startDate = startOfMonth(setMonth(setYear(new Date(), currentYear - 1), 11));
    const endDate = endOfMonth(setMonth(setYear(new Date(), currentYear), 11));
    const months = eachMonthOfInterval({ start: startDate, end: endDate });

    return months.map((date) => {
      const mStart = startOfMonth(date);
      const mEnd = endOfMonth(date);
      const txs = transactions.filter((t) => {
        const d = new Date(t.transaction_date);
        return d >= mStart && d <= mEnd;
      });
      const receitaBruta = txs
        .filter((t) => t.type === 'income' && REVENUE_CATEGORIES.includes(t.category || ''))
        .reduce((s, t) => s + Number(t.amount), 0);
      const impostos = txs
        .filter((t) => t.type === 'expense' && TAX_CATEGORIES.includes(t.category || ''))
        .reduce((s, t) => s + Number(t.amount), 0);
      const receitaLiquida = receitaBruta - impostos;
      const despesas = txs
        .filter((t) => t.type === 'expense' && !TAX_CATEGORIES.includes(t.category || ''))
        .reduce((s, t) => s + Number(t.amount), 0);
      return {
        month: format(date, 'MMM/yy', { locale: ptBR }),
        receita: receitaLiquida,
        despesas,
        resultado: receitaLiquida - despesas,
      };
    });
  }, [transactions]);

  const tickFmt = (v: number) => `${(v / 1000).toFixed(0)}k`;
  const currentYear = new Date().getFullYear();

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <CardTitle className="text-base sm:text-lg font-semibold">
          {isMobile ? `Evolução Dez/${currentYear - 1} - Dez/${currentYear}` : `Evolução - Receita vs Despesas (Dez/${currentYear - 1} a Dez/${currentYear})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className={isMobile ? 'h-64' : 'h-72'}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: isMobile ? 5 : 10, left: isMobile ? -15 : 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dreRec" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                <linearGradient id="dreDes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                <linearGradient id="dreRes" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="month" tick={{ fontSize: isMobile ? 9 : 11 }} interval={isMobile ? 2 : 0} angle={isMobile ? -45 : 0} textAnchor={isMobile ? 'end' : 'middle'} height={isMobile ? 50 : 30} />
              <YAxis tick={{ fontSize: isMobile ? 9 : 11 }} tickFormatter={tickFmt} width={isMobile ? 35 : 45} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Legend wrapperStyle={{ fontSize: isMobile ? '10px' : '12px' }} iconType="circle" iconSize={isMobile ? 8 : 10} />
              <Area type="monotone" dataKey="receita" name="Receita Líquida" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#dreRec)" />
              <Area type="monotone" dataKey="despesas" name="Despesas" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#dreDes)" />
              <Area type="monotone" dataKey="resultado" name="Resultado" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#dreRes)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

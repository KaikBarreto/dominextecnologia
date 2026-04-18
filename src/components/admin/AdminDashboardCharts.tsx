import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  FunnelChart, Funnel, LabelList,
} from 'recharts';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
const FUNNEL_GRADIENTS = [
  { id: 'fg0', color: '#6366F1' },
  { id: 'fg1', color: '#3B82F6' },
  { id: 'fg2', color: '#8B5CF6' },
  { id: 'fg3', color: '#10B981' },
];

interface Props {
  companies: any[];
  transactions: any[];
  startDate: Date;
  endDate: Date;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function AdminDashboardCharts({ companies, transactions, startDate, endDate }: Props) {
  const [revenueView, setRevenueView] = useState<'monthly' | 'weekly'>('monthly');

  const { data: companyOrigins } = useQuery({
    queryKey: ['admin-company-origins-colors'],
    queryFn: async () => {
      const { data } = await supabase.from('company_origins').select('name, color');
      return data || [];
    },
  });

  const { data: allCompanyPayments } = useQuery({
    queryKey: ['admin-company-payments-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_payments')
        .select('company_id, type, payment_method, payment_date')
        .order('payment_date', { ascending: false });
      return data || [];
    },
  });

  const originColorMap: Record<string, string> = {};
  (companyOrigins || []).forEach((o: any) => { originColorMap[(o.name || '').toLowerCase()] = o.color || '#6B7280'; });

  // Origem dos clientes (período)
  const filteredCompanies = companies.filter((c: any) => {
    const d = new Date(c.created_at);
    return d >= startDate && d <= endDate;
  });
  const originData = filteredCompanies.reduce((acc: any[], c: any) => {
    const raw = c.origin || 'Não informado';
    const matched = (companyOrigins || []).find((o: any) => o.name?.toLowerCase() === raw.toLowerCase());
    const origin = matched ? matched.name : raw;
    const existing = acc.find((it) => it.name === origin);
    if (existing) existing.value += 1;
    else acc.push({ name: origin, value: 1, color: originColorMap[origin.toLowerCase()] || COLORS[acc.length % COLORS.length] });
    return acc;
  }, []).sort((a: any, b: any) => b.value - a.value);

  // Forma de pagamento (último pgto por empresa ativa)
  const paymentMethodData = useMemo(() => {
    const active = companies.filter((c) => c.subscription_status === 'active');
    const activeIds = new Set(active.map((c) => c.id));
    const last: Record<string, string> = {};
    (allCompanyPayments || []).forEach((p: any) => {
      if (p.company_id && activeIds.has(p.company_id) && !last[p.company_id]) {
        last[p.company_id] = p.payment_method || 'unknown';
      }
    });
    const labelMap: Record<string, string> = {
      credit_card: 'Cartão de Crédito',
      cartao_credito: 'Cartão de Crédito',
      pix: 'PIX',
      pix_recurring: 'PIX Recorrente',
      boleto: 'Boleto',
    };
    const counts: Record<string, number> = {};
    Object.values(last).forEach((m) => {
      const label = labelMap[m] || m || 'Não informado';
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [companies, allCompanyPayments]);

  // Funil de retenção por nº de pagamentos
  const retentionFunnelData = useMemo(() => {
    const active = companies.filter((c) => c.subscription_status === 'active' || c.subscription_status === 'testing');
    const counts: Record<string, number> = {};
    (allCompanyPayments || []).forEach((p: any) => { if (p.company_id) counts[p.company_id] = (counts[p.company_id] || 0) + 1; });
    const m1 = active.filter((c) => (counts[c.id] || 0) === 1).length;
    const m2 = active.filter((c) => (counts[c.id] || 0) === 2).length;
    const m3 = active.filter((c) => (counts[c.id] || 0) === 3).length;
    const m4 = active.filter((c) => (counts[c.id] || 0) >= 4).length;
    const r12 = m1 + m2 + m3 + m4 > 0 ? ((m2 + m3 + m4) / (m1 + m2 + m3 + m4) * 100).toFixed(0) : '0';
    const r23 = m2 + m3 + m4 > 0 ? ((m3 + m4) / (m2 + m3 + m4) * 100).toFixed(0) : '0';
    const r3p = m3 + m4 > 0 ? (m4 / (m3 + m4) * 100).toFixed(0) : '0';
    return [
      { name: '1° Mês (1 pgto)', value: m1, fill: '#6366F1', percentage: '—' },
      { name: '2° Mês (2 pgtos)', value: m2, fill: '#3B82F6', percentage: `${r12}%` },
      { name: '3° Mês (3 pgtos)', value: m3, fill: '#8B5CF6', percentage: `${r23}%` },
      { name: '+3 Meses (4+ pgtos)', value: m4, fill: '#10B981', percentage: `${r3p}%` },
    ];
  }, [companies, allCompanyPayments]);

  // Churn rate mensal
  const churnRateData = useMemo(() => {
    const data: any[] = [];
    const now = new Date();
    const year = now.getFullYear();
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1);
      const ms = startOfMonth(d), me = endOfMonth(d);
      if (ms > now) { data.push({ month: format(d, 'MMM/yy', { locale: ptBR }), churn: null }); continue; }
      const activeAtStart = companies.filter((c) => new Date(c.created_at) < ms).length;
      const lost = companies.filter((c) => {
        if (!c.subscription_expires_at) return false;
        const exp = new Date(c.subscription_expires_at);
        return exp >= ms && exp <= me && new Date(c.created_at) < ms && c.subscription_status === 'inactive';
      }).length;
      const churn = activeAtStart > 0 ? Math.min((lost / activeAtStart) * 100, 100) : 0;
      data.push({ month: format(d, 'MMM/yy', { locale: ptBR }), churn });
    }
    return data;
  }, [companies]);

  // Receita mensal + meta
  const monthlyRevenueData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const metaInicial = 12000, metaFinal = 60000;
    const inc = (metaFinal - metaInicial) / 11;
    return Array.from({ length: 12 }, (_, m) => {
      const d = new Date(year, m, 1);
      const ms = startOfMonth(d), me = endOfMonth(d);
      const isFut = ms > now;
      const receita = isFut ? null : (transactions || []).filter((t: any) => {
        if (t.type !== 'income') return false;
        const td = new Date(t.transaction_date);
        return td >= ms && td <= me;
      }).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      return { month: format(d, 'MMM/yy', { locale: ptBR }), receita, meta: metaInicial + inc * m };
    });
  }, [transactions]);

  // Receita semanal
  const weeklyRevenueData = useMemo(() => {
    const now = new Date();
    const data = [];
    for (let i = -3; i <= 3; i++) {
      const wd = addWeeks(now, i);
      const ws = startOfWeek(wd, { weekStartsOn: 1 });
      const we = endOfWeek(wd, { weekStartsOn: 1 });
      const isFut = ws > now;
      const receita = isFut ? null : (transactions || []).filter((t: any) => {
        if (t.type !== 'income') return false;
        const td = new Date(t.transaction_date);
        return td >= ws && td <= we;
      }).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
      data.push({
        month: `${format(ws, 'dd/MM', { locale: ptBR })} - ${format(we, 'dd/MM', { locale: ptBR })}`,
        receita,
        meta: 4000,
      });
    }
    return data;
  }, [transactions]);

  return (
    <div className="space-y-4">
      {/* Pizzas: Origem + Forma de Pagamento */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base sm:text-lg">Origem dos Novos Clientes</CardTitle></CardHeader>
          <CardContent>
            {originData.length > 0 ? (
              <div className="flex flex-col gap-3">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={originData} cx="50%" cy="50%" outerRadius={80} innerRadius={35} dataKey="value" paddingAngle={2}>
                      {originData.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => {
                      const total = originData.reduce((s: number, d: any) => s + d.value, 0);
                      return [`${total ? ((v / total) * 100).toFixed(1) : 0}%`, n];
                    }} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto px-1">
                  {originData.map((it: any) => {
                    const total = originData.reduce((s: number, d: any) => s + d.value, 0);
                    const pct = total ? ((it.value / total) * 100).toFixed(0) : '0';
                    return (
                      <div key={it.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                        <span className="truncate flex-1 text-foreground/80">{it.name}</span>
                        <span className="font-semibold shrink-0">{it.value} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <div className="flex items-center justify-center h-[220px] text-muted-foreground">Nenhuma empresa no período</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base sm:text-lg">Clientes por Forma de Pagamento</CardTitle></CardHeader>
          <CardContent>
            {paymentMethodData.length > 0 ? (
              <div className="flex flex-col gap-3">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={paymentMethodData} cx="50%" cy="50%" outerRadius={80} innerRadius={35} dataKey="value" paddingAngle={2}>
                      {paymentMethodData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => {
                      const total = paymentMethodData.reduce((s: number, d: any) => s + d.value, 0);
                      return [`${total ? ((v / total) * 100).toFixed(1) : 0}%`, n];
                    }} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto px-1">
                  {paymentMethodData.map((it: any, i: number) => {
                    const total = paymentMethodData.reduce((s: number, d: any) => s + d.value, 0);
                    const pct = total ? ((it.value / total) * 100).toFixed(0) : '0';
                    return (
                      <div key={it.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="truncate flex-1 text-foreground/80">{it.name}</span>
                        <span className="font-semibold shrink-0">{it.value} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <div className="flex items-center justify-center h-[220px] text-muted-foreground">Nenhum cliente ativo</div>}
          </CardContent>
        </Card>
      </div>

      {/* Funil de retenção */}
      <Card>
        <CardHeader><CardTitle className="text-base sm:text-lg">Funil de Retenção de Clientes</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={300}>
                <FunnelChart>
                  <defs>
                    {FUNNEL_GRADIENTS.map((g) => (
                      <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={g.color} stopOpacity={1} />
                        <stop offset="100%" stopColor={g.color} stopOpacity={0.5} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Tooltip formatter={(v: number, _n: string, props: any) => [`${v} empresas`, props.payload?.name || '']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Funnel
                    data={retentionFunnelData.map((it, i) => ({ ...it, fill: `url(#${FUNNEL_GRADIENTS[i]?.id || 'fg0'})` }))}
                    dataKey="value" nameKey="name" isAnimationActive>
                    <LabelList position="center" fill="#fff" stroke="none" formatter={(v: number) => `${v}`} style={{ fontWeight: 'bold', fontSize: 16 }} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-3 lg:w-64">
              {retentionFunnelData.map((it, i) => (
                <div key={it.name} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: `linear-gradient(135deg, ${FUNNEL_GRADIENTS[i]?.color}, ${FUNNEL_GRADIENTS[i]?.color}80)` }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{it.name}</span>
                      <span className="text-sm text-muted-foreground">{it.value}</span>
                    </div>
                    {i > 0 && (
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">Retenção:</span>
                        <span className={`font-medium ${parseInt(it.percentage) >= 70 ? 'text-green-600' : parseInt(it.percentage) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {it.percentage}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receita evolução */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base sm:text-lg">
              Evolução da Receita {revenueView === 'monthly' ? 'Mensal' : 'Semanal'} ({new Date().getFullYear()})
            </CardTitle>
            <Tabs value={revenueView} onValueChange={(v) => setRevenueView(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="monthly" className="text-xs px-3 h-7">Mensal</TabsTrigger>
                <TabsTrigger value="weekly" className="text-xs px-3 h-7">Semanal</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={revenueView === 'monthly' ? monthlyRevenueData : weeklyRevenueData}>
              <defs>
                <linearGradient id="cReceita" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.8} /><stop offset="95%" stopColor="#10B981" stopOpacity={0.1} /></linearGradient>
                <linearGradient id="cMeta" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366F1" stopOpacity={0.05} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number | null, n: string) => v == null ? ['—', n] : [fmt(v), n]}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Legend />
              <Area type="monotone" dataKey="meta" name={revenueView === 'monthly' ? 'Meta MRR' : 'Meta Semanal'} stroke="#6366F1" fill="url(#cMeta)" strokeWidth={2} strokeDasharray="5 5" />
              <Area type="monotone" dataKey="receita" name="Receita" stroke="#10B981" fill="url(#cReceita)" strokeWidth={2} connectNulls={false} dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Churn */}
      <Card>
        <CardHeader><CardTitle className="text-base sm:text-lg">Taxa de Churn Mensal ({new Date().getFullYear()})</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={churnRateData}>
              <defs>
                <linearGradient id="cChurn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={0.8} /><stop offset="95%" stopColor="#EF4444" stopOpacity={0.1} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 12 }} domain={[0, 'auto']} />
              <Tooltip formatter={(v: number | null) => v == null ? ['—', 'Churn'] : [`${v.toFixed(2)}%`, 'Churn Rate']}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="churn" name="Churn Rate" stroke="#EF4444" fill="url(#cChurn)" strokeWidth={2} connectNulls={false} dot={{ fill: '#EF4444', strokeWidth: 2, r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

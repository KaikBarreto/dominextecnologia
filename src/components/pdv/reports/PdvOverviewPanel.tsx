import { ArrowDownRight, ArrowRight, ArrowUpRight, RotateCcw, ShoppingBag, TrendingUp } from 'lucide-react';
import { useEffect } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { EmptyState } from '@/components/mobile/EmptyState';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { usePdvManagementReport } from '@/hooks/usePdvReportsV2';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { compareMetric } from '@/lib/pdv/reportInsights';

const chartConfig = {
  revenue: { label: 'Receita', color: 'hsl(var(--primary))' },
  margin: { label: 'Margem', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

function Trend({ current, previous }: { current: number; previous: number }) {
  const trend = compareMetric(current, previous);
  const Icon = trend.direction === 'up' ? ArrowUpRight : trend.direction === 'down' ? ArrowDownRight : ArrowRight;
  const text = trend.direction === 'new' ? 'Sem base anterior' : `${Math.abs(trend.percent ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  return (
    <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />{text} vs. período anterior
    </span>
  );
}

export function PdvOverviewPanel({ from, to, refreshKey = 0 }: { from: string; to: string; refreshKey?: number }) {
  const report = usePdvManagementReport({ from, to });
  const { money } = useLocaleFormatters();
  const { refetch } = report;
  useEffect(() => { if (refreshKey > 0) void refetch(); }, [refreshKey, refetch]);
  if (report.isLoading) return <PdvPageSkeleton variant="reports" label="Carregando visão geral da loja" />;
  if (report.error) return <NoticeBanner variant="destructive" action="Tentar novamente" onClick={() => void report.refetch()}>{report.error.message}</NoticeBanner>;
  if (!report.data) return null;
  const { current, previous } = report.data;
  if (current.ordersCount === 0 && current.revenue === 0) {
    return <EmptyState size="compact" icon={<ShoppingBag className="h-10 w-10" />} title="Sem vendas reconhecidas no período" description="Altere o período para acompanhar receita, margem e ticket médio." />;
  }
  const optionalMoney = (value: number | null) => value == null ? 'Indisponível' : money(value);
  const marginRate = current.marginRate == null ? 'Indisponível' : `${(current.marginRate * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 rounded-xl bg-primary p-5 text-primary-foreground sm:grid-cols-[1.4fr_1fr] sm:p-6">
        <div>
          <p className="text-sm text-primary-foreground/70">Receita reconhecida no período</p>
          <p className="mt-1 break-words text-3xl font-bold tabular-nums sm:text-4xl">{money(current.revenue)}</p>
          <div className="mt-3 text-primary-foreground/75"><Trend current={current.revenue} previous={previous.revenue} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-primary-foreground/15 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div><p className="text-xs text-primary-foreground/65">Vendas</p><b className="text-2xl tabular-nums">{current.ordersCount}</b></div>
          <div><p className="text-xs text-primary-foreground/65">Ticket médio</p><b className="break-words text-xl tabular-nums">{money(current.averageTicket)}</b></div>
          <div><p className="text-xs text-primary-foreground/65">Margem</p><b className="break-words text-xl tabular-nums">{optionalMoney(current.margin)}</b></div>
          <div><p className="text-xs text-primary-foreground/65">Margem %</p><b className="text-xl tabular-nums">{marginRate}</b></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-y py-5 lg:grid-cols-4">
        {[
          { label: 'Custo dos materiais', value: optionalMoney(current.cmv), current: current.cmv, previous: previous.cmv },
          { label: 'Itens líquidos', value: current.quantity.toLocaleString('pt-BR'), current: current.quantity, previous: previous.quantity },
          { label: 'Devoluções', value: String(current.returnsCount), current: current.returnsCount, previous: previous.returnsCount },
          { label: 'Impacto das devoluções', value: money(current.returnsImpact), current: current.returnsImpact, previous: previous.returnsImpact },
        ].map((metric) => <div key={metric.label} className="min-w-0"><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-1 break-words text-xl font-bold tabular-nums">{metric.value}</p>{metric.current != null && metric.previous != null && <Trend current={metric.current} previous={metric.previous} />}</div>)}
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h3 className="font-semibold">Evolução diária</h3><p className="text-xs text-muted-foreground">Receita e margem líquidas de devoluções</p></div>
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
        </div>
        <Card><CardContent className="p-3 sm:p-5">
          <ChartContainer config={chartConfig} className="h-[260px] w-full aspect-auto">
            <AreaChart data={report.data.daily} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <defs><linearGradient id="pdvRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value: string) => value.slice(5).split('-').reverse().join('/')} />
              <YAxis width={58} tickLine={false} axisLine={false} tickFormatter={(value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => String(value).slice(5).split('-').reverse().join('/')} formatter={(value, name) => <div className="flex min-w-36 items-center justify-between gap-3"><span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label}</span><b className="tabular-nums">{money(Number(value))}</b></div>} />} />
              <Area type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="url(#pdvRevenue)" strokeWidth={2} isAnimationActive={false} />
              <Area type="monotone" dataKey="margin" stroke="var(--color-margin)" fill="transparent" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </CardContent></Card>
      </div>

      {current.returnsCount > 0 && <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-sm"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0" /><p><b>{current.returnsCount} {current.returnsCount === 1 ? 'devolução' : 'devoluções'}</b> impactaram {money(current.returnsImpact)} no período.</p></div>}
    </section>
  );
}

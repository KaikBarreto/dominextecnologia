import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { useProfiles } from '@/hooks/useProfiles';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { formatBRL } from '@/utils/currency';
import { osStatusLabels } from '@/types/database';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import {
  ClipboardCheck, TrendingUp, Clock, DollarSign, Users, Wrench,
} from 'lucide-react';
import { format, differenceInMinutes, getDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function OsReportDashboard() {
  const { serviceOrders } = useServiceOrders();
  const { statuses } = useOsStatuses();
  const { data: profiles } = useProfiles();
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  const filtered = useMemo(() => filterByDate(serviceOrders, 'scheduled_date'), [serviceOrders, range]);

  // ── KPI cards ──
  const kpis = useMemo(() => {
    const total = filtered.length;
    const concluded = filtered.filter(os => os.status === 'concluida');
    const rate = total > 0 ? Math.round((concluded.length / total) * 100) : 0;

    let avgMinutes = 0;
    const withTime = concluded.filter(os => os.check_in_time && os.check_out_time);
    if (withTime.length > 0) {
      const totalMin = withTime.reduce((sum, os) => {
        return sum + differenceInMinutes(new Date(os.check_out_time!), new Date(os.check_in_time!));
      }, 0);
      avgMinutes = Math.round(totalMin / withTime.length);
    }

    const revenue = concluded.reduce((sum, os) => sum + (Number(os.total_value) || 0), 0);

    return { total, concluded: concluded.length, rate, avgMinutes, revenue };
  }, [filtered]);

  // ── OS by status (pie) ──
  const statusData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    filtered.forEach(os => {
      const key = os.status;
      const existing = map.get(key);
      const label = statuses.find(s => s.key === key)?.label || osStatusLabels[key as keyof typeof osStatusLabels] || key;
      const color = statuses.find(s => s.key === key)?.color || '#3b82f6';
      if (existing) existing.value++;
      else map.set(key, { name: label, value: 1, color });
    });
    return Array.from(map.values());
  }, [filtered, statuses]);

  // ── OS by service type (bar) ──
  const serviceTypeData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; color: string }>();
    filtered.forEach(os => {
      const st = (os as any).service_type;
      const key = st?.id || 'sem_tipo';
      const existing = map.get(key);
      if (existing) existing.value++;
      else map.set(key, { name: st?.name || 'Sem tipo', value: 1, color: st?.color || '#94a3b8' });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ── OS over time (line) ──
  const timelineData = useMemo(() => {
    const map = new Map<string, { month: string; total: number; revenue: number }>();
    filtered.forEach(os => {
      const d = os.scheduled_date || os.created_at;
      const key = format(new Date(d), 'yyyy-MM');
      const label = format(new Date(d), 'MMM/yy', { locale: ptBR });
      const existing = map.get(key);
      const val = os.status === 'concluida' ? (Number(os.total_value) || 0) : 0;
      if (existing) { existing.total++; existing.revenue += val; }
      else map.set(key, { month: label, total: 1, revenue: val });
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [filtered]);

  // ── Top 10 customers ──
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; count: number; value: number }>();
    filtered.forEach(os => {
      const c = os.customer;
      const key = c?.id || 'unknown';
      const existing = map.get(key);
      const val = Number(os.total_value) || 0;
      if (existing) { existing.count++; existing.value += val; }
      else map.set(key, { name: c?.name || 'N/A', count: 1, value: val });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);

  // ── Top technicians ──
  const topTechnicians = useMemo(() => {
    const map = new Map<string, { name: string; count: number; totalMin: number; withTime: number }>();
    const concluded = filtered.filter(os => os.status === 'concluida');
    concluded.forEach(os => {
      const tid = os.technician_id;
      if (!tid) return;
      const profile = profiles?.find(p => p.user_id === tid);
      const existing = map.get(tid);
      let min = 0;
      let hasTime = 0;
      if (os.check_in_time && os.check_out_time) {
        min = differenceInMinutes(new Date(os.check_out_time), new Date(os.check_in_time));
        hasTime = 1;
      }
      if (existing) { existing.count++; existing.totalMin += min; existing.withTime += hasTime; }
      else map.set(tid, { name: profile?.full_name || 'Técnico', count: 1, totalMin: min, withTime: hasTime });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered, profiles]);

  // ── OS by weekday ──
  const weekdayData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    filtered.forEach(os => {
      const d = os.scheduled_date ? parseISO(os.scheduled_date) : new Date(os.created_at);
      counts[getDay(d)]++;
    });
    return WEEKDAY_LABELS.map((label, i) => ({ day: label, total: counts[i] }));
  }, [filtered]);

  const pieConfig: ChartConfig = Object.fromEntries(
    statusData.map(s => [s.name, { label: s.name, color: s.color }])
  );

  const formatMinutes = (m: number) => {
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h ${r}min` : `${h}h`;
  };

  return (
    <div className="space-y-6">
      <DateRangeFilter value={range} preset={preset} onPresetChange={setPreset} onRangeChange={setRange} />

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="rounded-full bg-primary/10 p-3"><ClipboardCheck className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total de OS</p>
              <p className="text-2xl font-bold">{kpis.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="rounded-full bg-success/10 p-3"><TrendingUp className="h-5 w-5 text-success" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa de conclusão</p>
              <p className="text-2xl font-bold">{kpis.rate}%</p>
              <p className="text-[11px] text-muted-foreground">{kpis.concluded} concluídas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="rounded-full bg-info/10 p-3"><Clock className="h-5 w-5 text-info" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Tempo médio</p>
              <p className="text-2xl font-bold">{kpis.avgMinutes > 0 ? formatMinutes(kpis.avgMinutes) : '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="rounded-full bg-warning/10 p-3"><DollarSign className="h-5 w-5 text-warning" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Faturamento</p>
              <p className="text-2xl font-bold">R$ {formatBRL(kpis.revenue)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* OS by status pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">OS por Status</CardTitle></CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <ChartContainer config={pieConfig} className="h-[260px] w-full">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* OS by service type bar */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">OS por Tipo de Serviço</CardTitle></CardHeader>
          <CardContent>
            {serviceTypeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceTypeData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => [v, 'OS']} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {serviceTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Timeline */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Volume de OS ao Longo do Tempo</CardTitle></CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData} margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v: number) => [v, 'OS']} />
                    <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue over time */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Faturamento ao Longo do Tempo</CardTitle></CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineData} margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`R$ ${formatBRL(v)}`, 'Faturamento']} />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weekday chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">OS por Dia da Semana</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v, 'OS']} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Rankings */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top customers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> Top 10 Clientes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs text-center">OS</TableHead>
                  <TableHead className="text-xs text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                ) : topCustomers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-center">{c.count}</TableCell>
                    <TableCell className="text-right text-sm">R$ {formatBRL(c.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top technicians */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Top Técnicos (Concluídas)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Técnico</TableHead>
                  <TableHead className="text-xs text-center">OS</TableHead>
                  <TableHead className="text-xs text-right">Tempo Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTechnicians.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                ) : topTechnicians.map((t, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{t.name}</TableCell>
                    <TableCell className="text-center">{t.count}</TableCell>
                    <TableCell className="text-right text-sm">
                      {t.withTime > 0 ? formatMinutes(Math.round(t.totalMin / t.withTime)) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

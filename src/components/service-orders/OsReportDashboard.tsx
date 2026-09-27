import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { useProfiles } from '@/hooks/useProfiles';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { formatBRL } from '@/utils/currency';
import { osStatusLabels } from '@/types/database';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  ClipboardCheck, TrendingUp, Clock, DollarSign, Users, Wrench, CalendarCheck,
} from 'lucide-react';
import { format, differenceInMinutes, differenceInCalendarDays, getDay, parseISO, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { KPICard } from '@/components/dashboard/KPICard';

const REPORT_SURFACE = 'border-0 bg-muted/20 shadow-none rounded-2xl';

/**
 * Gera os rótulos dos dias da semana (Dom..Sáb) no locale correto usando Intl.
 * Usa abreviação de 3 letras (narrow é 1 letra só, short é 3-4, narrow é 1).
 */
function getWeekdayLabels(localeTag: string): string[] {
  // Domingo = 0, ..., Sábado = 6
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(2024, 0, 7 + i); // 7 jan 2024 = domingo
    return new Intl.DateTimeFormat(localeTag, { weekday: 'short' }).format(date);
  });
}

// Mapeamento de locale app → BCP 47 para Intl.DateTimeFormat.
const LOCALE_TO_BCP47: Record<string, string> = {
  'pt-br': 'pt-BR',
  en: 'en-US',
  es: 'es',
  fr: 'fr',
};

export function OsReportDashboard() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.report;

  const { serviceOrders } = useServiceOrders();
  const { statuses } = useOsStatuses();
  const { data: profiles } = useProfiles();
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  // Labels dos dias da semana no locale atual (locale-aware via Intl).
  const WEEKDAY_LABELS = getWeekdayLabels(LOCALE_TO_BCP47[locale] ?? 'pt-BR');

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
      else map.set(key, { name: st?.name || t.serviceTypeFallback, value: 1, color: st?.color || '#94a3b8' });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filtered, t.serviceTypeFallback]);

  // ── OS over time ──
  // Em períodos curtos, agrega por dia. A versão anterior sempre agrupava por
  // mês, fazendo "Este mês" virar um único ponto sem valor analítico.
  const timelineData = useMemo(() => {
    const from = range.from;
    const to = range.to;
    const byDay = !!from && !!to && differenceInCalendarDays(to, from) <= 62;
    const map = new Map<string, { label: string; total: number; concluded: number; revenue: number }>();
    filtered.forEach(os => {
      const d = os.scheduled_date || os.created_at;
      const date = new Date(d);
      const key = format(date, byDay ? 'yyyy-MM-dd' : 'yyyy-MM');
      const label = format(date, byDay ? 'dd/MM' : 'MMM/yy', { locale: ptBR });
      const existing = map.get(key);
      const concluded = os.status === 'concluida';
      const val = concluded ? (Number(os.total_value) || 0) : 0;
      if (existing) {
        existing.total++;
        existing.concluded += concluded ? 1 : 0;
        existing.revenue += val;
      } else {
        map.set(key, { label, total: 1, concluded: concluded ? 1 : 0, revenue: val });
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [filtered, range.from, range.to]);

  // ── Saúde operacional do agendamento ──
  // Usa somente fatos registrados: data agendada, status e data de conclusão.
  // Não presume SLA nem prazo contratual inexistente.
  const scheduleHealthData = useMemo(() => {
    const today = startOfDay(new Date());
    let onSchedule = 0;
    let completedLate = 0;
    let overdueOpen = 0;
    let withoutCompletionTime = 0;

    filtered.forEach(os => {
      if (!os.scheduled_date) return;
      const scheduled = startOfDay(parseISO(os.scheduled_date));
      if (os.status === 'concluida') {
        const completedAt = os.completed_at || os.check_out_time;
        if (!completedAt) withoutCompletionTime++;
        else if (startOfDay(new Date(completedAt)) <= scheduled) onSchedule++;
        else completedLate++;
      } else if (os.status !== 'cancelada' && scheduled < today) {
        overdueOpen++;
      }
    });

    return [
      { name: t.scheduleHealthOnTime, value: onSchedule, color: 'hsl(var(--success))' },
      { name: t.scheduleHealthLate, value: completedLate, color: 'hsl(var(--warning))' },
      { name: t.scheduleHealthOpenOverdue, value: overdueOpen, color: 'hsl(var(--destructive))' },
      { name: t.scheduleHealthNoCompletion, value: withoutCompletionTime, color: 'hsl(var(--muted-foreground))' },
    ];
  }, [filtered, t.scheduleHealthLate, t.scheduleHealthNoCompletion, t.scheduleHealthOnTime, t.scheduleHealthOpenOverdue]);

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
      // Credita quem EXECUTOU de verdade (check-in), não só quem foi escalado
      // — em OS de equipe technician_id pode ser um integrante que nem foi a
      // campo. OS sem nenhum dos dois continua fora do ranking.
      const tid = os.check_in_by ?? os.technician_id;
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
      else map.set(tid, { name: profile?.full_name || t.technicianFallback, count: 1, totalMin: min, withTime: hasTime });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered, profiles, t.technicianFallback]);

  // ── OS by weekday ──
  const weekdayData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    filtered.forEach(os => {
      const d = os.scheduled_date ? parseISO(os.scheduled_date) : new Date(os.created_at);
      counts[getDay(d)]++;
    });
    return WEEKDAY_LABELS.map((label, i) => ({ day: label, total: counts[i] }));
  }, [filtered, WEEKDAY_LABELS]);

  const totalStatus = statusData.reduce((s, d) => s + d.value, 0);

  const formatMinutes = (m: number) => {
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h ${r}min` : `${h}h`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <DateRangeFilter value={range} preset={preset} onPresetChange={setPreset} onRangeChange={setRange} />
      </div>

      {/* KPI Cards */}
      <div className="grid auto-rows-[148px] grid-flow-col auto-cols-[82%] gap-4 overflow-x-auto pb-1 snap-x sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible 2xl:grid-cols-4 [&>*]:snap-start">
        <KPICard title={t.kpiTotal} value={kpis.total} icon={ClipboardCheck} bgClass="bg-primary" delay={0} />
        <KPICard
          title={t.kpiCompletionRate}
          value={kpis.rate}
          formattedValue={`${kpis.rate}%`}
          subtitle={t.kpiCompletionRateSub.replace('{n}', String(kpis.concluded))}
          icon={TrendingUp}
          bgClass="bg-success"
          delay={1}
        />
        <KPICard
          title={t.kpiAvgTime}
          value={kpis.avgMinutes}
          formattedValue={kpis.avgMinutes > 0 ? formatMinutes(kpis.avgMinutes) : '—'}
          icon={Clock}
          bgClass="bg-info"
          delay={2}
        />
        <KPICard
          title={t.kpiBilling}
          value={kpis.revenue}
          formattedValue={`R$ ${formatBRL(kpis.revenue)}`}
          icon={DollarSign}
          bgClass="bg-warning"
          delay={3}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* OS by status pie */}
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{t.chartByStatus}</CardTitle></CardHeader>
          <CardContent className="overflow-hidden">
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.noData}</p>
            ) : (
              <>
                <div className="relative h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {statusData.map((entry, i) => (
                          <linearGradient key={i} id={`os-grad-status-${i}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor={entry.color} stopOpacity={1.0} />
                            <stop offset="100%" stopColor={entry.color} stopOpacity={0.55} />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {statusData.map((entry, i) => (
                          <Cell key={i} fill={`url(#os-grad-status-${i})`} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number, name: string) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{totalStatus}</span>
                    <span className="text-[10px] text-muted-foreground">{t.osInPeriod}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
                  {statusData.map((entry, i) => {
                    const pct = totalStatus > 0 ? Math.round((entry.value / totalStatus) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                        <span>{entry.name}</span>
                        <span className="font-medium text-foreground">{entry.value}</span>
                        <span>({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* OS by service type bar */}
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{t.chartByServiceType}</CardTitle></CardHeader>
          <CardContent>
            {serviceTypeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.noData}</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceTypeData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <defs>
                      {serviceTypeData.map((entry, i) => (
                        <linearGradient key={i} id={`os-grad-svc-${i}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={entry.color} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={entry.color} stopOpacity={0.4} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => [v, t.tooltipWo]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {serviceTypeData.map((entry, i) => (
                        <Cell key={i} fill={`url(#os-grad-svc-${i})`} stroke={entry.color} />
                      ))}
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
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{t.chartTimeline}</CardTitle></CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.noData}</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData} margin={{ left: 0, right: 20 }}>
                    <defs>
                      <linearGradient id="os-grad-timeline-primary" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={30} />
                    <Tooltip formatter={(v: number) => [v, t.tooltipWo]} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name={t.timelineTotal}
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      fill="url(#os-grad-timeline-primary)"
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="concluded"
                      name={t.timelineConcluded}
                      stroke="hsl(var(--success))"
                      strokeWidth={2.5}
                      fill="transparent"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue over time */}
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{t.chartRevenue}</CardTitle></CardHeader>
          <CardContent>
            {timelineData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.noData}</p>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineData} margin={{ left: 0, right: 20 }}>
                    <defs>
                      <linearGradient id="os-grad-revenue-vertical" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`R$ ${formatBRL(v)}`, t.tooltipBilling]} />
                    <Bar dataKey="revenue" fill="url(#os-grad-revenue-vertical)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekday chart */}
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{t.chartByWeekday}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayData}>
                  <defs>
                    <linearGradient id="os-grad-weekday-vertical" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={30} />
                  <Tooltip formatter={(v: number) => [v, t.tooltipWo]} />
                  <Bar dataKey="total" fill="url(#os-grad-weekday-vertical)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pontualidade baseada na data agendada, sem presumir SLA. */}
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" /> {t.scheduleHealthTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scheduleHealthData.every(item => item.value === 0) ? (
              <p className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
                {t.scheduleHealthEmpty}
              </p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scheduleHealthData} layout="vertical" margin={{ left: 18, right: 24 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={138} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [v, t.tooltipWo]} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {scheduleHealthData.map(item => <Cell key={item.name} fill={item.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top customers */}
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" /> {t.rankingCustomers}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t.colCustomer}</TableHead>
                  <TableHead className="text-xs text-center">{t.colWo}</TableHead>
                  <TableHead className="text-xs text-right">{t.colTotal}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t.noData}</TableCell></TableRow>
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
        <Card className={REPORT_SURFACE}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4" /> {t.rankingTechnicians}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t.colTechnician}</TableHead>
                  <TableHead className="text-xs text-center">{t.colWo}</TableHead>
                  <TableHead className="text-xs text-right">{t.colAvgTime}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTechnicians.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t.noData}</TableCell></TableRow>
                ) : topTechnicians.map((tech, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{tech.name}</TableCell>
                    <TableCell className="text-center">{tech.count}</TableCell>
                    <TableCell className="text-right text-sm">
                      {tech.withTime > 0 ? formatMinutes(Math.round(tech.totalMin / tech.withTime)) : '—'}
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

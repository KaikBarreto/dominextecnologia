// ─────────────────────────────────────────────────────────────────────────────
// ActivityHistoryTable — histórico do diário comercial dentro do intervalo do
// `DateRangeFilter` da página. Mostra, por dia (mais recente primeiro):
// Manhã / Tarde / Total do dia + status (Completo / Parcial / Sem registro).
//
// Dia útil sem NENHUM registro aparece destacado (vem de `activityCoverage`)
// — é a informação que o CEO mais quer ver, então ela não pode se perder só
// porque não há linha no banco pra representá-la.
//
// Tabela no desktop, cards no mobile (régua mobile-first do projeto).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import {
  ACTIVITY_METRIC_LABEL, type DailyActivityRow,
} from '@/hooks/useSalespersonActivity';
import {
  activityCoverage, buildDayTotals, conversionRates, fromDateKey,
  goalAdherence, sumActivity, toDateKey, ZERO_COUNTERS, type DayTotals,
} from '@/utils/salespersonActivityStats';

interface ActivityHistoryTableProps {
  rows: DailyActivityRow[];
  range: DateRange;
  /** 'yyyy-MM-dd' de hoje (BRT) — teto pro cálculo de "dia sem registro". */
  todayKey: string;
  goals: { contacts: number; meetingsScheduled: number };
}

function formatDayLabel(dateKey: string): string {
  const date = fromDateKey(dateKey);
  if (!date) return dateKey;
  const label = format(date, "EEE, dd/MM", { locale: ptBR });
  return label.length ? label[0].toUpperCase() + label.slice(1) : label;
}

function formatPercent(v: number | null): string {
  if (v == null) return '—';
  return `${Math.round(v)}%`;
}

function MetricsList({ counters, dense }: { counters: typeof ZERO_COUNTERS; dense?: boolean }) {
  return (
    <dl className={dense ? 'space-y-0.5 text-[11px]' : 'space-y-0.5 text-xs'}>
      <div className="flex items-center justify-between gap-2">
        <dt className="truncate text-muted-foreground">{ACTIVITY_METRIC_LABEL.contacts}</dt>
        <dd className="shrink-0 font-medium tabular-nums">{counters.contacts}</dd>
      </div>
      <div className="flex items-center justify-between gap-2">
        <dt className="truncate text-muted-foreground">{ACTIVITY_METRIC_LABEL.meetings_scheduled}</dt>
        <dd className="shrink-0 font-medium tabular-nums">{counters.meetings_scheduled}</dd>
      </div>
      <div className="flex items-center justify-between gap-2">
        <dt className="truncate text-muted-foreground">{ACTIVITY_METRIC_LABEL.meetings_held}</dt>
        <dd className="shrink-0 font-medium tabular-nums">{counters.meetings_held}</dd>
      </div>
      <div className="flex items-center justify-between gap-2">
        <dt className="truncate text-muted-foreground">{ACTIVITY_METRIC_LABEL.sales_count}</dt>
        <dd className="shrink-0 font-medium tabular-nums">{counters.sales_count}</dd>
      </div>
    </dl>
  );
}

// Três estados, três cores SATURADAS (régua de UI do CEO: nada de badge cinza
// ou de contorno). `isMissingBusinessDay` não muda a cor — dia sem registro é
// dia sem registro; o parâmetro continua aqui porque é o que faz o dia vazio
// entrar na lista, decidido por quem chama.
function statusBadge(filledPeriods: number): { variant: BadgeProps['variant']; label: string } {
  if (filledPeriods === 2) return { variant: 'success', label: 'Completo' };
  if (filledPeriods === 1) return { variant: 'warning', label: 'Parcial' };
  return { variant: 'destructive', label: 'Sem registro' };
}

export function ActivityHistoryTable({ rows, range, todayKey, goals }: ActivityHistoryTableProps) {
  const isMobile = useIsMobile();

  const fromKey = range.from ? toDateKey(range.from) : (rows.length ? rows[rows.length - 1].activity_date : todayKey);
  const toKey = range.to ? toDateKey(range.to) : todayKey;

  const rowsInRange = useMemo(
    () => rows.filter((r) => r.activity_date >= fromKey && r.activity_date <= toKey),
    [rows, fromKey, toKey],
  );

  const coverage = useMemo(
    () => activityCoverage(rows, fromKey, toKey, todayKey),
    [rows, fromKey, toKey, todayKey],
  );

  const days: DayTotals[] = useMemo(() => {
    const present = buildDayTotals(rowsInRange);
    const presentDates = new Set(present.map((d) => d.date));
    const missing: DayTotals[] = coverage.missingDays
      .filter((d) => !presentDates.has(d))
      .map((d) => ({ date: d, morning: null, afternoon: null, filledPeriods: 0, ...ZERO_COUNTERS }));
    return [...present, ...missing].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [rowsInRange, coverage.missingDays]);

  const totals = useMemo(() => sumActivity(rowsInRange), [rowsInRange]);
  const rates = useMemo(() => conversionRates(totals), [totals]);
  const contactsAdherence = useMemo(
    () => goalAdherence(rows, coverage.businessDays, goals.contacts, 'contacts'),
    [rows, coverage.businessDays, goals.contacts],
  );
  const meetingsAdherence = useMemo(
    () => goalAdherence(rows, coverage.businessDays, goals.meetingsScheduled, 'meetings_scheduled'),
    [rows, coverage.businessDays, goals.meetingsScheduled],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{ACTIVITY_METRIC_LABEL.contacts}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{totals.contacts}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{ACTIVITY_METRIC_LABEL.meetings_scheduled}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{totals.meetings_scheduled}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{ACTIVITY_METRIC_LABEL.meetings_held}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{totals.meetings_held}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{ACTIVITY_METRIC_LABEL.sales_count}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{totals.sales_count}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Funil de conversão</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Contato → Reunião agendada</p>
            <p className="text-xl font-bold">{formatPercent(rates.contactToScheduled)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Agendada → Realizada</p>
            <p className="text-xl font-bold">{formatPercent(rates.scheduledToHeld)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Realizada → Venda</p>
            <p className="text-xl font-bold">{formatPercent(rates.heldToSale)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Aderência à meta diária</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Contatos ({goals.contacts}/dia) — {contactsAdherence.daysMet} de {contactsAdherence.businessDays} dias úteis
            </p>
            <p className="text-xl font-bold">{contactsAdherence.adherencePercent.toFixed(0)}%</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              Reuniões agendadas ({goals.meetingsScheduled}/dia) — {meetingsAdherence.daysMet} de {meetingsAdherence.businessDays} dias úteis
            </p>
            <p className="text-xl font-bold">{meetingsAdherence.adherencePercent.toFixed(0)}%</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico por dia</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {days.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<CalendarDays className="h-10 w-10" />}
                title="Sem dados no período"
                description="Nenhum dia útil com ou sem registro nesse intervalo."
                size="compact"
              />
            </div>
          ) : isMobile ? (
            <div className="space-y-3 p-4 pt-0">
              {days.map((day) => {
                const { variant, label } = statusBadge(day.filledPeriods);
                return (
                  <div key={day.date} className="min-w-0 rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{formatDayLabel(day.date)}</span>
                      <Badge variant={variant} className="shrink-0">{label}</Badge>
                    </div>
                    {day.filledPeriods > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Manhã</p>
                          {day.morning ? <MetricsList counters={day.morning} dense /> : <p className="text-[11px] text-muted-foreground">Não preenchido</p>}
                        </div>
                        <div className="min-w-0">
                          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Tarde</p>
                          {day.afternoon ? <MetricsList counters={day.afternoon} dense /> : <p className="text-[11px] text-muted-foreground">Não preenchido</p>}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Dia</th>
                    <th className="px-4 py-2 font-medium">Manhã</th>
                    <th className="px-4 py-2 font-medium">Tarde</th>
                    <th className="px-4 py-2 font-medium">Total do dia</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => {
                    const { variant, label } = statusBadge(day.filledPeriods);
                    return (
                      <tr key={day.date} className="border-b last:border-0">
                        <td className="px-4 py-3 align-top font-medium whitespace-nowrap">{formatDayLabel(day.date)}</td>
                        <td className="min-w-[160px] px-4 py-3 align-top">
                          {day.morning ? <MetricsList counters={day.morning} /> : <span className="text-xs text-muted-foreground">Não preenchido</span>}
                        </td>
                        <td className="min-w-[160px] px-4 py-3 align-top">
                          {day.afternoon ? <MetricsList counters={day.afternoon} /> : <span className="text-xs text-muted-foreground">Não preenchido</span>}
                        </td>
                        <td className="min-w-[160px] px-4 py-3 align-top font-semibold">
                          <MetricsList counters={day} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={variant}>{label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

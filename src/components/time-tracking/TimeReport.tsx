import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { useTimeHistory, formatMinutes } from '@/hooks/useTimeRecords';
import { useAdminTimeSheet } from '@/hooks/useTimeRecords';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export function TimeReport() {
  const { locale } = useAppLocaleContext();
  const tc = MESSAGES[locale].app.employees.timeclock;
  const tf = tc.reportFilters;
  const cal = tc.reportCalendar;
  const summ = tc.reportSummary;
  const chart = tc.reportChart;
  const months = tc.months;

  const MONTHS_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i),
    label: months[String(i) as keyof typeof months],
  }));

  const WEEKDAYS_LABELS = [
    cal.weekdays.sun,
    cal.weekdays.mon,
    cal.weekdays.tue,
    cal.weekdays.wed,
    cal.weekdays.thu,
    cal.weekdays.fri,
    cal.weekdays.sat,
  ];

  const now = new Date();
  const { employees } = useAdminTimeSheet();
  const [month, setMonth] = useState(String(now.getMonth()));
  const [year, setYear] = useState(String(now.getFullYear()));
  // Funcionário: multi-select (vazio = todos). Mês/Ano permanecem seletores de período.
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);

  // Contagem de filtros ativos: mês != atual, ano != atual, funcionário selecionado.
  // Mês e ano contam só quando diferem do default da carga inicial (now).
  const activeFiltersCount =
    (month !== String(now.getMonth()) ? 1 : 0) +
    (year !== String(now.getFullYear()) ? 1 : 0) +
    (employeeIds.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setMonth(String(now.getMonth()));
    setYear(String(now.getFullYear()));
    setEmployeeIds([]);
  };

  const startDate = format(startOfMonth(new Date(+year, +month)), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(new Date(+year, +month)), 'yyyy-MM-dd');

  // O hook só aceita 1 funcionário. Com exatamente 1 selecionado, filtra server-side;
  // com vários (ou nenhum), traz todos do período e filtra client-side.
  const { data: rawSheets = [] } = useTimeHistory({
    employeeId: employeeIds.length === 1 ? employeeIds[0] : undefined,
    startDate,
    endDate,
  });

  const sheets = useMemo(() => {
    if (employeeIds.length <= 1) return rawSheets;
    return rawSheets.filter(s => s.employee_id && employeeIds.includes(s.employee_id));
  }, [rawSheets, employeeIds]);

  // Summary/calendário por funcionário só fazem sentido com exatamente 1 selecionado.
  const singleEmployeeId = employeeIds.length === 1 ? employeeIds[0] : null;
  const employee = singleEmployeeId ? employees.find(e => e.id === singleEmployeeId) : undefined;

  const summary = useMemo(() => {
    const workedDays = sheets.filter(s => s.status === 'complete' || s.status === 'open').length;
    const totalWorked = sheets.reduce((s, sh) => s + (sh.total_worked_min || 0), 0);
    const totalExpected = sheets.reduce((s, sh) => s + (sh.expected_min || 0), 0);
    const balance = totalWorked - totalExpected;
    const absences = sheets.filter(s => s.status === 'incomplete').length;
    const lateCount = sheets.filter(s => (s.balance_min ?? 0) < -10).length;
    const overtimeMin = sheets.reduce((s, sh) => s + Math.max(0, (sh.balance_min || 0)), 0);
    const allDays = eachDayOfInterval({ start: new Date(+year, +month, 1), end: endOfMonth(new Date(+year, +month)) });
    const workDays = allDays.filter(d => getDay(d) !== 0 && getDay(d) !== 6).length;
    return { workedDays, workDays, totalWorked, totalExpected, balance, absences, lateCount, overtimeMin };
  }, [sheets, month, year]);

  // Calendar grid
  const days = eachDayOfInterval({
    start: startOfMonth(new Date(+year, +month)),
    end: endOfMonth(new Date(+year, +month)),
  });

  const getSheetForDate = (d: Date) => sheets.find(s => s.date === format(d, 'yyyy-MM-dd'));

  const getDayColor = (d: Date) => {
    const dow = getDay(d);
    if (dow === 0 || dow === 6) return 'bg-muted/50 text-muted-foreground';
    const sh = getSheetForDate(d);
    if (!sh) return 'bg-destructive/20 text-destructive';
    if (sh.status === 'holiday') return 'border-dashed border-2 border-muted-foreground bg-muted/30';
    if (sh.status === 'day_off') return 'bg-muted/50 text-muted-foreground';
    if (sh.status === 'justified') return 'bg-muted/50';
    if ((sh.balance_min ?? 0) > 0) return 'bg-info/20 text-info';
    if ((sh.balance_min ?? 0) < -10) return 'bg-warning/20 text-warning';
    return 'bg-success/20 text-success';
  };

  // Bar chart data
  const chartData = days.filter(d => getDay(d) !== 0 && getDay(d) !== 6).map(d => {
    const sh = getSheetForDate(d);
    return {
      day: format(d, 'dd'),
      horas: sh ? Number(((sh.total_worked_min || 0) / 60).toFixed(1)) : 0,
    };
  });

  const overviewLabel = employeeIds.length === 0
    ? tf.overviewAll
    : employeeIds.length === 1
      ? tf.reportSingle.replace('{{name}}', employees.find(e => e.id === employeeIds[0])?.name ?? '')
      : tf.reportMultiple.replace('{{count}}', String(employeeIds.length));

  return (
    <div className="space-y-4">
      {/* Filtros consolidados em UM botão "Filtros" (pattern sistema-wide v1.9.9).
          Selects (mês / ano / funcionário) ficam dentro do FilterButton — drawer
          de baixo no mobile, sheet lateral no desktop. */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {overviewLabel}
        </p>
        <FilterButton activeCount={activeFiltersCount} onClear={clearFilters}>
          <div className="space-y-1.5">
            <Label className="text-xs">{tf.monthLabel}</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{tf.yearLabel}</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <FilterCheckboxGroup
            label={tf.employeeLabel}
            selected={employeeIds}
            onChange={setEmployeeIds}
            emptyLabel={tf.allEmployees}
            options={employees.map(e => ({ value: e.id, label: e.name }))}
          />
        </FilterButton>
      </div>

      {/* Summary Card — só com exatamente 1 funcionário selecionado.
          Com vários (ou todos), calendário e gráfico abaixo agregam o conjunto. */}
      {employee && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="h-12 w-12">
                <SignedAvatarImage src={employee.photo_url} />
                <AvatarFallback>{employee.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold">{employee.name}</h3>
                {employee.position && <p className="text-sm text-muted-foreground">{employee.position}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-muted-foreground">{summ.workedDays}</p><p className="font-bold">{summary.workedDays}/{summary.workDays}</p></div>
              <div><p className="text-muted-foreground">{summ.totalWorked}</p><p className="font-bold">{formatMinutes(summary.totalWorked)}</p></div>
              <div><p className="text-muted-foreground">{summ.monthBalance}</p><p className={cn('font-bold', summary.balance >= 0 ? 'text-success' : 'text-destructive')}>{summary.balance >= 0 ? '+' : ''}{formatMinutes(summary.balance)}</p></div>
              <div><p className="text-muted-foreground">{summ.absencesLate}</p><p className="font-bold">{summary.absences} / {summary.lateCount}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">{cal.title}</h4>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {WEEKDAYS_LABELS.map(d => (
              <div key={d} className="font-medium text-muted-foreground py-1">{d}</div>
            ))}
            {Array.from({ length: getDay(days[0]) }).map((_, i) => <div key={`e-${i}`} />)}
            {days.map(d => {
              const sh = getSheetForDate(d);
              return (
                <Popover key={d.toISOString()}>
                  <PopoverTrigger asChild>
                    <button className={cn('rounded-md p-1.5 text-xs font-medium transition-colors hover:ring-1 hover:ring-primary', getDayColor(d))}>
                      {format(d, 'd')}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3 text-xs space-y-1">
                    <p className="font-semibold">{format(d, 'EEEE, dd MMM', { locale: ptBR })}</p>
                    {sh ? (
                      <>
                        <p>{cal.popoverClockIn}: {sh.first_clock_in ? format(new Date(sh.first_clock_in), 'HH:mm') : '—'}</p>
                        <p>{cal.popoverClockOut}: {sh.last_clock_out ? format(new Date(sh.last_clock_out), 'HH:mm') : '—'}</p>
                        <p>{cal.popoverWorked}: {sh.total_worked_min != null ? formatMinutes(sh.total_worked_min) : '—'}</p>
                      </>
                    ) : <p className="text-muted-foreground">{cal.noRecord}</p>}
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">{chart.title}</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <defs>
                  {/* Gradient vertical da barra primária — destaca topo, suaviza base. */}
                  <linearGradient id="timereport-grad-primary-vertical" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis domain={[0, 12]} className="text-xs" />
                <Tooltip formatter={(v: number) => [`${v}h`, chart.tooltipLabel]} />
                <ReferenceLine y={8} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="8h" />
                <Bar dataKey="horas" fill="url(#timereport-grad-primary-vertical)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

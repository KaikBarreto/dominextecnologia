import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTimeHistory, formatMinutes } from '@/hooks/useTimeRecords';
import { useAdminTimeSheet } from '@/hooks/useTimeRecords';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i),
  label: format(new Date(2026, i, 1), 'MMMM', { locale: ptBR }),
}));

export function TimeReport() {
  const now = new Date();
  const { employees } = useAdminTimeSheet();
  const [month, setMonth] = useState(String(now.getMonth()));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [employeeId, setEmployeeId] = useState('all');

  const startDate = format(startOfMonth(new Date(+year, +month)), 'yyyy-MM-dd');
  const endDate = format(endOfMonth(new Date(+year, +month)), 'yyyy-MM-dd');

  const { data: sheets = [] } = useTimeHistory({
    employeeId: employeeId !== 'all' ? employeeId : undefined,
    startDate,
    endDate,
  });

  const employee = employees.find(e => e.id === employeeId);

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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="sm:w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="col-span-2 sm:w-[200px]"><SelectValue placeholder="Funcionário" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Card */}
      {employeeId !== 'all' && employee && (
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
              <div><p className="text-muted-foreground">Dias trabalhados</p><p className="font-bold">{summary.workedDays}/{summary.workDays}</p></div>
              <div><p className="text-muted-foreground">Total trabalhado</p><p className="font-bold">{formatMinutes(summary.totalWorked)}</p></div>
              <div><p className="text-muted-foreground">Saldo do mês</p><p className={cn('font-bold', summary.balance >= 0 ? 'text-success' : 'text-destructive')}>{summary.balance >= 0 ? '+' : ''}{formatMinutes(summary.balance)}</p></div>
              <div><p className="text-muted-foreground">Faltas / Atrasos</p><p className="font-bold">{summary.absences} / {summary.lateCount}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">Calendário</h4>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
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
                        <p>Entrada: {sh.first_clock_in ? format(new Date(sh.first_clock_in), 'HH:mm') : '—'}</p>
                        <p>Saída: {sh.last_clock_out ? format(new Date(sh.last_clock_out), 'HH:mm') : '—'}</p>
                        <p>Trabalhado: {sh.total_worked_min != null ? formatMinutes(sh.total_worked_min) : '—'}</p>
                      </>
                    ) : <p className="text-muted-foreground">Sem registro</p>}
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
          <h4 className="font-semibold mb-3">Horas por dia</h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis domain={[0, 12]} className="text-xs" />
                <Tooltip formatter={(v: number) => [`${v}h`, 'Horas']} />
                <ReferenceLine y={8} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="8h" />
                <Bar dataKey="horas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

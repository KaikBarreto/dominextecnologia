import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserX, Coffee, CheckCircle2, Eye, PenLine, Clock } from 'lucide-react';
import { useAdminTimeSheet, calculateWorkedMinutes, formatMinutes } from '@/hooks/useTimeRecords';
import { TimeDayDetailModal } from './TimeDayDetailModal';
import { ManualPunchModal } from './ManualPunchModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  present: { label: 'Presente', className: 'bg-success text-white', dot: true },
  absent: { label: 'Ausente', className: 'bg-muted text-muted-foreground', dot: false },
  on_break: { label: 'Em intervalo', className: 'bg-warning text-white', dot: false },
  finished: { label: 'Concluído', className: 'bg-info text-white', dot: false },
  late: { label: 'Atrasado', className: 'bg-destructive text-white', dot: false },
};

export function TimeToday() {
  const { employees, isLoading, getRecordsForEmployee, getEmployeeStatus, kpis, registerManualPunch } = useAdminTimeSheet();
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [manualEmployee, setManualEmployee] = useState<{ id: string; name: string } | null>(null);
  const [, setTick] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(iv);
  }, []);

  const today = format(new Date(), 'yyyy-MM-dd');

  if (isLoading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Presentes', value: kpis.present, icon: Users, color: 'text-success' },
          { label: 'Ausentes', value: kpis.absent, icon: UserX, color: 'text-muted-foreground' },
          { label: 'Em intervalo', value: kpis.onBreak, icon: Coffee, color: 'text-warning' },
          { label: 'Concluídos', value: kpis.finished, icon: CheckCircle2, color: 'text-info' },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <kpi.icon className={cn('h-6 w-6 sm:h-8 sm:w-8', kpi.color)} />
              <div>
                <p className="text-xl sm:text-2xl font-bold">{kpi.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Employees */}
      {isMobile ? (
        <div className="space-y-3">
          {employees.map(emp => {
            const records = getRecordsForEmployee(emp.id);
            const status = getEmployeeStatus(emp.id);
            const cfg = STATUS_CONFIG[status];
            const clockIn = records.find(r => r.type === 'clock_in');
            const clockOut = records.find(r => r.type === 'clock_out');
            const { worked } = calculateWorkedMinutes(records);

            return (
              <Card key={emp.id} className="cursor-pointer" onClick={() => setSelectedEmployee({ id: emp.id, name: emp.name })}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={emp.photo_url || undefined} />
                      <AvatarFallback className="text-xs bg-muted">
                        {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{emp.name}</p>
                      {emp.position && <p className="text-xs text-muted-foreground truncate">{emp.position}</p>}
                    </div>
                    <Badge className={cn('text-[10px] shrink-0', cfg.className)}>
                      {cfg.dot && <span className="relative flex h-1.5 w-1.5 mr-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" /></span>}
                      {cfg.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span>Entrada: {clockIn ? format(new Date(clockIn.recorded_at), 'HH:mm') : '—'}</span>
                      <span>Saída: {clockOut ? format(new Date(clockOut.recorded_at), 'HH:mm') : '—'}</span>
                    </div>
                    <span className="font-medium text-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {records.length > 0 ? formatMinutes(worked) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-end gap-1 pt-1 border-t" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedEmployee({ id: emp.id, name: emp.name })}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setManualEmployee({ id: emp.id, name: emp.name })}>
                      <PenLine className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Funcionário</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Entrada</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Intervalo</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Saída</th>
                    <th className="text-left px-4 py-3 font-medium">Trabalhado</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const records = getRecordsForEmployee(emp.id);
                    const status = getEmployeeStatus(emp.id);
                    const cfg = STATUS_CONFIG[status];
                    const clockIn = records.find(r => r.type === 'clock_in');
                    const clockOut = records.find(r => r.type === 'clock_out');
                    const breakStart = records.find(r => r.type === 'break_start');
                    const breakEnd = records.find(r => r.type === 'break_end');
                    const { worked } = calculateWorkedMinutes(records);

                    return (
                      <tr key={emp.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedEmployee({ id: emp.id, name: emp.name })}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={emp.photo_url || undefined} />
                              <AvatarFallback className="text-xs bg-muted">
                                {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <span className="font-medium truncate max-w-[150px] block">{emp.name}</span>
                              {emp.position && <span className="text-xs text-muted-foreground">{emp.position}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">{clockIn ? format(new Date(clockIn.recorded_at), 'HH:mm') : '—'}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {breakStart && breakEnd
                            ? `${format(new Date(breakStart.recorded_at), 'HH:mm')} – ${format(new Date(breakEnd.recorded_at), 'HH:mm')}`
                            : breakStart ? `Em intervalo desde ${format(new Date(breakStart.recorded_at), 'HH:mm')}` : '—'}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">{clockOut ? format(new Date(clockOut.recorded_at), 'HH:mm') : '—'}</td>
                        <td className="px-4 py-3">{records.length > 0 ? formatMinutes(worked) : '—'}</td>
                        <td className="px-4 py-3">
                          <Badge className={cn('text-xs gap-1', cfg.className)}>
                            {cfg.dot && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-white" /></span>}
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedEmployee({ id: emp.id, name: emp.name })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setManualEmployee({ id: emp.id, name: emp.name })}>
                              <PenLine className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <TimeDayDetailModal
        open={!!selectedEmployee}
        onOpenChange={() => setSelectedEmployee(null)}
        employeeId={selectedEmployee?.id || null}
        employeeName={selectedEmployee?.name || ''}
        date={today}
      />
      <ManualPunchModal
        open={!!manualEmployee}
        onOpenChange={() => setManualEmployee(null)}
        employeeId={manualEmployee?.id || ''}
        employeeName={manualEmployee?.name || ''}
        onSubmit={async (data) => {
          await registerManualPunch.mutateAsync(data);
          setManualEmployee(null);
        }}
      />
    </div>
  );
}

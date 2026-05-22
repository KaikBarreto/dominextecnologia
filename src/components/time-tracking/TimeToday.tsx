import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserX, Coffee, CheckCircle2, Eye, PenLine, Clock } from 'lucide-react';
import { useAdminTimeSheet, calculateWorkedMinutes, formatMinutes } from '@/hooks/useTimeRecords';
import { TimeDayDetailModal } from './TimeDayDetailModal';
import { ManualPunchModal } from './ManualPunchModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <StatCarousel items={[]} loading />
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      </div>
    );
  }

  const statItems = [
    { key: 'present', label: 'Presentes', count: kpis.present, icon: <Users className="h-4 w-4" />, accentColor: 'hsl(var(--success))' },
    { key: 'absent', label: 'Ausentes', count: kpis.absent, icon: <UserX className="h-4 w-4" />, accentColor: 'hsl(var(--muted-foreground))' },
    { key: 'onBreak', label: 'Em intervalo', count: kpis.onBreak, icon: <Coffee className="h-4 w-4" />, accentColor: 'hsl(var(--warning))' },
    { key: 'finished', label: 'Concluídos', count: kpis.finished, icon: <CheckCircle2 className="h-4 w-4" />, accentColor: 'hsl(var(--info))' },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <StatCarousel items={statItems} />

      {/* Employees */}
      {isMobile ? (
        employees.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-12 w-12" />}
            title="Nenhum funcionário cadastrado"
            description="Cadastre funcionários para acompanhar o ponto do dia."
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {employees.map(emp => {
              const records = getRecordsForEmployee(emp.id);
              const status = getEmployeeStatus(emp.id);
              const cfg = STATUS_CONFIG[status];
              const clockIn = records.find(r => r.type === 'clock_in');
              const clockOut = records.find(r => r.type === 'clock_out');
              const { worked } = calculateWorkedMinutes(records);

              const itemActions: ItemAction[] = [
                {
                  key: 'view',
                  label: 'Ver detalhes',
                  icon: <Eye className="h-4 w-4" />,
                  onClick: () => setSelectedEmployee({ id: emp.id, name: emp.name }),
                },
                {
                  key: 'manual',
                  label: 'Registro manual',
                  icon: <PenLine className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => setManualEmployee({ id: emp.id, name: emp.name }),
                },
              ];

              const subtitleParts: string[] = [];
              subtitleParts.push(`Entrada ${clockIn ? format(new Date(clockIn.recorded_at), 'HH:mm') : '—'}`);
              subtitleParts.push(`Saída ${clockOut ? format(new Date(clockOut.recorded_at), 'HH:mm') : '—'}`);
              subtitleParts.push(records.length > 0 ? formatMinutes(worked) : '—');

              return (
                <MobileListItem
                  key={emp.id}
                  onClick={() => setSelectedEmployee({ id: emp.id, name: emp.name })}
                  actions={itemActions}
                  leading={
                    <Avatar className="h-10 w-10">
                      <SignedAvatarImage src={emp.photo_url} alt={emp.name} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                        {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  }
                  title={emp.name}
                  subtitle={subtitleParts.join(' • ')}
                  trailing={
                    <Badge className={cn('text-[10px] shrink-0 whitespace-nowrap', cfg.className)}>
                      {cfg.dot && (
                        <span className="relative flex h-1.5 w-1.5 mr-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                        </span>
                      )}
                      {cfg.label}
                    </Badge>
                  }
                />
              );
            })}
          </div>
        )
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
                              <SignedAvatarImage src={emp.photo_url} />
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

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { useTimeHistory, formatMinutes, type TimeSheet } from '@/hooks/useTimeRecords';
import { useAdminTimeSheet } from '@/hooks/useTimeRecords';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportToCSV } from '@/utils/exportTimesheets';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: 'Em andamento', className: 'bg-info text-white' },
  complete: { label: 'Completo', className: 'bg-success text-white' },
  incomplete: { label: 'Incompleto', className: 'bg-warning text-white' },
  justified: { label: 'Justificado', className: 'bg-muted text-muted-foreground' },
  holiday: { label: 'Feriado', className: 'bg-muted text-muted-foreground' },
  day_off: { label: 'Folga', className: 'bg-muted text-muted-foreground' },
};

export function TimeHistory() {
  const { employees } = useAdminTimeSheet();
  const isMobile = useIsMobile();
  const [employeeId, setEmployeeId] = useState('all');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: sheets = [], isLoading } = useTimeHistory({
    employeeId: employeeId !== 'all' ? employeeId : undefined,
    startDate,
    endDate,
    status: statusFilter,
  });

  const getName = (empId: string | null) => employees.find(e => e.id === empId)?.name || '—';

  const totals = useMemo(() => {
    const totalExpected = sheets.reduce((s, sh) => s + (sh.expected_min || 0), 0);
    const totalWorked = sheets.reduce((s, sh) => s + (sh.total_worked_min || 0), 0);
    return { totalExpected, totalWorked, balance: totalWorked - totalExpected };
  }, [sheets]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3">
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className="col-span-2 sm:w-[200px]"><SelectValue placeholder="Funcionário" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="sm:w-[160px]" />
        <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="sm:w-[160px]" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="complete">Completo</SelectItem>
            <SelectItem value="incomplete">Incompleto</SelectItem>
            <SelectItem value="justified">Justificado</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => exportToCSV(sheets, employees)}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      {/* Content */}
      {isMobile ? (
        <div className="space-y-3">
          {sheets.map(sh => {
            const stCfg = STATUS_LABELS[sh.status] || STATUS_LABELS.open;
            return (
              <Card key={sh.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{getName(sh.employee_id)}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(sh.date + 'T12:00:00'), 'dd/MM/yyyy')}</p>
                    </div>
                    <Badge className={cn('text-[10px] shrink-0', stCfg.className)}>{stCfg.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex gap-3">
                      <span>Entrada: {sh.first_clock_in ? format(new Date(sh.first_clock_in), 'HH:mm') : '—'}</span>
                      <span>Saída: {sh.last_clock_out ? format(new Date(sh.last_clock_out), 'HH:mm') : '—'}</span>
                    </div>
                    <span className="font-medium text-foreground">{sh.total_worked_min != null ? formatMinutes(sh.total_worked_min) : '—'}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {sheets.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum registro encontrado</p>
          )}
          {sheets.length > 0 && (
            <Card>
              <CardContent className="p-3 flex flex-wrap gap-3 text-xs">
                <span>Esperado: <strong>{formatMinutes(totals.totalExpected)}</strong></span>
                <span>Trabalhado: <strong>{formatMinutes(totals.totalWorked)}</strong></span>
                <span className={cn('font-semibold', totals.balance >= 0 ? 'text-success' : 'text-destructive')}>
                  Saldo: {totals.balance >= 0 ? '+' : ''}{formatMinutes(totals.balance)}
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Data</th>
                    <th className="text-left px-4 py-3 font-medium">Funcionário</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Entrada</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Saída</th>
                    <th className="text-left px-4 py-3 font-medium">Trabalhado</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Saldo</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map(sh => {
                    const stCfg = STATUS_LABELS[sh.status] || STATUS_LABELS.open;
                    return (
                      <tr key={sh.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3">{format(new Date(sh.date + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                        <td className="px-4 py-3 font-medium">{getName(sh.employee_id)}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">{sh.first_clock_in ? format(new Date(sh.first_clock_in), 'HH:mm') : '—'}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">{sh.last_clock_out ? format(new Date(sh.last_clock_out), 'HH:mm') : '—'}</td>
                        <td className="px-4 py-3">{sh.total_worked_min != null ? formatMinutes(sh.total_worked_min) : '—'}</td>
                        <td className={cn('px-4 py-3 hidden md:table-cell font-medium', (sh.balance_min ?? 0) >= 0 ? 'text-success' : 'text-destructive')}>
                          {sh.balance_min != null ? `${sh.balance_min >= 0 ? '+' : ''}${formatMinutes(sh.balance_min)}` : '—'}
                        </td>
                        <td className="px-4 py-3"><Badge className={cn('text-xs', stCfg.className)}>{stCfg.label}</Badge></td>
                      </tr>
                    );
                  })}
                  {sheets.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {sheets.length > 0 && (
              <div className="border-t px-4 py-3 flex flex-wrap gap-4 text-sm">
                <span>Esperado: <strong>{formatMinutes(totals.totalExpected)}</strong></span>
                <span>Trabalhado: <strong>{formatMinutes(totals.totalWorked)}</strong></span>
                <span className={cn('font-semibold', totals.balance >= 0 ? 'text-success' : 'text-destructive')}>
                  Saldo: {totals.balance >= 0 ? '+' : ''}{formatMinutes(totals.balance)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

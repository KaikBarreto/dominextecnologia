import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Download, Eye, Calendar as CalendarIcon } from 'lucide-react';
import { useTimeHistory, formatMinutes, type TimeSheet } from '@/hooks/useTimeRecords';
import { useAdminTimeSheet } from '@/hooks/useTimeRecords';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportToCSV } from '@/utils/exportTimesheets';
import { TimeDayDetailModal } from './TimeDayDetailModal';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailSheet, setDetailSheet] = useState<{ employeeId: string; employeeName: string; date: string } | null>(null);
  const { preset, range, setPreset, setRange } = useDateRangeFilter('this_month');

  const startDate = range.from ? format(range.from, 'yyyy-MM-dd') : undefined;
  const endDate = range.to ? format(range.to, 'yyyy-MM-dd') : undefined;

  const { data: sheets = [] } = useTimeHistory({
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

  const handleViewDetail = (sh: TimeSheet) => {
    const name = getName(sh.employee_id);
    setDetailSheet({ employeeId: sh.employee_id || '', employeeName: name, date: sh.date });
  };

  const activeFilterCount =
    (employeeId !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (preset !== 'this_month' ? 1 : 0);

  const clearFilters = () => {
    setEmployeeId('all');
    setStatusFilter('all');
    setPreset('this_month');
  };

  // ----------------------------------------------------------------
  // Filtros — versão desktop (inline) vs mobile (sheet)
  // ----------------------------------------------------------------
  const filtersBody = (
    <>
      <div className="space-y-2">
        <Label className={cn('text-xs', !isMobile && 'sr-only')}>Funcionário</Label>
        <Select value={employeeId} onValueChange={setEmployeeId}>
          <SelectTrigger className={cn(!isMobile && 'sm:w-[200px]')}>
            <SelectValue placeholder="Funcionário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className={cn('text-xs', !isMobile && 'sr-only')}>Período</Label>
        <DateRangeFilter value={range} preset={preset} onPresetChange={setPreset} onRangeChange={setRange} />
      </div>
      <div className="space-y-2">
        <Label className={cn('text-xs', !isMobile && 'sr-only')}>Status</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={cn(!isMobile && 'sm:w-[160px]')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="complete">Completo</SelectItem>
            <SelectItem value="incomplete">Incompleto</SelectItem>
            <SelectItem value="justified">Justificado</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      {isMobile ? (
        <div className="flex items-center justify-between gap-2">
          <FilterSheet activeCount={activeFilterCount} onClear={clearFilters}>
            {filtersBody}
          </FilterSheet>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9"
            onClick={() => exportToCSV(sheets, employees)}
            disabled={sheets.length === 0}
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end flex-wrap">
          {filtersBody}
          <Button variant="outline" size="sm" className="gap-2 sm:self-end sm:mb-0.5" onClick={() => exportToCSV(sheets, employees)}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      )}

      {/* Totals summary (mobile = sticky top compact, desktop = bottom of card) */}
      {isMobile && sheets.length > 0 && (
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

      {/* Content */}
      {isMobile ? (
        sheets.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon className="h-12 w-12" />}
            title="Nenhum registro encontrado"
            description="Ajuste os filtros para visualizar registros de outro período."
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {sheets.map(sh => {
              const stCfg = STATUS_LABELS[sh.status] || STATUS_LABELS.open;
              const itemActions: ItemAction[] = [
                {
                  key: 'view',
                  label: 'Ver detalhes',
                  icon: <Eye className="h-4 w-4" />,
                  onClick: () => handleViewDetail(sh),
                },
              ];

              const subtitleParts: string[] = [];
              subtitleParts.push(`Entrada ${sh.first_clock_in ? format(new Date(sh.first_clock_in), 'HH:mm') : '—'}`);
              subtitleParts.push(`Saída ${sh.last_clock_out ? format(new Date(sh.last_clock_out), 'HH:mm') : '—'}`);
              subtitleParts.push(sh.total_worked_min != null ? formatMinutes(sh.total_worked_min) : '—');

              return (
                <MobileListItem
                  key={sh.id}
                  onClick={() => handleViewDetail(sh)}
                  actions={itemActions}
                  title={
                    <div className="flex items-baseline gap-2">
                      <span className="truncate">{getName(sh.employee_id)}</span>
                      <span className="text-xs font-normal text-muted-foreground shrink-0">
                        {format(new Date(sh.date + 'T12:00:00'), 'dd/MM')}
                      </span>
                    </div>
                  }
                  subtitle={subtitleParts.join(' • ')}
                  trailing={
                    <Badge className={cn('text-[10px] shrink-0 whitespace-nowrap', stCfg.className)}>
                      {stCfg.label}
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
                    <th className="text-left px-4 py-3 font-medium">Data</th>
                    <th className="text-left px-4 py-3 font-medium">Funcionário</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Entrada</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Saída</th>
                    <th className="text-left px-4 py-3 font-medium">Trabalhado</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Saldo</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Ações</th>
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
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetail(sh)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {sheets.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>
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

      <TimeDayDetailModal
        open={!!detailSheet}
        onOpenChange={() => setDetailSheet(null)}
        employeeId={detailSheet?.employeeId || null}
        employeeName={detailSheet?.employeeName || ''}
        date={detailSheet?.date || format(new Date(), 'yyyy-MM-dd')}
      />
    </div>
  );
}

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Download, Eye, Clock } from 'lucide-react';
import { useTimeHistory, formatMinutes, type TimeSheet } from '@/hooks/useTimeRecords';
import { useAdminTimeSheet } from '@/hooks/useTimeRecords';
import { useIsMobile } from '@/hooks/use-mobile';
import { exportToCSV } from '@/utils/exportTimesheets';
import { TimeDayDetailModal } from './TimeDayDetailModal';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { useTableSort } from '@/hooks/useTableSort';
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
  // Filtros multi-select: vazio = "todos" (mostra tudo). Mobile e desktop usam FilterCheckboxGroup.
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [detailSheet, setDetailSheet] = useState<{ employeeId: string; employeeName: string; date: string } | null>(null);
  const { preset, range, setPreset, setRange } = useDateRangeFilter('this_month');

  const startDate = range.from ? format(range.from, 'yyyy-MM-dd') : undefined;
  const endDate = range.to ? format(range.to, 'yyyy-MM-dd') : undefined;

  // Hook não suporta arrays: trazemos por período/employee único (quando 1 selecionado)
  // e filtramos multi-select client-side. Em single-select desktop, server-side equivalente.
  const { data: rawSheets = [] } = useTimeHistory({
    employeeId: employeeIds.length === 1 ? employeeIds[0] : undefined,
    startDate,
    endDate,
    status: statusFilter.length === 1 ? statusFilter[0] : undefined,
  });

  const sheets = useMemo(() => {
    return rawSheets.filter(sh => {
      if (employeeIds.length > 1 && (!sh.employee_id || !employeeIds.includes(sh.employee_id))) return false;
      if (statusFilter.length > 1 && !statusFilter.includes(sh.status)) return false;
      return true;
    });
  }, [rawSheets, employeeIds, statusFilter]);

  const getName = (empId: string | null) => employees.find(e => e.id === empId)?.name || '—';

  // Pré-calcula campos derivados pra alimentar o useTableSort: nome do funcionário,
  // timestamps absolutos pra horário (ordenar como número), etc. O hook usa
  // `localeCompare` em strings, `aVal - bVal` em números — então convertemos.
  const sheetsForSort = useMemo(() => {
    return sheets.map(sh => ({
      ...sh,
      _employee_name: getName(sh.employee_id),
      _date_ts: new Date(sh.date + 'T12:00:00').getTime(),
      _in_ts: sh.first_clock_in ? new Date(sh.first_clock_in).getTime() : 0,
      _out_ts: sh.last_clock_out ? new Date(sh.last_clock_out).getTime() : 0,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, employees]);

  const { sortedItems, sortConfig, handleSort } = useTableSort(sheetsForSort, '_date_ts', 'desc');

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
    (employeeIds.length > 0 ? 1 : 0) +
    (statusFilter.length > 0 ? 1 : 0) +
    (preset !== 'this_month' ? 1 : 0);

  const clearFilters = () => {
    setEmployeeIds([]);
    setStatusFilter([]);
    setPreset('this_month');
  };

  // ----------------------------------------------------------------
  // Filtros — multi-select (FilterCheckboxGroup) tanto no mobile quanto desktop.
  // Vazio = mostra tudo; marcar 1+ filtra. Mesmo estado array em ambos os modos.
  // ----------------------------------------------------------------
  const filtersBody = (
    <>
      <FilterCheckboxGroup
        label="Funcionário"
        selected={employeeIds}
        onChange={setEmployeeIds}
        emptyLabel="Todos"
        options={employees.map(e => ({ value: e.id, label: e.name }))}
      />
      <div className="space-y-2">
        <Label className="text-xs">Período</Label>
        <DateRangeFilter value={range} preset={preset} onPresetChange={setPreset} onRangeChange={setRange} />
      </div>
      <FilterCheckboxGroup
        label="Status"
        selected={statusFilter}
        onChange={setStatusFilter}
        emptyLabel="Todos"
        options={[
          { value: 'complete', label: 'Completo' },
          { value: 'incomplete', label: 'Incompleto' },
          { value: 'justified', label: 'Justificado' },
        ]}
      />
    </>
  );

  return (
    <div className="space-y-4">
      {/* Filtros: mobile mantém FilterSheet (multi-select via checkbox); desktop
          consolida tudo num FilterButton standard (pattern sistema-wide v1.9.9). */}
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {sheets.length} registro{sheets.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <FilterButton activeCount={activeFilterCount} onClear={clearFilters}>
              {filtersBody}
            </FilterButton>
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
            size="compact"
            icon={<Clock className="h-10 w-10" />}
            title="Nenhum registro de ponto"
            description={
              activeFilterCount > 0
                ? 'Ajuste os filtros para visualizar registros de outro período.'
                : 'Ainda não há registros de ponto no período.'
            }
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="_date_ts" sortConfig={sortConfig} onSort={handleSort}>Data</SortableTableHead>
                    <SortableTableHead sortKey="_employee_name" sortConfig={sortConfig} onSort={handleSort}>Funcionário</SortableTableHead>
                    <SortableTableHead sortKey="_in_ts" sortConfig={sortConfig} onSort={handleSort} className="hidden sm:table-cell">Entrada</SortableTableHead>
                    <SortableTableHead sortKey="_out_ts" sortConfig={sortConfig} onSort={handleSort} className="hidden sm:table-cell">Saída</SortableTableHead>
                    <SortableTableHead sortKey="total_worked_min" sortConfig={sortConfig} onSort={handleSort}>Trabalhado</SortableTableHead>
                    <SortableTableHead sortKey="balance_min" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">Saldo</SortableTableHead>
                    <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="text-right">Ações</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map(sh => {
                    const stCfg = STATUS_LABELS[sh.status] || STATUS_LABELS.open;
                    return (
                      <TableRow key={sh.id} className="hover:bg-muted/30">
                        <TableCell>{format(new Date(sh.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="font-medium">{sh._employee_name}</TableCell>
                        <TableCell className="hidden sm:table-cell">{sh.first_clock_in ? format(new Date(sh.first_clock_in), 'HH:mm') : '—'}</TableCell>
                        <TableCell className="hidden sm:table-cell">{sh.last_clock_out ? format(new Date(sh.last_clock_out), 'HH:mm') : '—'}</TableCell>
                        <TableCell>{sh.total_worked_min != null ? formatMinutes(sh.total_worked_min) : '—'}</TableCell>
                        <TableCell className={cn('hidden md:table-cell font-medium', (sh.balance_min ?? 0) >= 0 ? 'text-success' : 'text-destructive')}>
                          {sh.balance_min != null ? `${sh.balance_min >= 0 ? '+' : ''}${formatMinutes(sh.balance_min)}` : '—'}
                        </TableCell>
                        <TableCell><Badge className={cn('text-xs', stCfg.className)}>{stCfg.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetail(sh)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sortedItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0">
                        <EmptyState
                          size="compact"
                          icon={<Clock className="h-10 w-10" />}
                          title="Nenhum registro de ponto"
                          description={
                            activeFilterCount > 0
                              ? 'Ajuste os filtros para visualizar registros de outro período.'
                              : 'Ainda não há registros de ponto no período.'
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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

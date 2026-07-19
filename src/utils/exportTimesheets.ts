import type { TimeSheet } from '@/hooks/useTimeRecords';
import { formatMinutes } from '@/hooks/useTimeRecords';
import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';

export function exportToCSV(
  sheets: TimeSheet[],
  employees: { id: string; name: string }[],
  locale: LocaleCode = 'pt-br',
) {
  const t = MESSAGES[locale].app.employees.timesheetsGenerator;
  const bcp47 = locale === 'pt-br' ? 'pt-BR' : locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'fr-FR';

  const getName = (empId: string | null) => employees.find(e => e.id === empId)?.name || empId || '—';

  const STATUS_LABELS: Record<string, string> = {
    open: t.statusOpen,
    complete: t.statusComplete,
    incomplete: t.statusIncomplete,
    justified: t.statusJustified,
    holiday: t.statusHoliday,
    day_off: t.statusDayOff,
  };

  const header = [
    t.csvColEmployee, t.csvColDate, t.csvColWeekday, t.csvColClockIn, t.csvColClockOut,
    t.csvColWorked, t.csvColBreak, t.csvColBalance, t.csvColStatus,
  ].join(';');

  const rows = sheets.map(s => {
    const d = new Date(s.date + 'T12:00:00');
    const weekday = d.toLocaleDateString(bcp47, { weekday: 'long', timeZone: 'America/Sao_Paulo' });
    const dateStr = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    return [
      getName(s.employee_id),
      dateStr,
      weekday,
      s.first_clock_in ? new Date(s.first_clock_in).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—',
      s.last_clock_out ? new Date(s.last_clock_out).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—',
      s.total_worked_min != null ? formatMinutes(s.total_worked_min) : '—',
      s.total_break_min != null ? formatMinutes(s.total_break_min) : '—',
      s.balance_min != null ? formatMinutes(s.balance_min) : '—',
      STATUS_LABELS[s.status] || s.status,
    ].join(';');
  });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const csv = '﻿' + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `controle-ponto-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

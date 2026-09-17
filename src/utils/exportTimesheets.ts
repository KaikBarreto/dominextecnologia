import type { TimeSheet } from '@/hooks/useTimeRecords';
import { formatMinutes } from '@/hooks/useTimeRecords';
import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import { safeTimeZone, timeInTz, todayInTz, zonedDateTimeToUtc } from '@/lib/ponto/timezone';

/**
 * Exporta o espelho de ponto em CSV.
 *
 * `timeZone` é o fuso da EMPRESA (`useAppLocaleContext().timezone`). Util não
 * chama hook, então quem chama passa por parâmetro. Vazio ou inválido cai em
 * America/Sao_Paulo.
 */
export function exportToCSV(
  sheets: TimeSheet[],
  employees: { id: string; name: string }[],
  locale: LocaleCode = 'pt-br',
  timeZone?: string | null,
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

  // Fuso da empresa, já validado: cada linha do CSV é documento de jornada e
  // tem que sair no relógio da empresa, não no de quem exportou. Antes as
  // quatro conversões abaixo estavam chumbadas em America/Sao_Paulo.
  const tz = safeTimeZone(timeZone);

  const rows = sheets.map(s => {
    // Meio-dia DO DIA DA EMPRESA: instante seguro pra formatar dia da semana e
    // data sem risco de escorregar um dia. Com `s.date + 'T12:00:00'` o meio-dia
    // era o do aparelho, e entre fusos distantes virava o dia vizinho.
    const d = new Date(zonedDateTimeToUtc(s.date, '12:00', tz));
    const weekday = d.toLocaleDateString(bcp47, { weekday: 'long', timeZone: tz });
    const dateStr = d.toLocaleDateString('pt-BR', { timeZone: tz });
    return [
      getName(s.employee_id),
      dateStr,
      weekday,
      s.first_clock_in ? timeInTz(s.first_clock_in, tz) : '—',
      s.last_clock_out ? timeInTz(s.last_clock_out, tz) : '—',
      s.total_worked_min != null ? formatMinutes(s.total_worked_min) : '—',
      s.total_break_min != null ? formatMinutes(s.total_break_min) : '—',
      s.balance_min != null ? formatMinutes(s.balance_min) : '—',
      STATUS_LABELS[s.status] || s.status,
    ].join(';');
  });

  // Data no nome do arquivo: dia da EMPRESA, o mesmo que o painel e as batidas
  // usam. Antes estava chumbado em America/Sao_Paulo.
  const today = todayInTz(tz);
  const csv = '﻿' + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `controle-ponto-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

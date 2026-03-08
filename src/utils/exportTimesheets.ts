import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TimeSheet } from '@/hooks/useTimeRecords';
import { formatMinutes } from '@/hooks/useTimeRecords';

const STATUS_LABELS: Record<string, string> = {
  open: 'Em andamento',
  complete: 'Completo',
  incomplete: 'Incompleto',
  justified: 'Justificado',
  holiday: 'Feriado',
  day_off: 'Folga',
};

export function exportToCSV(
  sheets: TimeSheet[],
  profiles: { user_id: string; full_name: string }[],
) {
  const getName = (uid: string) => profiles.find(p => p.user_id === uid)?.full_name || uid;

  const header = [
    'Funcionário', 'Data', 'Dia da semana', 'Entrada', 'Saída',
    'Trabalhado', 'Intervalo', 'Saldo', 'Status',
  ].join(';');

  const rows = sheets.map(s => {
    const d = new Date(s.date + 'T12:00:00');
    return [
      getName(s.user_id),
      format(d, 'dd/MM/yyyy'),
      format(d, 'EEEE', { locale: ptBR }),
      s.first_clock_in ? format(new Date(s.first_clock_in), 'HH:mm') : '—',
      s.last_clock_out ? format(new Date(s.last_clock_out), 'HH:mm') : '—',
      s.total_worked_min != null ? formatMinutes(s.total_worked_min) : '—',
      s.total_break_min != null ? formatMinutes(s.total_break_min) : '—',
      s.balance_min != null ? formatMinutes(s.balance_min) : '—',
      STATUS_LABELS[s.status] || s.status,
    ].join(';');
  });

  const csv = '\uFEFF' + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `controle-ponto-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

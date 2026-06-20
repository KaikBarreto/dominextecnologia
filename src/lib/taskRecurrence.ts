import { addDays, addWeeks, addMonths, format } from 'date-fns';

/**
 * Recorrência de tarefas (entry_type='tarefa' em service_orders).
 *
 * Fonte única da geração de datas de uma série, reutilizada tanto na CRIAÇÃO
 * (Schedule.handleTaskSubmit) quanto na EDIÇÃO "esta e as futuras". A próxima
 * onda (aba Tarefas do cliente) também deve consumir daqui — não duplicar.
 *
 * Datas são manipuladas ancoradas ao meio-dia local (`T12:00:00`) e formatadas
 * com `yyyy-MM-dd`, evitando que o fuso (America/Sao_Paulo, UTC-3) empurre a
 * data um dia pra trás na conversão. O armazenamento é só a data (sem hora),
 * então isso mantém o dia correto na agenda.
 */

export interface RecurrenceSpec {
  /** 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom' */
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  /** yyyy-MM-dd — data limite (inclusive) da série. */
  recurrence_end_date?: string | null;
  /** dias da semana (0=domingo..6=sábado), só para 'custom'. */
  recurrence_weekdays?: number[] | null;
}

const anchor = (date: string) => new Date(`${date}T12:00:00`);

/**
 * Gera todas as datas (yyyy-MM-dd) de uma série a partir de `startDate` (inclusive)
 * até `recurrence_end_date`. Sem recorrência ou sem data-final, retorna só a
 * própria `startDate`.
 */
export function generateRecurrenceDates(startDate: string, spec: RecurrenceSpec): string[] {
  const base = startDate;
  const dates: string[] = [base];

  if (!spec.recurrence_type || !spec.recurrence_end_date) {
    return dates;
  }

  const endDate = anchor(spec.recurrence_end_date);
  const interval = spec.recurrence_interval || 1;

  if (spec.recurrence_type === 'custom' && spec.recurrence_weekdays && spec.recurrence_weekdays.length > 0) {
    let current = addDays(anchor(base), 1);
    while (current <= endDate) {
      if (spec.recurrence_weekdays.includes(current.getDay())) {
        dates.push(format(current, 'yyyy-MM-dd'));
      }
      current = addDays(current, 1);
    }
    return dates;
  }

  let current = anchor(base);
  while (true) {
    if (spec.recurrence_type === 'daily') current = addDays(current, interval);
    else if (spec.recurrence_type === 'weekly') current = addWeeks(current, interval);
    else if (spec.recurrence_type === 'biweekly') current = addWeeks(current, 2 * interval);
    else if (spec.recurrence_type === 'monthly') current = addMonths(current, interval);
    else if (spec.recurrence_type === 'yearly') current = addMonths(current, 12 * interval);
    else break;
    if (current > endDate) break;
    dates.push(format(current, 'yyyy-MM-dd'));
  }

  return dates;
}

import { endOfMonth, format, isSameDay, isSameMonth, isSameYear, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PeriodRange {
  from?: Date;
  to?: Date;
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);

export function formatDrePeriodLabel(range?: PeriodRange): string {
  if (range?.from && range.to) {
    const coversWholeMonths = isSameDay(range.from, startOfMonth(range.from))
      && isSameDay(range.to, endOfMonth(range.to));
    if (coversWholeMonths) {
      if (isSameMonth(range.from, range.to)) {
        return capitalize(format(range.from, "MMMM 'de' yyyy", { locale: ptBR }));
      }
      if (isSameYear(range.from, range.to)) {
        return `${capitalize(format(range.from, 'MMMM', { locale: ptBR }))} a ${format(range.to, "MMMM 'de' yyyy", { locale: ptBR })}`;
      }
      return `${capitalize(format(range.from, "MMMM 'de' yyyy", { locale: ptBR }))} a ${format(range.to, "MMMM 'de' yyyy", { locale: ptBR })}`;
    }
    return `${format(range.from, 'dd/MM/yyyy')} a ${format(range.to, 'dd/MM/yyyy')}`;
  }
  if (range?.from) return `A partir de ${format(range.from, 'dd/MM/yyyy')}`;
  if (range?.to) return `Até ${format(range.to, 'dd/MM/yyyy')}`;
  return 'Todo o histórico';
}

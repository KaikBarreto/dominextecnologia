import { useEffect, useMemo, useState } from 'react';
import { isSameMonth } from 'date-fns';

import { DatePicker, parseIsoDate, type DatePickerProps } from '@/components/ui/DatePicker';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useScheduleCalendarIndicators } from '@/hooks/useScheduleCalendarIndicators';
import { MESSAGES } from '@/lib/i18n/messages';

type ScheduleDatePickerProps = DatePickerProps & {
  /** Ao editar, a própria OS/tarefa não deve aparecer como conflito visual. */
  excludeServiceOrderId?: string | null;
  /** Restringe os marcadores aos atendimentos do cliente selecionado. */
  customerId?: string | null;
  /** Identifica no texto do marcador os atendimentos dos equipamentos escolhidos. */
  equipmentIds?: string[];
  /** Abre neste mês quando ainda não há data escolhida. */
  referenceDate?: string;
};

function countLabel(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural.replace('{count}', String(count));
}

/**
 * DatePicker operacional com visão resumida da agenda. Use somente para a data
 * em que um atendimento/tarefa realmente acontecerá, nunca para vencimentos,
 * filtros, datas cadastrais ou limites de recorrência.
 */
export function ScheduleDatePicker({
  value,
  excludeServiceOrderId,
  customerId,
  equipmentIds = [],
  referenceDate,
  ...datePickerProps
}: ScheduleDatePickerProps) {
  const { locale } = useAppLocaleContext();
  const labels = MESSAGES[locale].app.common.datePicker;
  const selectedMonth = parseIsoDate(value);
  const referenceMonth = parseIsoDate(referenceDate ?? '');
  const [visibleMonth, setVisibleMonth] = useState(() => selectedMonth ?? referenceMonth ?? new Date());

  useEffect(() => {
    const nextMonth = parseIsoDate(value) ?? parseIsoDate(referenceDate ?? '');
    if (nextMonth) {
      setVisibleMonth((currentMonth) => isSameMonth(currentMonth, nextMonth) ? currentMonth : nextMonth);
    }
  }, [referenceDate, value]);

  const { data = [], isPending, isError } = useScheduleCalendarIndicators({
    month: visibleMonth,
    customerId,
    equipmentIds,
    excludeServiceOrderId,
  });

  const indicators = useMemo(() => data.flatMap((day) => {
    const result = [];
    if (day.hasContractOccurrence) {
      const matchesEquipment = day.contractOccurrenceEquipmentCount > 0;
      const count = matchesEquipment ? day.contractOccurrenceEquipmentCount : day.contractOccurrenceCount;
      result.push({
        date: day.date,
        color: 'amber' as const,
        label: matchesEquipment
          ? countLabel(count, labels.contractOccurrenceForEquipment, labels.contractOccurrencesForEquipment)
          : customerId
            ? countLabel(count, labels.contractOccurrenceForCustomer, labels.contractOccurrencesForCustomer)
            : countLabel(count, labels.contractOccurrence, labels.contractOccurrences),
      });
    }
    if (day.hasServiceOrder) {
      const matchesEquipment = day.serviceOrderEquipmentCount > 0;
      const count = matchesEquipment ? day.serviceOrderEquipmentCount : day.serviceOrderCount;
      result.push({
        date: day.date,
        color: 'blue' as const,
        label: matchesEquipment
          ? countLabel(count, labels.serviceOrderForEquipment, labels.serviceOrdersForEquipment)
          : customerId
            ? countLabel(count, labels.serviceOrderForCustomer, labels.serviceOrdersForCustomer)
            : countLabel(count, labels.serviceOrder, labels.serviceOrders),
      });
    }
    return result;
  }), [customerId, data, labels]);

  return (
    <DatePicker
      {...datePickerProps}
      value={value}
      initialMonth={referenceDate}
      indicators={indicators}
      indicatorLegend={[
        { color: 'amber', label: labels.contractOccurrence },
        { color: 'blue', label: labels.serviceOrder },
      ]}
      indicatorStatus={isError
        ? { type: 'error', label: labels.indicatorsError }
        : isPending
          ? { type: 'loading', label: labels.indicatorsLoading }
          : undefined}
      onVisibleMonthChange={setVisibleMonth}
    />
  );
}

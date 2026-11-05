import { useEffect, useMemo, useState } from 'react';

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
};

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
  ...datePickerProps
}: ScheduleDatePickerProps) {
  const { locale } = useAppLocaleContext();
  const labels = MESSAGES[locale].app.common.datePicker;
  const selectedMonth = parseIsoDate(value);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedMonth ?? new Date());

  useEffect(() => {
    const nextSelectedMonth = parseIsoDate(value);
    if (nextSelectedMonth) setVisibleMonth(nextSelectedMonth);
  }, [value]);

  const { data = [] } = useScheduleCalendarIndicators({
    month: visibleMonth,
    customerId,
    equipmentIds,
    excludeServiceOrderId,
  });

  const indicators = useMemo(() => data.flatMap((day) => {
    const result = [];
    if (day.hasContractOccurrence) {
      result.push({
        date: day.date,
        color: 'amber' as const,
        label: day.contractOccurrenceMatchesEquipment
          ? labels.contractOccurrenceForEquipment
          : customerId
            ? labels.contractOccurrenceForCustomer
            : labels.contractOccurrence,
      });
    }
    if (day.hasServiceOrder) {
      result.push({
        date: day.date,
        color: 'blue' as const,
        label: day.serviceOrderMatchesEquipment
          ? labels.serviceOrderForEquipment
          : customerId
            ? labels.serviceOrderForCustomer
            : labels.serviceOrder,
      });
    }
    return result;
  }), [customerId, data, labels]);

  return (
    <DatePicker
      {...datePickerProps}
      value={value}
      indicators={indicators}
      indicatorLegend={[
        { color: 'amber', label: labels.contractOccurrence },
        { color: 'blue', label: labels.serviceOrder },
      ]}
      onVisibleMonthChange={setVisibleMonth}
    />
  );
}

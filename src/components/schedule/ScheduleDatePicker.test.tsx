import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useIndicators = vi.fn();
const datePickerProps = vi.fn();

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/useScheduleCalendarIndicators', () => ({
  useScheduleCalendarIndicators: (options: unknown) => useIndicators(options),
}));

vi.mock('@/components/ui/DatePicker', () => ({
  parseIsoDate: (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return value ? new Date(year, month - 1, day) : undefined;
  },
  DatePicker: (props: unknown) => {
    datePickerProps(props);
    return <button type="button">Calendário</button>;
  },
}));

import { ScheduleDatePicker } from './ScheduleDatePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useIndicators.mockReturnValue({
    data: [
      {
        date: '2027-01-10',
        hasContractOccurrence: true,
        hasServiceOrder: true,
        contractOccurrenceMatchesEquipment: true,
        serviceOrderMatchesEquipment: false,
      },
      {
        date: '2027-01-11',
        hasContractOccurrence: false,
        hasServiceOrder: true,
        contractOccurrenceMatchesEquipment: false,
        serviceOrderMatchesEquipment: true,
      },
    ],
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('ScheduleDatePicker', () => {
  it('transforma dias ocupados em pontos distintos e exclui a própria OS', () => {
    act(() => {
      root.render(
        <ScheduleDatePicker
          value="2027-01-10"
          onValueChange={() => undefined}
          excludeServiceOrderId="os-atual"
          customerId="cliente-1"
          equipmentIds={['equipamento-1']}
        />,
      );
    });

    expect(useIndicators).toHaveBeenCalledWith(expect.objectContaining({
      excludeServiceOrderId: 'os-atual',
      customerId: 'cliente-1',
      equipmentIds: ['equipamento-1'],
    }));

    const props = datePickerProps.mock.calls.at(-1)?.[0] as {
      indicators: Array<{ date: string; color: string; label: string }>;
      indicatorLegend: Array<{ color: string; label: string }>;
    };

    expect(props.indicators).toEqual([
      { date: '2027-01-10', color: 'amber', label: 'Visita de contrato deste equipamento' },
      { date: '2027-01-10', color: 'blue', label: 'O.S. deste cliente' },
      { date: '2027-01-11', color: 'blue', label: 'O.S. deste equipamento' },
    ]);
    expect(props.indicatorLegend).toEqual([
      { color: 'amber', label: 'Visita de contrato' },
      { color: 'blue', label: 'O.S.' },
    ]);
  });
});

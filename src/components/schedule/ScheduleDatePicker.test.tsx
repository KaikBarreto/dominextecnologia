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
        contractOccurrenceCount: 3,
        serviceOrderCount: 2,
        contractOccurrenceEquipmentCount: 2,
        serviceOrderEquipmentCount: 0,
      },
      {
        date: '2027-01-11',
        hasContractOccurrence: false,
        hasServiceOrder: true,
        contractOccurrenceMatchesEquipment: false,
        serviceOrderMatchesEquipment: true,
        contractOccurrenceCount: 0,
        serviceOrderCount: 1,
        contractOccurrenceEquipmentCount: 0,
        serviceOrderEquipmentCount: 1,
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
      { date: '2027-01-10', color: 'amber', label: '2 visitas de contrato deste equipamento' },
      { date: '2027-01-10', color: 'blue', label: '2 O.S. deste cliente' },
      { date: '2027-01-11', color: 'blue', label: 'O.S. deste equipamento' },
    ]);
    expect(props.indicatorLegend).toEqual([
      { color: 'amber', label: 'Visita de contrato' },
      { color: 'blue', label: 'O.S.' },
    ]);
  });

  it('informa carregamento, falha e usa a data de referência como mês inicial', () => {
    useIndicators.mockReturnValue({ data: [], isPending: true, isError: false });

    act(() => {
      root.render(
        <ScheduleDatePicker
          value=""
          referenceDate="2028-04-12"
          onValueChange={() => undefined}
        />,
      );
    });

    let props = datePickerProps.mock.calls.at(-1)?.[0] as {
      initialMonth: string;
      indicatorStatus?: { type: string; label: string };
    };
    expect(props.initialMonth).toBe('2028-04-12');
    expect(props.indicatorStatus).toEqual({
      type: 'loading',
      label: 'Consultando os compromissos deste mês…',
    });

    useIndicators.mockReturnValue({ data: [], isPending: false, isError: true });
    act(() => {
      root.render(
        <ScheduleDatePicker
          value=""
          referenceDate="2028-04-12"
          onValueChange={() => undefined}
        />,
      );
    });

    props = datePickerProps.mock.calls.at(-1)?.[0] as typeof props;
    expect(props.indicatorStatus).toEqual({
      type: 'error',
      label: 'Não foi possível consultar a agenda. Confirme a data na tela Agenda antes de salvar.',
    });
  });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/DatePicker', () => ({
  DatePicker: ({ value, onValueChange }: { value: string; onValueChange: (value: string) => void }) => (
    <button
      type="button"
      data-testid="date-picker"
      data-value={value}
      onClick={() => onValueChange(value || '2026-01-20')}
    >
      {value || 'Escolher data'}
    </button>
  ),
}));

vi.mock('@/components/ui/TimePicker', () => ({
  TimePicker: ({ value, ariaLabel }: { value: string; ariaLabel: string }) => (
    <button type="button" aria-label={ariaLabel}>{value}</button>
  ),
}));

import { ServiceOrderSchedulePlanner } from './ServiceOrderSchedulePlanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = {
  period: 'Período',
  startDate: 'Início',
  endDate: 'Fim',
  dailyPlan: 'Jornadas',
  dailyPlanHelp: 'Ajuda',
  applyFirstToAll: 'Aplicar a todos',
  addDate: 'Adicionar outra data',
  addDay: 'Adicionar dia',
  removeDay: 'Remover este dia',
  scheduledDaySingular: 'dia',
  scheduledDayPlural: 'dias',
  startTime: 'Começa',
  endTime: 'Termina',
  invalidTimeRange: 'Intervalo inválido',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(plan: Array<{ date: string; time: string; duration_minutes: number }>, onChange: ReturnType<typeof vi.fn>) {
  act(() => {
    root.render(
      <ServiceOrderSchedulePlanner
        plan={plan}
        onChange={onChange}
        locale="pt-br"
        labels={labels}
      />,
    );
  });
}

function click(element: Element) {
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

describe('ServiceOrderSchedulePlanner — dias flexíveis', () => {
  it('remove um domingo no meio do período sem apagar os outros dias', () => {
    const onChange = vi.fn();
    render([
      { date: '2026-01-10', time: '08:00', duration_minutes: 120 },
      { date: '2026-01-11', time: '08:00', duration_minutes: 120 },
      { date: '2026-01-12', time: '08:00', duration_minutes: 120 },
    ], onChange);

    const removeButtons = Array.from(document.querySelectorAll('button[aria-label^="Remover este dia"]'));
    click(removeButtons[1]);

    expect(onChange).toHaveBeenCalledWith([
      { date: '2026-01-10', time: '08:00', duration_minutes: 120 },
      { date: '2026-01-12', time: '08:00', duration_minutes: 120 },
    ]);
  });

  it('adiciona uma data avulsa não consecutiva e mantém a ordem cronológica', () => {
    const onChange = vi.fn();
    render([
      { date: '2026-01-10', time: '08:00', duration_minutes: 120 },
      { date: '2026-01-12', time: '08:00', duration_minutes: 120 },
    ], onChange);

    click(document.querySelector('[data-testid="date-picker"][data-value=""]')!);
    click(Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Adicionar dia')!);

    expect(onChange).toHaveBeenCalledWith([
      { date: '2026-01-10', time: '08:00', duration_minutes: 120 },
      { date: '2026-01-12', time: '08:00', duration_minutes: 120 },
      { date: '2026-01-20', time: '08:00', duration_minutes: 120 },
    ]);
  });

  it('não permite remover o único dia da visita', () => {
    const onChange = vi.fn();
    render([{ date: '2026-01-10', time: '08:00', duration_minutes: 120 }], onChange);

    const remove = document.querySelector('button[aria-label^="Remover este dia"]') as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    click(remove);
    expect(onChange).not.toHaveBeenCalled();
  });
});

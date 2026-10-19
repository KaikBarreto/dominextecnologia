import { afterEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsCompact: () => false,
}));

vi.mock('@/components/ui/time-wheel', () => ({
  TimeWheel: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" data-testid="time-choice" onClick={() => onChange('16:45')}>
      16:45
    </button>
  ),
}));

import { TimePicker } from './TimePicker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('TimePicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = (ui: React.ReactElement) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(ui));
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('mostra horário em 24 horas sem usar o seletor nativo do navegador', () => {
    mount(<TimePicker value="15:30" onValueChange={() => {}} />);

    expect(container.querySelector('input[type="time"]')).toBeNull();
    expect(container.textContent).toContain('15:30');
  });

  it('só aplica a seleção da roleta quando o usuário conclui', () => {
    const onValueChange = vi.fn();
    mount(<TimePicker value="15:30" onValueChange={onValueChange} />);

    act(() => {
      (container.querySelector('button') as HTMLButtonElement).click();
    });
    act(() => {
      (document.querySelector('[data-testid="time-choice"]') as HTMLButtonElement).click();
    });
    expect(onValueChange).not.toHaveBeenCalled();

    const doneButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === 'Concluir') as HTMLButtonElement;
    act(() => doneButton.click());

    expect(onValueChange).toHaveBeenCalledWith('16:45');
  });
});

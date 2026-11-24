import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

import { TimeWheel } from './time-wheel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const pointerEvent = (
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  { clientY, pointerId = 1 }: { clientY: number; pointerId?: number },
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  return event;
};

describe('TimeWheel', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalScrollTo: typeof HTMLElement.prototype.scrollTo;

  beforeEach(() => {
    originalScrollTo = HTMLElement.prototype.scrollTo;
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value(options: ScrollToOptions) {
        this.scrollTop = options.top ?? 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: originalScrollTo,
    });
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
    vi.useRealTimers();
  });

  it('permite segurar e arrastar a coluna para escolher outro número', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    act(() => {
      root.render(<TimeWheel value="09:00" onChange={onChange} />);
    });

    const hours = container.querySelector('[role="listbox"][aria-label="Horas"]') as HTMLElement;
    expect(hours.scrollTop).toBe(9 * 40);

    act(() => {
      hours.dispatchEvent(pointerEvent('pointerdown', { clientY: 120 }));
      hours.dispatchEvent(pointerEvent('pointermove', { clientY: 40 }));
      hours.dispatchEvent(pointerEvent('pointerup', { clientY: 40 }));
    });

    expect(onChange).toHaveBeenLastCalledWith('11:00');
    expect(hours.scrollTop).toBe(11 * 40);
  });

  it('mantém a seleção por clique em um número', () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<TimeWheel value="09:00" onChange={onChange} />);
    });

    const hours = container.querySelector('[role="listbox"][aria-label="Horas"]') as HTMLElement;
    const twelve = Array.from(hours.querySelectorAll('button')).find(
      (button) => button.textContent === '12',
    ) as HTMLButtonElement;
    act(() => twelve.click());

    expect(onChange).toHaveBeenLastCalledWith('12:00');
  });
});

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvScrollFadeContainer } from '@/components/pdv/PdvScrollFadeContainer';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PdvScrollFadeContainer', () => {
  it('leva a lista ao fim quando recebe uma nova adição', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const { container, rerender } = render(
      <PdvScrollFadeContainer>
        <div>Primeiro item</div>
      </PdvScrollFadeContainer>,
    );
    const viewport = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 200 },
    });
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;

    act(() => {
      rerender(
        <PdvScrollFadeContainer scrollToEndKey={1}>
          <div>Último item adicionado</div>
        </PdvScrollFadeContainer>,
      );
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
  });
});

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

  it('rola até a linha incrementada sem precisar mudar sua posição', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const scrollIntoView = vi.fn();

    const { getByText, rerender } = render(
      <PdvScrollFadeContainer>
        <div data-pdv-scroll-item="p1">Primeiro item</div>
        <div data-pdv-scroll-item="p2">Segundo item</div>
      </PdvScrollFadeContainer>,
    );
    const firstItem = getByText('Primeiro item');
    firstItem.scrollIntoView = scrollIntoView;

    act(() => {
      rerender(
        <PdvScrollFadeContainer scrollToEndKey={1} scrollToItemKey="p1">
          <div data-pdv-scroll-item="p1">Primeiro item</div>
          <div data-pdv-scroll-item="p2">Segundo item</div>
        </PdvScrollFadeContainer>,
      );
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(getByText('Primeiro item').compareDocumentPosition(getByText('Segundo item'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

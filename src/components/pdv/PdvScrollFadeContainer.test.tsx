import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvScrollFadeContainer } from '@/components/pdv/PdvScrollFadeContainer';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PdvScrollFadeContainer', () => {
  it('permite focar o viewport do carrinho por teclado com nome acessível', () => {
    const { getByRole } = render(<PdvScrollFadeContainer externalScrollbar><button>Editar material</button></PdvScrollFadeContainer>);
    const viewport = getByRole('region', { name: 'Materiais do pedido' });
    expect(viewport).toHaveAttribute('tabindex', '0');
    viewport.focus();
    expect(viewport).toHaveFocus();
    expect(viewport).toContainElement(getByRole('button', { name: 'Editar material' }));
  });
  it.each([false, true])('leva a lista ao fim com trilho externo=%s quando recebe uma nova adição', (externalScrollbar) => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const { container, rerender } = render(
      <PdvScrollFadeContainer externalScrollbar={externalScrollbar}>
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
        <PdvScrollFadeContainer externalScrollbar={externalScrollbar} scrollToEndKey={1}>
          <div>Último item adicionado</div>
        </PdvScrollFadeContainer>,
      );
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' });
  });

  it.each([false, true])('rola até a linha incrementada sem reordenar com trilho externo=%s', (externalScrollbar) => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const scrollIntoView = vi.fn();

    const { getByText, rerender } = render(
      <PdvScrollFadeContainer externalScrollbar={externalScrollbar}>
        <div data-pdv-scroll-item="p1">Primeiro item</div>
        <div data-pdv-scroll-item="p2">Segundo item</div>
      </PdvScrollFadeContainer>,
    );
    const firstItem = getByText('Primeiro item');
    firstItem.scrollIntoView = scrollIntoView;

    act(() => {
      rerender(
        <PdvScrollFadeContainer externalScrollbar={externalScrollbar} scrollToEndKey={1} scrollToItemKey="p1">
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

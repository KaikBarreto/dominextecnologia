import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HorizontalTabBar } from './HorizontalTabBar';

describe('navegação de abas com overflow', () => {
  it('mostra controles clicáveis, mantém espaço para os nomes e atualiza os limites', () => {
    render(<HorizontalTabBar viewportProps={{ role: 'tablist' }}><button>Primeira</button><button>Última</button></HorizontalTabBar>);
    const viewport = screen.getByRole('tablist');
    const root = viewport.parentElement!;
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 240 });
    Object.defineProperties(viewport, { clientWidth: { configurable: true, value: 152 }, scrollWidth: { configurable: true, value: 600 }, scrollLeft: { configurable: true, value: 0, writable: true } });
    const scroll = vi.fn();
    viewport.scrollBy = scroll;
    fireEvent.scroll(viewport);
    const previous = screen.getByRole('button', { name: 'Ver abas anteriores' });
    const next = screen.getByRole('button', { name: 'Ver próximas abas' });
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    expect(next.parentElement).toBe(root);
    expect(viewport.contains(next)).toBe(false);
    fireEvent.click(next);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ left: 121.60000000000001 }));
    viewport.scrollLeft = 448;
    fireEvent.scroll(viewport);
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 800 });
    fireEvent.scroll(viewport);
    expect(screen.queryByRole('button', { name: 'Ver próximas abas' })).not.toBeInTheDocument();
  });

  it('revela seleção alterada programaticamente sem rolar a página', async () => {
    const { rerender } = render(<HorizontalTabBar viewportProps={{ role: 'tablist' }}><button aria-current="page">Primeira</button><button>Outra</button></HorizontalTabBar>);
    const viewport = screen.getByRole('tablist');
    const scroll = vi.fn(); viewport.scrollBy = scroll;
    viewport.getBoundingClientRect = () => ({ left: 0, right: 200, width: 200 } as DOMRect);
    screen.getByText('Outra').getBoundingClientRect = () => ({ left: 400, right: 480, width: 80 } as DOMRect);
    rerender(<HorizontalTabBar viewportProps={{ role: 'tablist' }}><button>Primeira</button><button aria-current="page">Outra</button></HorizontalTabBar>);
    await waitFor(() => expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ left: 288 })));
  });
  it('não desloca para fora uma aba larga já visível com diferença subpixel', async () => {
    render(<HorizontalTabBar viewportProps={{ role: 'tablist' }}><button aria-current="page">Diluição de Produto</button></HorizontalTabBar>);
    const viewport = screen.getByRole('tablist');
    const scroll = vi.fn(); viewport.scrollBy = scroll;
    viewport.getBoundingClientRect = () => ({ left: 60, right: 260, width: 200 } as DOMRect);
    screen.getByText('Diluição de Produto').getBoundingClientRect = () => ({ left: 59.625, right: 259.625, width: 200 } as DOMRect);
    fireEvent.resize(window);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    expect(scroll).not.toHaveBeenCalled();
  });

});

import { createRef, type ComponentProps, type CSSProperties, type RefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvSaleWorkspace } from './PdvSaleWorkspace';

vi.mock('@/hooks/usePdvDomiLinkWorkspace', () => ({
  usePdvDomiLinkWorkspace: () => ({ scannerControl: null, weighControl: undefined }),
}));
vi.mock('./PdvCartPanel', () => ({ PdvCartPanel: () => <div>Pedido atual</div> }));
vi.mock('./PdvSalePreviewView', () => ({
  PdvSalePreviewView: ({ rowRef, style }: { rowRef: RefObject<HTMLDivElement>; style?: CSSProperties }) => (
    <div ref={rowRef} style={style} data-testid="sale-viewport" />
  ),
}));

function props(): ComponentProps<typeof PdvSaleWorkspace> {
  return {
    catalog: {
      rowRef: createRef<HTMLDivElement>(), searchInputRef: createRef<HTMLInputElement>(),
      gridRef: createRef<HTMLDivElement>(), controlsRef: createRef<HTMLDivElement>(),
      mode: 'quick', onModeChange: vi.fn(), search: '', onSearchChange: vi.fn(),
      onSearchKeyDown: vi.fn(), onGridKeyDown: vi.fn(), products: [], activeProductId: null,
      onProductFocus: vi.fn(), onProductSelect: vi.fn(), formatCurrency: String, onExit: vi.fn(),
    },
    cart: { cart: { customerId: null, discount: 0, lines: [] } } as ComponentProps<typeof PdvSaleWorkspace>['cart'],
    mobile: false, drawerOpen: false, onDrawerOpenChange: vi.fn(),
    itemCount: 0, itemCountLabel: '0 materiais', formattedTotal: 'R$ 0,00', drawerTitle: 'Pedido atual',
  };
}

beforeEach(() => {
  vi.stubGlobal('visualViewport', undefined);
  vi.stubGlobal('innerHeight', 600);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 160 } as DOMRect);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('altura disponível para receber a venda', () => {
  it('mantém o carrinho limitado quando restam menos de 400 px no notebook', () => {
    render(<PdvSaleWorkspace {...props()} />);
    expect(screen.getByTestId('sale-viewport')).toHaveStyle({ height: '364px' });
  });

  it('recalcula ao reduzir a janela e ao mudar a altura do cabeçalho', () => {
    vi.stubGlobal('innerHeight', 900);
    render(<PdvSaleWorkspace {...props()} />);
    expect(screen.getByTestId('sale-viewport')).toHaveStyle({ height: '664px' });
    vi.stubGlobal('innerHeight', 600);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ top: 220 } as DOMRect);
    fireEvent(window, new Event('resize'));
    expect(screen.getByTestId('sale-viewport')).toHaveStyle({ height: '304px' });
  });

  it('usa a área visível reduzida pelo teclado ou zoom do navegador', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 540 });
    vi.stubGlobal('visualViewport', viewport);
    render(<PdvSaleWorkspace {...props()} />);
    expect(screen.getByTestId('sale-viewport')).toHaveStyle({ height: '304px' });
  });
});

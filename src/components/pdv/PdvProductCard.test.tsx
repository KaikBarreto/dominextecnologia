import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvProductCard } from '@/components/pdv/PdvProductCard';

vi.mock('@/components/ui/SignedImg', () => ({
  SignedImg: ({ src, fallbackLabel, blurFillClassName: _blur, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & {
    src?: string | null;
    fallbackLabel: string;
    blurFillClassName?: string;
  }) => src ? <img src={src} {...props} /> : <span>{fallbackLabel}</span>,
}));

const product = {
  inventoryId: 'produto-1',
  name: 'Protetor de surto',
  imageUrl: 'https://cdn.exemplo/protetor.png',
  unitPrice: 42,
  unit: 'un',
  availableQuantity: 8,
};

describe('PdvProductCard', () => {
  it('mantém o skeleton visível até a foto terminar de carregar', () => {
    const { container } = render(
      <PdvProductCard
        product={product}
        formatCurrency={(value) => `R$ ${value}`}
        outOfStockLabel="Sem estoque"
        availableLabel="{count} em estoque"
        noPhotoLabel="Sem foto"
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    fireEvent.load(container.querySelector('img')!);
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  it('expõe apenas o produto ativo na ordem de tabulação', () => {
    const { rerender, getByRole } = render(
      <PdvProductCard
        product={product}
        formatCurrency={(value) => `R$ ${value}`}
        outOfStockLabel="Sem estoque"
        availableLabel="{count} em estoque"
        noPhotoLabel="Sem foto"
        keyboardActive
        onSelect={vi.fn()}
      />,
    );
    expect(getByRole('button')).toHaveAttribute('tabindex', '0');
    expect(getByRole('button')).toHaveClass('border-transparent');
    expect(getByRole('button').className).toContain('inset_0_0_0_2px');
    expect(getByRole('button')).not.toHaveClass('border-primary');

    rerender(
      <PdvProductCard
        product={product}
        formatCurrency={(value) => `R$ ${value}`}
        outOfStockLabel="Sem estoque"
        availableLabel="{count} em estoque"
        noPhotoLabel="Sem foto"
        keyboardActive={false}
        onSelect={vi.fn()}
      />,
    );
    expect(getByRole('button')).toHaveAttribute('tabindex', '-1');
    expect(getByRole('button')).toHaveClass('border-border');
  });

  it('não reabre o skeleton ao remontar uma foto já carregada após pesquisa', () => {
    const cachedProduct = { ...product, inventoryId: 'produto-cache', imageUrl: 'https://cdn.exemplo/cache-unico.png' };
    const props = {
      product: cachedProduct,
      formatCurrency: (value: number) => `R$ ${value}`,
      outOfStockLabel: 'Sem estoque',
      availableLabel: '{count} em estoque',
      noPhotoLabel: 'Sem foto',
      onSelect: vi.fn(),
    };
    const first = render(<PdvProductCard {...props} />);
    fireEvent.load(first.container.querySelector('img')!);
    first.unmount();

    const second = render(<PdvProductCard {...props} />);
    expect(second.container.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });
});

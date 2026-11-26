import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvCartLineRow } from './PdvCartLineRow';
import type { CartLine } from '@/lib/pdv/cart';

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value).replace(/\s/g, ' ');
const discountEditorTexts = {
  add: 'Adicionar desconto', edit: 'Editar desconto', close: 'Fechar', valueMode: 'Valor', percentageMode: 'Percentual',
  valueLabel: 'Valor', percentageLabel: 'Percentual', invalidNumber: 'Número inválido', percentageLimit: 'Limite',
  valueLimit: 'Limite', itemTotal: 'Total do item', afterDiscount: 'Com desconto', cancel: 'Cancelar', apply: 'Aplicar', remove: 'Remover',
};

function line(overrides: Partial<CartLine> = {}): CartLine {
  return { inventoryId: 'item-a', name: 'Abraçadeira metálica tipo "U"', imageUrl: null, unitPrice: 8, unit: 'un',
    unitCost: 0, quantity: 5, discountAmount: 0, availableQuantity: 50, ...overrides };
}

function renderRow(value: CartLine, density: 'default' | 'preview') {
  return render(<PdvCartLineRow line={value} density={density} formatCurrency={formatCurrency} noPhotoLabel="Sem foto"
    openPhotoLabel="Abrir foto" photoViewerDescription="Foto do produto" removeLabel="Remover" quantityEditLabel="Editar quantidade"
    discountLabel="Desconto" discountEditorTexts={discountEditorTexts} currencySymbol="R$" locale="pt-br" currencyFractionDigits={2}
    onIncrement={vi.fn()} onSetQuantity={vi.fn()} onSetLineDiscount={vi.fn()} onSetLineFinalAmount={vi.fn()} onRemove={vi.fn()} />);
}

describe.each(['preview', 'default'] as const)('preço por unidade na linha do carrinho (%s)', (density) => {
  it('com desconto, risca o preço de tabela e mostra ao lado o valor cobrado por unidade', () => {
    renderRow(line({ discountAmount: 6 }), density);
    const original = screen.getByTestId('pdv-line-unit-price-original');
    expect(original.tagName).toBe('S');
    expect(original).toHaveTextContent('R$ 8,00');
    expect(screen.getByTestId('pdv-line-unit-price-net')).toHaveTextContent('R$ 6,80');
    expect(original.parentElement).toHaveTextContent(/R\$ 8,00 R\$ 6,80\s?\/\s?un/);
  });

  it('recalcula o valor por quilo em venda fracionada', () => {
    renderRow(line({ unit: 'kg', unitPrice: 45, quantity: 8.6, discountAmount: 42 }), density);
    expect(screen.getByTestId('pdv-line-unit-price-net')).toHaveTextContent('R$ 40,12');
    expect(screen.getByTestId('pdv-line-unit-price-original').parentElement).toHaveTextContent(/R\$ 45,00 R\$ 40,12\s?\/\s?kg/);
  });

  it('sem desconto, mantém só o preço de tabela', () => {
    const { container } = renderRow(line(), density);
    expect(screen.queryByTestId('pdv-line-unit-price-original')).toBeNull();
    expect(container).toHaveTextContent(/R\$ 8,00\s?\/\s?un/);
  });
});

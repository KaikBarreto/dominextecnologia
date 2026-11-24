import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvSalePreviewView } from './PdvSalePreviewView';

const material = { inventoryId: 'material-zero', name: 'Tubo de cobre', sku: 'MAT-001', imageUrl: null, unitPrice: 30, unit: 'm', availableQuantity: 0 };
function props() {
  return { mode: 'quick' as const, onModeChange: vi.fn(), search: '', onSearchChange: vi.fn(),
    onSearchKeyDown: vi.fn(), searchInputRef: createRef<HTMLInputElement>(), gridRef: createRef<HTMLDivElement>(),
    controlsRef: createRef<HTMLDivElement>(), rowRef: createRef<HTMLDivElement>(), onGridKeyDown: vi.fn(),
    products: [material], activeProductId: material.inventoryId, onProductFocus: vi.fn(), onProductSelect: vi.fn(),
    formatCurrency: (value: number) => `R$ ${value}`, onExit: vi.fn(), cart: <div>Pedido</div> };
}
describe('catálogo compartilhado de venda e compra', () => {
  it.each(['quick', 'catalog'] as const)('%s: código é badge separado e nome acessível preserva código e descrição', mode => {
    render(<PdvSalePreviewView {...props()} mode={mode} allowUnavailableProducts />);
    const option = screen.getByRole('option', { name: 'Adicionar MAT-001 Tubo de cobre' });
    expect(option.querySelector('.pdv-product-code')).toHaveTextContent('MAT-001');
    expect(option.querySelector('.pdv-product-code')).not.toHaveTextContent('Tubo de cobre');
    expect(option).toHaveTextContent('Tubo de cobre');
    expect(screen.getByRole('img', { name: 'Sem foto' })).toBeInTheDocument();
    expect(screen.queryByText('Sem foto')).not.toBeInTheDocument();
  });
  it('mantém a venda bloqueada quando o material não tem saldo', () => {
    const input = props(); render(<PdvSalePreviewView {...input} />);
    const product = screen.getByRole('option', { name: 'Adicionar MAT-001 Tubo de cobre' });
    expect(product).toBeDisabled(); fireEvent.click(product); expect(input.onProductSelect).not.toHaveBeenCalled();
  });
  it('permite repor por compra um material zerado sem inventar saldo disponível', () => {
    const input = props(); render(<PdvSalePreviewView {...input} title="Nova compra" allowUnavailableProducts exitLabel="Sair da compra" />);
    const product = screen.getByRole('option', { name: 'Adicionar MAT-001 Tubo de cobre' });
    expect(product).toBeEnabled(); expect(product).toHaveTextContent('MAT-001'); expect(product).toHaveTextContent('0 m disponíveis');
    fireEvent.click(product); expect(input.onProductSelect).toHaveBeenCalledWith(material);
  });
  it('distingue consulta em andamento de uma busca sem resultados', () => {
    const input = props();
    const { rerender } = render(<PdvSalePreviewView {...input} products={[]} catalogLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando materiais');
    expect(screen.queryByText('Nenhum material encontrado.')).not.toBeInTheDocument();
    rerender(<PdvSalePreviewView {...input} products={[]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhum material encontrado.')).toBeVisible();
  });
  it('bloqueia nova inclusão enquanto a compra está sendo confirmada', () => {
    const input = props(); render(<PdvSalePreviewView {...input} allowUnavailableProducts disabled />);
    expect(screen.getByRole('option', { name: 'Adicionar MAT-001 Tubo de cobre' })).toBeDisabled();
  });
});

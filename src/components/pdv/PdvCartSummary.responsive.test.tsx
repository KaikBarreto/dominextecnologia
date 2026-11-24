import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PdvCartSummary, type PdvCartSummaryTexts } from './PdvCartSummary';
import type { ComponentProps } from 'react';
import { PdvCartWorkspaceFooter, PdvCartWorkspaceTotals } from './PdvCartWorkspaceParts';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function props(): ComponentProps<typeof PdvCartSummary> {
  return {
    cart: { customerId: null, discount: 20, lines: [{ inventoryId: 'material', name: 'Material', imageUrl: null, unitCost: 40, availableQuantity: 10, quantity: 2, unitPrice: 100, discountAmount: 10 }] },
    customers: [], formatCurrency: money, currencySymbol: 'R$', appliedCreditAmount: 30,
    layout: 'workspace', compactSummary: true,
    onSetDiscountAmount: vi.fn(), onSetCartFinalAmount: vi.fn(), onCustomerChange: vi.fn(),
    onRequestPayment: vi.fn(), cashClosed: false, onGoToCashPanel: vi.fn(),
    onOpenAdvancedOptions: vi.fn(), advancedOptionsActive: false,
    couponContent: <button type="button">Usar cupom</button>,
    texts: { subtotal: 'Subtotal', total: 'Total', itemDiscounts: 'Descontos nos itens', advancedOptionsTrigger: 'Observação, data e anexos', discountEditor: { add: 'Adicionar', edit: 'Editar desconto' } } as PdvCartSummaryTexts,
  };
}
const view = (input: ComponentProps<typeof PdvCartSummary>) => <TooltipProvider><PdvCartSummary {...input} /></TooltipProvider>;

describe('resumo do pedido com pouca altura disponível', () => {
  it('mantém o valor líquido junto do recebimento com os detalhes recolhidos', () => {
    const input = props(); render(view(input));
    const toggle = screen.getByRole('button', { name: 'Conferir valores, descontos e créditos' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Subtotal')).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Usar cupom' })).not.toBeInTheDocument();
    const footer = screen.getByText('Restante a receber').closest('.cartfooter');
    expect(footer).toHaveTextContent(/R\$\s140,00/);
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Receber agora' }));
    fireEvent.click(screen.getByRole('button', { name: 'Receber agora' }));
    expect(input.onRequestPayment).toHaveBeenCalledOnce();
  });

  it('permite conferir subtotal, descontos e cupom sem ocultar o recebimento', () => {
    render(view(props()));
    const toggle = screen.getByRole('button', { name: 'Conferir valores, descontos e créditos' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveTextContent(/R\$\s200,00/);
    expect(screen.getByText('Descontos nos itens')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Usar cupom' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Receber agora' })).toBeVisible();
    fireEvent.click(toggle);
    expect(screen.getByText('Subtotal')).not.toBeVisible();
    expect(screen.getByText(/R\$\s140,00/)).toBeVisible();
  });

  it('preserva a escolha de expansão ao alternar entre janela alta e baixa', () => {
    const input = props(); const { rerender } = render(view(input));
    fireEvent.click(screen.getByRole('button', { name: 'Conferir valores, descontos e créditos' }));
    rerender(view({ ...input, compactSummary: false }));
    expect(screen.queryByRole('button', { name: 'Conferir valores, descontos e créditos' })).not.toBeInTheDocument();
    expect(screen.getByText('Subtotal')).toBeVisible();
    rerender(view(input));
    expect(screen.getByRole('button', { name: 'Conferir valores, descontos e créditos' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Subtotal')).toBeVisible();
  });

  it('continua bloqueando recebimento de pedido vazio no modo compacto', () => {
    const input = props();
    render(view({ ...input, cart: { customerId: null, discount: 0, lines: [] }, appliedCreditAmount: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Receber agora' }));
    expect(screen.getByRole('button', { name: 'Receber agora' })).toBeDisabled();
    expect(input.onRequestPayment).not.toHaveBeenCalled();
  });

  it('mantém os detalhes abertos se o operador estiver usando um controle ao reduzir a janela', () => {
    const input = props(); const { rerender } = render(view({ ...input, compactSummary: false }));
    fireEvent.focus(screen.getByRole('button', { name: 'Usar cupom' }));
    rerender(view(input));
    expect(screen.getByRole('button', { name: 'Conferir valores, descontos e créditos' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Usar cupom' })).toBeVisible();
  });

  it('atualiza o valor a receber com os créditos mesmo com os detalhes recolhidos', () => {
    const input = props(); const { rerender } = render(view(input));
    rerender(view({ ...input, appliedCreditAmount: 50 }));
    expect(screen.getByText(/R\$\s120,00/)).toBeVisible();
    expect(screen.getByText('Subtotal')).not.toBeVisible();
  });

  it('preserva o resumo compartilhado da compra com seu valor no próprio resumo', () => {
    render(<><PdvCartWorkspaceTotals subtotalLabel="Subtotal" subtotal={money(200)} totalLabel="Total da compra" total={money(200)} amountLabel="Valor da compra" amount={money(200)} /><PdvCartWorkspaceFooter><button type="button">Conferir compra</button></PdvCartWorkspaceFooter></>);
    expect(screen.getByText('Valor da compra').closest('.total')).toHaveTextContent(/R\$\s200,00/);
    expect(screen.getByRole('button', { name: 'Conferir compra' }).parentElement).toHaveClass('cartfooter');
  });
});

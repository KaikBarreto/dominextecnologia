import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvLastSaleHeader } from './Pdv';

const state = vi.hoisted(() => ({ receipt: vi.fn() }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton', () => ({ openPdvOrderReceipt: vi.fn(), PdvOrderReceiptButton: ({ orderId, label, documentKind }: { orderId: string; label: string; documentKind: string }) => <button onClick={() => state.receipt(orderId, documentKind)}>{label}</button> }));
const sale = { scopeKey: 'company-a:user-a:cash-a:terminal-a:stock-a', orderId: 'order-completed', orderNumber: 12, total: 50 };
const props = { completedSale: sale, scopeKey: sale.scopeKey, receiptFormat: '80mm' as const, canOpenPostSale: false, onOpenPostSale: vi.fn(), children: <button>Novo atendimento</button> };

describe('atalho compacto do último pedido', () => {
  it('mantém a próxima venda e abre o comprovante do pedido concluído sem navegar ou mutar dados', async () => {
    render(<PdvLastSaleHeader {...props} />);
    expect(screen.getByRole('button', { name: 'Novo atendimento' })).toBeInTheDocument();
    expect(screen.queryByText(/O comprovante pode ser reaberto/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Último pedido #12' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Comprovante' }));
    expect(state.receipt).toHaveBeenCalledWith('order-completed', 'sale');
    expect(screen.queryByRole('button', { name: 'Abrir pós-venda' })).not.toBeInTheDocument();
  });
  it('conserva o pós-venda autorizado e fecha seu menu antes de abri-lo', async () => {
    const open = vi.fn();
    render(<PdvLastSaleHeader {...props} canOpenPostSale onOpenPostSale={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Último pedido #12' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir pós-venda' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Comprovante' })).not.toBeInTheDocument();
  });
  it.each(['company-b:user-a:cash-a:terminal-a:stock-a','company-a:user-b:cash-a:terminal-a:stock-a','company-a:user-a:cash-b:terminal-a:stock-a',null])('mascara o último pedido e o popover antigo imediatamente ao trocar para %s', async scopeKey => {
    const { rerender } = render(<PdvLastSaleHeader {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Último pedido #12' }));
    expect(await screen.findByText('Pedido #12 concluído')).toBeInTheDocument();
    rerender(<PdvLastSaleHeader {...props} scopeKey={scopeKey} />);
    expect(screen.queryByText('Pedido #12 concluído')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Último pedido #12' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo atendimento' })).toBeInTheDocument();
  });
});

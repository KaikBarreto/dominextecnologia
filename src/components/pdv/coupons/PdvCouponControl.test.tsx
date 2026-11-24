import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeTotal, couponCartReady, type CartState } from '@/lib/pdv/cart';
const { evaluate, campaign } = vi.hoisted(() => ({ evaluate: vi.fn(), campaign: { kind: 'fixed' as 'fixed' | 'percentage', value: 20 } }));
vi.mock('@/hooks/pdvReportCache', () => ({ usePdvAuthorizedQueryScope: () => ({ ready: true, key: ['company', 'user'] }) }));
vi.mock('@/hooks/usePdvCoupons', () => ({
  PDV_COUPONS_ROOT: ['pdv', 'coupons'], evaluatePdvCoupon: evaluate,
  usePdvCouponOperationScope: () => ({ ready: true, key: ['test'], isCurrent: () => true }),
  usePdvCoupons: () => ({ coupons: [{ id: 'coupon', code: 'EXEMPLO20', name: 'Promoção exemplo', kind: campaign.kind, value: campaign.value, minimum_amount: 0, status: 'available', expires_on: null }], isLoading: false, isError: false }),
}));
import { PdvCouponControl } from './PdvCouponControl';
function Workspace() {
  const [cart, setCart] = useState<CartState>({ customerId: null, discount: 10, lines: [{ inventoryId: 'material', name: 'Exemplo', unitPrice: 100, unitCost: 40, quantity: 1, discountAmount: 0, availableQuantity: 10, imageUrl: null }] });
  return <><PdvCouponControl cart={cart} onChange={coupon => setCart(current => ({ ...current, coupon }))} /><output aria-label="Total da venda">{computeTotal(cart)}</output><button disabled={!couponCartReady(cart)}>Receber</button><button onClick={() => setCart(current => ({ ...current, lines: current.lines.map(line => ({ ...line, quantity: 2 })) }))}>Alterar quantidade</button></>;
}
describe('aplicação do cupom promocional', () => {
  beforeEach(() => { vi.clearAllMocks(); campaign.kind = 'fixed'; campaign.value = 20; });
  it('explica o bloqueio de 100% do pedido e permite remover o cupom sem alterar desconto manual', async () => {
    campaign.kind = 'percentage'; campaign.value = 100;
    evaluate.mockResolvedValue({ eligible: false, reason: 'order_total_zero', message: 'O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Workspace /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Usar cupom promocional' }));
    fireEvent.click(await screen.findByRole('radio', { name: /100% OFF/ }));
    expect(await screen.findByText('O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receber' })).toBeDisabled();
    expect(screen.getByLabelText('Total da venda')).toHaveTextContent('90');
    fireEvent.click(screen.getByRole('button', { name: 'Remover cupom promocional' }));
    expect(screen.getByRole('button', { name: 'Receber' })).toBeEnabled();
    expect(screen.getByLabelText('Total da venda')).toHaveTextContent('90');
    client.clear();
  });
  it('confirma desconto no servidor, revalida alterações e permite removê-lo sem criar crédito', async () => {
    evaluate.mockResolvedValueOnce({ eligible: true, discount_cents: 2000, code: 'EXEMPLO20' }).mockResolvedValue({ eligible: false, reason: 'items', message: 'O cupom não está disponível para os itens atuais.' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Workspace /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Usar cupom promocional' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Cupom EXEMPLO20/ }));
    await waitFor(() => expect(screen.getByLabelText('Total da venda')).toHaveTextContent('70'));
    expect(evaluate).toHaveBeenCalledWith('coupon', null, [{ id: 'material', inventory_id: 'material', net_cents: 9000 }], expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: 'Alterar quantidade' }));
    expect(screen.getByLabelText('Total da venda')).toHaveTextContent('190');
    expect(await screen.findByText('O cupom não está disponível para os itens atuais.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover cupom promocional' }));
    expect(screen.getByRole('button', { name: 'Usar cupom promocional' })).toBeInTheDocument();
    expect(screen.queryByText(/saldo|voucher/i)).not.toBeInTheDocument();
    client.clear();
  });
});

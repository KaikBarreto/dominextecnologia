import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), reverseRefund: vi.fn(), reverseVoucher: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/usePdvAfterSale', () => ({
  usePdvConfirmRefund: () => ({ mutateAsync: mocks.confirm, isPending: false }),
  usePdvReverseRefund: () => ({ mutateAsync: mocks.reverseRefund, isPending: false }),
  usePdvReverseVoucher: () => ({ mutateAsync: mocks.reverseVoucher, isPending: false }),
  usePdvApplyVoucherToOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
import { PdvConfirmRefundDialog, PdvReverseAfterSaleDialog } from './PdvAfterSaleActionDialogs';
function deferred() { let resolve!: (value: unknown) => void; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; }
const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => { if (descriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', descriptor); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });
const attempt = () => ({ signature: 'test', id: 'stable-key' });
beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue({ ok: true }); mocks.reverseRefund.mockResolvedValue({ ok: true }); mocks.reverseVoucher.mockResolvedValue({ ok: true }); });
describe('ações canônicas compartilham origem sem exigir devolução fictícia', () => {
  it('confirma reembolso pelo ID real, conta explícita e referência', async () => {
    const done = vi.fn(); render(<PdvConfirmRefundDialog open onOpenChange={vi.fn()} orderId="order1" refund={{ refundId: 'refund1', requiresConfirmationReference: true }} accounts={[{ accountId: 'bank1', label: 'Banco original', methods: ['pix'] }]} getAttempt={attempt} onCompleted={done} />);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled(); fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' }); fireEvent.click(await screen.findByRole('option', { name: 'Banco original' })); fireEvent.change(screen.getByLabelText(/Referência da confirmação/), { target: { value: 'PROTOCOLO123' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })); await act(async () => {}); expect(mocks.confirm).toHaveBeenCalledWith({ orderId: 'order1', refundId: 'refund1', accountId: 'bank1', confirmationReference: 'PROTOCOLO123', attemptId: 'stable-key' }); expect(done).toHaveBeenCalledOnce();
  });
  it.each(['refund', 'voucher'] as const)('estorna %s apenas por identificador canônico', async kind => {
    const target = kind === 'refund' ? { kind, item: { refundId: 'real1' } } : { kind, item: { voucherId: 'real1' } }; const done = vi.fn(); render(<PdvReverseAfterSaleDialog open onOpenChange={vi.fn()} orderId="order1" target={target} getAttempt={attempt} onCompleted={done} />); fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Motivo válido' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' })); await act(async () => {}); expect(kind === 'refund' ? mocks.reverseRefund : mocks.reverseVoucher).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order1', [kind === 'refund' ? 'refundId' : 'voucherId']: 'real1', attemptId: 'stable-key' })); expect(done).toHaveBeenCalledOnce();
  });
  it.each(['unmount', 'close', 'context', 'aba'] as const)('suprime resposta/toast atrasados depois de %s', async mode => {
    const late = deferred(); mocks.reverseRefund.mockReturnValue(late.promise); const done = vi.fn(); const close = vi.fn(); let valid = true;
    const props = { open: true, onOpenChange: close, orderId: 'order1', target: { kind: 'refund' as const, item: { refundId: 'real1' } }, getAttempt: attempt, onCompleted: done, isCurrent: () => valid };
    const view = render(<PdvReverseAfterSaleDialog {...props} />); fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Motivo válido' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar estorno' }));
    if (mode === 'unmount') view.unmount(); else if (mode === 'context') valid = false; else if (mode === 'close') view.rerender(<PdvReverseAfterSaleDialog {...props} open={false} />); else { view.rerender(<PdvReverseAfterSaleDialog {...props} orderId="order2" />); view.rerender(<PdvReverseAfterSaleDialog {...props} />); }
    await act(async () => { late.resolve({ ok: true }); }); expect(done).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
});

import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), toast: vi.fn(), actor: { user: { id: 'user-a' }, profile: { company_id: 'company-a' } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.actor }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/utils/osReceiptPdf', () => ({ downloadOsReceipt: state.download }));
import { canDownloadPaymentReceipt, usePaymentReceipt, paymentReceiptError } from './usePaymentReceipt';
const row = { transaction_type: 'entrada' as const, is_paid: true, paid_date: '2026-11-26', amount: 100, amount_received: 0 };
beforeEach(() => { vi.clearAllMocks(); state.actor.profile.company_id = 'company-a'; });
describe('recibos do financeiro', () => {
  it('oferece pagamento direto e exclui saída, cancelamento, transferência, pendência e mãe quitada por filhas', () => {
    expect(canDownloadPaymentReceipt(row)).toBe(true);
    for (const patch of [{ transaction_type: 'saida' as const }, { is_paid: false }, { paid_date: undefined }, { cancelled_at: '2026-11-27' }, { transfer_pair_id: 'pair' }, { amount_received: 100 }]) expect(canDownloadPaymentReceipt({ ...row, ...patch })).toBe(false);
  });
  it.each(['transaction', 'charge'] as const)('reconsulta o servidor antes de baixar %s', async kind => {
    const doc = { received: 100, payments: [{ reference: 'payment', amount: 100 }] };
    state.rpc.mockResolvedValue({ data: doc, error: null });
    const { result } = renderHook(() => usePaymentReceipt());
    await act(() => result.current.download('payment', kind));
    expect(state.rpc).toHaveBeenCalledWith(kind === 'charge' ? 'get_charge_payment_receipt' : 'get_financial_payment_receipt', kind === 'charge' ? { p_charge_id: 'payment' } : { p_transaction_id: 'payment' });
    expect(state.download).toHaveBeenCalledWith(doc, expect.any(Function));
  });
  it('descarta resposta atrasada ao trocar de empresa durante a consulta', async () => {
    let finish!: (value: unknown) => void;
    state.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = renderHook(() => usePaymentReceipt());
    let pending!: Promise<void>;
    act(() => { pending = result.current.download('payment'); });
    state.actor.profile.company_id = 'company-b'; rerender();
    await act(async () => { finish({ data: { received: 100 }, error: null }); await pending; });
    expect(state.download).not.toHaveBeenCalled();
  });
  it('pagamento estornado não gera PDF e não vaza erro técnico', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: 'ORC01', message: 'private_backend_name' } });
    const { result } = renderHook(() => usePaymentReceipt());
    await act(() => result.current.download('payment'));
    expect(state.download).not.toHaveBeenCalled();
    expect(state.toast.mock.calls[0][0].description).not.toContain('private_backend_name');
    expect(paymentReceiptError({ code: '42501' })).not.toContain('42501');
  });
});

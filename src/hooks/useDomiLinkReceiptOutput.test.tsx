import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDomiLinkReceiptOutput } from './useDomiLinkReceiptOutput';
import { writeDomiLinkEnabled, writeDomiLinkReceiptPrinter } from '@/lib/domilink/storage';

const mocks = vi.hoisted(() => ({ print: vi.fn(), pdf: vi.fn(), toast: vi.fn(), auth: {
  user: { id: 'user-A' }, profile: { user_id: 'user-A', company_id: 'company-A' }, loading: false, profileLoading: false,
} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('./use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/domilink/receiptOutput', () => ({ printDomiLinkReceipt: mocks.print }));
vi.mock('@/utils/openPdfInTab', () => ({ openPdfInTab: mocks.pdf }));

describe('saída do comprovante com DomiLink', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
    mocks.auth.profile = { user_id: 'user-A', company_id: 'company-A' };
    writeDomiLinkEnabled(true);
    writeDomiLinkReceiptPrinter({ userId: 'user-A', companyId: 'company-A' }, 'printer-A');
  });
  it('fecha a aba preparada só depois de confirmar envio à fila', async () => {
    mocks.print.mockResolvedValue(true);
    const target = { close: vi.fn() } as unknown as Window;
    const { result } = renderHook(() => useDomiLinkReceiptOutput());
    await act(() => result.current!(new Blob(), 'Pedido', target, { isCurrent: () => true }));
    expect(target.close).toHaveBeenCalledOnce(); expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'Comprovante enviado à impressora' });
  });
  it('em falha ou transporte incerto abre PDF e orienta verificar a fila, sem repetir impressão', async () => {
    mocks.print.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useDomiLinkReceiptOutput());
    await act(() => result.current!(new Blob(), 'Pedido', null, { isCurrent: () => true }));
    expect(mocks.print).toHaveBeenCalledOnce(); expect(mocks.pdf).toHaveBeenCalledOnce();
    expect(mocks.toast.mock.calls[0][0].description).toMatch(/Confira a fila/);
  });
  it('não publica PDF nem confirmação no novo contexto após resposta atrasada', async () => {
    let finish!: (value: boolean) => void;
    mocks.print.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
    const { result, rerender } = renderHook(() => useDomiLinkReceiptOutput());
    const pending = result.current!(new Blob(), 'Pedido', null, {});
    mocks.auth.profile = { user_id: 'user-A', company_id: 'company-B' }; rerender();
    await act(async () => { finish(true); await expect(pending).rejects.toThrow(/novamente/); });
    expect(mocks.pdf).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
});

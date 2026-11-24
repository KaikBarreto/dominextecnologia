import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvAfterSaleReturn, PdvAfterSaleWorkspace } from '@/hooks/usePdvAfterSale';
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/usePdvAfterSale', () => ({ usePdvCoverExchange: () => ({ mutateAsync: mocks.mutate, isPending: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/ui/dialog', () => {
  const part = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: part, DialogContent: part, DialogDescription: part, DialogFooter: part, DialogHeader: part, DialogTitle: part };
});
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <select value={value} onChange={e => onValueChange(e.target.value)}><option value="">Escolha</option>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>, SelectTrigger: () => null, SelectValue: () => null,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
import { PdvExchangeDialog } from './PdvExchangeDialog';
const entry = { returnId: 'return-A', vouchers: [], availableAmount: 10 } as unknown as PdvAfterSaleReturn;
function workspace(session: string | null = 'session-A') {
  return { exchangeCandidates: [{ orderId: 'target-A', orderNumber: 2, total: 10, status: 'aguardando_pagamento', createdAt: '2026-11-16', couponRevision: 0,
    targetTerminalId: session ? 'terminal-A' : null, targetCashSessionId: session, targetCashAccountId: session ? 'cash-A' : null, targetCashLabel: session ? 'Caixa A' : null }], cashOptions: [], accountOptions: [] } as unknown as PdvAfterSaleWorkspace;
}
function setup(session: string | null = 'session-A') {
  const props = { open: true, onOpenChange: vi.fn(), orderId: 'source-A', entry, workspace: workspace(session), canApproveCredit: false,
    getAttempt: vi.fn(() => ({ id: 'same-attempt', signature: 'stable' })), onCompleted: vi.fn(), isCurrent: () => true };
  const view = render(<PdvExchangeDialog {...props} />);
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'target-A' } });
  fireEvent.change(screen.getByLabelText('Saldo do cliente'), { target: { value: '10' } });
  return { ...view, props };
}
beforeEach(() => { vi.clearAllMocks(); mocks.mutate.mockResolvedValue({ ok: true }); });
describe('troca mantém snapshot da abertura de destino', () => {
  it('envia a abertura explícita mesmo com saldo exato e nenhuma diferença', async () => {
    const view = setup();
    expect(screen.getByText(/Caixa de destino: Caixa A/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' })); });
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ targetCashSessionId: 'session-A', cashSessionId: null, differenceMethod: null, couponRevision: 0, attemptId: 'same-attempt' }));
    expect(view.props.onCompleted).toHaveBeenCalledOnce();
  });
  it.each([
    ['entregue', 'Pedido #2 entregue no caixa.'],
    ['liberado_retirada', 'Pedido #2 liberado para retirada.'],
  ])('mostra o resultado confirmado %s sem anunciar uma etapa diferente', async (status, description) => {
    mocks.mutate.mockResolvedValueOnce({ ok: true, status });
    setup();
    expect(screen.getByText('Use saldo ou voucher da devolução em um pedido do cliente.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' })); });
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'Troca concluída', description });
  });
  it('sem abertura publicada pelo servidor bloqueia o envio', () => {
    setup(null);
    expect(screen.getByRole('button', { name: 'Confirmar troca' })).toBeDisabled();
    expect(screen.getByText(/não possui uma abertura disponível/)).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('descarta confirmação atrasada depois de trocar sessão A→B→A', async () => {
    let resolve!: (value: unknown) => void;
    mocks.mutate.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' }));
    view.rerender(<PdvExchangeDialog {...view.props} workspace={workspace('session-B')} />);
    view.rerender(<PdvExchangeDialog {...view.props} workspace={workspace('session-A')} />);
    await act(async () => { resolve({ ok: true }); });
    expect(view.props.onCompleted).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it.each(['unmount', 'revoked'] as const)('ignora confirmação após %s', async reason => {
    let resolve!: (value: unknown) => void;
    mocks.mutate.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' }));
    if (reason === 'unmount') view.unmount(); else view.rerender(<PdvExchangeDialog {...view.props} isCurrent={() => false} />);
    await act(async () => { resolve({ ok: true }); });
    expect(view.props.onCompleted).not.toHaveBeenCalled(); expect(view.props.onOpenChange).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('falha do servidor mantém editor aberto e não anuncia conclusão', async () => {
    mocks.mutate.mockRejectedValueOnce(new Error('O caixa de destino mudou. Atualize o pós-venda.'));
    const view = setup();await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' })); });
    expect(view.props.onCompleted).not.toHaveBeenCalled();expect(view.props.onOpenChange).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Troca não concluída', variant: 'destructive' }));
  });
});

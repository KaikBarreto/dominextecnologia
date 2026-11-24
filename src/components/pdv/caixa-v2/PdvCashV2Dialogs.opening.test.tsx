import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, children, footer }: { open: boolean; children: ReactNode; footer: ReactNode }) => open ? <div>{children}{footer}</div> : null }));
import { createPdvCashV2AttemptRegistry } from '@/hooks/usePdvCashSessionsV2';
import { PdvCashV2OpenDialog } from './PdvCashV2Dialogs';

const terminals = [{ id: 'secondary', name: 'Caixa Juruti', stockId: 'stock' }];
const defaults = { open: true, onOpenChange: vi.fn(), terminals, available: 0, canViewTreasury: true,
  cashAccountId: 'account', money: (value: number) => `R$ ${value.toFixed(2)}` };
function fill() {
  fireEvent.change(screen.getByLabelText('Dinheiro físico total da empresa'), { target: { value: '30000' } });
  fireEvent.change(screen.getByLabelText('Dinheiro inicial'), { target: { value: '10000' } });
}
describe('primeira abertura do caixa', () => {
  it('separa dinheiro total de fundo de troco e envia os dois valores', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<PdvCashV2OpenDialog {...defaults} canInitializeTreasury attemptRegistry={createPdvCashV2AttemptRegistry()} onConfirm={onConfirm} />);
    fill();
    expect(screen.getByText(/ficam livres no cofre: R\$ 200.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ terminalId: 'secondary', openingAmount: 100, initialBalance: 300 })));
  });
  it('não permite reservar mais do que o total informado', () => {
    render(<PdvCashV2OpenDialog {...defaults} canInitializeTreasury attemptRegistry={createPdvCashV2AttemptRegistry()} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Dinheiro inicial'), { target: { value: '10000' } });
    expect(screen.getByRole('button', { name: 'Abrir caixa' })).toBeDisabled();
    expect(screen.getByText(/não pode superar o dinheiro total/)).toBeInTheDocument();
  });
  it('reutiliza a tentativa e mantém os valores depois de resposta perdida', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('Falha de conexão')).mockResolvedValue(undefined);
    const props = { ...defaults, onConfirm, canInitializeTreasury: true, attemptRegistry: createPdvCashV2AttemptRegistry() };
    const { rerender } = render(<PdvCashV2OpenDialog {...props} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    await screen.findByText('Falha de conexão');
    // O servidor pode já ter inicializado, enquanto a resposta se perdeu.
    rerender(<PdvCashV2OpenDialog {...props} canInitializeTreasury={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    expect(onConfirm.mock.calls[1][0]).toEqual(onConfirm.mock.calls[0][0]);
  });
  it('abertura comum não oferece nem envia saldo inicial', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<PdvCashV2OpenDialog {...defaults} canViewTreasury={false} attemptRegistry={createPdvCashV2AttemptRegistry()} onConfirm={onConfirm} />);
    expect(screen.queryByLabelText('Dinheiro físico total da empresa')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir caixa' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0]).not.toHaveProperty('initialBalance');
  });
});

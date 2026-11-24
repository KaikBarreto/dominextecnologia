import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvReturnMutationResult, PdvReturnWorkspace } from '@/hooks/usePdvReturns';
import { PdvReturnDialog } from './PdvReturnDialog';

const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => { if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
// Identidade/reload usa o hook real na suíte durable; esta suíte isola controles e ciclo visual.
vi.mock('@/hooks/usePdvReturnIntent', () => ({
  usePdvReturnPending: () => ({ pending: false, storageError: null }),
  usePdvDurableReturn: () => ({ token: { epoch: 'fixture-epoch' }, ready: true, pending: false, busy: false, storageError: null, intent: null, isCurrent: () => true,
    submit: async (input: object, summary: { itemCount: number; total: number }) => ({ result: await mocks.mutate({ ...input, attemptId: crypto.randomUUID() }), summary }), retry: vi.fn() }),
}));
vi.mock('@/hooks/usePdvReturns', async importOriginal => ({ ...await importOriginal<typeof import('@/hooks/usePdvReturns')>(), usePdvCreateReturn: () => ({ mutateAsync: mocks.mutate, isPending: false }) }));
vi.mock('@/components/ui/responsive-dialog', () => ({ ResponsiveDialog: ({ open, children, footer }: { open: boolean; children: ReactNode; footer?: ReactNode }) => open ? <div role="dialog">{children}{footer}</div> : null }));
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: ({ ariaLabel, value, max, disabled }: { ariaLabel: string; value: string; max: string; disabled?: boolean }) => <button type="button" aria-label={ariaLabel} data-max={max} disabled={disabled}>{value}</button> }));
const workspace: PdvReturnWorkspace = {
  orderId: 'order-1', orderNumber: 42, customerId: 'customer-1',
  items: [{ deliveryItemId: 'delivery-1', orderItemId: 'item-1', description: 'Cabo', itemType: 'material', deliveredQuantity: 2, returnableQuantity: 2, commercialAmount: 200 }],
  stocks: [{ id: 'stock-sale', name: 'Prateleira', destination: 'saleable' }, { id: 'stock-quarantine', name: 'Conferência', destination: 'quarantine' }], receivables: [], history: [],
};
beforeEach(() => { mocks.mutate.mockReset().mockResolvedValue({}); mocks.toast.mockReset(); });

async function choose(name: string, option: string | RegExp) {
  fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

function fillReturn() {
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cabo' }), { target: { value: '1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da devolução' }), { target: { value: 'Peça devolvida pelo cliente' } });
}

const confirmedResult: PdvReturnMutationResult = { id: 'return-1', orderId: 'order-1', commercialTotal: 25, idempotent: false };

describe('controles próprios na devolução', () => {
  it('troca a condição e mantém o local, valor e payload canônicos ao confirmar', async () => {
    render(<PdvReturnDialog open onOpenChange={vi.fn()} workspace={workspace} canBackdate={false} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cabo' }), { target: { value: '1' } });
    await choose('Condição do item devolvido', 'Quarentena');
    expect(screen.getByRole('combobox', { name: 'Local de destino' })).toHaveTextContent('Conferência');
    expect(screen.getByRole('button', { name: 'Data da devolução' })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da devolução' }), { target: { value: 'Peça voltou para conferência' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', lines: [{ deliveryItemId: 'delivery-1', quantity: 1, destination: 'quarantine', destinationStockId: 'stock-quarantine' }], dispositions: [{ kind: 'customer_credit', amount: 100 }] })));
  });

  it('seleciona a dívida no controle próprio sem registrar movimento antes da confirmação', async () => {
    render(<PdvReturnDialog open onOpenChange={vi.fn()} workspace={{ ...workspace, receivables: [{ id: 'debt-1', description: 'Compra de outubro', dueDate: null, openAmount: 20 }, { id: 'debt-2', description: 'Compra de novembro', dueDate: null, openAmount: 80 }] }} canBackdate />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cabo' }), { target: { value: '1' } });
    await choose('Conta em aberto', /Compra de novembro/);
    expect(screen.getByRole('combobox', { name: 'Conta em aberto' })).toHaveTextContent('Compra de novembro');
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da devolução' }), { target: { value: 'Devolver e abater a conta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ dispositions: [{ kind: 'receivable_reduction', amount: 80, receivableTransactionId: 'debt-2' }, { kind: 'customer_credit', amount: 20 }] })));
  });

  it('preserva motivo e quantidade ao atualizar os dados do mesmo pedido', () => {
    const props = { open: true, onOpenChange: vi.fn(), workspace, canBackdate: false };
    const { rerender } = render(<PdvReturnDialog {...props} />);
    fillReturn();

    rerender(<PdvReturnDialog {...props} workspace={{ ...workspace, items: workspace.items.map(item => ({ ...item })), stocks: [...workspace.stocks] }} />);

    expect(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cabo' })).toHaveValue(1);
    expect(screen.getByRole('textbox', { name: 'Motivo da devolução' })).toHaveValue('Peça devolvida pelo cliente');
    expect(screen.getByRole('button', { name: 'Confirmar devolução' })).toBeEnabled();
  });

  it('mantém o resumo confirmado pelo servidor depois que o pedido não tem mais itens devolvíveis', async () => {
    mocks.mutate.mockResolvedValue(confirmedResult);
    const onCompleted = vi.fn();
    const props = { open: true, onOpenChange: vi.fn(), workspace, canBackdate: false, onCompleted };
    const { rerender } = render(<PdvReturnDialog {...props} />);
    fillReturn();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await screen.findByText('1 item(ns) devolvido(s)');

    rerender(<PdvReturnDialog {...props} workspace={{ ...workspace, items: workspace.items.map(item => ({ ...item, returnableQuantity: 0 })) }} />);

    expect(screen.getByText('1 item(ns) devolvido(s)')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*25,00/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*0,00/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, -1])('usa o resumo enviado se o total confirmado for inválido (%s)', async commercialTotal => {
    mocks.mutate.mockResolvedValue({ ...confirmedResult, commercialTotal });
    render(<PdvReturnDialog open onOpenChange={vi.fn()} workspace={workspace} canBackdate={false} />);
    fillReturn();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));

    await screen.findByText('1 item(ns) devolvido(s)');
    expect(screen.getByText(/R\$\s*100,00/)).toBeInTheDocument();
  });

  it('preserva o resumo enviado quando a invalidação do pedido chega antes da resposta da gravação', async () => {
    let resolve!: (result: PdvReturnMutationResult) => void;
    mocks.mutate.mockReturnValue(new Promise<PdvReturnMutationResult>(resolveResult => { resolve = resolveResult; }));
    const onCompleted = vi.fn();
    const props = { open: true, onOpenChange: vi.fn(), workspace, canBackdate: false, onCompleted };
    const { rerender } = render(<PdvReturnDialog {...props} />);
    fillReturn();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));

    rerender(<PdvReturnDialog {...props} workspace={{ ...workspace, items: workspace.items.map(item => ({ ...item, returnableQuantity: 0 })) }} />);
    await act(async () => { resolve({ ...confirmedResult, commercialTotal: null }); });

    expect(screen.getByText('1 item(ns) devolvido(s)')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*100,00/)).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('aceita total confirmado igual a zero', async () => {
    mocks.mutate.mockResolvedValue({ ...confirmedResult, commercialTotal: 0 });
    render(<PdvReturnDialog open onOpenChange={vi.fn()} workspace={workspace} canBackdate={false} />);
    fillReturn();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));

    await screen.findByText('1 item(ns) devolvido(s)');
    expect(screen.getByText(/R\$\s*0,00/)).toBeInTheDocument();
  });

  it.each(['reabrir', 'trocar pedido'] as const)('limpa o preenchimento e a confirmação ao %s', async transition => {
    mocks.mutate.mockResolvedValue(confirmedResult);
    const props = { open: true, onOpenChange: vi.fn(), workspace, canBackdate: false };
    const { rerender } = render(<PdvReturnDialog {...props} />);
    fillReturn();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await screen.findByText('1 item(ns) devolvido(s)');

    if (transition === 'reabrir') {
      rerender(<PdvReturnDialog {...props} open={false} />);
      rerender(<PdvReturnDialog {...props} />);
    } else {
      rerender(<PdvReturnDialog {...props} workspace={{ ...workspace, orderId: 'order-2', orderNumber: 43 }} />);
    }

    expect(screen.queryByText('1 item(ns) devolvido(s)')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cabo' })).toHaveValue(0);
    expect(screen.getByRole('textbox', { name: 'Motivo da devolução' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Confirmar devolução' })).toBeDisabled();
  });

  describe.each(['sucesso', 'erro'] as const)('resposta obsoleta com %s', outcome => {
    it.each(['fechar', 'desmontar', 'reabrir', 'pedido A→B→A'] as const)('ignora efeitos após %s', async transition => {
      let resolve!: (result: PdvReturnMutationResult) => void;
      let reject!: (error: Error) => void;
      mocks.mutate.mockReturnValue(new Promise<PdvReturnMutationResult>((resolveResult, rejectResult) => { resolve = resolveResult; reject = rejectResult; }));
      const onCompleted = vi.fn();
      const props = { open: true, onOpenChange: vi.fn(), workspace, canBackdate: false, onCompleted };
      const { rerender, unmount } = render(<PdvReturnDialog {...props} />);
      fillReturn();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
      expect(mocks.mutate).toHaveBeenCalledTimes(1);

      if (transition === 'desmontar') unmount();
      else if (transition === 'pedido A→B→A') {
        rerender(<PdvReturnDialog {...props} workspace={{ ...workspace, orderId: 'order-2' }} />);
        rerender(<PdvReturnDialog {...props} />);
      } else {
        rerender(<PdvReturnDialog {...props} open={false} />);
        if (transition === 'reabrir') rerender(<PdvReturnDialog {...props} />);
      }

      await act(async () => {
        if (outcome === 'sucesso') resolve(confirmedResult);
        else reject(new Error('Falha após encerrar a sessão'));
      });

      expect(onCompleted).not.toHaveBeenCalled();
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(screen.queryByText('1 item(ns) devolvido(s)')).not.toBeInTheDocument();
    });
  });
});

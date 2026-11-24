import type { ComponentProps, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvReturnMutationResult, PdvReturnWorkspace } from '@/hooks/usePdvReturns';
import { PdvReturnsPanel, type PdvReturnsAccess } from './PdvReturnsPanel';

const mocks = vi.hoisted(() => ({
  scope: { key: ['company-1', 'user-1', 'ready'], ready: true },
  query: { isLoading: false, isError: false, isFetching: false, data: undefined as PdvReturnWorkspace | undefined },
  refetch: vi.fn(), mutate: vi.fn(), toast: vi.fn(),
}));
vi.mock('@/hooks/pdvReportCache', async importOriginal => ({ ...await importOriginal<typeof import('@/hooks/pdvReportCache')>(), usePdvAuthorizedQueryScope: () => mocks.scope }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
// Identidade/reload usa o hook real na suíte durable; esta suíte isola controles e ciclo visual.
vi.mock('@/hooks/usePdvReturnIntent', () => ({
  usePdvReturnPending: () => ({ pending: false, storageError: null }),
  usePdvDurableReturn: () => ({ token: { epoch: 'fixture-epoch' }, ready: true, pending: false, busy: false, storageError: null, intent: null, isCurrent: () => true,
    submit: async (input: object, summary: { itemCount: number; total: number }) => ({ result: await mocks.mutate({ ...input, attemptId: crypto.randomUUID() }), summary }), retry: vi.fn() }),
}));
vi.mock('@/components/ui/responsive-dialog', () => ({ ResponsiveDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer?: ReactNode }) => open ? <div role="dialog"><h2>{title}</h2>{children}{footer}</div> : null }));
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: () => null }));
vi.mock('./PdvCancelResidualDialog', () => ({ PdvCancelResidualDialog: () => null }));
vi.mock('@/hooks/usePdvReturns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePdvReturns')>();
  return {
    ...actual,
    usePdvReturnWorkspace: () => ({ ...mocks.query, refetch: mocks.refetch }),
    usePdvCreateReturn: () => ({ mutateAsync: mocks.mutate, isPending: false }),
  };
});

const workspace: PdvReturnWorkspace = {
  orderId: 'order-1', orderNumber: 42, customerId: 'customer-1',
  items: [{ deliveryItemId: 'delivery-1', orderItemId: 'item-1', description: 'Cimento', itemType: 'material', deliveredQuantity: 1, returnableQuantity: 1, commercialAmount: 25 }],
  stocks: [{ id: 'stock-1', name: 'Loja', destination: 'saleable' }], receivables: [], history: [],
};
const result: PdvReturnMutationResult = { id: 'return-1', orderId: 'order-1', commercialTotal: 25, idempotent: false };
const access: PdvReturnsAccess = { enabled: true, canReturn: true, canReverse: false, canCancelResidual: true, canBackdate: false };
const panelProps = () => ({ orderId: 'order-1', orderNumber: 42, remainingQuantity: 3, access, onReload: vi.fn() });
const renderPanel = (props?: Partial<ComponentProps<typeof PdvReturnsPanel>>) => {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<PdvReturnsPanel {...panelProps()} {...props} />, { wrapper });
};
function openAndFill() {
  fireEvent.click(screen.getByRole('button', { name: 'Devolver itens' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cimento' }), { target: { value: '1' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da devolução' }), { target: { value: 'Último item voltou para loja' } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = { key: ['company-1', 'user-1', 'ready'], ready: true };
  mocks.query = { isLoading: false, isError: false, isFetching: false, data: { ...workspace } };
  mocks.mutate.mockReset().mockResolvedValue(result);
  mocks.refetch.mockReset().mockResolvedValue(undefined);
});

describe('integração W5 no detalhe de expedição', () => {
  it('mostra devolução para fatia entregue e cancelamento somente com residual', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Devolver itens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar saldo não entregue' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma devolução registrada neste pedido.')).toBeInTheDocument();
  });

  it('não mostra cancelamento quando não existe saldo não entregue', () => {
    renderPanel({ remainingQuantity: 0 });
    expect(screen.queryByRole('button', { name: 'Cancelar saldo não entregue' })).not.toBeInTheDocument();
  });

  it('não adiciona complexidade quando a flag está fechada', () => {
    renderPanel({ access: { ...access, enabled: false } });
    expect(screen.queryByText('Pós-venda do pedido')).not.toBeInTheDocument();
  });

  it('mantém confirmação do último item após refetch sem devolvíveis até concluir', async () => {
    const props = panelProps();
    const { rerender } = renderPanel(props);
    openAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await screen.findByRole('heading', { name: 'Devolução confirmada' });

    mocks.query = { ...mocks.query, isFetching: true, data: { ...workspace, items: workspace.items.map(item => ({ ...item, returnableQuantity: 0 })) } };
    rerender(<PdvReturnsPanel {...props} />);
    expect(screen.getByText('1 item(ns) devolvido(s)')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*25,00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Devolver itens' })).not.toBeInTheDocument();

    mocks.query = { ...mocks.query, isFetching: false, data: { ...mocks.query.data! } };
    rerender(<PdvReturnsPanel {...props} />);
    expect(screen.getByRole('heading', { name: 'Devolução confirmada' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Motivo da devolução' })).not.toBeInTheDocument();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(props.onReload).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });

  it('preserva a instância durante refetch antes de receber o resultado da última devolução', async () => {
    let resolve!: (value: PdvReturnMutationResult) => void;
    mocks.mutate.mockReturnValue(new Promise<PdvReturnMutationResult>(resolveResult => { resolve = resolveResult; }));
    const props = panelProps();
    const { rerender } = renderPanel(props);
    openAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    mocks.query = { ...mocks.query, isFetching: true, data: { ...workspace, items: workspace.items.map(item => ({ ...item, returnableQuantity: 0 })) } };
    rerender(<PdvReturnsPanel {...props} />);
    await act(async () => { resolve(result); });
    expect(screen.getByRole('heading', { name: 'Devolução confirmada' })).toBeInTheDocument();
    expect(screen.getByText('1 item(ns) devolvido(s)')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*25,00/)).toBeInTheDocument();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(props.onReload).toHaveBeenCalledTimes(1);
  });

  it('fecha e limpa o formulário ao trocar operador com cache válido do mesmo pedido, inclusive A→B→A', () => {
    const props = panelProps();
    const { rerender } = renderPanel(props);
    openAndFill();

    mocks.scope = { key: ['company-1', 'user-2', 'ready'], ready: true };
    rerender(<PdvReturnsPanel {...props} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mocks.scope = { key: ['company-1', 'user-1', 'ready'], ready: true };
    rerender(<PdvReturnsPanel {...props} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Devolver itens' }));
    expect(screen.getByRole('textbox', { name: 'Motivo da devolução' })).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cimento' })).toHaveValue(0);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it.each(['trocar pedido', 'perder dados', 'erro', 'carregar', 'aguardar contexto', 'revogar acesso'] as const)('fecha sem reabrir automaticamente ao %s', transition => {
    const props = panelProps();
    const { rerender } = renderPanel(props);
    openAndFill();
    let nextProps = props;
    if (transition === 'trocar pedido') nextProps = { ...props, orderId: 'order-2' };
    if (transition === 'perder dados') mocks.query.data = undefined;
    if (transition === 'erro') mocks.query.isError = true;
    if (transition === 'carregar') mocks.query.isLoading = true;
    if (transition === 'aguardar contexto') mocks.scope = { ...mocks.scope, ready: false };
    if (transition === 'revogar acesso') nextProps = { ...props, access: { ...access, canReturn: false, canReverse: true } };
    rerender(<PdvReturnsPanel {...nextProps} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Motivo da devolução' })).not.toBeInTheDocument();

    mocks.query = { isLoading: false, isError: false, isFetching: false, data: { ...workspace } };
    mocks.scope = { ...mocks.scope, ready: true };
    rerender(<PdvReturnsPanel {...props} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it.each(['trocar operador', 'revogar acesso'] as const)('ignora resposta pendente após %s', async transition => {
    let resolve!: (value: PdvReturnMutationResult) => void;
    mocks.mutate.mockReturnValue(new Promise<PdvReturnMutationResult>(resolveResult => { resolve = resolveResult; }));
    const props = panelProps();
    const { rerender } = renderPanel(props);
    openAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    if (transition === 'trocar operador') {
      mocks.scope = { key: ['company-1', 'user-2', 'ready'], ready: true };
      rerender(<PdvReturnsPanel {...props} />);
      mocks.scope = { key: ['company-1', 'user-1', 'ready'], ready: true };
      rerender(<PdvReturnsPanel {...props} />);
    } else {
      rerender(<PdvReturnsPanel {...props} access={{ ...access, canReturn: false, canReverse: true }} />);
    }
    await act(async () => { resolve(result); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(props.onReload).not.toHaveBeenCalled();
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const { state, save, toast } = vi.hoisted(() => ({ state: { key: 'scope-a', loading: false, error: false, ready: true }, save: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/usePdvCoupons', () => ({ usePdvCoupons: () => { const key = state.key; return { contextKey: key, coupons: [], customers: [], inventory: [], isLoading: state.loading, isError: state.error, error: state.error ? new Error('Seu perfil não tem permissão para gerenciar cupons.') : null, isCurrent: () => state.ready && state.key === key, save: { mutateAsync: save, isPending: false } }; } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', timezone: 'America/Sao_Paulo', currency: 'BRL' }) }));
import PdvCoupons from './PdvCoupons';

describe('gestão de cupons promocionais', () => {
  beforeAll(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  beforeEach(() => { vi.clearAllMocks(); state.key = 'scope-a'; state.loading = false; state.error = false; state.ready = true; });
  it('começa sem seleção, cria no detalhe e envia regras de venda sem saldo/voucher', async () => {
    save.mockImplementation(async (input: { rules: object }) => ({ ...input.rules, id: 'coupon', revision: 1, status: 'available', used_count: 0 }));
    render(<PdvCoupons />); expect(screen.getByText('Selecione um cupom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
    expect(screen.getByLabelText('Código')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'Exemplo10' } });
    fireEvent.change(screen.getByLabelText('Nome da promoção'), { target: { value: 'Promoção exemplo' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar cupom' }).closest('form')!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ id: null, revision: null, rules: { code: 'EXEMPLO10', name: 'Promoção exemplo', kind: 'percentage', value: 10, customer_ids: [], inventory_ids: [] } });
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar cupom' }).closest('form')!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0]).toMatchObject({ id: 'coupon', revision: 1 });
    expect(save.mock.calls[1][0].rules).not.toHaveProperty('id');
    expect(save.mock.calls[1][0].rules).not.toHaveProperty('revision');
    expect(screen.getByText(/Cancelamentos após conclusão e devoluções preservam a utilização/)).toBeInTheDocument();
    expect(screen.queryByText(/saldo disponível|usar voucher/i)).not.toBeInTheDocument();
  });
  it('oculta criação sem autorização e mostra carregamento no formato da lista', () => {
    state.error = true; const view = render(<PdvCoupons />);
    expect(screen.getByRole('alert')).toHaveTextContent('Seu perfil não tem permissão');
    expect(screen.queryByRole('button', { name: 'Criar cupom' })).not.toBeInTheDocument();
    state.error = false; state.ready = false; view.rerender(<PdvCoupons />);
    expect(screen.getByRole('status', { name: 'Carregando cupons' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Criar cupom' })).not.toBeInTheDocument();
  });
  it('mascara o formulário durante troca de empresa e não anuncia save obsoleto', async () => {
    let finish!: (value: unknown) => void; save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<PdvCoupons />); fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
    fireEvent.change(screen.getByLabelText('Nome da promoção'), { target: { value: 'Nome da empresa anterior' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar cupom' }).closest('form')!);
    state.key = 'scope-b'; view.rerender(<PdvCoupons />);
    expect(screen.queryByDisplayValue('Nome da empresa anterior')).not.toBeInTheDocument(); expect(screen.getByText('Selecione um cupom')).toBeInTheDocument();
    finish(undefined); await waitFor(() => expect(toast).not.toHaveBeenCalled());
  });
});

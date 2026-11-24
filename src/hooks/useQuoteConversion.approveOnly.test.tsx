import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Quote } from './useQuotes';
import { useQuoteConversion } from './useQuoteConversion';

const state = vi.hoisted(() => ({
  from: vi.fn(),
  toast: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: state.from, rpc: vi.fn() },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-a' } }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: state.toast }),
}));
vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return renderHook(() => useQuoteConversion(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  const chain = {
    update: state.update,
    eq: state.eq,
    in: state.in,
    is: state.is,
    select: state.select,
    maybeSingle: state.maybeSingle,
  };
  state.from.mockReturnValue(chain);
  state.update.mockReturnValue(chain);
  state.eq.mockReturnValue(chain);
  state.in.mockReturnValue(chain);
  state.is.mockReturnValue(chain);
  state.select.mockReturnValue(chain);
  state.maybeSingle.mockResolvedValue({ data: { id: 'quote-a' }, error: null });
});

describe('useQuoteConversion — apenas aprovar', () => {
  it('muda somente o status e protege a aprovação contra estado concorrente', async () => {
    const { result } = mount();
    const quote = {
      id: 'quote-a',
      quote_number: 314,
      status: 'enviado',
      financial_generated_at: null,
      financial_transaction_id: null,
      converted_to_os_id: null,
    } as Quote;

    await act(async () => {
      await expect(result.current.approveQuoteFinancial.mutateAsync({
        quote,
        approval: { mode: 'apenas_aprovar' },
      })).resolves.toEqual({ mode: 'apenas_aprovar', count: 0, primaryId: null });
    });

    expect(state.from).toHaveBeenCalledTimes(1);
    expect(state.from).toHaveBeenCalledWith('quotes');
    expect(state.update).toHaveBeenCalledWith({ status: 'aprovado' });
    expect(state.eq).toHaveBeenCalledWith('id', 'quote-a');
    expect(state.in).toHaveBeenCalledWith('status', ['rascunho', 'enviado']);
    expect(state.is.mock.calls).toEqual([
      ['financial_generated_at', null],
      ['financial_transaction_id', null],
      ['converted_to_os_id', null],
    ]);
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Orçamento aprovado!',
    }));
  });

  it('orienta a atualizar quando outro fluxo altera o orçamento primeiro', async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = mount();
    const quote = {
      id: 'quote-a',
      quote_number: 314,
      status: 'enviado',
      financial_generated_at: null,
      financial_transaction_id: null,
      converted_to_os_id: null,
    } as Quote;

    await act(async () => {
      await expect(result.current.approveQuoteFinancial.mutateAsync({
        quote,
        approval: { mode: 'apenas_aprovar' },
      })).rejects.toThrow('O orçamento foi alterado. Atualize a tela antes de aprovar novamente.');
    });
  });
});

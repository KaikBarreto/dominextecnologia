import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  projectPartyAccountStatement,
  toPartyAccountError,
  usePartyAccountStatement,
} from '@/hooks/usePartyAccountStatement';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const statement = {
  summary: {
    party_type: 'customer', party_id: 'customer-1', open_amount: '120.50',
    available_credit: '35.25', credit_limit: '500', purchase_capacity: '379.50', as_of: '2026-11-07',
    cpf_cnpj: 'não pode entrar', phone: 'não pode entrar',
  },
  entries: [{
    id: 'transaction-1', source_type: 'obligation', amount: '120.50', occurred_on: '2026-11-01',
    description: 'Parcela do pedido', due_date: '2026-11-15', is_paid: false,
    open_amount: '120.50', account_status: 'open', cost_price: 'segredo', document: 'segredo',
  }],
  total_count: 1, limit: 10, offset: 0,
};

describe('usePartyAccountStatement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('projeta somente o contrato permitido, sem documento, contato ou custo', () => {
    const projected = projectPartyAccountStatement(statement);
    expect(projected.summary).toEqual({
      partyType: 'customer', partyId: 'customer-1', openAmount: 120.5,
      availableCredit: 35.25, creditLimit: 500, purchaseCapacity: 379.5, asOf: '2026-11-07',
    });
    expect(projected.entries[0]).toEqual({
      id: 'transaction-1', sourceType: 'obligation', amount: 120.5, occurredOn: '2026-11-01',
      description: 'Parcela do pedido', dueDate: '2026-11-15', isPaid: false,
      openAmount: 120.5, accountStatus: 'open', accountId: null, cashSessionId: null,
      settlementMethod: null, canReverse: false,
    });
    expect(JSON.stringify(projected)).not.toMatch(/cpf|phone|cost_price|document/);
  });

  it('aplica crédito somente pela RPC, preserva idempotência e invalida leituras afetadas', async () => {
    rpc.mockResolvedValueOnce({ data: statement, error: null });
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePartyAccountStatement({
      partyType: 'customer', partyId: 'customer-1', page: 1,
    }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rpc.mockResolvedValueOnce({ data: { ok: true, entry_id: 'entry-1', available_credit: 15.25 }, error: null });
    await act(async () => {
      await result.current.applyCredit.mutateAsync({
        financialTransactionId: 'transaction-1', amount: 20, occurredOn: '2026-11-07',
        description: 'Aplicação autorizada', idempotencyKey: 'same-attempt-key',
      });
    });

    expect(rpc).toHaveBeenCalledWith('pdv_apply_party_credit_v2', {
      p_party_type: 'customer', p_party_id: 'customer-1',
      p_financial_transaction_id: 'transaction-1', p_amount: 20,
      p_occurred_on: '2026-11-07', p_description: 'Aplicação autorizada',
      p_idempotency_key: 'same-attempt-key',
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['party-account-v2'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['financial-transactions'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-orders'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['customers'] });
    });
  });

  it('oculta rollout/permissão sem expor código interno', () => {
    const error = toPartyAccountError({
      message: 'internal', details: 'code=pdv_party_account_rollout_disabled', code: '42501',
    });
    expect(error.kind).toBe('hidden');
    expect(error.message).not.toContain('pdv_party');
  });

  it('não repassa mensagem desconhecida, constraint ou SQLSTATE para a interface', () => {
    const error = toPartyAccountError({
      message: 'duplicate key violates constraint pdv_party_credit_request_unique',
      details: 'Key (operation_request_id)=(secret-id) already exists.',
      code: '23505',
    });
    expect(error.message).toBe('Não foi possível atualizar esta conta agora. Tente novamente.');
    expect(error.message).not.toMatch(/constraint|operation_request|23505|secret/i);
  });

  it('repete um estorno com a mesma chave da tentativa após falha transitória', async () => {
    rpc.mockResolvedValueOnce({ data: statement, error: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePartyAccountStatement({
      partyType: 'customer', partyId: 'customer-1',
    }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'rede indisponível' } })
      .mockResolvedValueOnce({ data: { ok: true, entry_id: 'reversal-1', available_credit: 35.25 }, error: null });
    const input = { entryId: 'credit-1', reason: 'Lançamento duplicado', idempotencyKey: 'reverse-attempt-1' };
    await expect(result.current.reverseCredit.mutateAsync(input)).rejects.toThrow('Não foi possível atualizar');
    await act(async () => { await result.current.reverseCredit.mutateAsync(input); });

    const reverseCalls = rpc.mock.calls.filter(([name]) => name === 'pdv_reverse_party_credit_entry_v2');
    expect(reverseCalls).toEqual([
      ['pdv_reverse_party_credit_entry_v2', {
        p_entry_id: 'credit-1', p_reason: 'Lançamento duplicado', p_idempotency_key: 'reverse-attempt-1',
      }],
      ['pdv_reverse_party_credit_entry_v2', {
        p_entry_id: 'credit-1', p_reason: 'Lançamento duplicado', p_idempotency_key: 'reverse-attempt-1',
      }],
    ]);
  });
});

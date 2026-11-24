import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, scope } = vi.hoisted(() => ({ rpc: vi.fn(), scope: { ready: true, key: ['scope', 'company-1', 'user-1', 'explicit', 'screen:customers|fn:view_customer_financial', 'operator'] } }));
vi.mock('@/hooks/pdvReportCache', async importOriginal => ({ ...await importOriginal<typeof import('@/hooks/pdvReportCache')>(), usePdvAuthorizedQueryScope: () => scope }));
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
  beforeEach(() => { vi.clearAllMocks(); scope.ready = true; scope.key = ['scope', 'company-1', 'user-1', 'explicit', 'screen:customers|fn:view_customer_financial', 'operator']; });

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
      settlementMethod: null, canReverse: false, requiresCashSession: false,
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

  it('preserva o caixa efetivo no Pix e atualiza caixa, fiado e relatórios após receber', async () => {
    rpc.mockResolvedValue({ data: statement, error: null });
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePartyAccountStatement({ partyType: 'customer', partyId: 'customer-1' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rpc.mockResolvedValueOnce({ data: { ok: true, financial_transaction_id: 'receipt-1' }, error: null });
    await act(async () => { await result.current.settleReceivable.mutateAsync({
      receivableId: 'obligation-1', amount: 4, method: 'pix', accountId: 'bank-1', cashSessionId: 'receiver-session-2',
      receivedOn: '2026-11-14', notes: 'Parcial', idempotencyKey: 'stable-receipt-key',
    }); });
    expect(rpc).toHaveBeenCalledWith('pdv_party_settle_receivables_v2', expect.objectContaining({
      p_session_id: 'receiver-session-2', p_method: 'pix', p_account_id: 'bank-1', p_idempotency_key: 'stable-receipt-key',
    }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-cash-sessions-v2', 'snapshot'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'reports-v2'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-customer-payment-options'] });
  });

  it.each([
    'pdv_receivable_receiving_context_required', 'pdv_receivable_receiving_context_mismatch',
    'pdv_receivable_receiving_context_missing', 'PDV_CASH_SESSION_FORBIDDEN',
  ])('orienta o usuário sem expor detalhes internos para %s', code => {
    const error = toPartyAccountError({ message: 'constraint internal', details: `code=${code}`, code: '42501' });
    expect(error.message).not.toMatch(/pdv_|constraint|42501|internal/i);
    expect(error.message).toMatch(/caixa/i);
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
  it('descarta o extrato e opções do cache quando a permissão é revogada', async () => {
    rpc.mockImplementation((name: string) => Promise.resolve(name === 'pdv_party_receivable_options_v3'
      ? { data: { accounts: [{ id: 'bank-1', name: 'Banco autorizado', type: 'banco' }], cash_sessions: [] }, error: null }
      : { data: statement, error: null }));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => usePartyAccountStatement({ partyType: 'customer', partyId: 'customer-1', receivablesEnabled: true }), { wrapper });
    await waitFor(() => expect(result.current.statement?.summary.availableCredit).toBe(35.25));
    await waitFor(() => expect(result.current.receivableOptions.data?.accounts).toHaveLength(1));
    scope.key = ['scope', 'company-1', 'user-1', 'explicit', 'screen:pdv', 'operator'];
    rpc.mockResolvedValue({ data: null, error: { details: 'code=pdv_party_account_permission_denied', code: '42501' } });
    rerender();
    expect(result.current.statement).toBeNull();
    expect(result.current.receivableOptions.data).toBeUndefined();
    await waitFor(() => expect(result.current.isHidden).toBe(true));
    expect(result.current.statement).toBeNull();
  });

  it.each(['company', 'user', 'loading'])('não reaproveita extrato ao trocar %s', async change => {
    rpc.mockResolvedValue({ data: statement, error: null });
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => usePartyAccountStatement({ partyType: 'customer', partyId: 'customer-1' }), { wrapper });
    await waitFor(() => expect(result.current.statement).not.toBeNull());
    const calls = rpc.mock.calls.length;
    if (change === 'company') scope.key = ['scope', 'company-2', 'user-1', 'explicit', '*', 'admin'];
    if (change === 'user') scope.key = ['scope', 'company-1', 'user-2', 'explicit', '*', 'admin'];
    scope.ready = false;
    rerender();
    expect(result.current.statement).toBeNull();
    expect(result.current.data).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(calls);
  });

});

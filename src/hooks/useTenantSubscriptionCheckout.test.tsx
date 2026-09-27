import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

import {
  parseTenantSubscriptionCheckout,
  useTenantSubscriptionCheckout,
} from './useTenantSubscriptionCheckout';

function payload(overrides: Record<string, unknown> = {}) {
  return {
    checkout: {
      kind: 'pix_auto',
      status: 'pending',
      expires_at: '2030-01-02T12:00:00Z',
      checkout_url: null,
      qr_code: 'base64qr',
      copy_paste: '000201010212',
      authorization_id: 'aut_nao_pode_vazar',
    },
    subscription: {
      description: 'Manutenção mensal',
      value: 149.9,
      cycle: 'MONTHLY',
      next_due_date: '2030-02-25',
      billing_type: 'PIX_AUTO',
      id: 'sub_nao_pode_vazar',
      cost: 17,
    },
    merchant: { name: 'Empresa Teste', logo_url: null, company_id: 'tenant-secreto' },
    customer: { first_name: 'Maria da Silva', email: 'nao@exibir.test', id: 'customer-secreto' },
    ...overrides,
  };
}

describe('useTenantSubscriptionCheckout', () => {
  beforeEach(() => invoke.mockReset());

  it('invoca a edge anônima com body short_code e mantém somente a allowlist no cache', async () => {
    invoke.mockResolvedValue({ data: payload(), error: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTenantSubscriptionCheckout('abc234def567'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invoke).toHaveBeenCalledWith('get-tenant-subscription-checkout', {
      body: { short_code: 'abc234def567' },
    });
    expect(result.current.data?.customer.first_name).toBe('Maria');
    expect(JSON.stringify(result.current.data)).not.toContain('authorization_id');
    expect(JSON.stringify(result.current.data)).not.toContain('company_id');
    expect(JSON.stringify(result.current.data)).not.toContain('customer-secreto');
    expect(JSON.stringify(result.current.data)).not.toContain('nao@exibir.test');
    expect(JSON.stringify(result.current.data)).not.toContain('"cost"');
  });

  it('falha fechado em payload incompleto ou URL externa fora da Asaas', () => {
    expect(parseTenantSubscriptionCheckout({ checkout: { kind: 'pix_auto' } })).toBeNull();

    const parsed = parseTenantSubscriptionCheckout(payload({
      checkout: {
        kind: 'asaas',
        status: 'pending',
        expires_at: null,
        checkout_url: 'https://malicioso.test/checkout',
        qr_code: null,
        copy_paste: null,
      },
    }));
    expect(parsed?.checkout.checkout_url).toBeNull();
  });
});


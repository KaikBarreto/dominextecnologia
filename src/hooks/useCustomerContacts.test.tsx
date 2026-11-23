import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  abortSignal: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mocks.from },
}));

import {
  CONTACT_MUTATION_TIMEOUT_MS,
  ContactMutationTimeoutError,
  useCustomerContacts,
} from './useCustomerContacts';

let request: {
  upsert: typeof mocks.upsert;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  abortSignal: typeof mocks.abortSignal;
};

describe('useCustomerContacts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    request = {
      upsert: mocks.upsert,
      select: vi.fn(() => request),
      single: vi.fn(() => new Promise(() => {})),
      abortSignal: mocks.abortSignal,
    };
    mocks.from.mockReturnValue(request);
    mocks.upsert.mockImplementation(() => request);
    mocks.abortSignal.mockImplementation(() => request);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancela a gravação travada e devolve o controle depois do limite', async () => {
    let capturedSignal: AbortSignal | undefined;
    mocks.abortSignal.mockImplementation((signal: AbortSignal) => {
      capturedSignal = signal;
      return request;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCustomerContacts(), { wrapper });

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.createContact.mutateAsync({
        id: 'c7df6fcf-ea4f-4e95-978f-e88f2d315415',
        customer_id: 'customer-1',
        name: 'Contato fictício',
      });
    });
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(0);
    });
    expect(result.current.createContact.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(CONTACT_MUTATION_TIMEOUT_MS);
      await expect(pending).rejects.toBeInstanceOf(ContactMutationTimeoutError);
      vi.advanceTimersByTime(0);
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c7df6fcf-ea4f-4e95-978f-e88f2d315415' }),
      { onConflict: 'id' },
    );
    expect(result.current.createContact.isPending).toBe(false);
  });
});

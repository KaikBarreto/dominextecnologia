import { describe, expect, it, vi } from 'vitest';
import { OS_BILLING_FLAGS_KEY } from '@/hooks/useOsBillingFlags';
import { OS_BILLING_STATE_KEY } from '@/hooks/useOsBillingState';
import { OS_REVENUE_SUMMARY_KEY } from '@/hooks/useOsRevenueSummary';
import { invalidateOsBillingQueries } from './OsBillingDialog';

describe('invalidateOsBillingQueries', () => {
  it('atualiza o estado individual e os selos em lote depois de faturar a OS', () => {
    const invalidateQueries = vi.fn();

    invalidateOsBillingQueries(
      { invalidateQueries } as unknown as Parameters<typeof invalidateOsBillingQueries>[0],
      'os-123',
    );

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [OS_REVENUE_SUMMARY_KEY] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [OS_BILLING_STATE_KEY, 'os-123'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [OS_BILLING_FLAGS_KEY] });
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
  });
});

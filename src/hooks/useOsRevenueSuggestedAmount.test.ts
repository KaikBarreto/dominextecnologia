import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCurrentUserCompanyId,
  from,
  select,
  eqCompany,
  eqId,
  maybeSingle,
} = vi.hoisted(() => ({
  getCurrentUserCompanyId: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eqCompany: vi.fn(),
  eqId: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));

import { fetchOsRevenueSuggestedAmount } from './useOsRevenueSuggestedAmount';

describe('fetchOsRevenueSuggestedAmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserCompanyId.mockResolvedValue('company-1');
    eqId.mockReturnValue({ maybeSingle });
    eqCompany.mockReturnValue({ eq: eqId });
    select.mockReturnValue({ eq: eqCompany });
    from.mockReturnValue({ select });
  });

  it.each([
    [875.4, 875.4],
    ['875.40', 875.4],
    [0, 0],
  ])('normaliza total_value %p para %p', async (databaseValue, expected) => {
    maybeSingle.mockResolvedValue({ data: { total_value: databaseValue }, error: null });

    await expect(fetchOsRevenueSuggestedAmount('os-1')).resolves.toBe(expected);
    expect(from).toHaveBeenCalledWith('service_orders');
    expect(select).toHaveBeenCalledWith('total_value');
    expect(eqCompany).toHaveBeenCalledWith('company_id', 'company-1');
    expect(eqId).toHaveBeenCalledWith('id', 'os-1');
  });

  it.each([null, undefined, 'abc', Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'descarta total inválido %p',
    async (databaseValue) => {
      maybeSingle.mockResolvedValue({ data: { total_value: databaseValue }, error: null });
      await expect(fetchOsRevenueSuggestedAmount('os-1')).resolves.toBeNull();
    },
  );

  it('não consulta sem empresa autenticada', async () => {
    getCurrentUserCompanyId.mockResolvedValue(null);

    await expect(fetchOsRevenueSuggestedAmount('os-1')).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('transforma erro e exceção de infraestrutura em null', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(fetchOsRevenueSuggestedAmount('os-1')).resolves.toBeNull();

    getCurrentUserCompanyId.mockRejectedValueOnce(new Error('sessão indisponível'));
    await expect(fetchOsRevenueSuggestedAmount('os-1')).resolves.toBeNull();
  });
});

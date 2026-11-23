import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
  },
}));

import {
  clearTenantStorageCache,
  IMMUTABLE_STORAGE_CACHE_SECONDS,
  tenantFileOptions,
} from '@/utils/tenantStorage';

describe('tenantFileOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTenantStorageCache();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    });
    mocks.maybeSingle.mockResolvedValue({ data: { company_id: 'company-1' } });
  });

  it('usa cache longo e preserva o carimbo da empresa', async () => {
    await expect(tenantFileOptions()).resolves.toEqual({
      cacheControl: IMMUTABLE_STORAGE_CACHE_SECONDS,
      metadata: { company_id: 'company-1' },
    });
  });

  it('mantém metadata do chamador e autoridade do company_id resolvido', async () => {
    await expect(tenantFileOptions({
      metadata: { category: 'invoice', company_id: 'forged-company' },
    })).resolves.toEqual({
      cacheControl: IMMUTABLE_STORAGE_CACHE_SECONDS,
      metadata: { category: 'invoice', company_id: 'company-1' },
    });
  });

  it('permite override explícito do cache', async () => {
    await expect(tenantFileOptions({ cacheControl: '3600' })).resolves.toMatchObject({
      cacheControl: '3600',
    });
  });

  it('aplica cache longo mesmo sem empresa resolvida', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    await expect(tenantFileOptions({ contentType: 'image/webp' })).resolves.toEqual({
      cacheControl: IMMUTABLE_STORAGE_CACHE_SECONDS,
      contentType: 'image/webp',
    });
  });
});

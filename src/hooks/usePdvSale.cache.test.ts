import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { invalidatePdvSaleCaches } from './usePdvSale';

describe('cache da venda PDV legada', () => {
  it('invalida relatórios, materiais e Curva ABC após liquidação ou substituição', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await invalidatePdvSaleCaches(client);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'reports-v2'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['material-purchase-report'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'abc-report'] });
  });
});

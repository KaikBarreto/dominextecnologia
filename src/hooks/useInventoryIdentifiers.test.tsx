import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  InventoryIdentifierError,
  mapInventoryIdentifierError,
  projectResolvedInventoryIdentifier,
  useInventoryIdentifiers,
} from '@/hooks/useInventoryIdentifiers';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useInventoryIdentifiers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolve pela RPC dedicada e projeta somente a allowlist comercial', async () => {
    rpc.mockResolvedValue({
      data: {
        identifier_id: 'identifier-1', identifier_type: 'barcode', code: '789',
        unit_label: 'caixa', unit_factor: 12, is_primary: true,
        material: {
          id: 'material-1', name: 'Parafuso', sku: 'PAR-1', unit: 'un', sale_price: 2.5, archived_at: null,
          cost_price: 1.25, fiscal_gtin: 'privado', supplier: 'Fornecedor', quantity: 999,
        },
      },
      error: null,
    });
    const { result } = renderHook(() => useInventoryIdentifiers(), { wrapper });
    let resolved: Awaited<ReturnType<typeof result.current.resolve.mutateAsync>>;
    await act(async () => {
      resolved = await result.current.resolve.mutateAsync({ code: '789' });
    });
    expect(rpc).toHaveBeenCalledWith('inventory_resolve_identifier_v2', {
      p_code: '789', p_identifier_type: null,
    });
    expect(resolved!).toEqual({
      identifierId: 'identifier-1', identifierType: 'barcode', code: '789',
      unitLabel: 'caixa', unitFactor: 12, isPrimary: true,
      material: { id: 'material-1', name: 'Parafuso', sku: 'PAR-1', unit: 'un', salePrice: 2.5, archivedAt: null },
    });
    expect(resolved!.material).not.toHaveProperty('cost_price');
    expect(resolved!.material).not.toHaveProperty('fiscal_gtin');
    expect(resolved!.material).not.toHaveProperty('quantity');
  });

  it('retorna null para codigo desconhecido e recusa payload incompleto', () => {
    expect(projectResolvedInventoryIdentifier(null)).toBeNull();
    expect(projectResolvedInventoryIdentifier({ identifier_id: 'x', material: { id: 'y' } })).toBeNull();
  });

  it('gera codigo interno somente pela unidade-base, sem prometer fator de embalagem', async () => {
    rpc.mockResolvedValue({
      data: {
        identifier_id: 'identifier-1', inventory_id: 'material-1', identifier_type: 'internal',
        code: 'DX-ABC', unit_label: 'un', unit_factor: 1, is_primary: true, is_active: true,
      },
      error: null,
    });
    const { result } = renderHook(() => useInventoryIdentifiers(), { wrapper });
    await act(async () => {
      await result.current.generateInternal.mutateAsync({ inventoryId: 'material-1' });
    });
    expect(rpc).toHaveBeenCalledWith('inventory_generate_internal_identifier_v2', {
      p_inventory_id: 'material-1',
    });
  });

  it('mapeia codigo interno para orientacao PT-BR sem expor SQL', () => {
    const error = mapInventoryIdentifierError({ code: '23505', details: 'code=inventory_identifier_collision' });
    expect(error).toBeInstanceOf(InventoryIdentifierError);
    expect(error.domainCode).toBe('inventory_identifier_collision');
    expect(error.message).toBe('Este código já está em uso nesta empresa.');
    expect(error.message).not.toContain('23505');
  });
});

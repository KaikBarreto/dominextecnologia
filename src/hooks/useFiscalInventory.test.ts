import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: state.rpc },
}));

import {
  fetchAllFiscalInventory,
  fetchAllFiscalMovements,
  type FiscalInventoryFilters,
  type FiscalMovementFilters,
} from './useFiscalInventory';

const positionFilters: FiscalInventoryFilters = {
  at: '2026-11-23T12:00:00.000Z',
  stockIds: ['stock-a'],
  groupIds: [],
  models: [55],
  query: 'cobre',
  onlyDivergent: true,
  includeZero: false,
  includeArchived: false,
};

const movementFilters: FiscalMovementFilters = {
  dateStart: null,
  dateEnd: '2026-11-23T12:00:00.000Z',
  stockIds: [],
  groupIds: [],
  models: [55, 65],
  events: [],
  query: '',
};

beforeEach(() => vi.clearAllMocks());

describe('estoque fiscal', () => {
  it('preserva os filtros e normaliza números vindos do Postgres', async () => {
    state.rpc.mockResolvedValue({
      data: [{
        stock_id: 'stock-a', stock_name: 'Principal', inventory_id: 'item-a', sku: 'CABO',
        material_name: 'Cabo de cobre', unit: 'M', group_id: null, group_name: null, group_color: null,
        fiscal_balance: '12.5', operational_balance: '10', divergence: '2.5', cost_price: '4',
        fiscal_value: '50', operational_value: '40', total_count: '1', total_fiscal_value: '50',
        total_operational_value: '40', total_divergence_value: '10',
      }],
      error: null,
    });

    const rows = await fetchAllFiscalInventory(positionFilters);

    expect(state.rpc).toHaveBeenCalledWith('fiscal_inventory_report', expect.objectContaining({
      p_at: positionFilters.at,
      p_stock_ids: ['stock-a'],
      p_group_ids: null,
      p_models: [55],
      p_query: 'cobre',
      p_only_divergent: true,
    }));
    expect(rows[0]).toMatchObject({ fiscal_balance: 12.5, divergence: 2.5, total_count: 1 });
  });

  it('não exporta um arquivo truncado acima de 50 mil linhas', async () => {
    state.rpc.mockResolvedValue({
      data: [{ total_count: 50_001 }],
      error: null,
    });

    await expect(fetchAllFiscalInventory(positionFilters)).rejects.toThrow(/50\.001 linhas/);
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });

  it('projeta saldo inicial no histórico de movimentações', async () => {
    state.rpc.mockResolvedValue({
      data: [{
        id: 'opening-a', occurred_at: '2026-11-23T10:00:00.000Z', stock_id: 'stock-a',
        stock_name: 'Principal', inventory_id: 'item-a', sku: null, material_name: 'Cabo', unit: 'M',
        group_id: null, group_name: null, document_model: '0', document_id: 'opening-a',
        document_number: null, access_key: null, source_event: 'opening', direction: 'entrada',
        quantity: '25', balance_before: '0', balance_after: '25',
        unit_cost: '2.5', total_cost: '62.5', total_count: '1',
      }],
      error: null,
    });

    const rows = await fetchAllFiscalMovements(movementFilters);

    expect(rows[0]).toMatchObject({
      source_event: 'opening', document_model: 0, quantity: 25,
      balance_before: 0, balance_after: 25, total_cost: 62.5,
    });
  });
});

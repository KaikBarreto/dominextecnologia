import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FiscalInventoryFilters {
  at: string;
  stockIds: string[];
  groupIds: string[];
  models: number[];
  query: string;
  onlyDivergent: boolean;
  includeZero: boolean;
  includeArchived: boolean;
}

export interface FiscalMovementFilters {
  dateStart: string | null;
  dateEnd: string | null;
  stockIds: string[];
  groupIds: string[];
  models: number[];
  events: string[];
  query: string;
}

export interface FiscalInventoryRow {
  stock_id: string;
  stock_name: string;
  inventory_id: string;
  sku: string | null;
  material_name: string;
  unit: string | null;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  fiscal_balance: number;
  operational_balance: number;
  divergence: number;
  cost_price: number;
  fiscal_value: number;
  operational_value: number;
  total_count: number;
  total_fiscal_value: number;
  total_operational_value: number;
  total_divergence_value: number;
}

export interface FiscalMovementRow {
  id: string;
  occurred_at: string;
  stock_id: string;
  stock_name: string;
  inventory_id: string;
  sku: string | null;
  material_name: string;
  unit: string | null;
  group_id: string | null;
  group_name: string | null;
  document_model: number;
  document_id: string;
  document_number: number | null;
  access_key: string | null;
  source_event: 'authorized' | 'cancelled' | 'opening';
  direction: 'entrada' | 'saida';
  quantity: number;
  balance_before: number;
  balance_after: number;
  unit_cost: number;
  total_cost: number;
  total_count: number;
}

type RpcResponse = { data: unknown; error: { message?: string } | null };
type Rpc = (name: string, params: Record<string, unknown>) => PromiseLike<RpcResponse>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
const arrayOrNull = <T,>(values: T[]) => values.length ? values : null;
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const EXPORT_ROW_LIMIT = 50_000;

function assertExportIsComplete(totalCount: number) {
  if (totalCount > EXPORT_ROW_LIMIT) {
    throw new Error(
      `O filtro atual retorna ${totalCount.toLocaleString('pt-BR')} linhas. `
      + `Refine os filtros para exportar no máximo ${EXPORT_ROW_LIMIT.toLocaleString('pt-BR')} linhas por arquivo.`,
    );
  }
}

const positionParams = (filters: FiscalInventoryFilters, limit: number, offset: number) => ({
  p_at: filters.at,
  p_stock_ids: arrayOrNull(filters.stockIds),
  p_group_ids: arrayOrNull(filters.groupIds),
  p_models: arrayOrNull(filters.models),
  p_query: filters.query.trim() || null,
  p_only_divergent: filters.onlyDivergent,
  p_include_zero: filters.includeZero,
  p_include_archived: filters.includeArchived,
  p_limit: limit,
  p_offset: offset,
});

const movementParams = (filters: FiscalMovementFilters, limit: number, offset: number) => ({
  p_date_start: filters.dateStart,
  p_date_end: filters.dateEnd,
  p_stock_ids: arrayOrNull(filters.stockIds),
  p_group_ids: arrayOrNull(filters.groupIds),
  p_models: arrayOrNull(filters.models),
  p_events: arrayOrNull(filters.events),
  p_query: filters.query.trim() || null,
  p_limit: limit,
  p_offset: offset,
});

function projectPosition(row: Record<string, unknown>): FiscalInventoryRow {
  return {
    ...(row as unknown as FiscalInventoryRow),
    fiscal_balance: numberValue(row.fiscal_balance),
    operational_balance: numberValue(row.operational_balance),
    divergence: numberValue(row.divergence),
    cost_price: numberValue(row.cost_price),
    fiscal_value: numberValue(row.fiscal_value),
    operational_value: numberValue(row.operational_value),
    total_count: numberValue(row.total_count),
    total_fiscal_value: numberValue(row.total_fiscal_value),
    total_operational_value: numberValue(row.total_operational_value),
    total_divergence_value: numberValue(row.total_divergence_value),
  };
}

function projectMovement(row: Record<string, unknown>): FiscalMovementRow {
  return {
    ...(row as unknown as FiscalMovementRow),
    document_model: numberValue(row.document_model),
    document_number: row.document_number == null ? null : numberValue(row.document_number),
    quantity: numberValue(row.quantity),
    balance_before: numberValue(row.balance_before),
    balance_after: numberValue(row.balance_after),
    unit_cost: numberValue(row.unit_cost),
    total_cost: numberValue(row.total_cost),
    total_count: numberValue(row.total_count),
  };
}

export async function fetchAllFiscalInventory(filters: FiscalInventoryFilters) {
  const rows: FiscalInventoryRow[] = [];
  for (let offset = 0; offset < EXPORT_ROW_LIMIT; offset += 500) {
    const result = await rpc('fiscal_inventory_report', positionParams(filters, 500, offset));
    if (result.error) throw new Error(result.error.message || 'Não foi possível exportar o estoque fiscal.');
    const page = (Array.isArray(result.data) ? result.data : []).map((row) => projectPosition(row as Record<string, unknown>));
    if (offset === 0 && page[0]) assertExportIsComplete(page[0].total_count);
    rows.push(...page);
    if (page.length < 500 || rows.length >= (page[0]?.total_count ?? 0)) break;
  }
  return rows;
}

export async function fetchAllFiscalMovements(filters: FiscalMovementFilters) {
  const rows: FiscalMovementRow[] = [];
  for (let offset = 0; offset < EXPORT_ROW_LIMIT; offset += 500) {
    const result = await rpc('fiscal_inventory_movements_report', movementParams(filters, 500, offset));
    if (result.error) throw new Error(result.error.message || 'Não foi possível exportar as movimentações fiscais.');
    const page = (Array.isArray(result.data) ? result.data : []).map((row) => projectMovement(row as Record<string, unknown>));
    if (offset === 0 && page[0]) assertExportIsComplete(page[0].total_count);
    rows.push(...page);
    if (page.length < 500 || rows.length >= (page[0]?.total_count ?? 0)) break;
  }
  return rows;
}

export function useFiscalInventory(filters: FiscalInventoryFilters, page: number, pageSize = 50, enabled = true) {
  return useQuery({
    queryKey: ['fiscal-inventory', 'position', filters, page, pageSize],
    queryFn: async () => {
      const result = await rpc('fiscal_inventory_report', positionParams(filters, pageSize, (page - 1) * pageSize));
      if (result.error) throw new Error(result.error.message || 'Não foi possível carregar o estoque fiscal.');
      return (Array.isArray(result.data) ? result.data : []).map((row) => projectPosition(row as Record<string, unknown>));
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useFiscalMovements(filters: FiscalMovementFilters, page: number, pageSize = 50, enabled = true) {
  return useQuery({
    queryKey: ['fiscal-inventory', 'movements', filters, page, pageSize],
    queryFn: async () => {
      const result = await rpc('fiscal_inventory_movements_report', movementParams(filters, pageSize, (page - 1) * pageSize));
      if (result.error) throw new Error(result.error.message || 'Não foi possível carregar as movimentações fiscais.');
      return (Array.isArray(result.data) ? result.data : []).map((row) => projectMovement(row as Record<string, unknown>));
    },
    enabled,
    staleTime: 15_000,
  });
}

export function useFiscalOpeningBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { stockId: string; inventoryId: string; targetBalance: number; effectiveAt: string; notes?: string }) => {
      const result = await rpc('fiscal_inventory_add_opening_balance', {
        p_stock_id: input.stockId,
        p_inventory_id: input.inventoryId,
        p_target_balance: input.targetBalance,
        p_effective_at: input.effectiveAt,
        p_notes: input.notes?.trim() || null,
      });
      if (result.error) throw new Error(result.error.message || 'Não foi possível informar o saldo inicial.');
      return result.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiscal-inventory'] }),
  });
}

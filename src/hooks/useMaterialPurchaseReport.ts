import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MATERIAL_PURCHASE_REPORT_QUERY_KEY } from '@/hooks/pdvReportCache';

export { MATERIAL_PURCHASE_REPORT_QUERY_KEY } from '@/hooks/pdvReportCache';

export interface MaterialPurchaseHistoryItem {
  date: string;
  kind: 'compra';
  order_id: string;
  order_number: number;
  supplier_id: string;
  supplier_name: string;
  stock_id: string;
  stock_name: string;
  created_by: string | null;
  created_by_name: string;
  financial_transaction_id: string | null;
  payment_method: string | null;
  is_paid: boolean | null;
  payment_status: 'pago' | 'pendente' | 'nao_vinculado' | 'nao_informado';
  flow_type: string;
  unit: string;
  quantity: number;
  unit_price: number | null;
  total: number | null;
}

export interface MaterialPurchaseReportRow {
  inventory_id: string;
  sku: string;
  material_name: string;
  unit: string;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
  current_balance: number;
  registered_sale_price: number;
  purchased_quantity: number;
  priced_quantity: number;
  unpriced_quantity: number;
  purchased_total: number;
  average_paid: number | null;
  purchase_count: number;
  last_purchase_date: string | null;
  history: MaterialPurchaseHistoryItem[];
  delivered_quantity?: number | null;
  returned_quantity?: number | null;
  net_sold_quantity?: number | null;
  returned_amount?: number | null;
  net_revenue?: number | null;
  net_cmv?: number | null;
  cost_coverage?: 'not_applicable' | 'partial' | 'complete' | null;
  cost_coverage_percent?: number | null;
  margin?: number | null;
}

interface Params {
  startDate?: string;
  endDate?: string;
  stockIds?: string[] | null;
  supplierIds?: string[] | null;
  groupIds?: string[] | null;
  createdByIds?: string[] | null;
}

export class MaterialPurchaseReportContractError extends Error {
  constructor() {
    super('O relatório de materiais recebido está incompleto. Atualize a tela e tente novamente.');
  }
}

const reportRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MaterialPurchaseReportContractError();
  }
  return value as Record<string, unknown>;
};

const reportText = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new MaterialPurchaseReportContractError();
  return value;
};

const reportString = (value: unknown): string => {
  if (typeof value !== 'string') throw new MaterialPurchaseReportContractError();
  return value;
};

const reportNullableText = (value: unknown): string | null => (
  value === null ? null : reportText(value)
);

const reportNullableString = (value: unknown): string | null => (
  value === null ? null : reportString(value)
);

const reportNumber = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MaterialPurchaseReportContractError();
  }
  return value;
};

const reportNullableNumber = (value: unknown): number | null => (
  value === null ? null : reportNumber(value)
);

const reportInteger = (value: unknown): number => {
  const parsed = reportNumber(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new MaterialPurchaseReportContractError();
  return parsed;
};

const reportCivilDate = (value: unknown): string => {
  const text = reportText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new MaterialPurchaseReportContractError();
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== text) throw new MaterialPurchaseReportContractError();
  return text;
};

const reportNullableCivilDate = (value: unknown): string | null => (
  value === null ? null : reportCivilDate(value)
);

const reportNullableBoolean = (value: unknown): boolean | null => {
  if (value === null) return null;
  if (typeof value !== 'boolean') throw new MaterialPurchaseReportContractError();
  return value;
};

const reportCostCoverage = (value: unknown): NonNullable<MaterialPurchaseReportRow['cost_coverage']> | null => {
  if (value === null) return null;
  if (value === 'complete') return 'complete';
  if (value === 'partial') return 'partial';
  if (value === 'not_applicable') return 'not_applicable';
  throw new MaterialPurchaseReportContractError();
};

function projectPurchaseHistory(value: unknown): MaterialPurchaseHistoryItem[] {
  if (!Array.isArray(value)) throw new MaterialPurchaseReportContractError();
  return value.map((entry) => {
    const row = reportRecord(entry);
    if (row.kind !== 'compra') throw new MaterialPurchaseReportContractError();
    const paymentStatus = row.payment_status;
    if (paymentStatus !== 'pago' && paymentStatus !== 'pendente'
      && paymentStatus !== 'nao_vinculado' && paymentStatus !== 'nao_informado') {
      throw new MaterialPurchaseReportContractError();
    }
    return {
      date: reportCivilDate(row.date),
      kind: 'compra',
      order_id: reportText(row.order_id),
      order_number: reportInteger(row.order_number),
      supplier_id: reportText(row.supplier_id),
      supplier_name: reportText(row.supplier_name),
      stock_id: reportText(row.stock_id),
      stock_name: reportText(row.stock_name),
      created_by: reportNullableText(row.created_by),
      created_by_name: reportText(row.created_by_name),
      financial_transaction_id: reportNullableText(row.financial_transaction_id),
      payment_method: reportNullableText(row.payment_method),
      is_paid: reportNullableBoolean(row.is_paid),
      payment_status: paymentStatus,
      flow_type: reportText(row.flow_type),
      unit: reportText(row.unit),
      quantity: reportNumber(row.quantity),
      unit_price: reportNullableNumber(row.unit_price),
      total: reportNullableNumber(row.total),
    };
  });
}

export function projectMaterialPurchaseReportRow(value: unknown): MaterialPurchaseReportRow {
  const row = reportRecord(value);
  const costCoverage = reportCostCoverage(row.cost_coverage);
  return {
    inventory_id: reportText(row.inventory_id),
    sku: reportString(row.sku),
    material_name: reportText(row.material_name),
    unit: reportText(row.unit),
    group_id: reportNullableText(row.group_id),
    group_name: reportNullableText(row.group_name),
    group_color: reportNullableString(row.group_color),
    current_balance: reportNumber(row.current_balance),
    registered_sale_price: reportNumber(row.registered_sale_price),
    purchased_quantity: reportNumber(row.purchased_quantity),
    priced_quantity: reportNumber(row.priced_quantity),
    unpriced_quantity: reportNumber(row.unpriced_quantity),
    purchased_total: reportNumber(row.purchased_total),
    average_paid: reportNullableNumber(row.average_paid),
    purchase_count: reportInteger(row.purchase_count),
    last_purchase_date: reportNullableCivilDate(row.last_purchase_date),
    history: projectPurchaseHistory(row.history),
    delivered_quantity: reportNullableNumber(row.delivered_quantity),
    returned_quantity: reportNullableNumber(row.returned_quantity),
    net_sold_quantity: reportNullableNumber(row.net_sold_quantity),
    returned_amount: reportNullableNumber(row.returned_amount),
    net_revenue: reportNullableNumber(row.net_revenue),
    net_cmv: reportNullableNumber(row.net_cmv),
    cost_coverage: costCoverage,
    cost_coverage_percent: reportNullableNumber(row.cost_coverage_percent),
    margin: reportNullableNumber(row.margin),
  };
}

export function projectMaterialPurchaseReportPage(payload: unknown) {
  const page = reportRecord(payload);
  if (page.scope !== 'inventory_material_period' || !Array.isArray(page.rows)
    || typeof page.has_more !== 'boolean') throw new MaterialPurchaseReportContractError();
  const totalCount = reportInteger(page.total_count);
  const limit = reportInteger(page.limit);
  const offset = reportInteger(page.offset);
  if (limit < 1 || page.rows.length > limit || offset + page.rows.length > totalCount
    || page.has_more !== (offset + page.rows.length < totalCount)) {
    throw new MaterialPurchaseReportContractError();
  }
  return {
    rows: page.rows.map(projectMaterialPurchaseReportRow),
    hasMore: page.has_more,
  };
}

export function useMaterialPurchaseReport({
  startDate,
  endDate,
  stockIds,
  supplierIds,
  groupIds,
  createdByIds,
}: Params) {
  return useQuery({
    queryKey: [...MATERIAL_PURCHASE_REPORT_QUERY_KEY, startDate, endDate, stockIds, supplierIds, groupIds, createdByIds],
    queryFn: async () => {
      type RpcResult = { data: unknown; error: { message?: string } | null };
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<RpcResult>;
      const rows: unknown[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore && offset < 5_000) {
        const { data, error } = await rpc('get_material_purchase_report_v2', {
          p_start_date: startDate || undefined,
          p_end_date: endDate || undefined,
          p_stock_ids: stockIds?.length ? stockIds : undefined,
          p_supplier_ids: supplierIds?.length ? supplierIds : undefined,
          p_group_ids: groupIds?.length ? groupIds : undefined,
          p_created_by_ids: createdByIds?.length ? createdByIds : undefined,
          p_limit: 500,
          p_offset: offset,
        });
        if (error) throw error;
        const page = projectMaterialPurchaseReportPage(data);
        const pageRows = page.rows;
        rows.push(...pageRows);
        hasMore = page.hasMore;
        offset += pageRows.length;
      }
      return rows as MaterialPurchaseReportRow[];
    },
    staleTime: 30_000,
  });
}

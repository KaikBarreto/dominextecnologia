import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
}

interface Params {
  startDate?: string;
  endDate?: string;
  stockIds?: string[] | null;
  supplierIds?: string[] | null;
  groupIds?: string[] | null;
  createdByIds?: string[] | null;
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
    queryKey: ['material-purchase-report', startDate, endDate, stockIds, supplierIds, groupIds, createdByIds],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_material_purchase_report', {
        p_start_date: startDate || undefined,
        p_end_date: endDate || undefined,
        p_stock_ids: stockIds?.length ? stockIds : undefined,
        p_supplier_ids: supplierIds?.length ? supplierIds : undefined,
        p_group_ids: groupIds?.length ? groupIds : undefined,
        p_created_by_ids: createdByIds?.length ? createdByIds : undefined,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        history: Array.isArray(row.history)
          ? row.history as unknown as MaterialPurchaseHistoryItem[]
          : [],
      })) as MaterialPurchaseReportRow[];
    },
    staleTime: 30_000,
  });
}

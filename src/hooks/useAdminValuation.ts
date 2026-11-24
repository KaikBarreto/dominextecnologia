import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminValuationData {
  as_of: string;
  period_start: string;
  period_end: string;
  current: {
    mrr: number;
    arr: number;
    active_customers: number;
    annual_customers: number;
    overdue_active_customers: number;
    top1_pct: number | null;
    top5_pct: number | null;
    missing_value_customers: number;
  };
  financial: {
    revenue: number;
    recurring_receipts: number;
    other_receipts: number;
    operating_result: number;
    operating_margin_pct: number | null;
    net_cash: number | null;
    observed_months: number;
    unclassified_amount: number;
    capital_excluded: number;
    overdue_amount: number;
    overdue_count: number;
    cash_first_movement: string | null;
  };
  history: {
    month: string;
    revenue: number;
    operating_result: number;
    net_cash: number | null;
    mrr: number | null;
  }[];
  retention: {
    month: string | null;
    churn_pct: number | null;
    nrr_pct: number | null;
    mrr_growth_pct: number | null;
  };
  warnings: string[];
}

const requiredNumber = (value: unknown): number => {
  if (value == null || value === "" || !Number.isFinite(Number(value))) {
    throw new Error("Indicador financeiro ausente ou inválido.");
  }
  return Number(value);
};

function normalize(raw: any): AdminValuationData {
  const current = raw?.current ?? {};
  const financial = raw?.financial ?? {};
  return {
    as_of: String(raw?.as_of ?? ""),
    period_start: String(raw?.period_start ?? ""),
    period_end: String(raw?.period_end ?? ""),
    current: {
      mrr: requiredNumber(current.mrr),
      arr: requiredNumber(current.arr),
      active_customers: requiredNumber(current.active_customers),
      annual_customers: requiredNumber(current.annual_customers),
      overdue_active_customers: requiredNumber(
        current.overdue_active_customers,
      ),
      top1_pct: current.top1_pct == null
        ? null
        : requiredNumber(current.top1_pct),
      top5_pct: current.top5_pct == null
        ? null
        : requiredNumber(current.top5_pct),
      missing_value_customers: requiredNumber(current.missing_value_customers),
    },
    financial: {
      revenue: requiredNumber(financial.revenue),
      recurring_receipts: requiredNumber(financial.recurring_receipts),
      other_receipts: requiredNumber(financial.other_receipts),
      operating_result: requiredNumber(financial.operating_result),
      operating_margin_pct: financial.operating_margin_pct == null
        ? null
        : requiredNumber(financial.operating_margin_pct),
      net_cash: financial.net_cash == null
        ? null
        : requiredNumber(financial.net_cash),
      observed_months: requiredNumber(financial.observed_months),
      unclassified_amount: requiredNumber(financial.unclassified_amount),
      capital_excluded: requiredNumber(financial.capital_excluded),
      overdue_amount: requiredNumber(financial.overdue_amount),
      overdue_count: requiredNumber(financial.overdue_count),
      cash_first_movement: financial.cash_first_movement ?? null,
    },
    history: Array.isArray(raw?.history)
      ? raw.history.map((row: any) => ({
        month: String(row?.month ?? ""),
        revenue: requiredNumber(row?.revenue),
        operating_result: requiredNumber(row?.operating_result),
        net_cash: requiredNumber(row?.net_cash),
        mrr: row?.mrr == null ? null : requiredNumber(row.mrr),
      }))
      : [],
    retention: {
      month: raw?.retention?.month ?? null,
      churn_pct: raw?.retention?.churn_pct == null
        ? null
        : requiredNumber(raw.retention.churn_pct),
      nrr_pct: raw?.retention?.nrr_pct == null
        ? null
        : requiredNumber(raw.retention.nrr_pct),
      mrr_growth_pct: raw?.retention?.mrr_growth_pct == null
        ? null
        : requiredNumber(raw.retention.mrr_growth_pct),
    },
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(String) : [],
  };
}

export function useAdminValuation() {
  return useQuery<AdminValuationData>({
    queryKey: ["admin-valuation-metrics"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "admin_valuation_metrics",
      );
      if (error) throw error;
      if (
        !data ||
        typeof data !== "object" ||
        !data.current ||
        !data.financial || !data.as_of || !data.period_start ||
        !data.period_end || !Array.isArray(data.history)
      ) {
        throw new Error("A resposta da estimativa financeira está incompleta.");
      }
      return normalize(data);
    },
    staleTime: 60_000,
    retry: 1,
  });
}

export function useAdminValuationMonthlyRevenue(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-valuation-monthly-revenue"],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "admin_valuation_monthly_revenue",
      );
      if (error) throw error;
      if (
        !/^\d{4}-\d{2}-01$/.test(data?.month_start ?? "") ||
        !data?.as_of || !Number.isFinite(Date.parse(data.as_of))
      ) {
        throw new Error("A receita do mês está incompleta.");
      }
      return {
        month_start: String(data.month_start),
        as_of: String(data.as_of),
        revenue: requiredNumber(data.revenue),
        transaction_count: requiredNumber(data.transaction_count),
      };
    },
    staleTime: 60_000,
    retry: 1,
  });
}

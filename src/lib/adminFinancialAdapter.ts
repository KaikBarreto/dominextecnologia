import { supabase } from "@/integrations/supabase/client";
import { ADMIN_REVIEW_EVENT_FILTER } from "@/lib/adminFinancialReview";
import { generateAdminDreHtml } from "@/utils/adminDreHtmlGenerator";
export async function fetchAdminDreComparison(
  bounds: { periodStartIso: string; periodEndExclusiveIso: string },
): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await (supabase as any).from(
      "admin_financial_transactions",
    ).select("id,type,category,amount,description,transaction_date").gte(
      "transaction_date",
      bounds.periodStartIso,
    ).lt("transaction_date", bounds.periodEndExclusiveIso).order(
      "transaction_date",
      { ascending: false },
    ).order("id").range(page * 500, page * 500 + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
  throw new Error("Escolha um período menor para comparar.");
}
export async function exportAdminDreReport(d: any) {
  const lines = (items: any[]) =>
    items.map((c) => ({ name: c.label, value: c.value }));
  const html = generateAdminDreHtml({
    grossRevenue: d.receitaBruta,
    revenueLines: lines(d.revenueByCategory),
    taxes: d.impostos,
    taxLines: lines(d.taxesByCategory),
    netRevenue: d.receitaLiquida,
    cpv: d.cpv,
    cpvLines: lines(d.cpvByCategory),
    grossProfit: d.lucroBruto,
    margemBruta: d.margemBruta,
    opex: d.opex,
    opexLines: lines(d.opexByCategory),
    ebitda: d.ebitda,
    margin: d.margem,
    estornos: d.estornos,
    estornoLines: lines(d.estornosByCategory),
    nonOperating: d.nonOperating,
    nonOperatingLines: lines(d.nonOperatingByCategory),
    resultadoFinal: d.resultadoFinal,
  }, d.period);
  const target = window.open("", "_blank");
  if (target) {
    target.document.write(html);
    target.document.close();
  }
}
export async function fetchAdminGatewayBalance() {
  const { data, error } = await supabase.functions.invoke("get-asaas-balance");
  if (error) throw error;
  if (data?.balance == null || !Number.isFinite(Number(data.balance))) {
    throw new Error("Saldo indisponível");
  }
  return Number(data.balance);
}
export async function fetchAdminLedgerSummary() {
  const { data, error } = await supabase.rpc("admin_ledger_summary");
  if (error) throw error;
  return data as unknown as { balance: number };
}
export async function fetchAdminReconciliationCutoff() {
  return null;
}
export async function fetchAdminAsaasPage(
  filters: {
    page: number;
    view: string;
    direction: string;
    from: string;
    to: string;
    status: string;
    cutoff: string | null;
  },
) {
  let q = supabase.from("admin_realized_asaas_movements").select(
    "id,asaas_transaction_id,asaas_event_type,direction,amount,occurred_at,description,category,status,source,admin_financial_transaction_id,company_id,created_at",
    { count: "exact" },
  ).order("occurred_at", { ascending: false }).order("id").range(
    filters.page * 50,
    filters.page * 50 + 49,
  );
  if (filters.view === "review") q = q.eq("status", "pending_categorization")
    .or(ADMIN_REVIEW_EVENT_FILTER);
  else if (filters.status) q = q.eq("status", filters.status);
  if (filters.direction !== "all") q = q.eq("direction", filters.direction);
  if (filters.from) q = q.gte("occurred_at", filters.from + "T00:00:00-03:00");
  if (filters.to) {
    q = q.lt(
      "occurred_at",
      new Date(Date.parse(filters.to + "T00:00:00-03:00") + 86400000)
        .toISOString(),
    );
  }
  const { data, error, count } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const transactionIds = [...new Set(rows.map(r => r.admin_financial_transaction_id).filter((id): id is string => Boolean(id)))];
  const legacyIds = [...new Set(rows.filter(r => !r.admin_financial_transaction_id).map(r => r.asaas_transaction_id).filter((id): id is string => Boolean(id)))];
  type LinkedDescription = { id: string; asaas_transaction_id: string | null; description: string | null };
  const loadDescriptions = async (column: "id" | "asaas_transaction_id", ids: string[]): Promise<LinkedDescription[]> => {
    if (!ids.length) return [];
    const { data, error } = await (supabase as any).from("admin_financial_transactions")
      .select("id,asaas_transaction_id,description").in(column, ids);
    if (error) throw error;
    return data ?? [];
  };
  const transactions = (await Promise.all([
    loadDescriptions("id", transactionIds),
    loadDescriptions("asaas_transaction_id", legacyIds),
  ])).flat();
  return {
    count: count ?? 0,
    items: rows.map((r) => {
      const parts = transactions.filter(t => r.admin_financial_transaction_id ? t.id === r.admin_financial_transaction_id : !!r.asaas_transaction_id && t.asaas_transaction_id === r.asaas_transaction_id);
      const descriptions = [...new Set(parts.map(t => t.description?.trim()).filter(Boolean))];
      const bankDescription = r.description || "Movimento Asaas";
      return {
        ...r,
        source: "asaas" as const,
        description: descriptions.join(" · ") || bankDescription,
        bank_description: bankDescription,
        categories: r.category ? [r.category] : [],
        divergent: false,
        original: r,
      };
    }),
  };
}

export async function fetchAdminFinancialTransactions(
  range: { from: Date | null; to: Date | null },
): Promise<any[]> {
  const dateColumn = "transaction_date";
  let query = (supabase as any).from("admin_financial_transactions").select("*")
    .order(dateColumn, { ascending: false }).order("id");
  const day = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${
      String(value.getDate()).padStart(2, "0")
    }`;
  if (range.from) {
    query = query.gte(dateColumn, day(range.from) + "T00:00:00-03:00");
  }
  if (range.to) {
    const after = new Date(range.to);
    after.setDate(after.getDate() + 1);
    query = query.lt(dateColumn, day(after) + "T00:00:00-03:00");
  }
  const rows: any[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await query.range(page * 500, page * 500 + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
  throw new Error("Escolha um período menor para consultar as movimentações.");
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  projectPdvDispatchDetail,
  type PdvDispatchDetail,
} from "@/hooks/usePdvDispatch";
import { usePdvAuthorizedQueryScope } from "@/hooks/pdvReportCache";

export type PdvSalesFlowStage =
  | "draft"
  | "cash"
  | "pickup"
  | "partial"
  | "completed";

export type PdvFulfillmentMode = "dispatch" | "cashier";

export interface PdvSalesFlowCardModel {
  flowId: string;
  preorderId: string | null;
  preorderNumber: number | null;
  orderId: string | null;
  orderNumber: number | null;
  stage: PdvSalesFlowStage;
  customerName: string | null;
  stockName: string | null;
  total: number | null;
  itemCount: number;
  remainingItems: number;
  updatedAt: string;
  canSeeAmount: boolean;
  fulfillmentMode: PdvFulfillmentMode;
}

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult>;

const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
export const PDV_SALES_FLOW_QUERY_KEY = ["pdv-sales-flow"] as const;

const STAGES = new Set<PdvSalesFlowStage>([
  "draft",
  "cash",
  "pickup",
  "partial",
  "completed",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number {
  return Math.max(0, numberOrNull(value) ?? 0);
}

function stage(value: unknown): PdvSalesFlowStage | null {
  return typeof value === "string" && STAGES.has(value as PdvSalesFlowStage)
    ? (value as PdvSalesFlowStage)
    : null;
}

export function projectPdvSalesFlow(payload: unknown): PdvSalesFlowCardModel[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((entry) => {
    const value = record(entry);
    const flowId = text(value.flow_id);
    const currentStage = stage(value.stage);
    const preorderId = text(value.preorder_id);
    const orderId = text(value.order_id);
    if (!flowId || !currentStage || (!preorderId && !orderId)) return [];

    const canSeeAmount = value.can_see_amount === true;
    return [
      {
        flowId,
        preorderId,
        preorderNumber: numberOrNull(value.preorder_number),
        orderId,
        orderNumber: numberOrNull(value.order_number),
        stage: currentStage,
        customerName: text(value.customer_name),
        stockName: text(value.stock_name),
        total: canSeeAmount ? numberOrNull(value.total) : null,
        itemCount: nonNegativeNumber(value.item_count),
        remainingItems: nonNegativeNumber(value.remaining_items),
        updatedAt: text(value.updated_at) ?? "",
        canSeeAmount,
        fulfillmentMode:
          value.fulfillment_mode === "cashier" ? "cashier" : "dispatch",
      },
    ];
  });
}

export function resolvePdvSalesFlowMode(
  cards: PdvSalesFlowCardModel[],
  fallback: PdvFulfillmentMode = "dispatch",
): PdvFulfillmentMode {
  return cards.find((card) => card.fulfillmentMode === "cashier")
    ? "cashier"
    : cards[0]?.fulfillmentMode ?? fallback;
}

function mapSalesFlowError(error: RpcError): Error {
  if (error.code === "42501") {
    return new Error("Seu perfil não permite consultar este fluxo do balcão.");
  }
  if (!error.code && /fetch|network|connection/i.test(error.message ?? "")) {
    return new Error("Não foi possível acessar o servidor. Verifique sua conexão.");
  }
  return new Error("Não foi possível carregar o fluxo do balcão.");
}

async function fetchPdvSalesFlow(): Promise<PdvSalesFlowCardModel[]> {
  const { data, error } = await rpc("pdv_list_sales_flow_v2");
  if (error) throw mapSalesFlowError(error);
  return projectPdvSalesFlow(data);
}

export function usePdvSalesFlow(enabled = true) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: [...PDV_SALES_FLOW_QUERY_KEY, ...scope.key],
    queryFn: fetchPdvSalesFlow,
    enabled: enabled && scope.ready,
    staleTime: 10_000,
    gcTime: 0,
  });
}

export function usePdvSalesFlowOrder(
  orderId: string | null,
  enabled = true,
) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery<PdvDispatchDetail>({
    queryKey: [...PDV_SALES_FLOW_QUERY_KEY, ...scope.key, "order", orderId],
    queryFn: async () => {
      const { data, error } = await rpc("pdv_get_sales_flow_order_v2", {
        p_order_id: orderId,
      });
      if (error) throw mapSalesFlowError(error);
      return projectPdvDispatchDetail(data);
    },
    enabled: enabled && Boolean(orderId) && scope.ready,
    staleTime: 5_000,
    gcTime: 0,
  });
}

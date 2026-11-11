import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PdvPreorderStatus =
  "edicao" | "encaminhado" | "convertido" | "cancelado";
export type PdvPreorderItemType = "material" | "service" | "free_item";

export interface PdvPreorderListRow {
  id: string;
  number: number;
  status: PdvPreorderStatus;
  operation_mode: "direct" | "counter";
  revision: number;
  customer_id: string | null;
  assigned_to: string | null;
  total: number | null;
  has_missing_prices: boolean;
  updated_at: string;
}

export interface PdvPreorder {
  id: string;
  company_id: string;
  number: number;
  customer_id: string | null;
  stock_id: string | null;
  target_terminal_id: string | null;
  status: PdvPreorderStatus;
  operation_mode: "direct" | "counter";
  revision: number;
  subtotal: number | null;
  discount_amount: number;
  total: number | null;
  notes: string | null;
  created_by: string;
  assigned_to: string | null;
  forwarded_at: string | null;
  converted_order_id: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdvPreorderItem {
  id: string;
  company_id: string;
  preorder_id: string;
  inventory_id: string | null;
  item_type: PdvPreorderItemType;
  description: string;
  quantity: number;
  unit_price: number | null;
  discount_amount: number;
  unit_factor_snapshot: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PdvPreorderDetail {
  preorder: PdvPreorder;
  items: PdvPreorderItem[];
}

export interface PdvPreorderSaveHeader {
  customer_id?: string | null;
  stock_id?: string | null;
  target_terminal_id?: string | null;
  assigned_to?: string | null;
  operation_mode?: "direct" | "counter";
  notes?: string | null;
  discount_amount?: number;
}

export interface PdvPreorderSaveItem {
  id: string;
  inventory_id?: string | null;
  item_type: PdvPreorderItemType;
  description: string;
  quantity: number;
  unit_price: number | null;
  discount_amount: number;
  unit_factor: number;
  sort_order: number;
}

interface SaveInput {
  preorderId: string;
  expectedRevision: number;
  header: PdvPreorderSaveHeader;
  items: PdvPreorderSaveItem[];
  requestId: string;
}

interface RevisionInput {
  preorderId: string;
  expectedRevision: number;
  requestId: string;
}

interface AssignTerminalInput extends RevisionInput { targetTerminalId: string }

interface ValueInput {
  preorderId: string;
  expectedRevision: number;
  header: Pick<
    PdvPreorderSaveHeader,
    "customer_id" | "notes" | "discount_amount"
  >;
  items: Array<{
    id: string;
    unit_price: number | null;
    discount_amount: number;
  }>;
  requestId: string;
}

export interface PdvPreorderMutationResult {
  preorder_id: string;
  revision?: number;
  status?: PdvPreorderStatus;
  number?: number;
  has_missing_prices?: boolean;
  order_id?: string;
  already_converted?: boolean;
}

export type PdvPreorderErrorKind =
  | "conflict"
  | "permission"
  | "missing-prices"
  | "reservation"
  | "pending"
  | "unavailable"
  | "unknown";

export class PdvPreorderDomainError extends Error {
  constructor(
    message: string,
    public readonly kind: PdvPreorderErrorKind,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "PdvPreorderDomainError";
  }
}

const ROOT_KEY = ["pdv-preorders"] as const;

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string; details?: string } | null;
};
type RpcCaller = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult>;
const pdvRpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

function detailCode(error: RpcResult["error"]): string {
  const match = error?.details?.match(/(?:^|\s)code=([a-z0-9_]+)/i);
  return match?.[1] ?? "";
}

export function mapPdvPreorderError(error: unknown): PdvPreorderDomainError {
  const raw = (error && typeof error === "object" ? error : {}) as {
    code?: string;
    message?: string;
    details?: string;
  };
  const code = detailCode({ data: null, error: raw }.error);

  if (raw.code === "40001" || code === "pdv_preorder_revision_conflict") {
    return new PdvPreorderDomainError(
      "Este orçamento do balcão mudou em outro dispositivo. Atualize os dados antes de continuar.",
      "conflict",
      code,
    );
  }
  if (raw.code === "42501" || code.endsWith("_denied")) {
    return new PdvPreorderDomainError(
      "Seu perfil não permite esta ação no orçamento do balcão.",
      "permission",
      code,
    );
  }
  if (
    code === "pdv_preorder_missing_prices" ||
    code === "pdv_preorder_discount_without_price"
  ) {
    return new PdvPreorderDomainError(
      "Defina os preços pendentes antes de criar o pedido.",
      "missing-prices",
      code,
    );
  }
  if (raw.code === "55000" || code === "pdv_preorder_operation_pending") {
    return new PdvPreorderDomainError(
      "Esta operação ainda está sendo processada. Aguarde um instante e tente novamente.",
      "pending",
      code,
    );
  }
  if (code.includes("reservation") || code.includes("reserved_item")) {
    return new PdvPreorderDomainError(
      "Este item possui uma reserva de estoque. Libere ou revise a reserva antes de alterar.",
      "reservation",
      code,
    );
  }
  if (
    !raw.code &&
    (!raw.message || /fetch|network|rede|connection/i.test(raw.message))
  ) {
    return new PdvPreorderDomainError(
      "Não foi possível acessar o servidor. Verifique sua conexão e tente novamente.",
      "unavailable",
    );
  }
  return new PdvPreorderDomainError(
    "Não foi possível concluir a ação. Revise os dados e tente novamente.",
    "unknown",
    code || raw.code,
  );
}

async function callRpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await pdvRpc(name, args);
  if (error) throw mapPdvPreorderError(error);
  return data as T;
}

export function usePdvPreorderQueue(
  status: PdvPreorderStatus | null,
  enabled = true,
) {
  return useQuery({
    queryKey: [...ROOT_KEY, "list", status ?? "all"],
    queryFn: () =>
      callRpc<PdvPreorderListRow[]>("pdv_list_preorders_v2", {
        p_status: status,
      }),
    enabled,
    staleTime: 15_000,
  });
}

export function usePdvPreorder(preorderId: string | null) {
  return useQuery({
    queryKey: [...ROOT_KEY, "detail", preorderId],
    queryFn: () =>
      callRpc<PdvPreorderDetail>("pdv_get_preorder_v2", {
        p_preorder_id: preorderId,
      }),
    enabled: Boolean(preorderId),
  });
}

export function fetchPdvPreorderDetail(
  preorderId: string,
): Promise<PdvPreorderDetail> {
  return callRpc<PdvPreorderDetail>("pdv_get_preorder_v2", {
    p_preorder_id: preorderId,
  });
}

export function usePdvPreorderActions() {
  const queryClient = useQueryClient();

  const invalidate = async (preorderId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ROOT_KEY }),
      preorderId
        ? queryClient.invalidateQueries({
            queryKey: [...ROOT_KEY, "detail", preorderId],
          })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: ["pdv-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["pdv-cash-session-detail"] }),
      queryClient.invalidateQueries({ queryKey: ["pdv-stock-reservations"] }),
      queryClient.invalidateQueries({ queryKey: ["pdv-stock-availability"] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-stock-levels"] }),
    ]);
  };
  const retryUnavailable = (failureCount: number, error: Error) =>
    failureCount < 1 &&
    error instanceof PdvPreorderDomainError &&
    error.kind === "unavailable";

  const save = useMutation({
    mutationFn: (input: SaveInput) =>
      callRpc<PdvPreorderMutationResult>("pdv_save_preorder_v2", {
        p_preorder_id: input.preorderId,
        p_expected_revision: input.expectedRevision,
        p_header: input.header,
        p_items: input.items,
        p_idempotency_key: input.requestId,
      }),
    onSuccess: (result) => invalidate(result.preorder_id),
    retry: retryUnavailable,
  });

  const forward = useMutation({
    mutationFn: (input: RevisionInput) =>
      callRpc<PdvPreorderMutationResult>("pdv_forward_preorder_v2", {
        p_preorder_id: input.preorderId,
        p_expected_revision: input.expectedRevision,
        p_idempotency_key: input.requestId,
      }),
    onSuccess: (result) => invalidate(result.preorder_id),
    retry: retryUnavailable,
  });

  const assignTerminal = useMutation({
    mutationFn: (input: AssignTerminalInput) =>
      callRpc<PdvPreorderMutationResult>("pdv_assign_preorder_terminal_v3", {
        p_preorder_id: input.preorderId,
        p_expected_revision: input.expectedRevision,
        p_target_terminal_id: input.targetTerminalId,
        p_idempotency_key: input.requestId,
      }),
    onSuccess: (result) => invalidate(result.preorder_id),
    retry: retryUnavailable,
  });

  const value = useMutation({
    mutationFn: (input: ValueInput) =>
      callRpc<PdvPreorderMutationResult>("pdv_value_preorder_v2", {
        p_preorder_id: input.preorderId,
        p_expected_revision: input.expectedRevision,
        p_header: input.header,
        p_items: input.items,
        p_idempotency_key: input.requestId,
      }),
    onSuccess: (result) => invalidate(result.preorder_id),
    retry: retryUnavailable,
  });

  const cancel = useMutation({
    mutationFn: (input: RevisionInput) =>
      callRpc<PdvPreorderMutationResult>("pdv_cancel_preorder_v2", {
        p_preorder_id: input.preorderId,
        p_expected_revision: input.expectedRevision,
        p_idempotency_key: input.requestId,
      }),
    onSuccess: (result) => invalidate(result.preorder_id),
    retry: retryUnavailable,
  });

  const convert = useMutation({
    mutationFn: (input: RevisionInput) =>
      callRpc<PdvPreorderMutationResult>("pdv_convert_preorder_v2", {
        p_preorder_id: input.preorderId,
        p_expected_revision: input.expectedRevision,
        p_idempotency_key: input.requestId,
      }),
    onSuccess: (result) => invalidate(result.preorder_id),
    retry: retryUnavailable,
  });

  return { save, assignTerminal, value, forward, cancel, convert, invalidate };
}

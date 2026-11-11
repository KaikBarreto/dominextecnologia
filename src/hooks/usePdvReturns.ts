import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches, usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

export type PdvReturnDestination = 'saleable' | 'quarantine' | 'none';
export type PdvReturnDispositionKind = 'receivable_reduction' | 'customer_credit';

export interface PdvReturnableItem {
  deliveryItemId: string;
  orderItemId: string;
  description: string;
  itemType: 'material' | 'service' | 'free_item';
  deliveredQuantity: number;
  returnableQuantity: number;
  commercialAmount: number;
}

export interface PdvReturnStock {
  id: string;
  name: string;
  destination: Exclude<PdvReturnDestination, 'none'>;
}

export interface PdvReturnHistoryEntry {
  id: string;
  eventKind: 'return' | 'reversal';
  occurredOn: string;
  reason: string;
  commercialTotal: number;
  reversalOfId: string | null;
  itemCount: number;
  quantity: number;
  canReverse: boolean;
}

export interface PdvReturnReceivable {
  id: string;
  description: string;
  dueDate: string | null;
  openAmount: number;
}

export interface PdvReturnWorkspace {
  orderId: string;
  orderNumber: number;
  customerId: string | null;
  items: PdvReturnableItem[];
  stocks: PdvReturnStock[];
  history: PdvReturnHistoryEntry[];
  receivables: PdvReturnReceivable[];
}

export interface PdvReturnLineInput {
  deliveryItemId: string;
  quantity: number;
  destination: PdvReturnDestination;
  destinationStockId?: string | null;
}

export interface PdvReturnDispositionInput {
  kind: PdvReturnDispositionKind;
  amount: number;
  receivableTransactionId?: string | null;
}

export interface PdvCreateReturnInput {
  orderId: string;
  lines: PdvReturnLineInput[];
  dispositions: PdvReturnDispositionInput[];
  occurredOn: string;
  reason: string;
  attemptId: string;
}

export interface PdvReturnMutationResult {
  id: string;
  orderId: string | null;
  commercialTotal: number | null;
  idempotent: boolean;
}

export interface PdvStableAttempt { signature: string; id: string }
export interface PdvReturnsAccessDecision {
  enabled: boolean;
  canReturn: boolean;
  canReverse: boolean;
  canCancelResidual: boolean;
  canBackdate: boolean;
}

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
const ROOT = ['pdv-returns'] as const;
const recordOf = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const textOf = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const numberOf = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function extractDomainCode(error: RpcError): string {
  return /(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details ?? '')?.[1]?.toLowerCase() ?? '';
}

export function mapPdvReturnError(error: unknown): Error {
  const raw = recordOf(error) as RpcError;
  const code = extractDomainCode(raw);
  if (code.includes('quantity_exceeded') || code.includes('delivery_not_found')) {
    return new Error('A quantidade entregue mudou. Atualize o pedido e confira os itens antes de tentar novamente.');
  }
  if (code.includes('destination_mismatch') || code.includes('stock_denied')) {
    return new Error('O local de destino não está mais disponível para esta devolução.');
  }
  if (code.includes('backdate_forbidden') || code.includes('before_delivery')) {
    return new Error('A data escolhida não é permitida para esta devolução.');
  }
  if (code.includes('receivable_invalid') || code.includes('disposition_total_mismatch')) {
    return new Error('O saldo em aberto mudou. Atualize os dados e distribua novamente o valor da devolução.');
  }
  if (code.includes('financial_disposition_required')) {
    return new Error('O saldo restante possui pagamento ou fiado vinculado e precisa de tratamento financeiro antes do cancelamento.');
  }
  if (code.includes('already_reversed')) return new Error('Esta devolução já foi desfeita em outro dispositivo.');
  if (code.includes('reversal_stock_insufficient')) return new Error('O item devolvido já não está disponível no local informado e não pode ser desfeito.');
  if (raw.code === '42501' || code.includes('denied') || code.includes('forbidden') || code.includes('disabled')) {
    return new Error('Seu perfil não permite realizar esta ação.');
  }
  if (raw.code === '55000' || /processamento|in.progress/i.test(raw.message ?? '')) {
    return new Error('Esta operação ainda está sendo processada. Aguarde um instante e tente novamente.');
  }
  if (!raw.code && /fetch|network|connection/i.test(raw.message ?? '')) {
    return new Error('Não foi possível acessar o servidor. Verifique sua conexão e tente novamente.');
  }
  return new Error('Não foi possível concluir a operação. Atualize os dados e tente novamente.');
}

async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(name, args);
  if (error) throw mapPdvReturnError(error);
  return data;
}

export function stablePdvReturnAttempt(previous: PdvStableAttempt | null, signature: string, createId: () => string): PdvStableAttempt {
  return previous?.signature === signature ? previous : { signature, id: createId() };
}

export function calculatePdvReturnTotal(items: PdvReturnableItem[], quantities: Record<string, number>): number {
  return roundMoney(items.reduce((total, item) => {
    const quantity = Math.max(0, Math.min(item.returnableQuantity, numberOf(quantities[item.deliveryItemId])));
    if (!quantity || item.deliveredQuantity <= 0) return total;
    return total + (Math.abs(item.commercialAmount) * quantity / item.deliveredQuantity);
  }, 0));
}

export function buildPdvReturnRpcArgs(input: PdvCreateReturnInput): Record<string, unknown> {
  return {
    p_order_id: input.orderId,
    p_lines: input.lines.map((line) => ({
      delivery_item_id: line.deliveryItemId,
      quantity: line.quantity,
      destination: line.destination,
      ...(line.destinationStockId ? { destination_stock_id: line.destinationStockId } : {}),
    })),
    p_dispositions: input.dispositions.map((disposition) => ({
      kind: disposition.kind,
      amount: roundMoney(disposition.amount),
      ...(disposition.receivableTransactionId ? { receivable_transaction_id: disposition.receivableTransactionId } : {}),
    })),
    p_occurred_on: input.occurredOn,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.attemptId,
  };
}

export function projectPdvReturnableOrder(payload: unknown): Pick<PdvReturnWorkspace, 'orderId' | 'orderNumber' | 'customerId' | 'items' | 'stocks'> {
  const root = recordOf(payload);
  return {
    orderId: textOf(root.order_id) ?? '',
    orderNumber: numberOf(root.number),
    customerId: textOf(root.customer_id),
    items: Array.isArray(root.items) ? root.items.flatMap((entry) => {
      const item = recordOf(entry);
      const deliveryItemId = textOf(item.delivery_item_id);
      const orderItemId = textOf(item.order_item_id);
      if (!deliveryItemId || !orderItemId) return [];
      return [{
        deliveryItemId,
        orderItemId,
        description: textOf(item.description) ?? 'Item entregue',
        itemType: item.item_type === 'service' ? 'service' as const : item.item_type === 'free_item' ? 'free_item' as const : 'material' as const,
        deliveredQuantity: Math.max(0, numberOf(item.delivered_quantity)),
        returnableQuantity: Math.max(0, numberOf(item.returnable_quantity)),
        commercialAmount: numberOf(item.commercial_amount),
      }];
    }) : [],
    stocks: Array.isArray(root.stocks) ? root.stocks.flatMap((entry) => {
      const stock = recordOf(entry);
      const id = textOf(stock.stock_id);
      if (!id || (stock.destination !== 'saleable' && stock.destination !== 'quarantine')) return [];
      return [{ id, name: textOf(stock.name) ?? 'Local de estoque', destination: stock.destination }];
    }) : [],
  };
}

export function projectPdvReturnContext(payload: unknown): Pick<PdvReturnWorkspace, 'orderId' | 'customerId' | 'history' | 'receivables'> {
  const root = recordOf(payload);
  return {
    orderId: textOf(root.order_id) ?? '',
    customerId: textOf(root.customer_id),
    history: Array.isArray(root.history) ? root.history.flatMap((entry) => {
      const item = recordOf(entry);
      const id = textOf(item.id);
      const occurredOn = textOf(item.occurred_on);
      if (!id || !occurredOn || (item.event_kind !== 'return' && item.event_kind !== 'reversal')) return [];
      return [{
        id,
        eventKind: item.event_kind,
        occurredOn,
        reason: textOf(item.reason) ?? 'Sem motivo informado',
        commercialTotal: numberOf(item.commercial_total),
        reversalOfId: textOf(item.reversal_of_id),
        itemCount: Math.max(0, numberOf(item.item_count)),
        quantity: Math.max(0, numberOf(item.quantity)),
        canReverse: item.can_reverse === true,
      }];
    }) : [],
    receivables: Array.isArray(root.receivables) ? root.receivables.flatMap((entry) => {
      const item = recordOf(entry);
      const id = textOf(item.id);
      const openAmount = Math.max(0, numberOf(item.open_amount));
      if (!id || openAmount <= 0) return [];
      return [{ id, description: textOf(item.description) ?? 'Saldo em aberto', dueDate: textOf(item.due_date), openAmount }];
    }) : [],
  };
}

export function projectPdvReturnResult(payload: unknown): PdvReturnMutationResult {
  const root = recordOf(payload);
  return {
    id: textOf(root.return_id) ?? textOf(root.cancellation_id) ?? '',
    orderId: textOf(root.order_id),
    commercialTotal: root.commercial_total == null ? null : numberOf(root.commercial_total),
    idempotent: root.idempotent === true,
  };
}

export function isPdvReturnsFeatureEnabled(payload: unknown, companyId: string | null | undefined): boolean {
  const flag = recordOf(payload);
  if (flag.enabled === true) return true;
  if (!companyId || !Array.isArray(flag.company_allowlist)) return false;
  return flag.company_allowlist.includes(companyId);
}

export function derivePdvReturnsAccess(input: { featureEnabled: boolean; privileged: boolean; hasPermissionRecord: boolean; permissions: readonly string[] }): PdvReturnsAccessDecision {
  const explicit = (permission: string) => input.hasPermissionRecord && (input.permissions.includes('*') || input.permissions.includes(permission));
  return {
    enabled: input.featureEnabled,
    canReturn: input.featureEnabled && (input.privileged || explicit('fn:return_pdv_order')),
    canReverse: input.featureEnabled && (input.privileged || explicit('fn:reverse_pdv_return')),
    canCancelResidual: input.featureEnabled && (input.privileged || explicit('fn:cancel_pdv_order_residual')),
    canBackdate: input.featureEnabled && (input.privileged || explicit('fn:backdate_pdv_return')),
  };
}

export function usePdvReturnsFeature(companyId: string | null | undefined) {
  return useQuery({
    queryKey: [...ROOT, 'feature', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_feature_flags')
        .select('enabled, company_allowlist')
        .eq('key', 'pdv_returns_v2')
        .maybeSingle();
      if (error) return false;
      return isPdvReturnsFeatureEnabled(data, companyId);
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });
}

export function usePdvReturnWorkspace(orderId: string | null, enabled: boolean) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: [...ROOT, ...scope.key, 'workspace', orderId],
    queryFn: async (): Promise<PdvReturnWorkspace> => {
      const [returnablePayload, contextPayload] = await Promise.all([
        call('pdv_get_returnable_order_v2', { p_order_id: orderId }),
        call('pdv_get_return_context_v2', { p_order_id: orderId }),
      ]);
      const returnable = projectPdvReturnableOrder(returnablePayload);
      const context = projectPdvReturnContext(contextPayload);
      if (!returnable.orderId || returnable.orderId !== context.orderId) throw new Error('Não foi possível confirmar os dados deste pedido.');
      return { ...returnable, history: context.history, receivables: context.receivables };
    },
    enabled: Boolean(orderId) && enabled && scope.ready,
    staleTime: 5_000,
    gcTime: 0,
  });
}

async function invalidateReturnConsumers(client: ReturnType<typeof useQueryClient>, orderId: string | null) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ROOT }),
    client.invalidateQueries({ queryKey: ['pdv-dispatch'] }),
    client.invalidateQueries({ queryKey: ['pdv-orders'] }),
    client.invalidateQueries({ queryKey: ['inventory'] }),
    client.invalidateQueries({ queryKey: ['party-account'] }),
    invalidatePdvReportCaches(client),
    ...(orderId ? [client.invalidateQueries({ queryKey: [...ROOT, 'workspace', orderId] })] : []),
  ]);
}

export function usePdvCreateReturn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: PdvCreateReturnInput) => projectPdvReturnResult(await call('pdv_return_delivery_items_v2', buildPdvReturnRpcArgs(input))),
    onSuccess: async (_, input) => invalidateReturnConsumers(client, input.orderId),
  });
}

export function usePdvReverseReturn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; returnId: string; reason: string; attemptId: string }) => projectPdvReturnResult(await call('pdv_reverse_commercial_return_v2', { p_return_id: input.returnId, p_reason: input.reason.trim(), p_idempotency_key: input.attemptId })),
    onSuccess: async (_, input) => invalidateReturnConsumers(client, input.orderId),
  });
}

export function usePdvCancelResidual() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; reason: string; attemptId: string }) => projectPdvReturnResult(await call('pdv_cancel_order_residual_v2', { p_order_id: input.orderId, p_reason: input.reason.trim(), p_idempotency_key: input.attemptId })),
    onSuccess: async (_, input) => invalidateReturnConsumers(client, input.orderId),
  });
}

import { useEffect, useRef } from 'react';
import { isPdvModuleFeatureEnabled, usePdvModuleFeature } from '@/hooks/usePdvModuleFeatures';
import { useAuth } from '@/contexts/AuthContext';
import { parsePdvMoneyText, pdvMoneyDecimalFromCents } from '@/lib/pdv/afterSaleMoney';
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
  return isPdvModuleFeatureEnabled(payload, companyId, 'returns');
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
  return usePdvModuleFeature(companyId, 'returns', ROOT);
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

export async function invalidateReturnConsumers(client: ReturnType<typeof useQueryClient>, orderId: string | null) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ROOT }),
    client.invalidateQueries({ queryKey: ['pdv-dispatch'] }),
    client.invalidateQueries({ queryKey: ['pdv-orders'] }),
    client.invalidateQueries({ queryKey: ['inventory'] }),
    client.invalidateQueries({ queryKey: ['party-account'] }),
    ...['party-account-v2', 'pdv-after-sale-v2', 'pdv-stock-reservations', 'pdv-cash-sessions-v2', 'pdv-cash-sessions', 'financial-transactions', 'pdv-customer-history', 'pdv-cash-queue'].map(root => client.invalidateQueries({ queryKey: [root] })),
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

// Residual cancellation is a distinct financial origin. Amounts stay in integer
// cents until the RPC boundary; the server recalculates the allocation under locks.
export type PdvResidualKind = 'customer_credit' | 'voucher' | 'refund';
export interface PdvResidualPayment { id: string; method: 'dinheiro' | 'pix' | 'transferencia'; amountCents: number; accountId: string }
export interface PdvResidualPlan {
  orderId: string; customerId: string; hash: string; totalCents: number; deliveredCents: number;
  residualCents: number; reductionCents: number; paidCents: number; payments: PdvResidualPayment[];
}
export interface PdvResidualDestination { kind: PdvResidualKind; paymentId: string; amountCents: number; accountId?: string; sessionId?: string; expiresOn?: string }
export interface PdvResidualCash { id: string; accountId: string; label: string }
export interface PdvResidualBank { id: string; label: string; methods: string[] }
export interface PdvResidualSummary { id: string; orderId: string; pendingRefund: boolean | null; unallocatedCents: number | null; accessMasked?: boolean }
export type PdvResidualWorkspace =
  | { mode: 'unpaid'; orderId: string }
  | { mode: 'completed'; summary: PdvResidualSummary }
  | { mode: 'covered'; plan: PdvResidualPlan; canCredit: boolean; canVoucher: boolean; canRefund: boolean; cash: PdvResidualCash[]; banks: PdvResidualBank[]; optionsWarning: boolean };
export class PdvResidualFault extends Error {
  constructor(message: string, public readonly kind: 'validation' | 'stale' | 'permission' | 'unsupported' | 'unknown' | 'context' | 'pending' = 'validation') { super(message); this.name = 'PdvResidualFault'; }
}
const invalidResidual = () => new PdvResidualFault('Não foi possível confirmar os valores deste pedido. Atualize os dados antes de continuar.');
const residualText = (value: unknown): string => { if (typeof value !== 'string' || !value.trim()) throw invalidResidual(); return value; };
const residualCents = (value: unknown): number => {
  if (typeof value !== 'number' && typeof value !== 'string') throw invalidResidual();
  const parsed = parsePdvMoneyText(String(value), { maxCents: 99_999_999_999 });
  if (!parsed) throw invalidResidual(); return parsed.cents;
};
export function projectPdvResidualPlan(value: unknown, orderId: string): PdvResidualPlan {
  const v = recordOf(value);
  const plan: PdvResidualPlan = {
    orderId: residualText(v.order_id), customerId: residualText(v.customer_id), hash: residualText(v.plan_hash),
    totalCents: residualCents(v.order_total), deliveredCents: residualCents(v.delivered_amount),
    residualCents: residualCents(v.residual_amount), reductionCents: residualCents(v.receivable_reduction_amount),
    paidCents: residualCents(v.paid_disposition_amount), payments: [],
  };
  if (plan.orderId !== orderId || !/^[a-f0-9]{64}$/.test(plan.hash) || plan.residualCents <= 0
    || plan.totalCents !== plan.deliveredCents + plan.residualCents || plan.residualCents !== plan.reductionCents + plan.paidCents
    || !Array.isArray(v.original_payments) || !Array.isArray(v.receivable_reductions)) throw invalidResidual();
  plan.payments = v.original_payments.map(raw => {
    const p = recordOf(raw); const method = p.method;
    if (method !== 'dinheiro' && method !== 'pix' && method !== 'transferencia') throw invalidResidual();
    const amountCents = residualCents(p.amount); if (amountCents <= 0) throw invalidResidual();
    residualText(p.settlement_transaction_id);
    return { id: residualText(p.payment_id), accountId: residualText(p.account_id), method, amountCents };
  });
  const reductions = v.receivable_reductions.map(raw => { const r = recordOf(raw); residualText(r.payment_id); residualText(r.receivable_transaction_id); return residualCents(r.amount); });
  if (reductions.some(n => n <= 0) || reductions.reduce((a, b) => a + b, 0) !== plan.reductionCents
    || new Set(plan.payments.map(p => p.id)).size !== plan.payments.length
    || plan.payments.reduce((a, p) => a + p.amountCents, 0) < plan.paidCents) throw invalidResidual();
  return plan;
}
export function validatePdvResidualDestinations(workspace: Extract<PdvResidualWorkspace, { mode: 'covered' }>, rows: PdvResidualDestination[]): boolean {
  const { plan } = workspace;
  if (rows.length > 10 || rows.reduce((sum, r) => sum + r.amountCents, 0) !== plan.paidCents) return false;
  const keys = new Set<string>();
  for (const row of rows) {
    const payment = plan.payments.find(p => p.id === row.paymentId); const key = `${row.kind}:${row.paymentId}`;
    if (!payment || keys.has(key) || !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0
      || rows.filter(r => r.paymentId === row.paymentId).reduce((a, r) => a + r.amountCents, 0) > payment.amountCents) return false;
    keys.add(key);
    if (row.kind === 'customer_credit' && !workspace.canCredit || row.kind === 'voucher' && !workspace.canVoucher) return false;
    if (row.kind === 'refund') {
      if (!workspace.canRefund) return false;
      if (payment.method === 'dinheiro') { if (!workspace.cash.some(c => c.id === row.sessionId && c.accountId === row.accountId)) return false; }
      else if (row.sessionId || row.accountId !== payment.accountId || !workspace.banks.some(b => b.id === row.accountId && b.methods.includes(payment.method))) return false;
    } else if (row.accountId || row.sessionId) return false;
    if (!['customer_credit', 'voucher', 'refund'].includes(row.kind) || row.kind !== 'voucher' && row.expiresOn) return false;
  }
  return true;
}
export function buildPdvResidualRpcArgs(input: { orderId: string; reason: string; planHash: string; destinations: PdvResidualDestination[]; attemptId: string }): Record<string, unknown> {
  return { p_order_id: input.orderId, p_reason: input.reason.trim(), p_expected_plan_hash: input.planHash, p_idempotency_key: input.attemptId,
    p_dispositions: [...input.destinations].sort((a, b) => a.kind.localeCompare(b.kind) || a.paymentId.localeCompare(b.paymentId)).map(r => ({
      kind: r.kind, original_payment_id: r.paymentId, amount: pdvMoneyDecimalFromCents(r.amountCents),
      ...(r.accountId ? { account_id: r.accountId } : {}), ...(r.sessionId ? { cash_session_id: r.sessionId } : {}), ...(r.expiresOn ? { expires_on: r.expiresOn } : {}),
    })) };
}
export function mapPdvResidualError(error: unknown): PdvResidualFault {
  if (error instanceof PdvResidualFault) return error;
  const e = recordOf(error) as RpcError; const code = extractDomainCode(e);
  if (/plan_changed|snapshot_mismatch|coverage_mismatch|payment_mismatch|disposition_total_mismatch|financial_disposition_required/.test(code)) return new PdvResidualFault('O pedido mudou. Atualize os valores e confira novamente o destino do restante.', 'stale');
  if (/source_unsupported|receivable_unsupported|settlement_unsupported/.test(code)) return new PdvResidualFault('Este pagamento precisa de conferência no financeiro antes de cancelar o restante.', 'unsupported');
  if (code.includes('customer_required')) return new PdvResidualFault('Identifique o cliente no pedido antes de destinar o valor já pago.', 'unsupported');
  if (e.code === '42501' || /denied|forbidden|disabled/.test(code)) return new PdvResidualFault('Seu perfil não permite tratar estes valores ou acessar o caixa deste pedido.', 'permission');
  if (/cash_insufficient/.test(code)) return new PdvResidualFault('A gaveta não possui dinheiro suficiente para este reembolso.');
  if (/reconciliation_required/.test(code)) return new PdvResidualFault('Confira a conciliação do caixa antes de devolver o dinheiro.');
  if (e.code === '40001') return new PdvResidualFault('Os valores mudaram. Atualize o pedido e confira o destino novamente.', 'stale');
  if (e.code === '22023' || e.code === '23514' || e.code === 'P0002') return new PdvResidualFault('Confira o motivo, os valores e o destino escolhido antes de tentar novamente.');
  if (e.code === '55000') return new PdvResidualFault('A solicitação ainda pode estar em processamento. Confira o resultado antes de alterar os valores.', 'pending');
  return new PdvResidualFault('Não recebemos a confirmação do servidor. Confira o resultado antes de fazer outra solicitação.', 'unknown');
}

type ResidualIntent = { rpc: string; args: Record<string, unknown>; signature: string; state: 'submitted' | 'unknown' | 'failed' | 'completed' };
// In-memory intent survives closing/unmounting the dialog. A reload always reads
// the immutable cancellation first; an uncertain intent is only replayed verbatim.
const residualIntents = new Map<string, ResidualIntent>();
export function clearPdvResidualIntentsForTests() { residualIntents.clear(); }

export function usePdvResidualCancellation(orderId: string, open: boolean) {
  const auth = useAuth(); const scope = usePdvAuthorizedQueryScope(); const client = useQueryClient();
  const companyId = auth.profile?.company_id ?? ''; const userId = auth.user?.id ?? '';
  const allowed = (action: string) => auth.roles.some(r => ['admin', 'gestor', 'super_admin'].includes(r))
    || auth.hasPermissionRecord && (auth.permissions.includes('*') || auth.permissions.includes(action));
  const enabled = open && scope.ready && allowed('fn:cancel_pdv_order_residual');
  const signature = JSON.stringify([orderId, scope.key, enabled]);
  const current = useRef<{ signature: string; epoch: string; mounted: boolean } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID(), mounted: true };
  const token = current.current; const identity = JSON.stringify([companyId, userId, orderId]);
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; }; }, [token]);
  const isCurrent = () => enabled && token.mounted && current.current === token;
  const assertCurrent = (signal?: AbortSignal) => { if (!isCurrent() || signal?.aborted) throw new PdvResidualFault('O contexto deste pedido mudou. Abra o pedido novamente.', 'context'); };
  async function readRpc(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    assertCurrent(signal);
    const request = rpc(name, args) as Promise<RpcResult> & { abortSignal?: (signal: AbortSignal) => Promise<RpcResult> };
    const result = await (signal && request.abortSignal ? request.abortSignal(signal) : request);
    assertCurrent(signal); if (result.error) throw mapPdvResidualError(result.error); return result.data;
  }
  const query = useQuery({
    queryKey: [...ROOT, ...scope.key, 'residual', orderId, token.epoch], enabled, retry: false, staleTime: 0, gcTime: 0, placeholderData: () => undefined,
    queryFn: async ({ signal }): Promise<PdvResidualWorkspace> => {
      assertCurrent(signal);
      try {
        const response = await supabase.from('pdv_orders').select('id,company_id,status,cash_session_id,terminal_id,payments:pdv_order_payments(id)').eq('id', orderId).eq('company_id', companyId).abortSignal(signal).maybeSingle();
        assertCurrent(signal); if (response.error) throw new PdvResidualFault('Não foi possível conferir o pedido. Atualize os dados para tentar novamente.');
        const o = recordOf(response.data);
        if (o.id !== orderId || o.company_id !== companyId || !Array.isArray(o.payments) || !textOf(o.status)
          || o.payments.some(raw => !textOf(recordOf(raw).id))) throw invalidResidual();
        const cancellation = await readRpc('pdv_get_order_residual_cancellation_v3', { p_order_id: orderId }, signal);
        if (cancellation !== null) {
          const c = recordOf(cancellation); if (c.order_id !== orderId || !Array.isArray(c.refunds) || (c.access_masked !== undefined && typeof c.access_masked !== 'boolean')) throw invalidResidual();
          if (c.access_masked === true) return { mode: 'completed', summary: { id: residualText(c.cancellation_id), orderId, accessMasked: true, pendingRefund: null, unallocatedCents: null } };
          return { mode: 'completed', summary: { id: residualText(c.cancellation_id), orderId, unallocatedCents: residualCents(c.unallocated_amount), pendingRefund: c.refunds.some(r => recordOf(r).status === 'pending') } };
        }
        if (o.status === 'cancelado' || o.status === 'cancelado_parcial') return { mode: 'completed', summary: { id: orderId, orderId, pendingRefund: false, unallocatedCents: 0 } };
        if (!o.payments.length) return { mode: 'unpaid', orderId };
        if (!allowed('fn:manage_party_credit')) throw new PdvResidualFault('Para cancelar um restante com pagamento ou fiado, peça a um responsável com permissão para tratar o saldo do cliente.', 'permission');
        const plan = projectPdvResidualPlan(await readRpc('pdv_get_order_residual_plan_v3', { p_order_id: orderId }, signal), orderId);
        const features = await readRpc('pdv_get_module_features_v3', {}, signal);
        const afterSaleAvailable = isPdvModuleFeatureEnabled(features, companyId, 'after_sale');
        let cash: PdvResidualCash[] = []; let banks: PdvResidualBank[] = []; let optionsWarning = false;
        let canVoucher = allowed('fn:issue_pdv_voucher') && afterSaleAvailable; let canRefund = false;
        if (afterSaleAvailable && allowed('fn:refund_pdv_return') && allowed('fn:view_pdv_after_sale')) {
          try {
            const w = recordOf(await readRpc('pdv_get_after_sale_workspace_v2', { p_order_id: orderId }, signal)); const order = recordOf(w.order); const caps = recordOf(w.capabilities);
            if (order.order_id !== orderId || order.customer_id !== plan.customerId || !Array.isArray(w.cash_options) || !Array.isArray(w.account_options)) throw invalidResidual();
            canVoucher = canVoucher && caps.issue_voucher === true; canRefund = caps.request_refund === true;
            cash = w.cash_options.flatMap(raw => { const c = recordOf(raw); return c.session_id === o.cash_session_id && c.terminal_id === o.terminal_id ? [{ id: residualText(c.session_id), accountId: residualText(c.account_id), label: residualText(c.label) }] : []; });
            if (allowed('fn:use_bank_accounts') && caps.use_bank_accounts === true) banks = w.account_options.map(raw => { const b = recordOf(raw); if (!Array.isArray(b.methods) || b.methods.some(m => m !== 'pix' && m !== 'transferencia')) throw invalidResidual(); return { id: residualText(b.account_id), label: residualText(b.label), methods: b.methods as string[] }; });
          } catch { assertCurrent(signal); cash = []; banks = []; canRefund = false; optionsWarning = true; }
        }
        return { mode: 'covered', plan, canCredit: true, canVoucher, canRefund, cash, banks, optionsWarning };
      } catch (error) {
        if (error instanceof PdvResidualFault && error.kind !== 'unknown') throw error;
        throw new PdvResidualFault('Não foi possível conferir o pedido. Verifique a conexão e tente consultar novamente.');
      } finally { assertCurrent(signal); }
    },
  });
  const mutation = useMutation({
    mutationFn: async (intent: ResidualIntent) => {
      assertCurrent(); intent.state = 'submitted'; residualIntents.set(identity, intent);
      try {
        const response = await rpc(intent.rpc, intent.args);
        if (response.error) throw mapPdvResidualError(response.error);
        const v = recordOf(response.data);
        if (v.ok !== true || v.order_id !== orderId || !textOf(v.cancellation_id)) throw new PdvResidualFault('A confirmação recebida não pôde ser conferida. Consulte o pedido antes de tentar outra operação.', 'unknown');
        const resources = Array.isArray(v.resources) ? v.resources : [];
        try {
        if (intent.rpc.endsWith('_v3') && (!Array.isArray(v.resources) || resources.some(raw => {
          const r = recordOf(raw); return !['customer_credit', 'voucher', 'refund'].includes(String(r.kind))
            || !textOf(r.original_payment_id) || residualCents(r.amount) <= 0
            || r.kind === 'refund' && r.status !== 'pending' && r.status !== 'settled';
        }))) { intent.state = 'unknown'; throw new PdvResidualFault('A confirmação financeira precisa ser conferida no pedido antes de outra tentativa.', 'unknown'); }
        if (intent.rpc.endsWith('_v3')) {
          const sent = intent.args.p_dispositions as Array<Record<string, unknown>>;
          if (resources.length !== sent.length || resources.some(raw => {
            const r = recordOf(raw); const expected = sent.find(s => s.kind === r.kind && s.original_payment_id === r.original_payment_id);
            return !expected || residualCents(expected.amount) !== residualCents(r.amount);
          })) throw invalidResidual();
        }
        } catch { throw new PdvResidualFault('A confirmação financeira precisa ser conferida no pedido antes de outra tentativa.', 'unknown'); }
        intent.state = 'completed'; await invalidateReturnConsumers(client, orderId); assertCurrent();
        return { id: String(v.cancellation_id), orderId, unallocatedCents: 0, pendingRefund: resources.some(r => recordOf(r).kind === 'refund' && recordOf(r).status === 'pending') };
      } catch (error) {
        const mapped = mapPdvResidualError(error);
        if (intent.state !== 'completed') intent.state = mapped.kind === 'unknown' || mapped.kind === 'pending' || mapped.kind === 'context' ? 'unknown' : 'failed';
        if (intent.state === 'unknown') await invalidateReturnConsumers(client, orderId);
        throw mapped;
      }
    },
  });
  function submit(reason: string, destinations: PdvResidualDestination[] = []) {
    assertCurrent(); const data = query.data;
    if (!data || data.mode === 'completed' || !reason.trim() || reason.trim().length > 500) return Promise.reject(invalidResidual());
    if (data.mode === 'covered' && !validatePdvResidualDestinations(data, destinations)) return Promise.reject(new PdvResidualFault('Distribua exatamente o valor já pago entre os destinos disponíveis.'));
    const args = data.mode === 'unpaid' ? { p_order_id: orderId, p_reason: reason.trim() } : buildPdvResidualRpcArgs({ orderId, reason, planHash: data.plan.hash, destinations, attemptId: '' });
    delete (args as Record<string, unknown>).p_idempotency_key;
    const rpcName = data.mode === 'unpaid' ? 'pdv_cancel_order_residual_v2' : 'pdv_cancel_order_residual_v3';
    const payloadSignature = JSON.stringify([rpcName, args]); const previous = residualIntents.get(identity);
    if (previous && previous.state !== 'failed') return Promise.reject(new PdvResidualFault('Confira o resultado da solicitação anterior antes de alterar o destino.', 'pending'));
    const intent: ResidualIntent = previous?.signature === payloadSignature ? previous : { rpc: rpcName, args: { ...args, p_idempotency_key: crypto.randomUUID() }, signature: payloadSignature, state: 'failed' };
    return mutation.mutateAsync(intent);
  }
  function retryIntent() { assertCurrent(); if (!query.data || query.data.mode === 'completed') return Promise.reject(new PdvResidualFault('O cancelamento já foi registrado. Confira o histórico com um responsável autorizado.', 'pending')); const intent = residualIntents.get(identity); if (!intent) return Promise.reject(invalidResidual()); return mutation.mutateAsync(intent); }
  const intent = residualIntents.get(identity);
  return { query: enabled ? query : { ...query, data: undefined }, scopeKey: token.epoch, isCurrent,
    submit, retryIntent, reconcile: () => query.refetch(),
    isPending: mutation.isPending && mutation.variables === intent,
    uncertain: enabled && Boolean(intent && intent.state !== 'failed'),
    intentReason: enabled && intent ? textOf(intent.args.p_reason) : null,
  };
}

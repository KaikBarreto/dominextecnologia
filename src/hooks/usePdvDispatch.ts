import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches } from '@/hooks/pdvReportCache';

export type PdvDispatchStatus = 'liberado_retirada' | 'retirada_parcial' | 'entregue';
export interface PdvDispatchQueueRow { id: string; number: number; recipientName: string | null; stockId: string; stockName: string | null; status: PdvDispatchStatus; releasedAt: string; remainingItems: number }
export interface PdvDispatchReservation { id: string; stockId: string; availableQuantity: number; hasConflict: boolean }
export interface PdvDispatchItem { id: string; description: string; itemType: 'material' | 'service' | 'free_item'; unit: string; orderedQuantity: number; deliveredQuantity: number; remainingQuantity: number; reservations: PdvDispatchReservation[] }
export interface PdvDispatchOrder { id: string; number: number; status: PdvDispatchStatus; customer: { id: string; name: string } | null; stock: { id: string; name: string } | null }
export interface PdvDispatchDetail { order: PdvDispatchOrder; items: PdvDispatchItem[] }
export interface PdvDeliveryReceipt { kind: string; deliveryId: string; withdrawnAt: string; order: { id: string; number: number; status: string }; customerName: string | null; stockName: string | null; items: Array<{ description: string; unit: string; quantity: number; remainingQuantity: number }>; notice: string }
export interface PdvCompleteDispatchInput { orderId: string; lines: Array<{ orderItemId: string; reservationId?: string | null; quantity: number }>; attemptId: string }
export interface PdvAttempt { signature: string; id: string }

export function stablePdvAttempt(previous: PdvAttempt | null, signature: string, createId: () => string): PdvAttempt {
  return previous?.signature === signature ? previous : { signature, id: createId() };
}

export function buildPdvDispatchRpcArgs(input: PdvCompleteDispatchInput): Record<string, unknown> {
  return { p_order_id: input.orderId, p_lines: input.lines.map((line) => ({ order_item_id: line.orderItemId, ...(line.reservationId ? { reservation_id: line.reservationId } : {}), quantity: line.quantity })), p_idempotency_key: input.attemptId };
}

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
const ROOT = ['pdv-dispatch'] as const;
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const txt = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const num = (value: unknown): number => { const parsed = typeof value === 'number' ? value : Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const status = (value: unknown): PdvDispatchStatus => value === 'retirada_parcial' ? 'retirada_parcial' : value === 'entregue' ? 'entregue' : 'liberado_retirada';

export function mapPdvDispatchError(error: unknown): Error {
  const raw = rec(error) as RpcError;
  const code = /(?:^|\s)code=([a-z0-9_]+)/i.exec(raw.details ?? '')?.[1] ?? '';
  if (code.includes('conflict') || code.includes('shortage')) return new Error('O estoque mudou. Atualize o pedido e confira as quantidades antes de retirar.');
  if (code.includes('already') || code.includes('not_dispatchable')) return new Error('Este pedido já foi atualizado em outro dispositivo.');
  if (raw.code === '42501' || code.endsWith('_denied')) return new Error('Seu perfil não permite registrar esta retirada.');
  if (raw.code === '55000' || code.includes('in_progress')) return new Error('Esta retirada ainda está sendo processada. Tente novamente em instantes.');
  if (!raw.code && /fetch|network|connection/i.test(raw.message ?? '')) return new Error('Não foi possível acessar o servidor. Verifique sua conexão.');
  return new Error('Não foi possível registrar a retirada. Atualize os dados e tente novamente.');
}

async function call(name: string, args?: Record<string, unknown>): Promise<unknown> { const { data, error } = await rpc(name, args); if (error) throw mapPdvDispatchError(error); return data; }

export function projectPdvDispatchQueue(payload: unknown): PdvDispatchQueueRow[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => { const v = rec(entry); const id = txt(v.id); const stockId = txt(v.stock_id); if (!id || !stockId) return []; return [{ id, number: num(v.number), recipientName: txt(v.recipient_name), stockId, stockName: txt(v.stock_name), status: status(v.status), releasedAt: txt(v.released_at) ?? '', remainingItems: num(v.remaining_items) }]; });
}

export function projectPdvDispatchDetail(payload: unknown): PdvDispatchDetail {
  const root = rec(payload); const order = rec(root.order); const customer = rec(order.customer); const stockValue = rec(order.stock);
  return {
    order: { id: txt(order.id) ?? '', number: num(order.number), status: status(order.status), customer: txt(customer.id) ? { id: txt(customer.id)!, name: txt(customer.name) ?? 'Cliente' } : null, stock: txt(stockValue.id) ? { id: txt(stockValue.id)!, name: txt(stockValue.name) ?? 'Estoque' } : null },
    items: Array.isArray(root.items) ? root.items.map((entry) => { const v = rec(entry); return { id: txt(v.id) ?? '', description: txt(v.description) ?? 'Item', itemType: v.item_type === 'service' ? 'service' as const : v.item_type === 'free_item' ? 'free_item' as const : 'material' as const, unit: txt(v.unit) ?? 'un', orderedQuantity: num(v.ordered_quantity), deliveredQuantity: num(v.delivered_quantity), remainingQuantity: num(v.remaining_quantity), reservations: Array.isArray(v.reservations) ? v.reservations.map((r) => { const rv = rec(r); return { id: txt(rv.id) ?? '', stockId: txt(rv.stock_id) ?? '', availableQuantity: num(rv.available_quantity), hasConflict: rv.has_conflict === true }; }).filter((r) => r.id) : [] }; }).filter((item) => item.id) : [],
  };
}

export function projectPdvDeliveryReceipt(payload: unknown): PdvDeliveryReceipt {
  const v = rec(payload), order = rec(v.order);
  return { kind: txt(v.kind) ?? 'delivery_receipt', deliveryId: txt(v.delivery_id) ?? '', withdrawnAt: txt(v.withdrawn_at) ?? '', order: { id: txt(order.id) ?? '', number: num(order.number), status: txt(order.status) ?? '' }, customerName: txt(v.customer_name), stockName: txt(v.stock_name), items: Array.isArray(v.items) ? v.items.map((entry) => { const item = rec(entry); return { description: txt(item.description) ?? 'Item', unit: txt(item.unit) ?? 'un', quantity: num(item.quantity), remainingQuantity: num(item.remaining_quantity) }; }) : [], notice: txt(v.notice) ?? 'Comprovante não fiscal de retirada.' };
}

export function usePdvDispatchQueue() { return useQuery({ queryKey: [...ROOT, 'queue'], queryFn: async () => projectPdvDispatchQueue(await call('pdv_list_dispatch_queue_v2')), staleTime: 10_000 }); }
export function usePdvDispatchHistory() { return useQuery({ queryKey: [...ROOT, 'history'], queryFn: async () => projectPdvDispatchQueue(await call('pdv_list_delivered_orders_v2')), staleTime: 10_000 }); }
export function usePdvDispatchOrder(orderId: string | null) { return useQuery({ queryKey: [...ROOT, 'order', orderId], queryFn: async () => projectPdvDispatchDetail(await call('pdv_get_dispatch_order_v2', { p_order_id: orderId })), enabled: Boolean(orderId), staleTime: 5_000 }); }
export async function fetchPdvDeliveryReceipt(deliveryId: string) { return projectPdvDeliveryReceipt(await call('pdv_get_delivery_receipt_snapshot_v2', { p_delivery_id: deliveryId })); }
export function usePdvDeliveryReceipt(deliveryId: string | null) { return useQuery({ queryKey: [...ROOT, 'receipt', deliveryId], queryFn: () => fetchPdvDeliveryReceipt(deliveryId!), enabled: Boolean(deliveryId), staleTime: Infinity }); }
export function usePdvCompleteDispatch() { const client = useQueryClient(); return useMutation({ mutationFn: async (input: PdvCompleteDispatchInput) => rec(await call('pdv_complete_dispatch_delivery_v2', buildPdvDispatchRpcArgs(input))), onSuccess: async (_, input) => { await Promise.all([client.invalidateQueries({ queryKey: [...ROOT, 'queue'] }), client.invalidateQueries({ queryKey: [...ROOT, 'order', input.orderId] }), client.invalidateQueries({ queryKey: ['inventory'] }), client.invalidateQueries({ queryKey: ['pdv-orders'] }), invalidatePdvReportCaches(client)]); } }); }

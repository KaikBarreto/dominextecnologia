import { invalidatePdvCatalogCaches, invalidatePdvOrderProjections } from '@/hooks/pdvOperationalCache';
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches, usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

export type PdvDispatchStatus = 'liberado_retirada' | 'retirada_parcial' | 'entregue';
export interface PdvDispatchQueueRow { id: string; number: number; recipientName: string | null; stockId: string; stockName: string | null; status: PdvDispatchStatus; releasedAt: string; remainingItems: number }
export interface PdvDispatchReservation { id: string; stockId: string; availableQuantity: number; hasConflict: boolean }
export interface PdvDispatchItem { id: string; description: string; itemType: 'material' | 'service' | 'free_item'; unit: string; orderedQuantity: number; deliveredQuantity: number; remainingQuantity: number; reservations: PdvDispatchReservation[] }
export interface PdvDispatchOrder { id: string; number: number; status: PdvDispatchStatus; customer: { id: string; name: string } | null; stock: { id: string; name: string } | null }
export interface PdvDispatchDetail { order: PdvDispatchOrder; items: PdvDispatchItem[] }
export interface PdvDeliveryReceipt { kind: string; deliveryId: string; withdrawnAt: string; order: { id: string; number: number; status: string }; customerName: string | null; stockName: string | null; operatorName?: string | null; items: Array<{ description: string; unit: string; quantity: number; remainingQuantity: number }>; notice: string }
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
type RpcRequest = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => RpcRequest };
type RpcCaller = (name: string, args?: Record<string, unknown>) => RpcRequest;
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

async function call(name: string, args?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  let request = rpc(name, args);
  if (signal && request.abortSignal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw mapPdvDispatchError(error);
  return data;
}

function usePdvDispatchRead<T>(entityKey: readonly (string | null)[], read: (signal: AbortSignal) => Promise<T>, staleTime: number, hasEntity = true) {
  const scope = usePdvAuthorizedQueryScope();
  const { roles, permissions, hasPermissionRecord } = useAuth();
  // Mesmo gate nominal do contexto de balcão; a RPC continua validando tenant,
  // assinatura, modo e ACL do estoque antes de retornar qualquer dado.
  const canRead = roles.some(role => ['admin', 'gestor', 'super_admin'].includes(role))
    || (hasPermissionRecord === true && (permissions.includes('*') || permissions.includes('screen:pdv_dispatch')));
  const enabled = scope.ready && canRead && hasEntity;
  const queryKey = [...ROOT, ...entityKey, ...scope.key];
  const signature = JSON.stringify([queryKey, enabled]);
  const current = useRef({ signature });
  if (current.current.signature !== signature) current.current = { signature };
  const requestScope = current.current;
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const assertCurrent = () => {
        if (!enabled || signal.aborted || current.current !== requestScope) {
          throw new DOMException('O contexto desta consulta mudou. Atualize os dados.', 'AbortError');
        }
      };
      assertCurrent();
      try { return await read(signal); }
      finally { assertCurrent(); }
    },
    enabled,
    staleTime,
    // Uma consulta de outro contexto não é um placeholder válido, mesmo que o
    // QueryClient tenha keepPreviousData como padrão global.
    placeholderData: () => undefined,
    gcTime: 0,
  });
  return enabled ? query : { ...query, data: undefined };
}

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
  return { kind: txt(v.kind) ?? 'delivery_receipt', deliveryId: txt(v.delivery_id) ?? '', withdrawnAt: txt(v.withdrawn_at) ?? '', order: { id: txt(order.id) ?? '', number: num(order.number), status: txt(order.status) ?? '' }, customerName: txt(v.customer_name), stockName: txt(v.stock_name), operatorName: txt(v.operator_name), items: Array.isArray(v.items) ? v.items.map((entry) => { const item = rec(entry); return { description: txt(item.description) ?? 'Item', unit: txt(item.unit) ?? 'un', quantity: num(item.quantity), remainingQuantity: num(item.remaining_quantity) }; }) : [], notice: txt(v.notice) ?? 'Comprovante não fiscal de retirada.' };
}

export function usePdvDispatchQueue() { return usePdvDispatchRead(['queue'], async signal => projectPdvDispatchQueue(await call('pdv_list_dispatch_queue_v2', undefined, signal)), 10_000); }
export function usePdvDispatchHistory() { return usePdvDispatchRead(['history'], async signal => projectPdvDispatchQueue(await call('pdv_list_delivered_orders_v2', undefined, signal)), 10_000); }
export function usePdvDispatchOrder(orderId: string | null) { return usePdvDispatchRead(['order', orderId], async signal => projectPdvDispatchDetail(await call('pdv_get_dispatch_order_v2', { p_order_id: orderId }, signal)), 5_000, Boolean(orderId)); }
export async function fetchPdvDeliveryReceipt(deliveryId: string, signal?: AbortSignal) { return projectPdvDeliveryReceipt(await call('pdv_get_delivery_receipt_snapshot_v2', { p_delivery_id: deliveryId }, signal)); }
export function usePdvDeliveryReceipt(deliveryId: string | null) { return usePdvDispatchRead(['receipt', deliveryId], signal => fetchPdvDeliveryReceipt(deliveryId!, signal), Infinity, Boolean(deliveryId)); }
export function usePdvCompleteDispatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: PdvCompleteDispatchInput) => rec(await call(
      'pdv_complete_dispatch_delivery_v2', buildPdvDispatchRpcArgs(input),
    )),
    onSuccess: async () => {
      await Promise.all([
        // Fila, detalhe e histórico compartilham os fatos da retirada.
        client.invalidateQueries({ queryKey: ROOT }),
        invalidatePdvOrderProjections(client),
        invalidatePdvCatalogCaches(client),
        ...['inventory-stock-levels', 'inventory-movements', 'pdv-stock-availability',
          'pdv-stock-reservations', 'pdv-cash-sessions-v2', 'inventory', 'pdv-orders']
          .map(root => client.invalidateQueries({ queryKey: [root] })),
        invalidatePdvReportCaches(client),
      ]);
    },
  });
}

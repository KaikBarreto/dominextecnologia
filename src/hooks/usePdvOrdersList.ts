import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

export type PdvOrderPaymentStatus = 'aguardando' | 'parcial' | 'pago' | 'fiado_aprovado' | 'reembolso_parcial' | 'reembolsado' | 'cancelado';
export type PdvOrderPickupStatus = 'aguardando_liberacao' | 'liberado' | 'parcial' | 'entregue' | 'cancelada';
export type PdvOrderStatusKind = 'commercial' | 'payment' | 'pickup';

export function pdvOrderStatusLabel(kind: PdvOrderStatusKind, value: string): string {
  const labels: Record<PdvOrderStatusKind, Record<string, string>> = {
    commercial: { rascunho: 'Rascunho', aguardando_pagamento: 'Pedido aberto', pago: 'Pedido pago', liberado_retirada: 'Pedido liberado', retirada_parcial: 'Pedido parcial', entregue: 'Pedido entregue', cancelado: 'Pedido cancelado', cancelado_parcial: 'Cancelado parcial' },
    payment: { aguardando: 'Pagamento pendente', parcial: 'Pagamento parcial', pago: 'Pagamento concluído', fiado_aprovado: 'Fiado aprovado', reembolso_parcial: 'Reembolso parcial', reembolsado: 'Reembolsado', cancelado: 'Pagamento cancelado' },
    pickup: { aguardando_liberacao: 'Aguardando liberação', liberado: 'Retirada liberada', parcial: 'Retirada parcial', entregue: 'Retirada concluída', cancelada: 'Retirada cancelada' },
  };
  return labels[kind][value] ?? value.split('_').join(' ');
}

export interface PdvOrdersListFilters {
  query: string;
  status: string | null;
  paymentStatus: PdvOrderPaymentStatus | null;
  pickupStatus: PdvOrderPickupStatus | null;
  terminalId: string | null;
  operatorId: string | null;
  from: string | null;
  to: string | null;
  sort: 'newest' | 'oldest';
  page: number;
  pageSize: number;
}

export interface PdvOrderListRow {
  id: string;
  number: number;
  customerName: string | null;
  createdAt: string;
  updatedAt: string;
  commercialStatus: string;
  paymentStatus: PdvOrderPaymentStatus;
  pickupStatus: PdvOrderPickupStatus;
  total: number;
  itemCount: number;
  cashName: string | null;
  operatorName: string | null;
  canGenerateReceipt: boolean;
}

export interface PdvOrderFilterOption { id: string; name: string }
export interface PdvOrdersListResult {
  rows: PdvOrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  canFilterCash: boolean;
  cashOptions: PdvOrderFilterOption[];
  operatorOptions: PdvOrderFilterOption[];
}

export interface PdvOrderWorkspaceDetail {
  order: {
    id: string;
    number: number;
    customerName: string | null;
    createdAt: string;
    commercialStatus: string;
    total: number;
    notes: string | null;
    paymentStatus: PdvOrderPaymentStatus;
    pickupStatus: PdvOrderPickupStatus;
    canGenerateReceipt: boolean;
  };
  items: Array<{ id: string; description: string; quantity: number; unitPrice: number; total: number; deliveredQuantity: number }>;
  timeline: Array<{ kind: string; label: string; at: string }>;
}

type RpcResult = { data: unknown; error: { code?: string; details?: string; message?: string } | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const number = (value: unknown): number => { const result = typeof value === 'number' ? value : Number(value); return Number.isFinite(result) ? result : 0; };

function paymentStatus(value: unknown): PdvOrderPaymentStatus {
  return value === 'parcial' || value === 'pago' || value === 'fiado_aprovado' || value === 'reembolso_parcial' || value === 'reembolsado' || value === 'cancelado' ? value : 'aguardando';
}
function pickupStatus(value: unknown): PdvOrderPickupStatus {
  return value === 'liberado' || value === 'parcial' || value === 'entregue' || value === 'cancelada' ? value : 'aguardando_liberacao';
}

export function mapPdvOrdersWorkspaceError(error: unknown): Error {
  const raw = object(error);
  const details = text(raw.details) ?? '';
  const code = /(?:^|\s)code=([a-z0-9_]+)/i.exec(details)?.[1] ?? '';
  if (code === 'pdv_orders_order_denied') return new Error('Este pedido não pertence aos caixas que você pode consultar.');
  if (code === 'pdv_orders_cash_filter_denied') return new Error('Seu perfil não permite filtrar outros caixas.');
  if (code.endsWith('_denied') || raw.code === '42501') return new Error('Seu perfil não permite consultar os pedidos.');
  if (/fetch|network|connection/i.test(text(raw.message) ?? '')) return new Error('Não foi possível acessar o servidor. Verifique sua conexão.');
  return new Error('Não foi possível carregar os pedidos. Tente novamente.');
}

async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(name, args);
  if (error) throw mapPdvOrdersWorkspaceError(error);
  return data;
}

export function projectPdvOrdersList(payload: unknown): PdvOrdersListResult {
  const root = object(payload);
  const rows = Array.isArray(root.rows) ? root.rows.flatMap((entry): PdvOrderListRow[] => {
    const row = object(entry); const id = text(row.id); const createdAt = text(row.created_at);
    if (!id || !createdAt) return [];
    return [{ id, number: number(row.number), customerName: text(row.customer_name), createdAt, updatedAt: text(row.updated_at) ?? createdAt, commercialStatus: text(row.commercial_status) ?? 'criado', paymentStatus: paymentStatus(row.payment_status), pickupStatus: pickupStatus(row.pickup_status), total: number(row.total), itemCount: number(row.item_count), cashName: text(row.cash_name), operatorName: text(row.operator_name), canGenerateReceipt: row.can_generate_receipt === true }];
  }) : [];
  const options = (value: unknown): PdvOrderFilterOption[] => Array.isArray(value) ? value.flatMap((entry) => { const option = object(entry); const id = text(option.id); const name = text(option.name); return id && name ? [{ id, name }] : []; }) : [];
  return { rows, total: number(root.total), page: number(root.page), pageSize: number(root.page_size) || 25, canFilterCash: root.can_filter_cash === true, cashOptions: options(root.cash_options), operatorOptions: options(root.operator_options) };
}

export function projectPdvOrderWorkspaceDetail(payload: unknown): PdvOrderWorkspaceDetail {
  const root = object(payload); const order = object(root.order); const id = text(order.id); const createdAt = text(order.created_at);
  if (!id || !createdAt) throw new Error('O pedido recebido está incompleto.');
  return {
    order: { id, number: number(order.number), customerName: text(order.customer_name), createdAt, commercialStatus: text(order.commercial_status) ?? 'criado', total: number(order.total), notes: text(order.notes), paymentStatus: paymentStatus(order.payment_status), pickupStatus: pickupStatus(order.pickup_status), canGenerateReceipt: order.can_generate_receipt === true },
    items: Array.isArray(root.items) ? root.items.flatMap((entry) => { const item = object(entry); const itemId = text(item.id); if (!itemId) return []; return [{ id: itemId, description: text(item.description) ?? 'Item', quantity: number(item.quantity), unitPrice: number(item.unit_price), total: number(item.total), deliveredQuantity: number(item.delivered_quantity) }]; }) : [],
    timeline: Array.isArray(root.timeline) ? root.timeline.flatMap((entry) => { const event = object(entry); const at = text(event.at); if (!at) return []; return [{ kind: text(event.kind) ?? 'pedido', label: text(event.label) ?? 'Pedido atualizado', at }]; }) : [],
  };
}

export function usePdvOrdersList(filters: PdvOrdersListFilters) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: ['pdv', 'orders-workspace', ...scope.key, filters],
    queryFn: async () => projectPdvOrdersList(await call('pdv_list_orders_workspace_v3', {
      p_query: filters.query || null, p_status: filters.status, p_payment_status: filters.paymentStatus,
      p_pickup_status: filters.pickupStatus, p_terminal_id: filters.terminalId, p_operator_id: filters.operatorId,
      p_from: filters.from, p_to: filters.to, p_sort: filters.sort, p_page: filters.page, p_page_size: filters.pageSize,
    })),
    enabled: scope.ready,
    staleTime: 10_000,
    gcTime: 0,
  });
}

export function usePdvOrderWorkspace(orderId: string | null) {
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({ queryKey: ['pdv', 'orders-workspace', ...scope.key, 'detail', orderId], queryFn: async () => projectPdvOrderWorkspaceDetail(await call('pdv_get_order_workspace_v3', { p_order_id: orderId })), enabled: scope.ready && Boolean(orderId), staleTime: 5_000, gcTime: 0 });
}

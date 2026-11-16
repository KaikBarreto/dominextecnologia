import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from './pdvReportCache';

export const PDV_COUPONS_ROOT = ['pdv', 'coupons'] as const;
export type PdvCouponState = 'available' | 'inactive' | 'expired' | 'scheduled';
export interface PdvCouponRules {
  code: string; name: string; kind: 'fixed' | 'percentage'; value: number;
  max_discount_amount: number | null; minimum_amount: number;
  starts_on: string | null; expires_on: string | null; is_active: boolean;
  usage_limit: number | null; per_customer_limit: number | null;
  customer_ids: string[]; inventory_ids: string[];
}
export interface PdvCoupon extends PdvCouponRules {
  id: string; revision: number; status: PdvCouponState; used_count: number;
}
export interface PdvCouponBaseItem { id: string; inventory_id: string | null; net_cents: number }
export interface PdvCouponEvaluation {
  eligible: boolean; reason?: string; message?: string; discount_cents?: number;
  allocations?: Array<{ item_id: string; base_net_cents: number; discount_cents: number }>;
  coupon_id?: string; revision?: number; code?: string;
}
type RpcError = { code?: string; details?: string; message?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcPending = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args?: Record<string, unknown>) => RpcPending;
const INVALID = 'Não foi possível confirmar os dados do cupom. Atualize os dados e tente novamente.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;
const REASONS: Record<string, string> = {
  order_total_zero: 'O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.',
  missing: 'Este cupom não está disponível.', inactive: 'Este cupom está inativo.', scheduled: 'A vigência deste cupom ainda não começou.', expired: 'A vigência deste cupom terminou.',
  customer: 'Este cupom está disponível apenas para os clientes selecionados.', customer_required: 'Selecione um cliente para usar este cupom.',
  minimum: 'O valor dos itens não atingiu a compra mínima deste cupom.', items: 'Adicione um produto participante para usar este cupom.',
  usage_limit: 'O limite de utilizações deste cupom foi atingido.', customer_limit: 'Este cliente já atingiu o limite de utilizações deste cupom.', zero: 'O cupom não gera desconto para os itens atuais.',
};
const invalid = (): never => { throw new Error(INVALID); };
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
function text(value: unknown, max = 200): string { return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value : invalid(); }
function uuid(value: unknown): string { return typeof value === 'string' && UUID.test(value) ? value : invalid(); }
function integer(value: unknown, min = 0): number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : invalid(); }
function money(value: unknown, min = 0): number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= 999_999_999_999.99 && Math.round(value * 100) / 100 === value ? value : invalid(); }
function day(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : invalid();
}
function ids(value: unknown): string[] { if (!Array.isArray(value) || value.length > 10_000) return invalid(); const result = value.map(uuid); return new Set(result).size === result.length ? result : invalid(); }
export function projectPdvCoupon(value: unknown): PdvCoupon {
  const row = record(value); const code = text(row.code, 40); if (!CODE.test(code)) return invalid();
  if (row.kind !== 'fixed' && row.kind !== 'percentage' || typeof row.is_active !== 'boolean' || !['available', 'inactive', 'expired', 'scheduled'].includes(String(row.status))) return invalid();
  const amount = money(row.value, 0.01); if (row.kind === 'percentage' && amount > 100) return invalid();
  const start = day(row.starts_on), end = day(row.expires_on); if (start && end && start > end) return invalid();
  return { id: uuid(row.id), revision: integer(row.revision, 1), code, name: text(row.name, 100), kind: row.kind, value: amount, is_active: row.is_active,
    status: row.status as PdvCouponState, used_count: integer(row.used_count), starts_on: start, expires_on: end,
    minimum_amount: money(row.minimum_amount), max_discount_amount: row.max_discount_amount === null ? null : money(row.max_discount_amount, 0.01),
    usage_limit: row.usage_limit === null ? null : integer(row.usage_limit, 1), per_customer_limit: row.per_customer_limit === null ? null : integer(row.per_customer_limit, 1),
    customer_ids: ids(row.customer_ids), inventory_ids: ids(row.inventory_ids) };
}
export function projectPdvCouponEvaluation(value: unknown, couponId: string, items: PdvCouponBaseItem[]): PdvCouponEvaluation {
  const row = record(value); if (typeof row.eligible !== 'boolean') return invalid();
  if (!row.eligible) { const reason = text(row.reason, 40); return REASONS[reason] ? { eligible: false, reason, message: REASONS[reason] } : invalid(); }
  const discount = integer(row.discount_cents, 1), revision = integer(row.revision, 1), code = text(row.code, 40), id = uuid(row.coupon_id);
  if (id !== couponId || !CODE.test(code) || !Array.isArray(row.allocations) || row.allocations.length === 0) return invalid();
  const bases = new Map(items.map(item => [item.id, item.net_cents]));
  if (bases.size !== items.length || items.some(item => !Number.isSafeInteger(item.net_cents) || item.net_cents < 0) || discount >= items.reduce((sum, item) => sum + item.net_cents, 0)) return invalid();
  const seen = new Set<string>(); let allocated = 0;
  const allocations = row.allocations.map(value => {
    const allocation = record(value), itemId = text(allocation.item_id), base = integer(allocation.base_net_cents), cents = integer(allocation.discount_cents);
    if (seen.has(itemId) || bases.get(itemId) !== base || cents > base) return invalid();
    seen.add(itemId); allocated += cents;
    return { item_id: itemId, base_net_cents: base, discount_cents: cents };
  });
  if (allocated !== discount) return invalid();
  return { eligible: true, coupon_id: id, revision, code, discount_cents: discount, allocations };
}
function projectCouponList(value: unknown) {
  const payload = record(value); if (!Array.isArray(payload.coupons) || !Array.isArray(payload.customers) || !Array.isArray(payload.inventory)) return invalid();
  const option = (value: unknown) => { const row = record(value); return { id: uuid(row.id), name: text(row.name) }; };
  return { coupons: payload.coupons.map(projectPdvCoupon), customers: payload.customers.map(option), inventory: payload.inventory.map(option) };
}
export function safePdvCouponError(error: RpcError): Error {
  const detail = error.details ?? '';
  if (detail.includes('pdv_coupon_order_total_zero')) return new Error(REASONS.order_total_zero);
  if (detail.includes('pdv_coupon_duplicate')) return new Error('Já existe um cupom com este código. Escolha outro código.');
  if (detail.includes('pdv_coupon_conflict') || error.code === '40001') return new Error('O cupom ou o pedido mudou em outra sessão. Atualize os dados e tente novamente.');
  if (detail.includes('pdv_coupon_invalid') || detail.includes('pdv_coupon_items_invalid')) return new Error('Revise o código, os valores, os limites e a vigência do cupom.');
  if (detail.includes('pdv_coupon_missing')) return new Error('Este cupom não está mais disponível. Atualize a lista.');
  if (detail.includes('pdv_coupon_ineligible')) return new Error('O cupom não atende às regras desta venda. Confira o cliente, os itens, a vigência e os limites.');
  if (error.code === '42501') return new Error('Não foi possível autorizar o acesso aos cupons. Confira sua sessão e as permissões do PDV.');
  return new Error('Não foi possível carregar ou salvar o cupom. Tente novamente.');
}
export async function callPdvCouponRpc(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const pending = rpc(name, args); const result = await (signal && pending.abortSignal ? pending.abortSignal(signal) : pending);
  if (signal?.aborted) throw new Error('O contexto do PDV mudou.');
  if (result.error) throw safePdvCouponError(result.error); return result.data;
}
export async function evaluatePdvCoupon(couponId: string, customerId: string | null, items: PdvCouponBaseItem[], signal?: AbortSignal): Promise<PdvCouponEvaluation> {
  const data = await callPdvCouponRpc('pdv_evaluate_coupon_v1', { p_coupon_id: couponId, p_customer_id: customerId, p_items: items }, signal);
  return projectPdvCouponEvaluation(data, couponId, items);
}
/** Cada passagem A→B→A tem uma época própria; respostas antigas nunca publicam. */
export function usePdvCouponOperationScope(extra: unknown, enabled = true) {
  const scope = usePdvAuthorizedQueryScope(); const ready = scope.ready && enabled;
  const signature = JSON.stringify([scope.key, ready, extra]);
  const current = useRef<{ signature: string; epoch: string; mounted: boolean; controllers: Set<AbortController> } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID(), mounted: true, controllers: new Set() };
  const token = current.current;
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; for (const controller of token.controllers) controller.abort(); token.controllers.clear(); }; }, [token]);
  return { ready, key: [...scope.key, token.epoch], isCurrent: () => ready && token.mounted && current.current === token, token };
}
function couponRulesPayload(rules: PdvCouponRules): PdvCouponRules {
  return { code: rules.code, name: rules.name, kind: rules.kind, value: rules.value, max_discount_amount: rules.max_discount_amount, minimum_amount: rules.minimum_amount, starts_on: rules.starts_on, expires_on: rules.expires_on, is_active: rules.is_active, usage_limit: rules.usage_limit, per_customer_limit: rules.per_customer_limit, customer_ids: rules.customer_ids, inventory_ids: rules.inventory_ids };
}
export function usePdvCoupons(management = false, enabled = true) {
  const scope = usePdvCouponOperationScope(['list', management], enabled); const queryClient = useQueryClient();
  const saveToken = useRef<typeof scope.token | null>(null);
  const query = useQuery({
    queryKey: [...PDV_COUPONS_ROOT, ...scope.key, management], enabled: scope.ready,
    staleTime: 0, gcTime: 0, placeholderData: () => undefined,
    queryFn: async ({ signal }) => {
      const data = await callPdvCouponRpc('pdv_list_coupons_v1', { p_management: management }, signal);
      if (!scope.isCurrent() || signal.aborted) throw new Error('O contexto do PDV mudou.');
      return projectCouponList(data);
    },
  });
  const save = useMutation({
    mutationFn: async (input: { id: string | null; revision: number | null; rules: PdvCouponRules }) => {
      if (!scope.isCurrent()) return undefined;
      saveToken.current = scope.token;
      const controller = new AbortController(); scope.token.controllers.add(controller);
      try {
        const data = await callPdvCouponRpc('pdv_save_coupon_v1', { p_coupon_id: input.id, p_expected_revision: input.revision, p_rules: couponRulesPayload(input.rules) }, controller.signal);
        return scope.isCurrent() ? projectPdvCoupon(data) : undefined;
      } catch (error) { if (scope.isCurrent() && !controller.signal.aborted) throw error; return undefined; }
      finally { scope.token.controllers.delete(controller); }
    },
    onSuccess: result => { if (result && scope.isCurrent()) void queryClient.invalidateQueries({ queryKey: PDV_COUPONS_ROOT }); },
  });
  const visible = scope.isCurrent() && !query.isError ? query.data : undefined;
  const mutationVisible = saveToken.current === scope.token && scope.isCurrent();
  const scopedSave = { ...save, data: mutationVisible ? save.data : undefined, error: mutationVisible ? save.error : null, isPending: mutationVisible && save.isPending };
  return { ...query, data: visible, error: scope.isCurrent() ? query.error : null, isError: scope.isCurrent() && query.isError, coupons: visible?.coupons ?? [], customers: visible?.customers ?? [], inventory: visible?.inventory ?? [], save: scopedSave, isCurrent: scope.isCurrent, contextKey: scope.token.epoch };
}

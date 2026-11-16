import type { PdvReturnMutationResult } from '@/hooks/usePdvReturns';

export interface PdvReturnIntentOwner { companyId: string; userId: string; orderId: string }
export type PdvReturnIntentState = 'submitted' | 'unknown' | 'failed' | 'confirmed';
export interface PdvReturnIntent {
  version: 1; owner: PdvReturnIntentOwner; rpc: 'pdv_return_delivery_items_v2';
  args: Record<string, unknown>; state: PdvReturnIntentState;
  summary: { itemCount: number; total: number }; result?: PdvReturnMutationResult;
}
export const RETURN_INTENT_EVENT = 'pdv-return-intent-changed';
export const RETURN_INTENT_STORAGE_ERROR = 'Não foi possível salvar ou conferir a tentativa neste aparelho. Verifique o armazenamento do navegador e tente novamente.';
export const RETURN_INTENT_PENDING_MESSAGE = 'A devolução pode ter sido registrada. Tente confirmar a mesma solicitação antes de iniciar outra.';
export const RETURN_INTENT_CONTEXT_MESSAGE = 'O contexto deste pedido mudou. Abra o pedido correto antes de continuar.';
export class PdvReturnIntentError extends Error {
  constructor(message: string, public readonly kind: 'storage' | 'pending' | 'context' | 'unknown' | 'business' = 'unknown') { super(message); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const nonempty = (value: unknown, max = 128): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.round(value * 100) / 100 === value;
const storageFailure = () => new PdvReturnIntentError(RETURN_INTENT_STORAGE_ERROR, 'storage');
const keysOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
function day(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function pdvReturnIntentKey(owner: PdvReturnIntentOwner): string {
  if (![owner.companyId, owner.userId, owner.orderId].every(value => nonempty(value))) throw storageFailure();
  return `pdv-return-intent:v1:${encodeURIComponent(owner.companyId)}:${encodeURIComponent(owner.userId)}:${encodeURIComponent(owner.orderId)}`;
}
export function validatePdvReturnArgs(args: unknown, orderId: string): args is Record<string, unknown> {
  const a = record(args);
  if (!a || !keysOnly(a, ['p_order_id', 'p_lines', 'p_dispositions', 'p_occurred_on', 'p_reason', 'p_idempotency_key']) || a.p_order_id !== orderId || !uuid(a.p_order_id) || !uuid(a.p_idempotency_key)
    || !day(a.p_occurred_on) || !nonempty(a.p_reason, 500) || a.p_reason.trim() !== a.p_reason || !Array.isArray(a.p_lines) || !a.p_lines.length || a.p_lines.length > 100 || !Array.isArray(a.p_dispositions) || a.p_dispositions.length > 10) return false;
  const seen = new Set<string>();
  for (const value of a.p_lines) {
    const line = record(value);
    if (!line || !keysOnly(line, ['delivery_item_id', 'quantity', 'destination', 'destination_stock_id']) || !uuid(line.delivery_item_id) || seen.has(line.delivery_item_id) || typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0 || !['saleable', 'quarantine', 'none'].includes(String(line.destination))) return false;
    if (line.destination === 'none' ? line.destination_stock_id !== undefined && line.destination_stock_id !== null : !uuid(line.destination_stock_id)) return false;
    seen.add(line.delivery_item_id);
  }
  for (const value of a.p_dispositions) {
    const disposition = record(value);
    if (!disposition || !keysOnly(disposition, ['kind', 'amount', 'receivable_transaction_id']) || !['customer_credit', 'receivable_reduction'].includes(String(disposition.kind)) || !money(disposition.amount) || disposition.amount <= 0) return false;
    if (disposition.kind === 'receivable_reduction' ? !uuid(disposition.receivable_transaction_id) : disposition.receivable_transaction_id !== undefined && disposition.receivable_transaction_id !== null) return false;
  }
  return true;
}
export function parsePdvReturnIntent(raw: string, owner: PdvReturnIntentOwner): PdvReturnIntent {
  try {
    const value = record(JSON.parse(raw)), identity = record(value?.owner), summary = record(value?.summary);
    if (!value || value.version !== 1 || value.rpc !== 'pdv_return_delivery_items_v2' || !identity || identity.companyId !== owner.companyId || identity.userId !== owner.userId || identity.orderId !== owner.orderId || !['submitted', 'unknown', 'failed', 'confirmed'].includes(String(value.state))
      || !validatePdvReturnArgs(value.args, owner.orderId) || !summary || !Number.isSafeInteger(summary.itemCount) || Number(summary.itemCount) < 1 || !money(summary.total)) throw storageFailure();
    const args = value.args as Record<string, unknown>; const lines = args.p_lines as unknown[];
    const sum = (args.p_dispositions as Array<{ amount: number }>).reduce((amount, item) => amount + Math.round(item.amount * 100), 0);
    if (summary.itemCount !== lines.length || sum !== Math.round(summary.total * 100)) throw storageFailure();
    if (value.state === 'confirmed') {
      const r = record(value.result);
      if (!r || !uuid(r.id) || r.orderId !== owner.orderId || !money(r.commercialTotal) || typeof r.idempotent !== 'boolean') throw storageFailure();
    }
    return value as unknown as PdvReturnIntent;
  } catch { throw storageFailure(); }
}
export function rawPdvReturnIntent(owner: PdvReturnIntentOwner): string | null {
  try { return localStorage.getItem(pdvReturnIntentKey(owner)); } catch { return '!storage-unavailable'; }
}
export function readPdvReturnIntent(owner: PdvReturnIntentOwner): PdvReturnIntent | null {
  const raw = rawPdvReturnIntent(owner); return raw === null ? null : parsePdvReturnIntent(raw, owner);
}
function notify() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(RETURN_INTENT_EVENT)); }
export function writePdvReturnIntent(intent: PdvReturnIntent): void {
  const raw = JSON.stringify(intent); parsePdvReturnIntent(raw, intent.owner);
  try {
    localStorage.setItem(pdvReturnIntentKey(intent.owner), raw);
    if (localStorage.getItem(pdvReturnIntentKey(intent.owner)) !== raw) throw storageFailure();
  } catch { throw storageFailure(); }
  notify();
}
export function updatePdvReturnIntent(intent: PdvReturnIntent, state: PdvReturnIntentState, result?: PdvReturnMutationResult): void {
  const current = readPdvReturnIntent(intent.owner);
  if (current?.args.p_idempotency_key !== intent.args.p_idempotency_key) throw storageFailure();
  writePdvReturnIntent({ ...current, state, ...(result ? { result } : {}) });
}
export function clearPdvReturnIntent(intent: PdvReturnIntent): void {
  const current = readPdvReturnIntent(intent.owner);
  if (current?.args.p_idempotency_key !== intent.args.p_idempotency_key) return;
  try { localStorage.removeItem(pdvReturnIntentKey(intent.owner)); if (localStorage.getItem(pdvReturnIntentKey(intent.owner)) !== null) throw storageFailure(); }
  catch { throw storageFailure(); }
  notify();
}
export async function preparePdvReturnIntent(owner: PdvReturnIntentOwner, args: Record<string, unknown>, summary: PdvReturnIntent['summary'], assertCurrent: () => void): Promise<PdvReturnIntent> {
  const prepare = () => {
    assertCurrent(); const previous = readPdvReturnIntent(owner);
    if (previous && !['failed', 'confirmed'].includes(previous.state)) throw new PdvReturnIntentError(RETURN_INTENT_PENDING_MESSAGE, 'pending');
    const intent: PdvReturnIntent = { version: 1, owner: { ...owner }, rpc: 'pdv_return_delivery_items_v2', args: structuredClone(args), summary: { ...summary }, state: 'submitted' };
    writePdvReturnIntent(intent); assertCurrent(); return intent;
  };
  // A Web Lock serializa preparação entre abas quando suportada. A alternativa
  // é a seção síncrona read/write/readback; não promete atomicidade entre abas.
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(pdvReturnIntentKey(owner), prepare) : prepare();
}

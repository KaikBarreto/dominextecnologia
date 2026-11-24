import { invalidatePdvOrderProjections } from '@/hooks/pdvOperationalCache';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches, usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { parsePdvMoneyText, pdvMoneyDecimalFromCents } from '@/lib/pdv/afterSaleMoney';
import { PdvResidualFault, type PdvResidualDestination } from '@/hooks/usePdvReturns';

export interface PdvResidualDispositionPlan {
  orderId: string; cancellationId: string; customerId: string; hash: string; freeCents: number;
  payments: Array<{ id: string; method: 'dinheiro' | 'pix' | 'transferencia'; accountId: string; budgetCents: number; availableCents: number }>;
  canCredit: boolean; canVoucher: boolean; canRefund: boolean;
  cash: Array<{ id: string; terminalId: string; accountId: string; label: string }>;
  banks: Array<{ id: string; label: string }>;
}
type Result = { orderId: string; cancellationId: string; pendingRefund: boolean };
type RpcResult = { data: unknown; error: { code?: string; details?: string; message?: string } | null };
type RpcCaller = (name: string, args: Record<string, unknown>) => Promise<RpcResult> & { abortSignal?: (signal: AbortSignal) => Promise<RpcResult> };
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
const ROOT = ['pdv-after-sale-v2'] as const;
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const invalid = () => new PdvResidualFault('Não foi possível conferir os valores disponíveis. Atualize o pós-venda antes de continuar.');
const text = (v: unknown): string => { if (typeof v !== 'string' || !v.trim()) throw invalid(); return v; };
const cents = (v: unknown): number => { if (typeof v !== 'number' && typeof v !== 'string') throw invalid(); const p = parsePdvMoneyText(String(v), { maxCents: 99_999_999_999 }); if (!p) throw invalid(); return p.cents; };
const bool = (v: unknown): boolean => { if (typeof v !== 'boolean') throw invalid(); return v; };
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw invalid(); return v; };

export function projectPdvResidualDispositionPlan(value: unknown, orderId: string): PdvResidualDispositionPlan {
  const v = record(value); const cap = record(v.capabilities);
  const plan: PdvResidualDispositionPlan = {
    orderId: text(v.order_id), cancellationId: text(v.cancellation_id), customerId: text(v.customer_id), hash: text(v.plan_hash), freeCents: cents(v.free_amount),
    canCredit: bool(cap.customer_credit), canVoucher: bool(cap.voucher), canRefund: bool(cap.refund),
    payments: list(v.payments).map(raw => { const p = record(raw); if (!['dinheiro', 'pix', 'transferencia'].includes(String(p.method))) throw invalid();
      const budgetCents = cents(p.budget_amount); const availableCents = cents(p.available_amount); if (availableCents > budgetCents || budgetCents <= 0) throw invalid();
      return { id: text(p.payment_id), method: p.method as 'dinheiro' | 'pix' | 'transferencia', accountId: text(p.account_id), budgetCents, availableCents }; }),
    cash: list(v.cash_options).map(raw => { const c = record(raw); return { id: text(c.session_id), terminalId: text(c.terminal_id), accountId: text(c.account_id), label: text(c.label) }; }),
    banks: list(v.bank_options).map(raw => { const b = record(raw); return { id: text(b.account_id), label: text(b.label) }; }),
  };
  if (plan.orderId !== orderId || !/^[a-f0-9]{64}$/.test(plan.hash) || new Set(plan.payments.map(p => p.id)).size !== plan.payments.length
    || plan.payments.reduce((s, p) => s + p.availableCents, 0) !== plan.freeCents) throw invalid();
  return plan;
}

export function validatePdvResidualDisposition(plan: PdvResidualDispositionPlan, rows: PdvResidualDestination[]): boolean {
  if (plan.freeCents <= 0 || rows.length < 1 || rows.length > 10 || rows.reduce((s, r) => s + r.amountCents, 0) !== plan.freeCents) return false;
  const keys = new Set<string>();
  return rows.every(row => {
    const p = plan.payments.find(p => p.id === row.paymentId); const key = `${row.paymentId}:${row.kind}`;
    if (!p || keys.has(key) || !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0
      || rows.filter(r => r.paymentId === row.paymentId).reduce((s, r) => s + r.amountCents, 0) > p.availableCents) return false;
    keys.add(key);
    if (row.kind === 'customer_credit') return plan.canCredit && !row.accountId && !row.sessionId;
    if (row.kind === 'voucher') return plan.canVoucher && !row.accountId && !row.sessionId;
    return row.kind === 'refund' && plan.canRefund && row.accountId === p.accountId && (p.method === 'dinheiro'
      ? plan.cash.some(c => c.id === row.sessionId && c.accountId === p.accountId)
      : !row.sessionId && plan.banks.some(b => b.id === row.accountId));
  });
}

export function mapPdvResidualDispositionError(value: unknown): PdvResidualFault {
  if (value instanceof PdvResidualFault) return value;
  const e = record(value); const code = String(e.details ?? '');
  if (code.includes('reconciliation_required')) return new PdvResidualFault('O histórico financeiro precisa ser conciliado por um responsável antes de escolher um novo destino.', 'unsupported');
  if (code.includes('cash_unavailable')) return new PdvResidualFault('O caixa original está fechado ou indisponível. Peça ao responsável para conferir a devolução em dinheiro.', 'permission');
  if (code.includes('payment_exceeded') || code.includes('total_mismatch')) return new PdvResidualFault('Distribua somente o valor liberado de cada pagamento original. Atualize os valores e confira novamente.');
  if (e.code === '40001') return new PdvResidualFault('O valor disponível mudou em outro atendimento. Atualize e confira os destinos novamente.', 'stale');
  if (e.code === '42501') return new PdvResidualFault('Seu perfil não permite tratar este valor ou utilizar o destino escolhido.', 'permission');
  if (['22023', '23514', 'P0002'].includes(String(e.code))) return new PdvResidualFault('Confira os valores, o motivo e os destinos escolhidos.');
  if (e.code === '55000') return new PdvResidualFault('A solicitação pode estar sendo processada. Confira o resultado antes de alterar os valores.', 'pending');
  return new PdvResidualFault('Não recebemos a confirmação. Repita a mesma solicitação para conferir o resultado.', 'unknown');
}

interface Intent { epoch: string; args: Record<string, unknown>; state: 'submitted' | 'unknown' | 'completed' | 'failed'; expectedCents: number; cancellationId: string }
const intents = new Map<string, Intent>();
export const clearPdvResidualDispositionIntentsForTests = () => intents.clear();

export function usePdvResidualDisposition(orderId: string, open: boolean) {
  const auth = useAuth(); const scope = usePdvAuthorizedQueryScope(); const client = useQueryClient();
  const ready = open && scope.ready; const identity = JSON.stringify([auth.profile?.company_id, auth.user?.id, orderId]);
  const signature = JSON.stringify([identity, scope.key, ready]);
  const current = useRef<{ signature: string; epoch: string; mounted: boolean } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID(), mounted: true };
  const token = current.current;
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; }; }, [token]);
  const isCurrent = () => ready && token.mounted && current.current === token;
  const assertCurrent = () => { if (!isCurrent()) throw new PdvResidualFault('O contexto mudou. Abra o pós-venda novamente.', 'context'); };
  const query = useQuery({
    queryKey: [...ROOT, ...scope.key, 'residual-disposition', orderId, token.epoch], enabled: ready, retry: false, staleTime: 0, gcTime: 0, placeholderData: () => undefined,
    queryFn: async ({ signal }) => { const req = rpc('pdv_get_residual_disposition_plan_v4', { p_order_id: orderId });
      const result = await (req.abortSignal ? req.abortSignal(signal) : req); assertCurrent(); if (signal.aborted) throw new PdvResidualFault('O contexto mudou.', 'context');
      if (result.error) throw mapPdvResidualDispositionError(result.error); return projectPdvResidualDispositionPlan(result.data, orderId); },
  });
  async function invalidate() {
    await Promise.all([invalidatePdvOrderProjections(client), ...['pdv-after-sale-v2', 'pdv-returns', 'party-account', 'party-account-v2', 'pdv-orders', 'pdv-dispatch', 'pdv-cash-sessions-v2', 'financial-transactions'].map(root => client.invalidateQueries({ queryKey: [root] })), invalidatePdvReportCaches(client)]);
  }
  const mutation = useMutation({ mutationFn: async (intent: Intent): Promise<Result> => {
    assertCurrent(); if (intent.epoch !== token.epoch) throw new PdvResidualFault('O contexto mudou. Abra o pós-venda novamente.', 'context');
    intent.state = 'submitted'; intents.set(identity, intent);
    try {
      const response = await rpc('pdv_reallocate_residual_value_v4', intent.args);
      if (response.error) throw mapPdvResidualDispositionError(response.error);
      const v = record(response.data); let resources: unknown[];
      try { resources = list(v.resources);
      const sent = intent.args.p_dispositions as Array<Record<string, unknown>>;
      if (v.ok !== true || v.order_id !== orderId || v.cancellation_id !== intent.cancellationId || cents(v.allocated_amount) !== intent.expectedCents
        || resources.length !== sent.length || resources.some(raw => { const r = record(raw); const expected = sent.find(s => s.kind === r.kind && s.original_payment_id === r.original_payment_id);
          return !expected || cents(expected.amount) !== cents(r.amount) || r.kind === 'customer_credit' && !r.credit_entry_id || r.kind === 'voucher' && !r.voucher_id
            || r.kind === 'refund' && (!r.refund_id || !['pending', 'settled'].includes(String(r.status))); })) throw invalid();
      } catch { throw new PdvResidualFault('A confirmação precisa ser conferida antes de alterar os destinos.', 'unknown'); }
      intent.state = 'completed'; await invalidate(); assertCurrent();
      return { orderId, cancellationId: intent.cancellationId, pendingRefund: resources.some(raw => { const r = record(raw); return r.kind === 'refund' && r.status === 'pending'; }) };
    } catch (error) {
      const mapped = mapPdvResidualDispositionError(error);
      if (intent.state !== 'completed') intent.state = ['unknown', 'pending', 'context'].includes(mapped.kind) ? 'unknown' : 'failed';
      if (intent.state === 'unknown') await invalidate(); throw mapped;
    }
  } });
  function submit(reason: string, rows: PdvResidualDestination[]) {
    assertCurrent(); const old = intents.get(identity); if (old && ['submitted', 'unknown'].includes(old.state)) return Promise.reject(new PdvResidualFault('Confira a solicitação anterior antes de alterar os destinos.', 'unknown'));
    const plan = query.data; if (!plan || query.isError || query.isFetching || !reason.trim() || reason.trim().length > 500 || !validatePdvResidualDisposition(plan, rows)) return Promise.reject(invalid());
    const intent: Intent = { epoch: token.epoch, state: 'submitted', expectedCents: plan.freeCents, cancellationId: plan.cancellationId, args: {
      p_order_id: orderId, p_reason: reason.trim(), p_expected_plan_hash: plan.hash, p_idempotency_key: crypto.randomUUID(),
      p_dispositions: rows.map(r => ({ kind: r.kind, original_payment_id: r.paymentId, amount: pdvMoneyDecimalFromCents(r.amountCents),
        ...(r.accountId ? { account_id: r.accountId } : {}), ...(r.sessionId ? { cash_session_id: r.sessionId } : {}) })),
    } };
    intents.set(identity, intent);
    return mutation.mutateAsync(intent);
  }
  const intent = intents.get(identity); const uncertain = Boolean(intent && ['submitted', 'unknown'].includes(intent.state));
  function retryIntent() { assertCurrent(); const pending = intents.get(identity); if (!pending || !['submitted', 'unknown'].includes(pending.state)) return Promise.reject(invalid()); pending.epoch = token.epoch; return mutation.mutateAsync(pending); }
  return { query: { ...query, data: isCurrent() && !query.isError ? query.data : undefined }, scopeKey: token.epoch, isCurrent,
    isPending: mutation.isPending, uncertain, submit, retryIntent };
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { buildPdvReturnRpcArgs, invalidateReturnConsumers, mapPdvReturnError, type PdvCreateReturnInput, type PdvReturnMutationResult } from '@/hooks/usePdvReturns';
import {
  RETURN_INTENT_CONTEXT_MESSAGE, RETURN_INTENT_EVENT, RETURN_INTENT_PENDING_MESSAGE, RETURN_INTENT_STORAGE_ERROR,
  PdvReturnIntentError, clearPdvReturnIntent, parsePdvReturnIntent, pdvReturnIntentKey, preparePdvReturnIntent, rawPdvReturnIntent, readPdvReturnIntent, updatePdvReturnIntent,
  type PdvReturnIntent, type PdvReturnIntentOwner,
} from '@/lib/pdv/return-intent';

type RpcError = { code?: string; message?: string; details?: string };
const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>;
class ReturnRpcError extends Error { constructor(public readonly raw: RpcError) { super(mapPdvReturnError(raw).message); } }
function useReturnIdentity(orderId: string, enabled: boolean) {
  const auth = useAuth(), scope = usePdvAuthorizedQueryScope();
  const privileged = auth.roles.some(role => ['admin', 'gestor', 'super_admin'].includes(role));
  const explicit = (permission: string) => auth.hasPermissionRecord && (auth.permissions.includes('*') || auth.permissions.includes(permission));
  const allowed = privileged || (explicit('fn:return_pdv_order') && (explicit('screen:pdv_orders') || explicit('screen:pdv_dispatch')));
  const ready = enabled && scope.ready && allowed && auth.profile?.is_active === true && auth.profile.user_id === auth.user?.id && Boolean(auth.profile?.company_id && auth.user?.id && orderId);
  const companyId = auth.profile?.company_id ?? '', userId = auth.user?.id ?? '';
  const owner = useMemo<PdvReturnIntentOwner>(() => ({ companyId, userId, orderId }), [companyId, userId, orderId]);
  const signature = JSON.stringify([scope.key, ready, orderId]);
  const current = useRef<{ signature: string; epoch: string; mounted: boolean } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID(), mounted: true };
  const token = current.current;
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; }; }, [token]);
  return { owner, ready, token, isCurrent: () => ready && current.current === token && token.mounted };
}
export function usePdvReturnPending(orderId: string, enabled = true) {
  const identity = useReturnIdentity(orderId, enabled); const key = identity.ready ? pdvReturnIntentKey(identity.owner) : '';
  const raw = useSyncExternalStore(callback => {
    const changed = () => callback(); const storageChanged = (event: StorageEvent) => { if (event.key === key || event.key === null) callback(); };
    window.addEventListener(RETURN_INTENT_EVENT, changed); window.addEventListener('storage', storageChanged);
    return () => { window.removeEventListener(RETURN_INTENT_EVENT, changed); window.removeEventListener('storage', storageChanged); };
  }, () => identity.ready ? rawPdvReturnIntent(identity.owner) : null, () => null);
  const parsed = useMemo(() => {
    if (!raw || !identity.ready) return { intent: null, error: null };
    try { return { intent: parsePdvReturnIntent(raw, identity.owner), error: null }; }
    catch { return { intent: null, error: RETURN_INTENT_STORAGE_ERROR }; }
  }, [raw, identity.ready, identity.owner]);
  const visible = identity.isCurrent();
  return { ...identity, intent: visible ? parsed.intent : null, storageError: visible ? parsed.error : null,
    pending: visible && Boolean(parsed.intent && ['submitted', 'unknown'].includes(parsed.intent.state)) };
}
function confirmedResult(value: unknown, intent: PdvReturnIntent): PdvReturnMutationResult {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const amount = row.commercial_total;
  if (row.ok !== true || typeof row.return_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.return_id) || row.order_id !== intent.owner.orderId || typeof row.idempotent !== 'boolean'
    || typeof amount !== 'number' || !Number.isFinite(amount) || Math.round(Math.abs(amount) * 100) / 100 !== Math.abs(amount) || Math.round(Math.abs(amount) * 100) !== Math.round(intent.summary.total * 100)) throw new PdvReturnIntentError('A confirmação recebida não pôde ser conferida. Tente confirmar a mesma solicitação.', 'unknown');
  return { id: row.return_id, orderId: intent.owner.orderId, commercialTotal: Math.abs(amount), idempotent: row.idempotent };
}
export function usePdvDurableReturn(orderId: string, enabled = true) {
  const state = usePdvReturnPending(orderId, enabled), client = useQueryClient();
  const [activity, setActivity] = useState<{ epoch: string; busy: boolean }>({ epoch: '', busy: false });
  const running = useRef<string | null>(null);
  const starting = useRef<string | null>(null);
  const assertCurrent = () => { if (!state.isCurrent()) throw new PdvReturnIntentError(RETURN_INTENT_CONTEXT_MESSAGE, 'context'); };
  async function execute(intent: PdvReturnIntent, retry: boolean) {
    assertCurrent(); const operation = `${state.token.epoch}:${intent.args.p_idempotency_key}`;
    if (running.current === operation) return undefined;
    running.current = operation; setActivity({ epoch: state.token.epoch, busy: true });
    const uncertainBefore = retry || intent.state === 'unknown'; let posted = false;
    try {
      const current = readPdvReturnIntent(state.owner);
      if (!current || current.args.p_idempotency_key !== intent.args.p_idempotency_key || JSON.stringify(current.args) !== JSON.stringify(intent.args)) throw new PdvReturnIntentError(RETURN_INTENT_STORAGE_ERROR, 'storage');
      if (retry) updatePdvReturnIntent(intent, 'unknown');
      assertCurrent(); posted = true;
      const response = await rpc(intent.rpc, structuredClone(intent.args));
      if (response.error) throw new ReturnRpcError(response.error);
      const result = confirmedResult(response.data, intent);
      // Confirmação pode ser reconciliada no owner original após desmontagem;
      // não publica toast, estado ou callback em contexto novo/ABA.
      try { updatePdvReturnIntent(intent, 'confirmed', result); clearPdvReturnIntent(intent); } catch { /* Replay da mesma chave continuará seguro se o armazenamento estiver indisponível. */ }
      void invalidateReturnConsumers(client, intent.owner.orderId).catch(() => undefined);
      return state.isCurrent() ? { result, summary: intent.summary } : undefined;
    } catch (error) {
      const definite = posted && !uncertainBefore && error instanceof ReturnRpcError && /^(42501|22023|23502|23503|23514)$/.test(error.raw.code ?? '');
      if (posted) {
        try { updatePdvReturnIntent(intent, definite ? 'failed' : 'unknown'); } catch { /* Mantém o registro submetido anterior; nunca libera outra intenção incerta. */ }
        if (!definite) void invalidateReturnConsumers(client, intent.owner.orderId).catch(() => undefined);
      }
      if (!state.isCurrent()) return undefined;
      if (!posted && error instanceof PdvReturnIntentError) throw error;
      if (definite) throw new PdvReturnIntentError((error as ReturnRpcError).message, 'business');
      throw new PdvReturnIntentError(error instanceof ReturnRpcError ? `${error.message} ${RETURN_INTENT_PENDING_MESSAGE}` : RETURN_INTENT_PENDING_MESSAGE, 'unknown');
    } finally {
      if (running.current === operation) running.current = null;
      if (state.isCurrent()) setActivity({ epoch: state.token.epoch, busy: false });
    }
  }
  async function submit(input: Omit<PdvCreateReturnInput, 'attemptId'>, summary: PdvReturnIntent['summary']) {
    assertCurrent();
    if (starting.current === state.token.epoch) return undefined;
    starting.current = state.token.epoch; setActivity({ epoch: state.token.epoch, busy: true });
    try {
      const args = buildPdvReturnRpcArgs({ ...input, attemptId: crypto.randomUUID() });
      const intent = await preparePdvReturnIntent(state.owner, args, summary, assertCurrent);
      return await execute(intent, false);
    } finally {
      if (starting.current === state.token.epoch) starting.current = null;
      if (state.isCurrent()) setActivity({ epoch: state.token.epoch, busy: false });
    }
  }
  async function retry() {
    assertCurrent(); const intent = readPdvReturnIntent(state.owner);
    if (!intent || !['submitted', 'unknown'].includes(intent.state)) throw new PdvReturnIntentError('Não há tentativa pendente para confirmar neste pedido.', 'context');
    return execute(intent, true);
  }
  return { ...state, busy: activity.epoch === state.token.epoch && activity.busy, submit, retry };
}

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import type { PdvCashV2Session, PdvCashV2Terminal } from '@/hooks/usePdvCashSessionsV2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNAVAILABLE = 'Não foi possível conferir o caixa de destino deste pedido.';
type TargetOrder = { id: string; companyId: string; terminalId: string; cashSessionId: string | null };
export type PdvReceivingTarget = { status: 'none' | 'pending' | 'unavailable'; sessionId: null } | { status: 'ready'; sessionId: string };

export function projectPdvReceivingOrder(value: unknown, orderId: string, companyId: string): TargetOrder | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(UNAVAILABLE);
  const row = value as Record<string, unknown>;
  const nullableId = (id: unknown) => id === null || typeof id === 'string' && UUID.test(id);
  if (row.id !== orderId || row.company_id !== companyId || row.contract_version !== 2 || row.operation_mode_snapshot !== 'counter'
    || row.status !== 'aguardando_pagamento' || !nullableId(row.target_terminal_id) || !nullableId(row.terminal_id) || !nullableId(row.cash_session_id)) return null;
  if (row.target_terminal_id && row.terminal_id && row.target_terminal_id !== row.terminal_id) return null;
  const terminalId = row.target_terminal_id ?? row.terminal_id;
  if (typeof terminalId !== 'string') return null;
  return { id: orderId, companyId, terminalId, cashSessionId: row.cash_session_id as string | null };
}

/** O endereço identifica o pedido; somente RLS e as aberturas autorizadas determinam o destino. */
export function usePdvReceivingTarget({ orderId, enabled, cashReady, sessions, terminals }: {
  orderId: string | null; enabled: boolean; cashReady: boolean;
  sessions: readonly PdvCashV2Session[]; terminals: readonly PdvCashV2Terminal[];
}) {
  const scope = usePdvAuthorizedQueryScope();
  const { profile } = useAuth();
  const companyId = scope.ready ? profile?.company_id ?? null : null;
  const validId = typeof orderId === 'string' && UUID.test(orderId);
  const ready = enabled && scope.ready && Boolean(companyId) && validId;
  const signature = JSON.stringify([scope.key, orderId, ready]);
  const current = useRef<{ signature: string; epoch: string; mounted: boolean } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID(), mounted: true };
  const token = current.current;
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; }; }, [token]);
  const isCurrent = () => ready && current.current === token && token.mounted;
  const query = useQuery({
    queryKey: ['pdv-orders', 'receiving-target', ...scope.key, orderId, token.epoch],
    enabled: ready, staleTime: 0, gcTime: 0, placeholderData: () => undefined, retry: false,
    queryFn: async ({ signal }) => {
      if (!ready || !companyId || !orderId) throw new Error(UNAVAILABLE);
      const { data, error } = await supabase.from('pdv_orders')
        .select('id,company_id,target_terminal_id,terminal_id,cash_session_id,status,contract_version,operation_mode_snapshot')
        .eq('company_id', companyId!).eq('id', orderId!).abortSignal(signal).maybeSingle();
      if (!isCurrent() || signal.aborted) throw new Error('O contexto do PDV mudou.');
      if (error) throw new Error(UNAVAILABLE);
      return projectPdvReceivingOrder(data, orderId!, companyId!);
    },
  });
  let target: PdvReceivingTarget = { status: 'none', sessionId: null };
  if (orderId !== null) {
    target = { status: 'pending', sessionId: null };
    if (!validId || !enabled) target = { status: 'unavailable', sessionId: null };
    else if (scope.ready && cashReady && isCurrent() && !query.isPending) {
      const order = !query.isError ? query.data : null;
      const terminal = order && terminals.find(item => item.id === order.terminalId);
      const matching = order && terminal ? sessions.filter(session => session.companyId === companyId && session.status === 'aberta'
        && session.contractVersion === 2 && session.terminalId === terminal.id
        && (!order.cashSessionId || session.id === order.cashSessionId)) : [];
      target = matching.length === 1 ? { status: 'ready', sessionId: matching[0].id } : { status: 'unavailable', sessionId: null };
    }
  }
  return { ...target, refetch: query.refetch };
}

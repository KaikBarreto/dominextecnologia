import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  createDomiLinkIdempotencyKey, detectDomiLink, DomiLinkError, loadDomiLinkProfile,
  pairDomiLink, queueDomiLinkTestPrint, readDomiLinkBarcode, readDomiLinkScale,
  revokeDomiLink, waitForDomiLinkPrintJob,
} from '@/lib/domilink/client';
import {
  clearDomiLinkSession, clearDomiLinkSessionOutsideScope, getDomiLinkSessionRevision,
  readDomiLinkEnabled, readDomiLinkSession, writeDomiLinkEnabled, writeDomiLinkSession,
  type DomiLinkSessionScope,
} from '@/lib/domilink/storage';
import type { DomiLinkDevice, DomiLinkProfile, DomiLinkScaleReading } from '@/lib/domilink/types';

export type DomiLinkStatus = 'disabled' | 'checking' | 'offline' | 'pairing' | 'connected' | 'error';
interface State {
  contextKey: string;
  status: DomiLinkStatus;
  profile: DomiLinkProfile | null;
  error: string | null;
  busyAction: string | null;
  lastScaleReading: DomiLinkScaleReading | null;
  lastBarcode: string | null;
}
function emptyState(contextKey: string, status: DomiLinkStatus): State {
  return { contextKey, status, profile: null, error: null, busyAction: null, lastScaleReading: null, lastBarcode: null };
}
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a ação no DomiLink.';
}
function contextChanged() { return new Error('A conta ou empresa mudou. Abra o DomiLink novamente.'); }
function revokeQuietly(token: string | null) {
  if (token) void revokeDomiLink(token).catch(() => undefined);
}

export function useDomiLink() {
  const auth = useAuth();
  const [enabled, setEnabledState] = useState(readDomiLinkEnabled);
  const userId = auth.user?.id;
  const profileUserId = auth.profile?.user_id;
  const companyId = auth.profile?.company_id;
  const scope = useMemo<DomiLinkSessionScope | null>(() => !auth.loading && !auth.profileLoading && userId && profileUserId === userId && companyId
    ? { userId, companyId } : null, [auth.loading, auth.profileLoading, userId, profileUserId, companyId]);
  const scopeKey = scope ? JSON.stringify([scope.userId, scope.companyId]) : '';
  const contextKey = enabled ? scopeKey : '';
  const current = useRef({ contextKey, generation: 0, mounted: true });
  if (current.current.contextKey !== contextKey) {
    current.current = { ...current.current, contextKey, generation: current.current.generation + 1 };
  }
  const [state, setState] = useState(() => emptyState(contextKey, contextKey ? 'checking' : 'disabled'));
  const busyId = useRef(0);
  const connectId = useRef(0);

  useEffect(() => {
    current.current.mounted = true;
    return () => {
      current.current.mounted = false;
      current.current.generation += 1;
    };
  }, []);

  const capture = useCallback(() => {
    if (!contextKey || !scope || current.current.contextKey !== contextKey || !current.current.mounted) throw contextChanged();
    const generation = current.current.generation;
    const revision = getDomiLinkSessionRevision();
    const valid = () => current.current.mounted && current.current.contextKey === contextKey && current.current.generation === generation && getDomiLinkSessionRevision() === revision;
    return { scope, valid, assert: () => { if (!valid()) throw contextChanged(); } };
  }, [contextKey, scope]);

  const connect = useCallback(async () => {
    if (!contextKey) return;
    const operation = capture();
    const id = ++connectId.current;
    const valid = () => operation.valid() && connectId.current === id;
    setState((s) => ({ ...s, contextKey, status: 'checking', error: null }));
    try {
      const health = await detectDomiLink();
      if (!valid()) return;
      const token = readDomiLinkSession(operation.scope);
      if (!token) {
        setState((s) => ({ ...s, profile: null, status: 'pairing' }));
        return;
      }
      try {
        const profile = await loadDomiLinkProfile(token, health);
        if (valid()) setState((s) => ({ ...s, profile, status: 'connected' }));
      } catch (error) {
        if (!valid()) return;
        if (error instanceof DomiLinkError && error.status === 401) {
          clearDomiLinkSession();
          setState((s) => ({ ...s, profile: null, status: 'pairing' }));
          return;
        }
        throw error;
      }
    } catch (error) {
      if (valid()) setState((s) => ({ ...s, profile: null, error: messageOf(error), status: error instanceof DomiLinkError && error.code === 'offline' ? 'offline' : 'error' }));
    }
  }, [capture, contextKey]);

  useEffect(() => {
    // Durante a hidratação apenas mascaramos os dados; remount/StrictMode não revoga pareamento.
    if (!auth.loading && !auth.profileLoading) revokeQuietly(clearDomiLinkSessionOutsideScope(scope));
    setState(emptyState(contextKey, contextKey ? 'checking' : 'disabled'));
    if (contextKey) void connect();
  }, [connect, contextKey, scope, auth.loading, auth.profileLoading]);

  const setEnabled = useCallback((next: boolean) => {
    writeDomiLinkEnabled(next);
    if (!next) {
      current.current.generation += 1;
      current.current.contextKey = '';
      revokeQuietly(clearDomiLinkSession());
      setState(emptyState('', 'disabled'));
    }
    setEnabledState(next);
  }, []);

  const pair = useCallback(async (code: string) => {
    const operation = capture();
    const id = ++busyId.current;
    setState((s) => ({ ...s, busyAction: 'pair', error: null }));
    try {
      const result = await pairDomiLink(code);
      if (!operation.valid()) {
        revokeQuietly(result.token);
        throw contextChanged();
      }
      writeDomiLinkSession(result.token, operation.scope);
      await connect();
      operation.assert();
    } catch (error) {
      if (operation.valid()) setState((s) => ({ ...s, error: messageOf(error), status: 'pairing' }));
      throw operation.valid() ? error : contextChanged();
    } finally {
      if (operation.valid() && busyId.current === id) setState((s) => ({ ...s, busyAction: null }));
    }
  }, [capture, connect]);

  const disconnect = useCallback(async () => {
    capture();
    // Descartar e invalidar antes da rede: nenhuma resposta pendente reabre a sessão.
    const token = clearDomiLinkSession();
    current.current.generation += 1;
    setState(emptyState(contextKey, 'pairing'));
    try { if (token) await revokeDomiLink(token); } catch { /* sessão local já descartada */ }
  }, [capture, contextKey]);

  const withSession = useCallback(async <T,>(action: string, run: (token: string, assertCurrent: () => void) => Promise<T>, apply?: (s: State, result: T) => State) => {
    const operation = capture();
    const token = readDomiLinkSession(operation.scope);
    if (!token) throw new Error('Faça o pareamento antes de usar o equipamento.');
    const id = ++busyId.current;
    setState((s) => ({ ...s, busyAction: action }));
    try {
      const result = await run(token, operation.assert);
      operation.assert();
      if (apply) setState((s) => apply(s, result));
      return result;
    } catch (error) {
      throw operation.valid() ? error : contextChanged();
    } finally {
      if (operation.valid() && busyId.current === id) setState((s) => ({ ...s, busyAction: null }));
    }
  }, [capture]);

  const testPrint = useCallback((device: DomiLinkDevice) => withSession(`print:${device.id}`, async (token, assertCurrent) => {
    const queued = await queueDomiLinkTestPrint(token, device, createDomiLinkIdempotencyKey());
    assertCurrent();
    return waitForDomiLinkPrintJob(token, queued.job, assertCurrent);
  }), [withSession]);
  const readScale = useCallback((deviceId: string) => withSession(`scale:${deviceId}`, (token) => readDomiLinkScale(token, deviceId), (s, lastScaleReading) => ({ ...s, lastScaleReading })), [withSession]);
  const readBarcode = useCallback((deviceId: string) => withSession(`barcode:${deviceId}`, (token) => readDomiLinkBarcode(token, deviceId), (s, lastBarcode) => ({ ...s, lastBarcode })), [withSession]);

  // Mascaramento síncrono: nem um render do contexto novo recebe dados do anterior.
  const visible = state.contextKey === contextKey && contextKey ? state : emptyState(contextKey, contextKey ? 'checking' : 'disabled');
  const profile = visible.profile;
  const devices = useMemo(() => ({
    printers: profile?.devices.filter((device) => device.kind === 'printer') ?? [],
    scales: profile?.devices.filter((device) => device.kind === 'scale') ?? [],
    barcodes: profile?.devices.filter((device) => device.kind === 'barcode') ?? [],
  }), [profile]);
  return { enabled, setEnabled, status: visible.status, profile, devices, error: visible.error, busyAction: visible.busyAction,
    lastScaleReading: visible.lastScaleReading, lastBarcode: visible.lastBarcode, retry: connect, pair, disconnect, testPrint, readScale, readBarcode };
}

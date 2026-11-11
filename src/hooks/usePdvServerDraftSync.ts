import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface DraftShape {
  id: string;
  sequence: number;
  updatedAt: string;
}

interface WorkspaceShape<TDraft extends DraftShape> {
  drafts: TDraft[];
  activeId: string;
  nextSequence: number;
}

export type PdvDraftSyncIssue = 'conflict' | 'unavailable' | null;

interface UsePdvServerDraftSyncOptions<
  TDraft extends DraftShape,
  TWorkspace extends WorkspaceShape<TDraft>,
> {
  storageKey: string | null;
  hydratedStorageKey: string | null;
  localCacheFound: boolean;
  draftType: 'sale' | 'purchase';
  context: { cashSessionId: string | null; terminalId: string | null; stockId: string } | null;
  workspace: TWorkspace;
  setWorkspace: Dispatch<SetStateAction<TWorkspace>>;
  parseWorkspace: (raw: string) => TWorkspace;
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

interface PdvServerDraftRow {
  id: string;
  revision: number | string;
  payload: Json;
  deleted_at?: string | null;
}

interface PdvServerDraftMutationResult {
  revision?: number | string;
  deleted_at?: string | null;
}

interface PdvDraftRpcData {
  pdv_list_order_drafts_v2: PdvServerDraftRow[];
  pdv_save_order_draft_v2: PdvServerDraftMutationResult;
  pdv_delete_order_draft_v2: PdvServerDraftMutationResult;
}

type PdvDraftRpcName = keyof PdvDraftRpcData;
type PdvDraftRpcError = { code?: string; message?: string; details?: string };
type PdvDraftRpcCaller = <TName extends PdvDraftRpcName>(
  name: TName,
  args: Record<string, unknown>,
) => PromiseLike<{ data: PdvDraftRpcData[TName] | null; error: PdvDraftRpcError | null }>;

const draftRpc = supabase.rpc.bind(supabase) as unknown as PdvDraftRpcCaller;

function isServerDraftRow(value: unknown): value is PdvServerDraftRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && Number.isFinite(Number(row.revision))
    && row.payload !== null
    && typeof row.payload === 'object';
}

function updatedAtMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Espelha rascunhos locais no servidor sem transformar a rede em requisito
 * para operar o balcão. A fila é serial, endereçada por draftId e usa CAS:
 * resposta atrasada nunca é aplicada ao rascunho ativo por engano, e duas
 * abas/dispositivos nunca se sobrescrevem silenciosamente.
 */
export function usePdvServerDraftSync<
  TDraft extends DraftShape,
  TWorkspace extends WorkspaceShape<TDraft>,
>({
  storageKey,
  hydratedStorageKey,
  localCacheFound,
  draftType,
  context,
  workspace,
  setWorkspace,
  parseWorkspace,
}: UsePdvServerDraftSyncOptions<TDraft, TWorkspace>) {
  const cashSessionId = context?.cashSessionId ?? null;
  const terminalId = context?.terminalId ?? null;
  const stockId = context?.stockId ?? null;
  const revisionsRef = useRef(new Map<string, number>());
  const serverPayloadRef = useRef(new Map<string, string>());
  const pendingSaveRef = useRef(new Map<string, {
    serialized: string;
    requestId: string;
    expectedRevision: number;
  }>());
  const pendingDeleteRef = useRef(new Map<string, {
    requestId: string;
    expectedRevision: number;
  }>());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const currentStorageKeyRef = useRef(storageKey);
  const workspaceRef = useRef(workspace);
  const tombstonesRef = useRef(new Set<string>());
  currentStorageKeyRef.current = storageKey;
  workspaceRef.current = workspace;

  const [serverReadyKey, setServerReadyKey] = useState<string | null>(null);
  const [syncIssue, setSyncIssue] = useState<PdvDraftSyncIssue>(null);

  const persistTombstones = useCallback((key: string, ids: Set<string>) => {
    try {
      if (ids.size === 0) window.localStorage.removeItem(`${key}:server-deletions`);
      else window.localStorage.setItem(`${key}:server-deletions`, JSON.stringify([...ids]));
    } catch {
      // Best-effort: a fila em memória ainda tenta concluir a exclusão.
    }
  }, []);

  const markDeleted = useCallback((draftId: string) => {
    const key = currentStorageKeyRef.current;
    if (!key) return;
    tombstonesRef.current.add(draftId);
    persistTombstones(key, tombstonesRef.current);
  }, [persistTombstones]);

  useEffect(() => {
    revisionsRef.current.clear();
    serverPayloadRef.current.clear();
    pendingSaveRef.current.clear();
    pendingDeleteRef.current.clear();
    tombstonesRef.current.clear();
    setServerReadyKey(null);
    setSyncIssue(null);
    if (!storageKey || hydratedStorageKey !== storageKey) return;

    let cancelled = false;
    const requestKey = storageKey;
    try {
      const rawTombstones = window.localStorage.getItem(`${requestKey}:server-deletions`);
      const parsed = rawTombstones ? JSON.parse(rawTombstones) : [];
      if (Array.isArray(parsed)) {
        tombstonesRef.current = new Set(parsed.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      tombstonesRef.current.clear();
    }

    async function hydrateFromServer() {
      if (!stockId) return;
      const { data, error } = await draftRpc('pdv_list_order_drafts_v2', {
        p_draft_type: draftType,
        p_cash_session_id: cashSessionId,
        p_terminal_id: terminalId,
        p_stock_id: stockId,
        p_include_deleted: false,
      });
      if (cancelled || currentStorageKeyRef.current !== requestKey) return;
      if (error) {
        setSyncIssue('unavailable');
        setServerReadyKey(requestKey);
        return;
      }

      const rows = (data ?? []).filter(isServerDraftRow);
      const serverIds = new Set(rows.map((row) => row.id));
      for (const draftId of [...tombstonesRef.current]) {
        if (!serverIds.has(draftId)) tombstonesRef.current.delete(draftId);
      }
      persistTombstones(requestKey, tombstonesRef.current);
      const visibleRows = rows.filter((row) => !tombstonesRef.current.has(row.id));
      const current = workspaceRef.current;
      const remoteWorkspace = parseWorkspace(JSON.stringify({
        drafts: visibleRows.map((row) => row.payload),
        activeId: current.activeId,
        nextSequence: current.nextSequence,
      }));

      for (const row of rows) {
        revisionsRef.current.set(row.id, Number(row.revision));
      }
      for (const draft of remoteWorkspace.drafts) {
        serverPayloadRef.current.set(draft.id, JSON.stringify(draft));
      }

      setWorkspace((local) => {
        if (visibleRows.length === 0) return local;
        if (!localCacheFound) return remoteWorkspace;

        const merged = new Map<string, TDraft>();
        for (const draft of remoteWorkspace.drafts) merged.set(draft.id, draft);
        for (const draft of local.drafts) {
          const remote = merged.get(draft.id);
          if (!remote || updatedAtMs(draft.updatedAt) >= updatedAtMs(remote.updatedAt)) {
            merged.set(draft.id, draft);
          }
        }
        const drafts = [...merged.values()]
          .sort((a, b) => a.sequence - b.sequence)
          .slice(0, 20);
        const activeId = drafts.some((draft) => draft.id === local.activeId)
          ? local.activeId
          : drafts[0].id;
        const maxSequence = drafts.reduce((max, draft) => Math.max(max, draft.sequence), 0);
        return {
          ...local,
          drafts,
          activeId,
          nextSequence: Math.max(local.nextSequence, remoteWorkspace.nextSequence, maxSequence + 1),
        };
      });
      setServerReadyKey(requestKey);
    }

    void hydrateFromServer();
    return () => {
      cancelled = true;
    };
  }, [cashSessionId, draftType, hydratedStorageKey, localCacheFound, parseWorkspace, persistTombstones, setWorkspace, stockId, storageKey, terminalId]);

  useEffect(() => {
    if (!storageKey || serverReadyKey !== storageKey || hydratedStorageKey !== storageKey) return;
    const requestKey = storageKey;
    const snapshot = workspace.drafts.map((draft) => JSON.parse(JSON.stringify(draft)) as TDraft);
    const timer = window.setTimeout(() => {
      queueRef.current = queueRef.current.then(async () => {
        if (currentStorageKeyRef.current !== requestKey) return;
        const activeIds = new Set(snapshot.map((draft) => draft.id));
        let issueDuringRun: PdvDraftSyncIssue = null;

        for (const draft of snapshot) {
          const serialized = JSON.stringify(draft);
          if (serverPayloadRef.current.get(draft.id) === serialized) continue;
          const previousPending = pendingSaveRef.current.get(draft.id);
          const pending = previousPending?.serialized === serialized
            ? previousPending
            : {
                serialized,
                requestId: crypto.randomUUID(),
                expectedRevision: revisionsRef.current.get(draft.id) ?? 0,
              };
          pendingSaveRef.current.set(draft.id, pending);
          if (!stockId) return;
          const { data, error } = await draftRpc('pdv_save_order_draft_v2', {
            p_draft_id: draft.id,
            p_draft_type: draftType,
            p_payload: asJson(draft),
            p_expected_revision: pending.expectedRevision,
            p_client_request_id: pending.requestId,
            p_cash_session_id: cashSessionId,
            p_terminal_id: terminalId,
            p_stock_id: stockId,
          });
          if (currentStorageKeyRef.current !== requestKey) return;
          if (error) {
            const issue = error.code === '40001' ? 'conflict' : 'unavailable';
            if (issue === 'conflict' || issueDuringRun == null) issueDuringRun = issue;
            continue;
          }
          const revision = Number(data?.revision);
          if (!Number.isFinite(revision)) {
            issueDuringRun = 'unavailable';
            continue;
          }
          revisionsRef.current.set(draft.id, revision);
          serverPayloadRef.current.set(draft.id, serialized);
          pendingSaveRef.current.delete(draft.id);
        }

        for (const [draftId, revision] of [...revisionsRef.current]) {
          if (activeIds.has(draftId)) continue;
          const previousPending = pendingDeleteRef.current.get(draftId);
          const pending = previousPending?.expectedRevision === revision
            ? previousPending
            : { requestId: crypto.randomUUID(), expectedRevision: revision };
          pendingDeleteRef.current.set(draftId, pending);
          if (!stockId) return;
          const { data, error } = await draftRpc('pdv_delete_order_draft_v2', {
            p_draft_id: draftId,
            p_expected_revision: pending.expectedRevision,
            p_client_request_id: pending.requestId,
            p_draft_type: draftType,
            p_cash_session_id: cashSessionId,
            p_terminal_id: terminalId,
            p_stock_id: stockId,
          });
          if (currentStorageKeyRef.current !== requestKey) return;
          if (error) {
            const issue = error.code === '40001' ? 'conflict' : 'unavailable';
            if (issue === 'conflict' || issueDuringRun == null) issueDuringRun = issue;
            continue;
          }
          if (data?.deleted_at) {
            revisionsRef.current.delete(draftId);
            serverPayloadRef.current.delete(draftId);
            pendingSaveRef.current.delete(draftId);
            pendingDeleteRef.current.delete(draftId);
            tombstonesRef.current.delete(draftId);
            persistTombstones(requestKey, tombstonesRef.current);
          }
        }
        setSyncIssue(issueDuringRun);
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [cashSessionId, draftType, hydratedStorageKey, persistTombstones, serverReadyKey, stockId, storageKey, terminalId, workspace]);

  return { syncIssue, serverReady: serverReadyKey === storageKey, markDeleted };
}

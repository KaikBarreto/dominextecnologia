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
export type PdvDraftPersistResult = 'saved' | 'conflict' | 'unavailable' | 'scope_changed' | 'not_found';
export type PdvDraftResolutionResult = 'resolved' | 'refresh_required' | 'review_order' | 'unavailable' | 'not_found';
export interface PdvDraftResolutionMetadata { id: string; choice: 'local' | 'server'; localCopyId: string | null }
export interface PdvDraftConflict<TDraft> {
  id: string;
  local: TDraft | null;
  server: TDraft | null;
  alternatives: TDraft[];
  requiresOrderReview: boolean;
  orderId: string | null;
}

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
  createConflictCopy: (draft: TDraft, id: string, sequence: number) => TDraft;
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key]);
  return sorted;
}

/**
 * Identidade de conteúdo de um rascunho. O mesmo atendimento chega em três
 * ordens de chave: como nasceu na memória, como o parser o reconstrói a
 * partir do cache e como o `jsonb` do servidor o devolve (chaves reordenadas).
 * Comparar o texto cru tratava essas três formas como versões diferentes.
 */
export function pdvDraftContentKey(value: unknown): string {
  return JSON.stringify(sortKeys(asJson(value)));
}

/** Metadado gravado por versões anteriores usava o texto cru do rascunho. */
function storedContentKey(serialized: string): string {
  try { return pdvDraftContentKey(JSON.parse(serialized)); }
  catch { return serialized; }
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

const callDraftRpc = supabase.rpc.bind(supabase) as unknown as PdvDraftRpcCaller;
async function draftRpc<TName extends PdvDraftRpcName>(name: TName, args: Record<string, unknown>) {
  try { return await callDraftRpc(name, args); }
  catch { return { data: null, error: { code: 'NETWORK_UNAVAILABLE' } }; }
}

function isServerDraftRow(value: unknown): value is PdvServerDraftRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && Number.isFinite(Number(row.revision))
    && row.payload !== null
    && typeof row.payload === 'object';
}

interface ConfirmedDraftBase { revision: number; serialized: string }
interface DraftHydration {
  key: string;
  generation: number;
  ready: boolean;
  start: () => Promise<boolean>;
  finish: (ready: boolean) => void;
}

function existingOrderId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('attempt' in value)) return null;
  const attempt = value.attempt;
  return attempt && typeof attempt === 'object' && 'orderId' in attempt && typeof attempt.orderId === 'string'
    ? attempt.orderId : null;
}

function hasDurableFinancialIdentity(value: unknown): boolean {
  if (!value || typeof value !== 'object' || !('attempt' in value)) return false;
  const attempt = value.attempt;
  return Boolean(attempt && typeof attempt === 'object' && 'directSaleVersion' in attempt && attempt.directSaleVersion === 3);
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
  createConflictCopy,
}: UsePdvServerDraftSyncOptions<TDraft, TWorkspace>) {
  const cashSessionId = context?.cashSessionId ?? null;
  const terminalId = context?.terminalId ?? null;
  const stockId = context?.stockId ?? null;
  const revisionsRef = useRef(new Map<string, number>());
  const serverPayloadRef = useRef(new Map<string, string>());
  // A revisão pertence ao conteúdo confirmado, nunca ao relógio do dispositivo.
  const basesRef = useRef(new Map<string, ConfirmedDraftBase>());
  const conflictsRef = useRef(new Map<string, Set<string>>());
  const blockedRef = useRef(new Set<string>());
  const generationRef = useRef(0);
  const scopeRef = useRef<string | null>(null);
  const resolutionRef = useRef<{ key: string; id: string; promise: Promise<PdvDraftResolutionResult> } | null>(null);
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
  const [recoveryPersistenceIssue, setRecoveryPersistenceIssue] = useState(false);
  const [resolvingDraftId, setResolvingDraftId] = useState<string | null>(null);
  const [lastResolution, setLastResolution] = useState<PdvDraftResolutionMetadata | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const hydrationRef = useRef<DraftHydration | null>(null);
  const initialDraftsRef = useRef<Map<string, string> | null>(null);
  const [hydrationCompletion, setHydrationCompletion] = useState<{ hydration: DraftHydration; ready: boolean } | null>(null);
  const [, refreshConflicts] = useState(0);

  const persistBases = useCallback((key: string) => {
    try {
      window.localStorage.setItem(`${key}:server-bases`, JSON.stringify([...basesRef.current]));
    } catch { /* Sem base durável, a próxima abertura falha protegida. */ }
  }, []);

  const persistConflicts = useCallback((key: string) => {
    try {
      window.localStorage.setItem(`${key}:server-conflicts`, JSON.stringify({
        blocked: [...blockedRef.current],
        versions: [...conflictsRef.current].map(([draftId, copies]) => [draftId, [...copies]]),
      }));
      setRecoveryPersistenceIssue(false);
    } catch {
      setRecoveryPersistenceIssue(true);
      // A edição atual e a alternativa continuam preservadas em memória.
    }
  }, []);

  const preserveConflict = useCallback((key: string, id: string, serialized: string) => {
    const wasBlocked = blockedRef.current.has(id);
    blockedRef.current.add(id);
    const versions = conflictsRef.current.get(id) ?? new Set<string>();
    const changed = !versions.has(serialized) || !wasBlocked;
    versions.add(serialized);
    conflictsRef.current.set(id, versions);
    if (changed) refreshConflicts(version => version + 1);
    persistConflicts(key);
  }, [persistConflicts]);

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
    const generation = ++generationRef.current;
    const sameScope = scopeRef.current === storageKey;
    scopeRef.current = storageKey;
    revisionsRef.current.clear();
    serverPayloadRef.current.clear();
    if (!sameScope) {
      initialDraftsRef.current = null;
      basesRef.current.clear();
      conflictsRef.current.clear();
      blockedRef.current.clear();
      tombstonesRef.current.clear();
    }
    pendingSaveRef.current.clear();
    pendingDeleteRef.current.clear();
    setServerReadyKey(null);
    setSyncIssue(null);
    setRecoveryPersistenceIssue(false);
    setResolvingDraftId(null);
    setLastResolution(null);
    resolutionRef.current = null;
    if (!storageKey || hydratedStorageKey !== storageKey) return;

    let cancelled = false;
    const requestKey = storageKey;
    // O placeholder sem cache só pode ceder enquanto continuar intocado
    // desde a primeira leitura, inclusive quando essa leitura for repetida.
    initialDraftsRef.current ??= new Map(workspaceRef.current.drafts.map(draft => [draft.id, pdvDraftContentKey(draft)]));
    const initialDrafts = initialDraftsRef.current;
    try {
      const bases: unknown = JSON.parse(window.localStorage.getItem(`${requestKey}:server-bases`) ?? '[]');
      if (Array.isArray(bases)) for (const entry of bases) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[1]
          && Number.isFinite(entry[1].revision) && typeof entry[1].serialized === 'string') {
          if (!basesRef.current.has(entry[0])) basesRef.current.set(entry[0], { revision: entry[1].revision, serialized: storedContentKey(entry[1].serialized) });
        }
      }
      const rawConflicts: unknown = JSON.parse(window.localStorage.getItem(`${requestKey}:server-conflicts`) ?? '[]');
      const envelope = rawConflicts && typeof rawConflicts === 'object' && !Array.isArray(rawConflicts)
        ? rawConflicts as { versions?: unknown; blocked?: unknown } : null;
      const conflicts = envelope?.versions ?? rawConflicts;
      if (Array.isArray(conflicts)) for (const entry of conflicts) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && Array.isArray(entry[1])) {
          const copies = conflictsRef.current.get(entry[0]) ?? new Set<string>();
          for (const copy of entry[1]) if (typeof copy === 'string') copies.add(storedContentKey(copy));
          conflictsRef.current.set(entry[0], copies);
          if (!envelope) blockedRef.current.add(entry[0]);
        }
      }
      if (Array.isArray(envelope?.blocked)) for (const id of envelope.blocked) {
        if (typeof id === 'string') blockedRef.current.add(id);
      }
    } catch { /* Metadado inválido não autoriza sobrescrever nenhuma versão. */ }
    try {
      const rawTombstones = window.localStorage.getItem(`${requestKey}:server-deletions`);
      const parsed = rawTombstones ? JSON.parse(rawTombstones) : [];
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === 'string') tombstonesRef.current.add(id);
      }
    } catch {
      // A intenção em memória continua válida mesmo sem acesso ao storage.
    }

    async function hydrateFromServer(): Promise<boolean> {
      if (!stockId) return false;
      // A restauração não pode apagar atendimento digitado enquanto a rede responde.
      // Comparamos o conteúdo enviado à leitura, sem depender do relógio do dispositivo.
      const requestDrafts = new Map(workspaceRef.current.drafts.map(draft => [draft.id, pdvDraftContentKey(draft)]));
      const { data, error } = await draftRpc('pdv_list_order_drafts_v2', {
        p_draft_type: draftType,
        p_cash_session_id: cashSessionId,
        p_terminal_id: terminalId,
        p_stock_id: stockId,
        p_include_deleted: false,
      });
      if (cancelled || generationRef.current !== generation || currentStorageKeyRef.current !== requestKey) return false;
      if (error) {
        setSyncIssue('unavailable');
        // Sem leitura/base não há autorização para inferir saves ou exclusões.
        return false;
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
        drafts: rows.map((row) => row.payload),
        activeId: current.activeId,
        nextSequence: current.nextSequence,
      }));
      // Parsers produzem um placeholder para um workspace vazio; ele nunca é
      // uma linha remota e não pode virar outra aba nem uma base confirmada.
      const remoteDrafts = remoteWorkspace.drafts.filter(draft => serverIds.has(draft.id));

      for (const row of rows) {
        revisionsRef.current.set(row.id, Number(row.revision));
      }
      for (const draft of remoteDrafts) {
        serverPayloadRef.current.set(draft.id, pdvDraftContentKey(draft));
      }

      setWorkspace((local) => {
        // Bloqueio herdado de uma comparação por texto cru: se a conta ainda
        // guarda exatamente a base confirmada por este dispositivo e nenhuma
        // cópia preservada tem outro conteúdo, nunca houve versão diferente.
        let released = false;
        for (const id of [...blockedRef.current]) {
          const account = serverPayloadRef.current.get(id);
          const current = local.drafts.find(draft => draft.id === id);
          if (!account || !current || tombstonesRef.current.has(id)) continue;
          const mine = pdvDraftContentKey(current);
          if (mine !== account && basesRef.current.get(id)?.serialized !== account) continue;
          if ([...(conflictsRef.current.get(id) ?? [])].some(copy => copy !== account && copy !== mine)) continue;
          blockedRef.current.delete(id);
          conflictsRef.current.delete(id);
          released = true;
        }
        if (released) { persistConflicts(requestKey); refreshConflicts(version => version + 1); }
        const merged = new Map<string, TDraft>();
        for (const draft of remoteDrafts) {
          const serialized = pdvDraftContentKey(draft);
          const revision = revisionsRef.current.get(draft.id)!;
          if (tombstonesRef.current.has(draft.id)) {
            const base = basesRef.current.get(draft.id);
            if (!base || base.serialized !== serialized || base.revision !== revision) {
              preserveConflict(requestKey, draft.id, serialized);
            }
            continue;
          }
          merged.set(draft.id, draft);
        }
        for (const draft of local.drafts) {
          if (tombstonesRef.current.has(draft.id)) continue;
          const serialized = pdvDraftContentKey(draft);
          const editedDuringRequest = requestDrafts.get(draft.id) !== serialized;
          // O placeholder inicial sem cache cede ao servidor; conteúdo que o
          // operador editou/criou durante a consulta precisa continuar no balcão.
          if (visibleRows.length > 0 && !localCacheFound && initialDrafts.get(draft.id) === serialized) continue;
          const remote = merged.get(draft.id);
          const base = basesRef.current.get(draft.id);
          if (remote && serialized !== pdvDraftContentKey(remote)) {
            const remoteSerialized = pdvDraftContentKey(remote);
            if (!editedDuringRequest && base?.serialized === serialized) continue;
            // Só editar sobre a base conhecida permite usar a revisão lida.
            if (base?.serialized !== remoteSerialized && requestDrafts.get(draft.id) !== remoteSerialized) {
              preserveConflict(requestKey, draft.id, remoteSerialized);
              preserveConflict(requestKey, draft.id, serialized);
            }
          } else if (!remote && base) {
            // Sumiu da leitura: pode ter sido fechado em outro dispositivo.
            preserveConflict(requestKey, draft.id, serialized);
          }
          merged.set(draft.id, draft);
        }
        const drafts = [...merged.values()].sort((a, b) => a.sequence - b.sequence);
        if (drafts.length === 0) return local;
        for (const remote of remoteDrafts) {
          if (blockedRef.current.has(remote.id) || tombstonesRef.current.has(remote.id)) continue;
          basesRef.current.set(remote.id, {
            revision: revisionsRef.current.get(remote.id)!, serialized: pdvDraftContentKey(remote),
          });
        }
        persistBases(requestKey);
        setSyncIssue(blockedRef.current.size > 0 || drafts.length > 20 ? 'conflict' : null);
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
      return true;
    }

    let pending: Promise<boolean> | null = null;
    let resolvePending: ((ready: boolean) => void) | null = null;
    const hydration: DraftHydration = {
      key: requestKey, generation, ready: false,
      start: () => {
        if (cancelled) return Promise.resolve(false);
        if (hydration.ready) return Promise.resolve(true);
        if (pending) return pending;
        const promise = new Promise<boolean>(resolve => { resolvePending = resolve; });
        pending = promise;
        void hydrateFromServer().catch(() => {
          if (!cancelled) setSyncIssue('unavailable');
          return false;
        }).then(ready => {
          if (!cancelled) setHydrationCompletion({ hydration, ready });
        });
        return promise;
      },
      finish: ready => {
        hydration.ready = ready;
        const resolve = resolvePending;
        pending = null; resolvePending = null;
        resolve?.(ready);
      },
    };
    hydrationRef.current = hydration;
    void hydration.start();
    return () => {
      cancelled = true;
      hydration.finish(false);
      if (hydrationRef.current === hydration) hydrationRef.current = null;
    };
  }, [cashSessionId, draftType, hydratedStorageKey, localCacheFound, parseWorkspace, persistBases, persistConflicts, persistTombstones, preserveConflict, setWorkspace, stockId, storageKey, syncAttempt, terminalId]);

  // Só libera a barreira depois do render que aplicou a reconciliação. Assim
  // uma resposta de leitura não autoriza salvar sobre um conflito ainda na fila.
  useEffect(() => {
    if (!hydrationCompletion) return;
    const { hydration, ready } = hydrationCompletion;
    if (hydrationRef.current === hydration) hydration.finish(ready);
  }, [hydrationCompletion]);

  // Eventos entre abas não são uma confirmação de servidor. Preservam versões
  // divergentes e não substituem conteúdo local que ainda pode estar pendente.
  useEffect(() => {
    if (!storageKey || hydratedStorageKey !== storageKey) return;
    const requestKey = storageKey;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== requestKey || event.newValue == null || currentStorageKeyRef.current !== requestKey) return;
      let incoming: TWorkspace;
      let incomingIds: Set<string>;
      try {
        const raw: unknown = JSON.parse(event.newValue);
        if (!raw || typeof raw !== 'object' || !('drafts' in raw) || !Array.isArray(raw.drafts)) return;
        incomingIds = new Set(raw.drafts.filter((draft): draft is { id: string } =>
          draft != null && typeof draft === 'object' && typeof draft.id === 'string').map(draft => draft.id));
        if (incomingIds.size === 0) return;
        incoming = parseWorkspace(event.newValue);
      } catch { return; }
      setWorkspace(local => {
        const merged = new Map(local.drafts.map(draft => [draft.id, draft]));
        for (const draft of incoming.drafts) {
          if (!incomingIds.has(draft.id)) continue;
          if (tombstonesRef.current.has(draft.id)) continue;
          const current = merged.get(draft.id);
          if (current && pdvDraftContentKey(current) !== pdvDraftContentKey(draft)) {
            preserveConflict(requestKey, draft.id, pdvDraftContentKey(draft));
            preserveConflict(requestKey, draft.id, pdvDraftContentKey(current));
          } else if (!current) merged.set(draft.id, draft);
        }
        if (blockedRef.current.size > 0 || merged.size > 20) setSyncIssue('conflict');
        if (merged.size === local.drafts.length) return local;
        return { ...local, drafts: [...merged.values()], nextSequence: Math.max(local.nextSequence, incoming.nextSequence,
          ...[...merged.values()].map(draft => draft.sequence + 1)) };
      });
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [hydratedStorageKey, parseWorkspace, preserveConflict, setWorkspace, storageKey]);

  const saveDraftSnapshot = useCallback(async (draft: TDraft, requestKey: string, generation: number): Promise<PdvDraftPersistResult> => {
    const current = () => currentStorageKeyRef.current === requestKey && generationRef.current === generation;
    if (!current()) return 'scope_changed';
    if (blockedRef.current.has(draft.id)) return 'conflict';
    if (tombstonesRef.current.has(draft.id)) return 'not_found';
    const latest = workspaceRef.current.drafts.find(item => item.id === draft.id);
    const serialized = pdvDraftContentKey(draft);
    if (!latest || pdvDraftContentKey(latest) !== serialized) return 'conflict';
    if (serverPayloadRef.current.get(draft.id) === serialized) return 'saved';
    const previousPending = pendingSaveRef.current.get(draft.id);
    const pending = previousPending?.serialized === serialized ? previousPending : {
      serialized, requestId: crypto.randomUUID(), expectedRevision: revisionsRef.current.get(draft.id) ?? 0,
    };
    pendingSaveRef.current.set(draft.id, pending);
    if (!stockId) return 'unavailable';
    const { data, error } = await draftRpc('pdv_save_order_draft_v2', {
      p_draft_id: draft.id, p_draft_type: draftType, p_payload: asJson(draft),
      p_expected_revision: pending.expectedRevision, p_client_request_id: pending.requestId,
      p_cash_session_id: cashSessionId, p_terminal_id: terminalId, p_stock_id: stockId,
    });
    if (!current()) return 'scope_changed';
    if (error) {
      const issue = error.code === '40001' ? 'conflict' : 'unavailable';
      if (issue === 'conflict') preserveConflict(requestKey, draft.id, serialized);
      setSyncIssue(issue);
      return issue;
    }
    const revision = Number(data?.revision);
    if (!Number.isFinite(revision)) { setSyncIssue('unavailable'); return 'unavailable'; }
    revisionsRef.current.set(draft.id, revision);
    serverPayloadRef.current.set(draft.id, serialized);
    basesRef.current.set(draft.id, { revision, serialized });
    persistBases(requestKey);
    pendingSaveRef.current.delete(draft.id);
    return 'saved';
  }, [cashSessionId, draftType, persistBases, preserveConflict, stockId, terminalId]);

  const saveDraftNow = useCallback(async (draft: TDraft): Promise<PdvDraftPersistResult> => {
    if (!storageKey || currentStorageKeyRef.current !== storageKey
      || hydratedStorageKey !== storageKey) return 'scope_changed';
    const requestKey = storageKey;
    const generation = generationRef.current;
    if (!workspaceRef.current.drafts.some(item => item.id === draft.id)) return 'not_found';
    // O chamador já instalou o mesmo snapshot no estado/local. Impede que um
    // autosave antigo, já enfileirado, sobrescreva a identidade financeira.
    workspaceRef.current = { ...workspaceRef.current,
      drafts: workspaceRef.current.drafts.map(item => item.id === draft.id ? draft : item) };
    const hydration = hydrationRef.current;
    if (!hydration || hydration.key !== requestKey || hydration.generation !== generation) return 'scope_changed';
    if (!hydration.ready) {
      // Uma falha na primeira leitura não pode bloquear a finalização para
      // sempre. Reaproveita a leitura em voo ou tenta recuperá-la uma vez,
      // conservando a tentativa financeira instalada pelo chamador.
      const ready = await hydration.start();
      if (currentStorageKeyRef.current !== requestKey || generationRef.current !== generation) return 'scope_changed';
      if (!ready) return 'unavailable';
    }
    const job = queueRef.current.then(() => saveDraftSnapshot(draft, requestKey, generation));
    queueRef.current = job.then(() => undefined, () => undefined);
    return job.catch(() => 'unavailable');
  }, [hydratedStorageKey, saveDraftSnapshot, storageKey]);

  useEffect(() => {
    if (!storageKey || serverReadyKey !== storageKey || hydratedStorageKey !== storageKey) return;
    const requestKey = storageKey;
    const generation = generationRef.current;
    const snapshot = workspace.drafts.map((draft) => JSON.parse(JSON.stringify(draft)) as TDraft);
    const timer = window.setTimeout(() => {
      queueRef.current = queueRef.current.then(async () => {
        if (currentStorageKeyRef.current !== requestKey || generationRef.current !== generation) return;
        const activeIds = new Set(snapshot.map((draft) => draft.id));
        let issueDuringRun: PdvDraftSyncIssue = blockedRef.current.size > 0 || snapshot.length > 20 ? 'conflict' : null;

        for (const draft of snapshot) {
          if (currentStorageKeyRef.current !== requestKey || generationRef.current !== generation) return;
          if (blockedRef.current.has(draft.id) || tombstonesRef.current.has(draft.id)) continue;
          // Snapshots anteriores podem estar na fila quando uma barreira
          // explícita já instalou uma tentativa ou confirmação mais nova.
          const latest = workspaceRef.current.drafts.find(item => item.id === draft.id);
          if (!latest || pdvDraftContentKey(latest) !== pdvDraftContentKey(draft)) continue;
          const saved = await saveDraftSnapshot(draft, requestKey, generation);
          if (saved === 'scope_changed') return;
          if (saved === 'conflict' || (saved === 'unavailable' && issueDuringRun == null)) issueDuringRun = saved;
        }

        for (const draftId of [...tombstonesRef.current]) {
          if (currentStorageKeyRef.current !== requestKey || generationRef.current !== generation) return;
          if (activeIds.has(draftId)) continue;
          if (blockedRef.current.has(draftId)) { issueDuringRun = 'conflict'; continue; }
          const revision = revisionsRef.current.get(draftId);
          if (revision == null) continue;
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
          if (currentStorageKeyRef.current !== requestKey || generationRef.current !== generation) return;
          if (error) {
            const issue = error.code === '40001' ? 'conflict' : 'unavailable';
            if (issue === 'conflict') blockedRef.current.add(draftId);
            if (issue === 'conflict' || issueDuringRun == null) issueDuringRun = issue;
            continue;
          }
          if (data?.deleted_at) {
            revisionsRef.current.delete(draftId);
            serverPayloadRef.current.delete(draftId);
            basesRef.current.delete(draftId);
            persistBases(requestKey);
            pendingSaveRef.current.delete(draftId);
            pendingDeleteRef.current.delete(draftId);
            tombstonesRef.current.delete(draftId);
            persistTombstones(requestKey, tombstonesRef.current);
          }
        }
        setSyncIssue(blockedRef.current.size > 0 ? 'conflict' : issueDuringRun);
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [cashSessionId, draftType, hydratedStorageKey, persistBases, persistTombstones, preserveConflict, saveDraftSnapshot, serverReadyKey, stockId, storageKey, terminalId, workspace]);

  const parseDraft = useCallback((serialized: string | undefined): TDraft | null => {
    if (!serialized) return null;
    try {
      const payload = JSON.parse(serialized) as DraftShape;
      return parseWorkspace(JSON.stringify({ drafts: [payload], activeId: payload.id, nextSequence: payload.sequence + 1 }))
        .drafts.find(draft => draft.id === payload.id) ?? null;
    } catch { return null; }
  }, [parseWorkspace]);

  const currentScopeReady = Boolean(storageKey) && hydratedStorageKey === storageKey && scopeRef.current === storageKey;
  const draftConflicts: PdvDraftConflict<TDraft>[] = currentScopeReady
    ? [...blockedRef.current].map(id => {
      const local = workspace.drafts.find(draft => draft.id === id) ?? parseDraft(basesRef.current.get(id)?.serialized)
        ?? parseDraft([...(conflictsRef.current.get(id) ?? [])][0]);
      const server = parseDraft(serverPayloadRef.current.get(id));
      const alternatives = [...(conflictsRef.current.get(id) ?? [])].map(copy => parseDraft(copy))
        .filter((draft): draft is TDraft => draft != null);
      const orderId = [local, server, ...alternatives].map(existingOrderId).find(Boolean) ?? null;
      return { id, local, server, alternatives,
        requiresOrderReview: orderId != null || [local, server, ...alternatives].some(hasDurableFinancialIdentity), orderId };
    }) : [];

  const resolveDraftConflict = useCallback((id: string, choice: 'local' | 'server'): Promise<PdvDraftResolutionResult> => {
    const requestKey = currentStorageKeyRef.current;
    const generation = generationRef.current;
    if (!requestKey || requestKey !== storageKey || hydratedStorageKey !== requestKey || !stockId) return Promise.resolve('not_found');
    const inFlight = resolutionRef.current;
    if (inFlight?.key === requestKey && inFlight.id === id) return inFlight.promise;
    if (inFlight || !blockedRef.current.has(id)) return Promise.resolve('not_found');
    const isCurrent = () => currentStorageKeyRef.current === requestKey && generationRef.current === generation;
    setResolvingDraftId(id);
    const promise = (async (): Promise<PdvDraftResolutionResult> => {
      const { data, error } = await draftRpc('pdv_list_order_drafts_v2', {
        p_draft_type: draftType, p_cash_session_id: cashSessionId, p_terminal_id: terminalId,
        p_stock_id: stockId, p_include_deleted: false,
      });
      if (!isCurrent()) return 'not_found';
      if (error) return 'unavailable';
      const row = (data ?? []).filter(isServerDraftRow).find(candidate => candidate.id === id);
      const remote = row ? parseDraft(JSON.stringify(row.payload)) : null;
      if (row && !remote) return 'unavailable';
      const serialized = remote ? pdvDraftContentKey(remote) : undefined;
      const shownRevision = revisionsRef.current.get(id);
      const shownPayload = serverPayloadRef.current.get(id);
      if (shownRevision !== (row ? Number(row.revision) : undefined) || shownPayload !== serialized) {
        if (shownPayload) preserveConflict(requestKey, id, shownPayload);
        if (serialized) {
          serverPayloadRef.current.set(id, serialized);
          revisionsRef.current.set(id, Number(row!.revision));
          preserveConflict(requestKey, id, serialized);
        } else {
          serverPayloadRef.current.delete(id);
          revisionsRef.current.delete(id);
        }
        refreshConflicts(version => version + 1);
        return 'refresh_required';
      }

      const local = workspaceRef.current.drafts.find(draft => draft.id === id) ?? parseDraft(basesRef.current.get(id)?.serialized)
        ?? parseDraft([...(conflictsRef.current.get(id) ?? [])][0]);
      const chosen = choice === 'local' ? local : remote;
      if (!chosen) return 'not_found';
      const versions = new Map<string, TDraft>();
      for (const candidate of [local, remote, ...[...(conflictsRef.current.get(id) ?? [])].map(copy => parseDraft(copy))]) {
        if (candidate) versions.set(pdvDraftContentKey(candidate), candidate);
      }
      if ([...versions.values()].some(candidate => existingOrderId(candidate) || hasDurableFinancialIdentity(candidate))) return 'review_order';

      const expectedLocal = JSON.stringify(workspaceRef.current.drafts.find(draft => draft.id === id) ?? null);
      const otherVersions = [...versions].filter(([copy]) => copy !== pdvDraftContentKey(chosen)).map(([, draft]) => draft);
      let sequence = workspaceRef.current.nextSequence;
      const copies = otherVersions.map(draft => createConflictCopy(JSON.parse(JSON.stringify(draft)) as TDraft, crypto.randomUUID(), sequence++));
      // Se a linha já foi fechada no servidor, uma recuperação nunca a revive.
      const selected = remote ? chosen : createConflictCopy(JSON.parse(JSON.stringify(chosen)) as TDraft, crypto.randomUUID(), sequence++);
      const applied = await new Promise<boolean>(resolve => {
        setWorkspace(current => {
          if (!isCurrent() || JSON.stringify(current.drafts.find(draft => draft.id === id) ?? null) !== expectedLocal) {
            resolve(false);
            return current;
          }
          const kept = current.drafts.filter(draft => draft.id !== id);
          const drafts = [...kept, selected, ...copies].sort((a, b) => a.sequence - b.sequence);
          if (remote && serialized) basesRef.current.set(id, { revision: Number(row!.revision), serialized });
          else basesRef.current.delete(id);
          blockedRef.current.delete(id);
          persistConflicts(requestKey);
          pendingSaveRef.current.delete(id);
          pendingDeleteRef.current.delete(id);
          tombstonesRef.current.delete(id);
          persistBases(requestKey);
          persistTombstones(requestKey, tombstonesRef.current);
          setSyncIssue(blockedRef.current.size > 0 || drafts.length > 20 ? 'conflict' : null);
          const localIndex = local ? otherVersions.findIndex(draft => pdvDraftContentKey(draft) === pdvDraftContentKey(local)) : -1;
          setLastResolution({ id, choice, localCopyId: !remote && choice === 'local' ? selected.id
            : localIndex >= 0 ? copies[localIndex].id : null });
          resolve(true);
          return { ...current, drafts, activeId: current.activeId === id ? selected.id : current.activeId,
            nextSequence: Math.max(current.nextSequence, sequence) };
        });
      });
      return applied ? 'resolved' : 'refresh_required';
    })().finally(() => {
      if (resolutionRef.current?.promise === promise) resolutionRef.current = null;
      if (isCurrent()) setResolvingDraftId(null);
    });
    resolutionRef.current = { key: requestKey, id, promise };
    return promise;
  }, [cashSessionId, createConflictCopy, draftType, hydratedStorageKey, parseDraft, persistBases, persistConflicts, persistTombstones, preserveConflict,
    setWorkspace, stockId, storageKey, terminalId]);

  const retrySync = useCallback(() => setSyncAttempt(attempt => attempt + 1), []);
  return { syncIssue: currentScopeReady ? syncIssue : null,
    serverReady: currentScopeReady && serverReadyKey === storageKey, markDeleted, saveDraftNow,
    recoveryPersistenceIssue: currentScopeReady && recoveryPersistenceIssue,
    draftConflicts, resolveDraftConflict, resolvingDraftId: currentScopeReady ? resolvingDraftId : null,
    retrySync, lastResolution: currentScopeReady ? lastResolution : null };
}

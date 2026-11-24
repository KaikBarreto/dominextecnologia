import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addPdvSaleDraft,
  createPdvSaleWorkspace,
  deletePdvSaleDraft,
  parsePdvSaleWorkspace,
  pdvSaleDraftStorageKey,
  selectPdvSaleDraft,
  updatePdvSaleDraft,
  type PdvSaleDraft,
  type PdvSaleDraftWorkspace,
  MAX_PDV_SALE_DRAFTS,
} from '@/lib/pdv/sale-drafts';
import { usePdvServerDraftSync, type PdvDraftPersistResult } from '@/hooks/usePdvServerDraftSync';

interface DraftWorkspaceOwner {
  companyId: string;
  userId: string;
  cashSessionId: string;
  terminalId: string;
  stockId: string;
}

interface UsePdvSaleDraftWorkspaceOptions {
  owner: DraftWorkspaceOwner | null;
  transactionDate: string;
  defaultStockId: string | null;
  directSaleV2?: boolean;
}

export function usePdvSaleDraftWorkspace({
  owner,
  transactionDate,
  defaultStockId,
  directSaleV2 = false,
}: UsePdvSaleDraftWorkspaceOptions) {
  const [workspace, setWorkspace] = useState<PdvSaleDraftWorkspace>(() =>
    createPdvSaleWorkspace(transactionDate, defaultStockId),
  );
  const [localPersistenceIssue, setLocalPersistenceIssue] = useState(false);
  const hydratedStorageKeyRef = useRef<string | null>(null);
  const [hydration, setHydration] = useState<{ key: string | null; cacheFound: boolean }>({
    key: null,
    cacheFound: false,
  });
  const defaultsRef = useRef({ transactionDate, defaultStockId });
  defaultsRef.current = { transactionDate, defaultStockId };
  const storageKey = useMemo(() => (owner ? pdvSaleDraftStorageKey(owner) : null), [owner]);
  const liveStorageKeyRef = useRef(storageKey);
  const liveWorkspaceRef = useRef(workspace);
  liveStorageKeyRef.current = storageKey;
  liveWorkspaceRef.current = workspace;

  useEffect(() => {
    if (!storageKey) {
      hydratedStorageKeyRef.current = null;
      setHydration({ key: null, cacheFound: false });
      setWorkspace(createPdvSaleWorkspace(
        defaultsRef.current.transactionDate,
        defaultsRef.current.defaultStockId,
      ));
      return;
    }
    let raw: string | null = null;
    setLocalPersistenceIssue(false);
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      setLocalPersistenceIssue(true);
      // Safari privado/storage cheio: a sessão continua funcional em memória.
    }
    setWorkspace(parsePdvSaleWorkspace(
      raw,
      defaultsRef.current.transactionDate,
      defaultsRef.current.defaultStockId,
    ));
    hydratedStorageKeyRef.current = storageKey;
    setHydration({ key: storageKey, cacheFound: raw != null });
  }, [storageKey]); // troca de usuário/empresa precisa isolar tudo imediatamente

  useEffect(() => {
    if (!storageKey || hydratedStorageKeyRef.current !== storageKey || hydration.key !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(workspace));
      setLocalPersistenceIssue(false);
    } catch {
      setLocalPersistenceIssue(true);
      // Best-effort: nunca derruba uma venda porque o cache local ficou cheio.
    }
  }, [hydration.key, storageKey, workspace]);

  // Hoje/local podem chegar depois do perfil. Só preenche campos ainda não
  // escolhidos; nunca pisa numa data retroativa ou local selecionado.
  useEffect(() => {
    setWorkspace((current) => ({
      ...current,
      drafts: current.drafts.map((draft) => ({
        ...draft,
        transactionDate: draft.transactionDateTouched ? draft.transactionDate : transactionDate,
        stockId: draft.stockId ?? defaultStockId,
      })),
    }));
  }, [transactionDate, defaultStockId]);

  const visibleWorkspace = useMemo(
    () => hydration.key === storageKey ? workspace : createPdvSaleWorkspace(transactionDate, defaultStockId),
    [defaultStockId, hydration.key, storageKey, transactionDate, workspace],
  );
  const activeDraft = useMemo(
    () => visibleWorkspace.drafts.find((draft) => draft.id === visibleWorkspace.activeId) ?? visibleWorkspace.drafts[0],
    [visibleWorkspace],
  );

  const updateDraft = useCallback((draftId: string, updater: (draft: PdvSaleDraft) => PdvSaleDraft) => {
    setWorkspace((current) => updatePdvSaleDraft(current, draftId, updater));
  }, []);

  const updateActiveDraft = useCallback((updater: (draft: PdvSaleDraft) => PdvSaleDraft) => {
    setWorkspace((current) => updatePdvSaleDraft(current, current.activeId, updater));
  }, []);

  const createDraft = useCallback(() => {
    setWorkspace((current) => addPdvSaleDraft(current, transactionDate, defaultStockId));
  }, [transactionDate, defaultStockId]);

  const selectDraft = useCallback((draftId: string) => {
    setWorkspace((current) => selectPdvSaleDraft(current, draftId));
  }, []);

  const parseServerWorkspace = useCallback(
    (raw: string) => parsePdvSaleWorkspace(
      raw,
      defaultsRef.current.transactionDate,
      defaultsRef.current.defaultStockId,
    ),
    [],
  );
  const createConflictCopy = useCallback((draft: PdvSaleDraft, id: string, sequence: number): PdvSaleDraft => ({
    ...draft, id, sequence, attempt: directSaleV2 ? draft.attempt : null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }), [directSaleV2]);
  const { markDeleted, syncIssue, serverReady, recoveryPersistenceIssue, draftConflicts, resolveDraftConflict, resolvingDraftId, retrySync, lastResolution, saveDraftNow } = usePdvServerDraftSync({
    storageKey,
    hydratedStorageKey: hydration.key,
    localCacheFound: hydration.cacheFound,
    draftType: 'sale',
    context: owner ? { cashSessionId: owner.cashSessionId, terminalId: owner.terminalId, stockId: owner.stockId } : null,
    workspace,
    setWorkspace,
    parseWorkspace: parseServerWorkspace,
    createConflictCopy,
  });
  const persistDraftNow = useCallback(async (
    draftId: string,
    updater: (draft: PdvSaleDraft) => PdvSaleDraft,
  ): Promise<{ server: PdvDraftPersistResult; localSaved: boolean }> => {
    if (!storageKey || liveStorageKeyRef.current !== storageKey || hydration.key !== storageKey
      || hydratedStorageKeyRef.current !== storageKey) return { server: 'scope_changed', localSaved: false };
    const previous = liveWorkspaceRef.current.drafts.find(item => item.id === draftId);
    let next = updatePdvSaleDraft(liveWorkspaceRef.current, draftId, updater);
    let draft = next.drafts.find(item => item.id === draftId);
    if (!draft) return { server: 'not_found', localSaved: false };
    // Retry da mesma barreira conserva também o snapshot e o request CAS;
    // atualizar só o relógio perderia a resposta de um save já confirmado.
    if (previous && JSON.stringify({ ...draft, updatedAt: previous.updatedAt }) === JSON.stringify(previous)) {
      next = liveWorkspaceRef.current;
      draft = previous;
    }
    liveWorkspaceRef.current = next;
    const target = draft;
    setWorkspace(current => {
      // Saves explícitos continuam endereçados por ID: uma edição/seleção
      // enfileirada em outro atendimento não é substituída pelo snapshot.
      const merged = { ...current, drafts: current.drafts.map(item => item.id === draftId ? target : item) };
      liveWorkspaceRef.current = merged;
      return merged;
    });
    let localSaved = false;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      localSaved = true; setLocalPersistenceIssue(false);
    } catch { setLocalPersistenceIssue(true); }
    const server = await saveDraftNow(draft);
    return { server: liveStorageKeyRef.current === storageKey ? server : 'scope_changed', localSaved };
  }, [hydration.key, saveDraftNow, storageKey]);
  const deleteDraft = useCallback((draftId: string) => {
    markDeleted(draftId);
    setWorkspace((current) => deletePdvSaleDraft(current, draftId, transactionDate, defaultStockId));
  }, [defaultStockId, markDeleted, transactionDate]);

  return {
    workspace: visibleWorkspace,
    activeDraft,
    updateDraft,
    persistDraftNow,
    updateActiveDraft,
    createDraft,
    selectDraft,
    deleteDraft,
    setWorkspace,
    syncIssue,
    serverReady,
    localPersistenceIssue: localPersistenceIssue || recoveryPersistenceIssue,
    draftConflicts,
    resolveDraftConflict,
    resolvingDraftId,
    retrySync,
    lastResolution,
    canCreateDraft: visibleWorkspace.drafts.length < MAX_PDV_SALE_DRAFTS,
    creationLimitReached: visibleWorkspace.drafts.length >= MAX_PDV_SALE_DRAFTS,
  };
}

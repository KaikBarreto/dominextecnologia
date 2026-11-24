import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addPdvPurchaseDraft,
  createPdvPurchaseWorkspace,
  deletePdvPurchaseDraft,
  parsePdvPurchaseWorkspace,
  pdvPurchaseDraftStorageKey,
  selectPdvPurchaseDraft,
  updatePdvPurchaseDraft,
  type PdvPurchaseDraft,
  type PdvPurchaseDraftDefaults,
  type PdvPurchaseWorkspace,
  MAX_PDV_PURCHASE_DRAFTS,
} from '@/lib/pdv/purchase-drafts';
import { usePdvServerDraftSync } from '@/hooks/usePdvServerDraftSync';
import { pdvPurchaseCashDraftStorageSuffix, type PdvPurchaseCashContext } from '@/components/pdv/caixa-v2/pdvPurchaseContext';

interface PdvPurchaseWorkspaceOwner {
  companyId: string;
  userId: string;
  stockId: string;
}

interface UsePdvPurchaseDraftWorkspaceOptions {
  owner: PdvPurchaseWorkspaceOwner | null;
  defaults: PdvPurchaseDraftDefaults;
  cashContext?: PdvPurchaseCashContext | null;
}

export function usePdvPurchaseDraftWorkspace({
  owner,
  defaults,
  cashContext = null,
}: UsePdvPurchaseDraftWorkspaceOptions) {
  const [workspace, setWorkspace] = useState<PdvPurchaseWorkspace>(() =>
    createPdvPurchaseWorkspace(defaults),
  );
  const [localPersistenceIssue, setLocalPersistenceIssue] = useState(false);
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const hydratedKeyRef = useRef<string | null>(null);
  const [hydration, setHydration] = useState<{ key: string | null; cacheFound: boolean }>({
    key: null,
    cacheFound: false,
  });
  const storageKey = useMemo(() => {
    if (!owner) return null;
    const base = pdvPurchaseDraftStorageKey(owner);
    return cashContext ? `${base}:${pdvPurchaseCashDraftStorageSuffix(cashContext)}` : base;
  }, [cashContext, owner]);

  useEffect(() => {
    if (!storageKey) {
      hydratedKeyRef.current = null;
      setHydration({ key: null, cacheFound: false });
      setWorkspace(createPdvPurchaseWorkspace(defaultsRef.current));
      return;
    }
    let raw: string | null = null;
    setLocalPersistenceIssue(false);
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      setLocalPersistenceIssue(true);
      // Storage indisponível: mantém os rascunhos somente em memória.
    }
    setWorkspace(parsePdvPurchaseWorkspace(raw, defaultsRef.current));
    hydratedKeyRef.current = storageKey;
    setHydration({ key: storageKey, cacheFound: raw != null });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || hydratedKeyRef.current !== storageKey || hydration.key !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(workspace));
      setLocalPersistenceIssue(false);
    } catch {
      setLocalPersistenceIssue(true);
      // Persistência é best-effort e nunca pode impedir a compra.
    }
  }, [hydration.key, storageKey, workspace]);

  useEffect(() => {
    setWorkspace((current) => ({
      ...current,
      drafts: current.drafts.map((draft) => ({
        ...draft,
        stockId: draft.stockId || defaults.stockId || '',
        accountId: draft.accountId || defaults.accountId || '',
        categoryId: draft.categoryId || defaults.categoryId || '',
        purchaseDate: draft.purchaseDateTouched ? draft.purchaseDate : defaults.purchaseDate,
        paidDate: draft.paidDateTouched ? draft.paidDate : defaults.purchaseDate,
      })),
    }));
  }, [defaults.stockId, defaults.accountId, defaults.categoryId, defaults.purchaseDate]);

  // Troca de usuário/empresa pode acontecer sem desmontar a árvore. Enquanto o
  // effect ainda não hidratou a nova chave, nunca exponha o workspace anterior
  // nem por um frame (defesa client-side; RLS continua sendo a barreira real).
  const visibleWorkspace = useMemo(
    () => hydratedKeyRef.current === storageKey
      ? workspace
      : createPdvPurchaseWorkspace(defaults),
    [workspace, storageKey, defaults],
  );
  const activeDraft = useMemo(
    () => visibleWorkspace.drafts.find((draft) => draft.id === visibleWorkspace.activeId)
      ?? visibleWorkspace.drafts[0],
    [visibleWorkspace],
  );

  const updateDraft = useCallback((draftId: string, updater: (draft: PdvPurchaseDraft) => PdvPurchaseDraft) => {
    setWorkspace((current) => updatePdvPurchaseDraft(current, draftId, updater));
  }, []);

  const createDraft = useCallback(() => {
    setWorkspace((current) => addPdvPurchaseDraft(current, defaults));
  }, [defaults]);

  const selectDraft = useCallback((draftId: string) => {
    setWorkspace((current) => selectPdvPurchaseDraft(current, draftId));
  }, []);

  const parseServerWorkspace = useCallback(
    (raw: string) => parsePdvPurchaseWorkspace(raw, defaultsRef.current),
    [],
  );
  const createConflictCopy = useCallback((draft: PdvPurchaseDraft, id: string, sequence: number): PdvPurchaseDraft => ({
    ...draft, id, sequence, clientRequestId: crypto.randomUUID(),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }), []);
  const { markDeleted, syncIssue, serverReady, recoveryPersistenceIssue, draftConflicts, resolveDraftConflict, resolvingDraftId, retrySync, lastResolution } = usePdvServerDraftSync({
    storageKey,
    hydratedStorageKey: hydration.key,
    localCacheFound: hydration.cacheFound,
    draftType: 'purchase',
    context: owner ? {
      cashSessionId: cashContext?.sessionId ?? null,
      terminalId: cashContext?.terminalId ?? null,
      stockId: owner.stockId,
    } : null,
    workspace,
    setWorkspace,
    parseWorkspace: parseServerWorkspace,
    createConflictCopy,
  });
  const deleteDraft = useCallback((draftId: string) => {
    markDeleted(draftId);
    setWorkspace((current) => deletePdvPurchaseDraft(current, draftId, defaults));
  }, [defaults, markDeleted]);

  return {
    workspace: visibleWorkspace,
    activeDraft,
    updateDraft,
    createDraft,
    selectDraft,
    deleteDraft,
    syncIssue,
    serverReady,
    localPersistenceIssue: localPersistenceIssue || recoveryPersistenceIssue,
    draftConflicts,
    resolveDraftConflict,
    resolvingDraftId,
    retrySync,
    lastResolution,
    canCreateDraft: visibleWorkspace.drafts.length < MAX_PDV_PURCHASE_DRAFTS,
    creationLimitReached: visibleWorkspace.drafts.length >= MAX_PDV_PURCHASE_DRAFTS,
  };
}

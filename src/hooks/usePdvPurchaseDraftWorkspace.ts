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
} from '@/lib/pdv/purchase-drafts';
import { usePdvServerDraftSync } from '@/hooks/usePdvServerDraftSync';

interface PdvPurchaseWorkspaceOwner {
  companyId: string;
  userId: string;
}

interface UsePdvPurchaseDraftWorkspaceOptions {
  owner: PdvPurchaseWorkspaceOwner | null;
  defaults: PdvPurchaseDraftDefaults;
}

export function usePdvPurchaseDraftWorkspace({
  owner,
  defaults,
}: UsePdvPurchaseDraftWorkspaceOptions) {
  const [workspace, setWorkspace] = useState<PdvPurchaseWorkspace>(() =>
    createPdvPurchaseWorkspace(defaults),
  );
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const hydratedKeyRef = useRef<string | null>(null);
  const [hydration, setHydration] = useState<{ key: string | null; cacheFound: boolean }>({
    key: null,
    cacheFound: false,
  });
  const storageKey = useMemo(() => owner ? pdvPurchaseDraftStorageKey(owner) : null, [owner]);

  useEffect(() => {
    if (!storageKey) {
      hydratedKeyRef.current = null;
      setHydration({ key: null, cacheFound: false });
      setWorkspace(createPdvPurchaseWorkspace(defaultsRef.current));
      return;
    }
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      // Storage indisponível: mantém os rascunhos somente em memória.
    }
    setWorkspace(parsePdvPurchaseWorkspace(raw, defaultsRef.current));
    hydratedKeyRef.current = storageKey;
    setHydration({ key: storageKey, cacheFound: raw != null });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || hydratedKeyRef.current !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(workspace));
    } catch {
      // Persistência é best-effort e nunca pode impedir a compra.
    }
  }, [storageKey, workspace]);

  useEffect(() => {
    if (!storageKey) return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue != null) {
        setWorkspace(parsePdvPurchaseWorkspace(event.newValue, defaultsRef.current));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey]);

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
  const { markDeleted, syncIssue, serverReady } = usePdvServerDraftSync({
    storageKey,
    hydratedStorageKey: hydration.key,
    localCacheFound: hydration.cacheFound,
    draftType: 'purchase',
    workspace,
    setWorkspace,
    parseWorkspace: parseServerWorkspace,
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
  };
}

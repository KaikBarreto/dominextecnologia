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
} from '@/lib/pdv/sale-drafts';
import { usePdvServerDraftSync } from '@/hooks/usePdvServerDraftSync';

interface DraftWorkspaceOwner {
  companyId: string;
  userId: string;
}

interface UsePdvSaleDraftWorkspaceOptions {
  owner: DraftWorkspaceOwner | null;
  transactionDate: string;
  defaultStockId: string | null;
}

export function usePdvSaleDraftWorkspace({
  owner,
  transactionDate,
  defaultStockId,
}: UsePdvSaleDraftWorkspaceOptions) {
  const [workspace, setWorkspace] = useState<PdvSaleDraftWorkspace>(() =>
    createPdvSaleWorkspace(transactionDate, defaultStockId),
  );
  const hydratedStorageKeyRef = useRef<string | null>(null);
  const [hydration, setHydration] = useState<{ key: string | null; cacheFound: boolean }>({
    key: null,
    cacheFound: false,
  });
  const defaultsRef = useRef({ transactionDate, defaultStockId });
  defaultsRef.current = { transactionDate, defaultStockId };
  const storageKey = useMemo(() => (owner ? pdvSaleDraftStorageKey(owner) : null), [owner]);

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
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
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
    if (!storageKey || hydratedStorageKeyRef.current !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(workspace));
    } catch {
      // Best-effort: nunca derruba uma venda porque o cache local ficou cheio.
    }
  }, [storageKey, workspace]);

  // Outra aba do MESMO usuário/empresa atualizou os rascunhos. O evento não
  // dispara na aba que escreveu, então não cria loop. Escopado pela chave.
  useEffect(() => {
    if (!storageKey) return;
    function handleStorage(event: StorageEvent) {
      if (event.key !== storageKey || event.newValue == null) return;
      setWorkspace(parsePdvSaleWorkspace(event.newValue, transactionDate, defaultStockId));
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey, transactionDate, defaultStockId]);

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

  const activeDraft = useMemo(
    () => workspace.drafts.find((draft) => draft.id === workspace.activeId) ?? workspace.drafts[0],
    [workspace],
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
  const { markDeleted, syncIssue, serverReady } = usePdvServerDraftSync({
    storageKey,
    hydratedStorageKey: hydration.key,
    localCacheFound: hydration.cacheFound,
    draftType: 'sale',
    workspace,
    setWorkspace,
    parseWorkspace: parseServerWorkspace,
  });
  const deleteDraft = useCallback((draftId: string) => {
    markDeleted(draftId);
    setWorkspace((current) => deletePdvSaleDraft(current, draftId, transactionDate, defaultStockId));
  }, [defaultStockId, markDeleted, transactionDate]);

  return {
    workspace,
    activeDraft,
    updateDraft,
    updateActiveDraft,
    createDraft,
    selectDraft,
    deleteDraft,
    setWorkspace,
    syncIssue,
    serverReady,
  };
}

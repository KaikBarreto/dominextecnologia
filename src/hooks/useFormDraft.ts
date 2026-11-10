import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFormDraftOptions<T> {
  /** Unique key per form type, e.g. 'customer-form', 'employee-form' */
  key: string;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Whether we're editing an existing record (drafts only for new records) */
  isEditing?: boolean;
  /** Keys to ignore when checking for meaningful data (e.g. default values) */
  ignoreKeys?: string[];
  /** Coalesce mudanças antes de gravar; zero mantém a persistência síncrona dos formulários existentes. */
  debounceMs?: number;
}

export type FormDraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface FormDraftView<T> {
  contextKey: string;
  showResumePrompt: boolean;
  draftData: T | null;
  status: FormDraftSaveStatus;
  savedAt: number | null;
}

function createDraftView<T>(contextKey: string): FormDraftView<T> {
  return { contextKey, showResumePrompt: false, draftData: null, status: 'idle', savedAt: null };
}

export interface UseFormDraftReturn<T> {
  hasDraft: boolean;
  draftData: T | null;
  saveDraft: (data: T) => void;
  /**
   * Persiste SINCRONAMENTE o último dado conhecido, respeitando o guard de
   * "não gravar o snapshot inicial/vazio". Chamar no caminho de FECHAR (antes do
   * reset do formulário) e/ou no unmount — cobre a race do drawer mobile, em que
   * o usuário digita e fecha no MESMO tick e o efeito de save gated em `isOpen`
   * já roda com `isOpen=false`, nunca persistindo o último valor.
   *
   * Passar `data` atualiza o "último dado conhecido" antes de persistir (útil no
   * caminho de fechar, onde o snapshot atual do form é conhecido). Sem argumento,
   * persiste o último dado que passou por `saveDraft`/`flush`.
   */
  flush: (data?: T) => void;
  clearDraft: () => void;
  acceptDraft: () => void;
  discardDraft: () => void;
  /** Inicia outro preenchimento sem suspender o autosave; data preserva a primeira edição de um aviso não bloqueante. */
  startNewDraft: (data?: T) => void;
  showResumePrompt: boolean;
  status: FormDraftSaveStatus;
  /** Momento da última escrita bem-sucedida nesta sessão/contexto. */
  savedAt: number | null;
}

/** Default-like values that don't count as meaningful user input */
function isMeaningfulValue(v: unknown): boolean {
  if (v === '' || v === null || v === undefined || v === false) return false;
  if (typeof v === 'number' && v === 0) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  // Objeto vazio ({}) é estado default (ex.: Record de configs sem nenhuma
  // entrada) — não conta como preenchimento real do usuário.
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
  return true;
}

export function useFormDraft<T extends object>({
  key,
  isOpen,
  isEditing = false,
  ignoreKeys = [],
  debounceMs = 0,
}: UseFormDraftOptions<T>): UseFormDraftReturn<T> {
  const storageKey = `form-draft:${key}`;
  const [view, setView] = useState(() => createDraftView<T>(storageKey));
  const contextKeyRef = useRef(storageKey);
  const mountedRef = useRef(true);
  const suppressSaveRef = useRef(false);
  const resumePendingRef = useRef(false);
  const initialSnapshotRef = useRef<string | null>(null);
  const explicitNewDraftRef = useRef(false);
  const hasActiveDraftRef = useRef(false);
  const lastDataRef = useRef<T | null>(null);
  const lastPersistedRef = useRef<{ snapshot: string; savedAt: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ snapshot: string; data: T } | null>(null);
  const generationRef = useRef(0);
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const ignoreKeysRef = useRef(ignoreKeys);
  ignoreKeysRef.current = ignoreKeys;
  const debounceMsRef = useRef(debounceMs);
  debounceMsRef.current = Math.max(0, debounceMs);

  // Cancelamento síncrono na troca de escopo: um timer ou callback antigo nunca
  // pode descarregar os dados da empresa/usuário anterior sob a chave nova.
  if (contextKeyRef.current !== storageKey) {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    generationRef.current += 1;
    contextKeyRef.current = storageKey;
    suppressSaveRef.current = false;
    resumePendingRef.current = false;
    initialSnapshotRef.current = null;
    explicitNewDraftRef.current = false;
    hasActiveDraftRef.current = false;
    lastDataRef.current = null;
    lastPersistedRef.current = null;
  }

  const updateView = useCallback((patch: Partial<Omit<FormDraftView<T>, 'contextKey'>>) => {
    if (!mountedRef.current) return;
    setView(previous => {
      const current = previous.contextKey === contextKeyRef.current ? previous : createDraftView<T>(contextKeyRef.current);
      if (current === previous && Object.entries(patch).every(([field, value]) => current[field as keyof typeof current] === value)) return previous;
      return { ...current, ...patch };
    });
  }, []);

  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    generationRef.current += 1;
  }, []);

  const meaningful = (data: T) => Object.keys(data)
    .some(field => !ignoreKeysRef.current.includes(field) && isMeaningfulValue(data[field as keyof T]));

  const removeEmptyDraft = useCallback(() => {
    cancelPending();
    hasActiveDraftRef.current = false;
    lastPersistedRef.current = null;
    let status: FormDraftSaveStatus = 'idle';
    try { sessionStorage.removeItem(contextKeyRef.current); } catch { status = 'error'; }
    updateView({ draftData: null, showResumePrompt: false, status, savedAt: null });
  }, [cancelPending, updateView]);

  const persistIfMeaningful = (data: T): void => {
    if (isEditingRef.current || suppressSaveRef.current || resumePendingRef.current) return;
    try {
      const snapshot = JSON.stringify(data);
      if (!meaningful(data) || (!explicitNewDraftRef.current && snapshot === initialSnapshotRef.current)) {
        updateView({ status: 'idle' });
        return;
      }
      const previous = lastPersistedRef.current;
      if (previous?.snapshot === snapshot && sessionStorage.getItem(contextKeyRef.current) === snapshot) {
        updateView({ status: 'saved', savedAt: previous.savedAt });
        return;
      }
      sessionStorage.setItem(contextKeyRef.current, snapshot);
      const savedAt = Date.now();
      hasActiveDraftRef.current = true;
      lastPersistedRef.current = { snapshot, savedAt };
      updateView({ status: 'saved', savedAt });
    } catch {
      updateView({ status: 'error' });
    }
  };
  const persistRef = useRef(persistIfMeaningful);
  persistRef.current = persistIfMeaningful;

  const saveDraft = useCallback((data: T) => {
    if (contextKeyRef.current !== storageKey || !isOpenRef.current || isEditingRef.current || suppressSaveRef.current || resumePendingRef.current) return;
    lastDataRef.current = data;
    try {
      const snapshot = JSON.stringify(data);
      if (initialSnapshotRef.current === null) {
        initialSnapshotRef.current = snapshot;
        if (!explicitNewDraftRef.current) return;
      }
      if (!Object.keys(data).some(field => !ignoreKeysRef.current.includes(field) && isMeaningfulValue(data[field as keyof T]))) {
        if (hasActiveDraftRef.current) removeEmptyDraft();
        else { cancelPending(); updateView({ status: 'idle' }); }
        return;
      }
      if (!explicitNewDraftRef.current && snapshot === initialSnapshotRef.current) {
        cancelPending();
        updateView({ status: 'idle' });
        return;
      }
      if (pendingRef.current?.snapshot === snapshot) return;
      if (lastPersistedRef.current?.snapshot === snapshot) {
        cancelPending();
        persistRef.current(data);
        return;
      }
      cancelPending();
      hasActiveDraftRef.current = true;
      updateView({ status: 'saving' });
      if (debounceMsRef.current === 0) {
        persistRef.current(data);
        return;
      }
      pendingRef.current = { snapshot, data };
      const generation = generationRef.current;
      timerRef.current = setTimeout(() => {
        if (generation !== generationRef.current || contextKeyRef.current !== storageKey) return;
        const pending = pendingRef.current;
        timerRef.current = null;
        pendingRef.current = null;
        if (pending && isOpenRef.current) persistRef.current(pending.data);
      }, debounceMsRef.current);
    } catch {
      cancelPending();
      updateView({ status: 'error' });
    }
  }, [storageKey, cancelPending, updateView, removeEmptyDraft]);

  const flush = useCallback((data?: T) => {
    if (contextKeyRef.current !== storageKey) return;
    cancelPending();
    if (isEditingRef.current || suppressSaveRef.current || resumePendingRef.current) return;
    if (data !== undefined) lastDataRef.current = data;
    const latest = lastDataRef.current;
    // Antes de fechar, data ainda representa o formulário visível. Depois do
    // fechamento, um reset vazio não pode apagar o último rascunho válido.
    if (data !== undefined && isOpenRef.current && hasActiveDraftRef.current && !Object.keys(data).some(field => !ignoreKeysRef.current.includes(field) && isMeaningfulValue(data[field as keyof T]))) {
      removeEmptyDraft();
      return;
    }
    if (latest != null) persistRef.current(latest);
  }, [storageKey, cancelPending, removeEmptyDraft]);

  useEffect(() => {
    cancelPending();
    if (!isOpen) {
      // O baseline e a supressão ficam intactos até a próxima abertura, para um
      // flush de fechamento não ressuscitar dados após limpar/descartar.
      flush();
      resumePendingRef.current = false;
      updateView({ showResumePrompt: false });
      return;
    }
    suppressSaveRef.current = false;
    resumePendingRef.current = false;
    initialSnapshotRef.current = null;
    explicitNewDraftRef.current = false;
    hasActiveDraftRef.current = false;
    lastDataRef.current = null;
    lastPersistedRef.current = null;
    updateView({ ...createDraftView<T>(storageKey) });
    if (isEditing) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        if (parsed && typeof parsed === 'object' && meaningful(parsed)) {
          resumePendingRef.current = true;
          updateView({ draftData: parsed, showResumePrompt: true });
          return;
        }
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      updateView({ status: 'error' });
    }
    // Opções de meaningful são lidas por ref; status e novos arrays de ignoreKeys
    // não podem reinicializar a sessão nem mudar a identidade de saveDraft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEditing, storageKey, cancelPending, flush, updateView]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelPending();
      const latest = lastDataRef.current;
      if (latest != null) persistRef.current(latest);
    };
  }, [cancelPending]);

  const clearDraft = useCallback(() => {
    if (contextKeyRef.current !== storageKey) return;
    cancelPending();
    suppressSaveRef.current = true;
    resumePendingRef.current = false;
    lastDataRef.current = null;
    lastPersistedRef.current = null;
    hasActiveDraftRef.current = false;
    let status: FormDraftSaveStatus = 'idle';
    try { sessionStorage.removeItem(storageKey); } catch { status = 'error'; }
    updateView({ draftData: null, showResumePrompt: false, status, savedAt: null });
  }, [storageKey, cancelPending, updateView]);

  const acceptDraft = useCallback(() => {
    if (contextKeyRef.current !== storageKey) return;
    if (resumePendingRef.current) {
      // A restauração já é uma escolha humana. O próximo snapshot completo
      // deve ser escrito (incluindo novos campos), em vez de virar baseline.
      explicitNewDraftRef.current = true;
      hasActiveDraftRef.current = true;
      initialSnapshotRef.current = null;
    }
    resumePendingRef.current = false;
    updateView({ showResumePrompt: false });
  }, [storageKey, updateView]);

  const startNewDraft = useCallback((data?: T) => {
    if (contextKeyRef.current !== storageKey) return;
    cancelPending();
    suppressSaveRef.current = false;
    resumePendingRef.current = false;
    initialSnapshotRef.current = null;
    // data é uma primeira edição humana, não um baseline/default do formulário.
    explicitNewDraftRef.current = data !== undefined;
    lastDataRef.current = data ?? null;
    lastPersistedRef.current = null;
    hasActiveDraftRef.current = data !== undefined;
    let status: FormDraftSaveStatus = 'idle';
    try {
      sessionStorage.removeItem(storageKey);
      if (data !== undefined) initialSnapshotRef.current = JSON.stringify(data);
    } catch { status = 'error'; }
    updateView({ draftData: null, showResumePrompt: false, status, savedAt: null });
    if (data !== undefined && Object.keys(data).some(field => !ignoreKeysRef.current.includes(field) && isMeaningfulValue(data[field as keyof T]))) persistRef.current(data);
  }, [storageKey, cancelPending, updateView]);

  const currentView = view.contextKey === storageKey ? view : createDraftView<T>(storageKey);

  return {
    hasDraft: !!currentView.draftData,
    draftData: currentView.draftData,
    saveDraft,
    flush,
    clearDraft,
    acceptDraft,
    discardDraft: clearDraft,
    startNewDraft,
    showResumePrompt: currentView.showResumePrompt,
    status: currentView.status,
    savedAt: currentView.savedAt,
  };
}

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
  showResumePrompt: boolean;
}

/** Default-like values that don't count as meaningful user input */
function isMeaningfulValue(v: any): boolean {
  if (v === '' || v === null || v === undefined || v === false) return false;
  if (typeof v === 'number' && v === 0) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  // Objeto vazio ({}) é estado default (ex.: Record de configs sem nenhuma
  // entrada) — não conta como preenchimento real do usuário.
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
  return true;
}

export function useFormDraft<T extends Record<string, any>>({
  key,
  isOpen,
  isEditing = false,
  ignoreKeys = [],
}: UseFormDraftOptions<T>): UseFormDraftReturn<T> {
  const storageKey = `form-draft:${key}`;
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [draftData, setDraftData] = useState<T | null>(null);
  const suppressSaveRef = useRef(false);
  const initialSnapshotRef = useRef<string | null>(null);
  // Último dado conhecido do formulário. Alimentado por `saveDraft` (enquanto o
  // modal está aberto) e por `flush(data)` (no caminho de fechar). Serve pro
  // flush do unmount persistir o valor mais recente mesmo quando o drawer mobile
  // desmonta o conteúdo sem passar por um novo render com o estado atualizado.
  const lastDataRef = useRef<T | null>(null);
  // `isEditing`/`ignoreKeys` em refs pra o cleanup de unmount (que roda uma única
  // vez, deps []) e o flush enxergarem o valor corrente sem virarem dependência.
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const ignoreKeysRef = useRef(ignoreKeys);
  ignoreKeysRef.current = ignoreKeys;

  // Check for existing draft when modal opens (only for new records)
  useEffect(() => {
    if (isOpen && !isEditing) {
      suppressSaveRef.current = false;
      initialSnapshotRef.current = null;
      // Sessão nova: zera o "último dado conhecido" (o baseline será registrado
      // pelo 1º saveDraft do formulário recém-aberto).
      lastDataRef.current = null;
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as T;
          const keysToCheck = Object.keys(parsed).filter(k => !ignoreKeys.includes(k));
          const hasData = keysToCheck.some(k => isMeaningfulValue(parsed[k]));
          if (hasData) {
            setDraftData(parsed);
            setShowResumePrompt(true);
            return;
          }
        }
      } catch {
        // ignore
      }
      // No meaningful draft found — clear it
      sessionStorage.removeItem(storageKey);
      setDraftData(null);
      setShowResumePrompt(false);
    }

    if (!isOpen) {
      setShowResumePrompt(false);
      suppressSaveRef.current = false;
      initialSnapshotRef.current = null;
    }
  }, [isOpen, isEditing, storageKey]);

  // Grava um snapshot sem passar pelo baseline. Usado pelo FLUSH (fechar/unmount):
  // só persiste se o dado tem ALGUM campo com preenchimento REAL do usuário (mesma
  // régua do `isMeaningfulValue` + `ignoreKeys` da detecção de rascunho na
  // abertura). Assim o flush é robusto à ordem dos efeitos — não depende do
  // baseline (que o efeito de `!isOpen` zera ao fechar) — e nunca grava o estado
  // inicial vazio por cima de um rascunho bom.
  const persistIfMeaningful = (data: T): void => {
    if (isEditingRef.current || suppressSaveRef.current) return;
    const keysToCheck = Object.keys(data).filter(k => !ignoreKeysRef.current.includes(k));
    const hasData = keysToCheck.some(k => isMeaningfulValue(data[k]));
    if (!hasData) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // storage full or unavailable
    }
  };
  // `persistIfMeaningful` é recriado a cada render (fecha sobre `storageKey`);
  // guardado num ref pra o cleanup de unmount (deps []) chamar sempre a versão atual.
  const persistRef = useRef(persistIfMeaningful);
  persistRef.current = persistIfMeaningful;

  const saveDraft = useCallback((data: T) => {
    if (isEditing || suppressSaveRef.current) return;

    // Mantém o "último dado conhecido" fresco pro flush do fechar/unmount.
    lastDataRef.current = data;

    // Capture initial snapshot on first save call to compare later
    const snapshot = JSON.stringify(data);
    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = snapshot;
      // Don't save the initial/default state
      return;
    }

    // Only save if data has changed from the initial snapshot
    if (snapshot === initialSnapshotRef.current) return;

    try {
      sessionStorage.setItem(storageKey, snapshot);
    } catch {
      // storage full or unavailable
    }
  }, [storageKey, isEditing]);

  // Persiste sincronamente o último dado conhecido (respeitando a régua de
  // preenchimento real). Chamar no caminho de FECHAR (com o snapshot atual) e/ou
  // no unmount — garante que o último valor digitado sobreviva mesmo quando o
  // efeito de save gated em `isOpen` já rodou com `isOpen=false` (race do drawer).
  const flush = useCallback((data?: T) => {
    if (data !== undefined) lastDataRef.current = data;
    const latest = lastDataRef.current;
    if (latest == null) return;
    persistRef.current(latest);
  }, []);

  // Rede de segurança do MOBILE: o drawer vaul desmonta o conteúdo ao fechar. Se
  // um caminho de fechar não chamou `flush` (ex.: unmount abrupto), o cleanup
  // persiste o último dado conhecido antes de sumir.
  useEffect(() => {
    return () => {
      const latest = lastDataRef.current;
      if (latest != null) persistRef.current(latest);
    };
    // Cleanup-only: roda só no unmount. `persistRef`/`lastDataRef` são refs estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setDraftData(null);
    setShowResumePrompt(false);
    suppressSaveRef.current = true;
    // Descarta o último dado conhecido pra o flush do unmount não ressuscitar o
    // rascunho já limpo (ex.: após criar o contrato com sucesso).
    lastDataRef.current = null;
  }, [storageKey]);

  const acceptDraft = useCallback(() => {
    setShowResumePrompt(false);
  }, []);

  const discardDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setDraftData(null);
    setShowResumePrompt(false);
    // Prevent saving default values after discard until modal reopens
    suppressSaveRef.current = true;
    lastDataRef.current = null;
  }, [storageKey]);

  return {
    hasDraft: !!draftData,
    draftData,
    saveDraft,
    flush,
    clearDraft,
    acceptDraft,
    discardDraft,
    showResumePrompt,
  };
}

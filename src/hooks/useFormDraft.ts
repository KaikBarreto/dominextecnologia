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

interface UseFormDraftReturn<T> {
  hasDraft: boolean;
  draftData: T | null;
  saveDraft: (data: T) => void;
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

  // Check for existing draft when modal opens (only for new records)
  useEffect(() => {
    if (isOpen && !isEditing) {
      suppressSaveRef.current = false;
      initialSnapshotRef.current = null;
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

  const saveDraft = useCallback((data: T) => {
    if (isEditing || suppressSaveRef.current) return;

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

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setDraftData(null);
    setShowResumePrompt(false);
    suppressSaveRef.current = true;
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
  }, [storageKey]);

  return {
    hasDraft: !!draftData,
    draftData,
    saveDraft,
    clearDraft,
    acceptDraft,
    discardDraft,
    showResumePrompt,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFormDraftOptions<T> {
  /** Unique key per form type, e.g. 'customer-form', 'employee-form' */
  key: string;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Whether we're editing an existing record (drafts only for new records) */
  isEditing?: boolean;
}

interface UseFormDraftReturn<T> {
  /** Whether a draft was found when the modal opened */
  hasDraft: boolean;
  /** The draft data (if found) */
  draftData: T | null;
  /** Call to save current form state as draft */
  saveDraft: (data: T) => void;
  /** Call to clear the draft (after submit or "start fresh") */
  clearDraft: () => void;
  /** Call when user chooses to resume the draft */
  acceptDraft: () => void;
  /** Call when user chooses to discard the draft */
  discardDraft: () => void;
  /** Whether the resume prompt should be shown */
  showResumePrompt: boolean;
}

export function useFormDraft<T extends Record<string, any>>({
  key,
  isOpen,
  isEditing = false,
}: UseFormDraftOptions<T>): UseFormDraftReturn<T> {
  const storageKey = `form-draft:${key}`;
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [draftData, setDraftData] = useState<T | null>(null);
  const checkedRef = useRef(false);

  // Check for existing draft when modal opens (only for new records)
  useEffect(() => {
    if (isOpen && !isEditing) {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as T;
          // Check if there's meaningful data (at least one non-empty value)
          const hasData = Object.values(parsed).some(v => 
            v !== '' && v !== null && v !== undefined && v !== 0 && v !== false &&
            !(Array.isArray(v) && v.length === 0)
          );
          if (hasData) {
            setDraftData(parsed);
            setShowResumePrompt(true);
            checkedRef.current = true;
            return;
          }
        }
      } catch {
        // ignore parse errors
      }
      setDraftData(null);
      setShowResumePrompt(false);
      checkedRef.current = true;
    }

    if (!isOpen) {
      checkedRef.current = false;
      setShowResumePrompt(false);
    }
  }, [isOpen, isEditing, storageKey]);

  const saveDraft = useCallback((data: T) => {
    if (isEditing) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // storage full or unavailable
    }
  }, [storageKey, isEditing]);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setDraftData(null);
    setShowResumePrompt(false);
  }, [storageKey]);

  const acceptDraft = useCallback(() => {
    setShowResumePrompt(false);
  }, []);

  const discardDraft = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setDraftData(null);
    setShowResumePrompt(false);
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

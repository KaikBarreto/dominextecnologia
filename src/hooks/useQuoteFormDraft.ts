import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useFormDraft, type UseFormDraftReturn } from '@/hooks/useFormDraft';
import {
  QuoteFormDraftController, emptyQuoteDraftView, type DraftReply,
  type QuoteDraftPersistence, type QuoteDraftSyncIssue, type QuoteDraftView,
} from '@/lib/quotes/quote-form-draft';

interface Options {
  key: string; isOpen: boolean; isEditing?: boolean; ignoreKeys?: string[]; debounceMs?: number;
  companyId?: string | null; userId?: string | null;
}
export interface UseQuoteFormDraftReturn<T> extends Omit<UseFormDraftReturn<T>, 'flush' | 'clearDraft' | 'discardDraft'> {
  flush: (data?: T) => Promise<void> | void;
  clearDraft: () => Promise<void> | void;
  discardDraft: () => Promise<void> | void;
  persistence: QuoteDraftPersistence;
  expiresAt: number | null;
  isLoading: boolean;
  syncIssue: QuoteDraftSyncIssue;
  retry: () => void;
}

/** Personal cross-device draft; the quote itself is written only on explicit submit. */
export function useQuoteFormDraft<T extends object>(options: Options): UseQuoteFormDraftReturn<T> {
  const { key, isOpen, isEditing = false, companyId, userId } = options;
  const cloud = !!companyId && !!userId;
  const scope = cloud ? `${companyId}:${userId}` : null;
  const optionsRef = useRef(options); optionsRef.current = options;
  const mounted = useRef(true);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const [state, setState] = useState<{ scope: string | null; view: QuoteDraftView<T> }>({ scope, view: emptyQuoteDraftView<T>() });
  const controllerRef = useRef<{ scope: string; controller: QuoteFormDraftController<T> } | null>(null);
  if (controllerRef.current?.scope !== scope) {
    controllerRef.current?.controller.stop();
    controllerRef.current = scope && companyId && userId ? {
      scope,
      controller: new QuoteFormDraftController<T>({
        storageKey: `quote-form-draft:v1:${scope}`,
        storage: {
          getItem: storageKey => localStorage.getItem(storageKey),
          setItem: (storageKey, value) => localStorage.setItem(storageKey, value),
          removeItem: storageKey => localStorage.removeItem(storageKey),
        },
        legacyRead: () => {
          // Importa somente a sessão antiga cuja chave declara as duas identidades.
          if (key !== `quote-form:${companyId}:${userId}`) return null;
          try {
            const raw = sessionStorage.getItem(`form-draft:${key}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
            return parsed as T;
          } catch { return null; }
        },
        legacyClear: () => { try { sessionStorage.removeItem(`form-draft:${key}`); } catch { /* best effort */ } },
        ignoreKeys: () => optionsRef.current.ignoreKeys ?? [],
        debounceMs: () => optionsRef.current.debounceMs ?? 700,
        changed: view => { if (mounted.current && scopeRef.current === scope) setState({ scope, view }); },
        read: async () => {
          const abort = new AbortController();
          const timer = setTimeout(() => abort.abort(), 10000);
          try {
            const { data, error } = await supabase.rpc('get_quote_form_draft', { p_company_id: companyId, p_user_id: userId }).abortSignal(abort.signal);
            return { data: data as unknown as DraftReply | null, error };
          } finally { clearTimeout(timer); }
        },
        write: async (payload, revision, requestId) => {
          const abort = new AbortController();
          const timer = setTimeout(() => abort.abort(), 10000);
          try {
          const { data, error } = await supabase.rpc('save_quote_form_draft', {
            p_company_id: companyId, p_user_id: userId,
            p_payload: payload as unknown as Json, p_expected_revision: revision, p_request_id: requestId,
          }).abortSignal(abort.signal);
          return { data: data as unknown as DraftReply | null, error };
          } finally { clearTimeout(timer); }
        },
      }),
    } : null;
  }
  const controller = controllerRef.current?.controller;
  // Mantém o contrato dos testes e dos contextos ainda sem identidade autenticada.
  // O hook legado fica desativado quando existe escopo de conta.
  const local = useFormDraft<T>({ key, isOpen: isOpen && !cloud, isEditing: isEditing || cloud,
    ignoreKeys: options.ignoreKeys, debounceMs: options.debounceMs });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!controller) return;
    if (isOpen && !isEditing) controller.activate();
    else void controller.close();
    return () => { void controller.close(); };
  }, [controller, isOpen, isEditing]);
  useEffect(() => {
    if (!controller || !isOpen || isEditing) return;
    const online = () => { if (controller.view.syncIssue === 'unavailable') controller.retry(); };
    const hidden = () => { if (document.visibilityState === 'hidden') void controller.flush(); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('online', online); document.removeEventListener('visibilitychange', hidden); };
  }, [controller, isOpen, isEditing]);
  const saveDraft = useCallback((data: T) => { if (!optionsRef.current.isEditing && controllerRef.current?.controller === controller) controller?.save(data); }, [controller]);
  const flush = useCallback((data?: T) => { if (!optionsRef.current.isEditing && controllerRef.current?.controller === controller) return controller?.flush(data); }, [controller]);
  const clearDraft = useCallback(() => { if (!optionsRef.current.isEditing && controllerRef.current?.controller === controller) return controller?.clear(); }, [controller]);
  const acceptDraft = useCallback(() => { if (!optionsRef.current.isEditing && controllerRef.current?.controller === controller) controller?.accept(); }, [controller]);
  const startNewDraft = useCallback((data?: T) => { if (!optionsRef.current.isEditing && controllerRef.current?.controller === controller) controller?.startNew(data); }, [controller]);
  const retry = useCallback(() => { if (!optionsRef.current.isEditing && controllerRef.current?.controller === controller) controller?.retry(); }, [controller]);
  if (!cloud) return { ...local, persistence: 'local', expiresAt: null, isLoading: false, syncIssue: null, retry };
  const view = state.scope === scope ? state.view : emptyQuoteDraftView<T>();
  return { ...view, hasDraft: !!view.draftData, saveDraft, flush, clearDraft, discardDraft: clearDraft, acceptDraft, startNewDraft, retry };
}

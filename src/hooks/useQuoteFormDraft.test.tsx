import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuoteFormDraft } from './useQuoteFormDraft';
import { QUOTE_DRAFT_TTL_MS } from '@/lib/quotes/quote-form-draft';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
const COMPANY = '22222222-2222-4222-8222-222222222222';
const USER = '11111111-1111-4111-8111-111111111111';
const options = { key: `quote-form:${COMPANY}:${USER}`, isOpen: true, companyId: COMPANY, userId: USER, debounceMs: 0 };
const empty = { notes: '', items: [] };
const filled = { notes: 'Dados fictícios', items: [{ price: 120 }] };
let server: { payload?: unknown; revision: number; updated_at: string | null; expires_at: string | null };
let requests: { name: string; args: Record<string, unknown>; signal: AbortSignal }[];
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); requests = [];
  server = { payload: null, revision: 0, updated_at: null, expires_at: null };
  rpc.mockReset();
  rpc.mockImplementation((name: string, args: Record<string, unknown>) => ({ abortSignal: async (signal: AbortSignal) => {
    requests.push({ name, args, signal });
    if (name === 'get_quote_form_draft') return { data: { ...server }, error: null };
    if (args.p_expected_revision !== server.revision) return { data: null, error: { code: '40001' } };
    server = { payload: args.p_payload, revision: server.revision + 1, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + QUOTE_DRAFT_TTL_MS).toISOString() };
    return { data: { ...server }, error: null };
  } }));
});
describe('useQuoteFormDraft integration', () => {
  it('hydrates before saving and asserts both authenticated identities on every request', async () => {
    const { result } = renderHook(() => useQuoteFormDraft<typeof filled>(options));
    expect(result.current.isLoading).toBe(true);
    act(() => result.current.saveDraft(empty));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.saveDraft(filled)); await act(() => result.current.flush());
    expect(result.current.persistence).toBe('account'); expect(server.payload).toEqual(filled);
    for (const request of requests) { expect(request.args).toMatchObject({ p_company_id: COMPANY, p_user_id: USER }); expect(request.signal).toBeInstanceOf(AbortSignal); }
  });
  it('offers remote recovery on a new browser without local backup', async () => {
    server = { payload: filled, revision: 7, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + QUOTE_DRAFT_TTL_MS).toISOString() };
    const { result } = renderHook(() => useQuoteFormDraft(options));
    await waitFor(() => expect(result.current.showResumePrompt).toBe(true));
    expect(result.current.draftData).toEqual(filled); expect(result.current.expiresAt).toBeGreaterThan(Date.now());
    expect(requests.filter(r => r.name === 'save_quote_form_draft')).toHaveLength(0);
  });
  it('awaits server discard before reporting completion', async () => {
    const { result } = renderHook(() => useQuoteFormDraft<typeof filled>(options));
    act(() => result.current.saveDraft(empty)); await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.saveDraft(filled)); await act(() => result.current.flush());
    await act(() => result.current.clearDraft()); expect(server.payload).toBeNull(); expect(result.current.status).toBe('idle');
  });
  it('fallback without authenticated IDs retains legacy session-only behavior', () => {
    const { result } = renderHook(() => useQuoteFormDraft<typeof filled>({ key: 'quote-form', isOpen: true, debounceMs: 0 }));
    act(() => result.current.saveDraft(empty)); act(() => result.current.saveDraft(filled));
    expect(result.current.persistence).toBe('local'); expect(result.current.isLoading).toBe(false);
    expect(JSON.parse(sessionStorage.getItem('form-draft:quote-form')!)).toEqual(filled); expect(rpc).not.toHaveBeenCalled();
  });
  it('does not autosave while editing an already persisted quote', async () => {
    const { result } = renderHook(() => useQuoteFormDraft<typeof filled>({ ...options, isEditing: true }));
    act(() => result.current.saveDraft(empty)); act(() => result.current.saveDraft(filled)); await act(() => result.current.flush());
    expect(rpc).not.toHaveBeenCalled();
  });
  it('flushes pending changes on abrupt mobile unmount', async () => {
    const { result, unmount } = renderHook(() => useQuoteFormDraft<typeof filled>({ ...options, debounceMs: 3000 }));
    act(() => result.current.saveDraft(empty)); await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.saveDraft(filled)); unmount(); await waitFor(() => expect(server.payload).toEqual(filled));
  });
  it('changes account key without exposing the prior account draft', async () => {
    server = { payload: filled, revision: 7, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + QUOTE_DRAFT_TTL_MS).toISOString() };
    const { result, rerender } = renderHook(({ userId }) => useQuoteFormDraft({ ...options, userId }), { initialProps: { userId: USER } });
    await waitFor(() => expect(result.current.draftData).toEqual(filled));
    server = { payload: null, revision: 0, updated_at: null, expires_at: null };
    rerender({ userId: '33333333-3333-4333-8333-333333333333' });
    expect(result.current.draftData).toBeNull(); await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.draftData).toBeNull();
  });
  it('editing another persisted quote cannot clear the personal creation draft', async () => {
    const { result, rerender } = renderHook(({ isOpen, isEditing }) => useQuoteFormDraft<typeof filled>({ ...options, isOpen, isEditing }), { initialProps: { isOpen: true, isEditing: false } });
    act(() => result.current.saveDraft(empty)); await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.saveDraft(filled)); await act(() => result.current.flush());
    rerender({ isOpen: false, isEditing: false }); rerender({ isOpen: true, isEditing: true });
    await act(() => result.current.clearDraft()); act(() => result.current.startNewDraft());
    expect(server.payload).toEqual(filled);
    expect(requests.filter(r => r.name === 'save_quote_form_draft')).toHaveLength(1);
  });

});

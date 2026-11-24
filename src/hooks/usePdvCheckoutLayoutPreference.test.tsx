import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdvCheckoutLayoutPreference } from './usePdvCheckoutLayoutPreference';

const identity = vi.hoisted(() => ({ user: { id: 'operator-1' } as { id: string } | null, profile: { company_id: 'company-1' } as { company_id: string } | null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => identity }));

describe('apresentação do recebimento por usuário e empresa', () => {
  beforeEach(() => { localStorage.clear(); identity.user = { id: 'operator-1' }; identity.profile = { company_id: 'company-1' }; });
  it('começa compacto e lembra a escolha nos próximos recebimentos', () => {
    const first = renderHook(() => usePdvCheckoutLayoutPreference());
    expect(first.result.current.expanded).toBe(false);
    act(() => first.result.current.setExpanded(true));
    expect(first.result.current.expanded).toBe(true);
    first.unmount();
    const next = renderHook(() => usePdvCheckoutLayoutPreference());
    expect(next.result.current.expanded).toBe(true);
    act(() => next.result.current.setExpanded(false));
    expect(localStorage.getItem('pdv:checkout-layout:company-1:operator-1')).toBe('compact');
  });
  it('não aplica preferência de outro usuário ou empresa ao trocar a sessão', () => {
    const hook = renderHook(() => usePdvCheckoutLayoutPreference());
    act(() => hook.result.current.setExpanded(true));
    identity.user = { id: 'operator-2' }; hook.rerender();
    expect(hook.result.current.expanded).toBe(false);
    identity.user = { id: 'operator-1' }; identity.profile = { company_id: 'company-2' }; hook.rerender();
    expect(hook.result.current.expanded).toBe(false);
    identity.profile = { company_id: 'company-1' }; hook.rerender();
    expect(hook.result.current.expanded).toBe(true);
  });
  it('sem identidade confirmada não salva preferências', () => {
    identity.user = null; identity.profile = null;
    const hook = renderHook(() => usePdvCheckoutLayoutPreference());
    act(() => hook.result.current.setExpanded(true));
    expect(hook.result.current.expanded).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AuthState = {
  admin: boolean;
  permissions: string[];
  screens: string[];
};

let authState: AuthState;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdminOrGestor: () => authState.admin,
    hasPermission: (key: string) => authState.permissions.includes(key),
    hasScreenAccess: (key: string) => authState.screens.includes(key),
  }),
}));

import { useBankPermissions } from './useBankPermissions';

describe('useBankPermissions', () => {
  beforeEach(() => {
    authState = { admin: false, permissions: [], screens: [] };
  });

  it('permite uso operacional para quem acessa o Financeiro sem liberar gestão', () => {
    authState.screens = ['screen:finance'];

    const { result } = renderHook(() => useBankPermissions());

    expect(result.current).toEqual({
      canUseBankAccounts: true,
      canManageBankAccounts: false,
    });
  });

  it('permite uso operacional para quem gerencia lançamentos', () => {
    authState.permissions = ['fn:manage_finance'];

    const { result } = renderHook(() => useBankPermissions());

    expect(result.current.canUseBankAccounts).toBe(true);
    expect(result.current.canManageBankAccounts).toBe(false);
  });

  it('preserva gestão para quem visualiza totais financeiros', () => {
    authState.permissions = ['fn:view_finance_totals'];

    const { result } = renderHook(() => useBankPermissions());

    expect(result.current.canManageBankAccounts).toBe(true);
    expect(result.current.canUseBankAccounts).toBe(true);
  });

  it('mantém bloqueado quem não possui acesso relacionado', () => {
    authState.permissions = ['fn:create_customer'];

    const { result } = renderHook(() => useBankPermissions());

    expect(result.current).toEqual({
      canUseBankAccounts: false,
      canManageBankAccounts: false,
    });
  });
});

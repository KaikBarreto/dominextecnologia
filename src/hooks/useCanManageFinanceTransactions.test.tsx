import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let adminOrManager = false;
let hasPermissionRecord = true;
let permissions: string[] = [];

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdminOrGestor: () => adminOrManager,
    hasPermissionRecord,
    hasPermission: (key: string) => permissions.includes('*') || permissions.includes(key),
  }),
}));

import { useCanManageFinanceTransactions } from './useCanManageFinanceTransactions';

describe('useCanManageFinanceTransactions', () => {
  beforeEach(() => {
    adminOrManager = false;
    hasPermissionRecord = true;
    permissions = [];
  });

  it('libera admin e gestor', () => {
    adminOrManager = true;
    expect(renderHook(() => useCanManageFinanceTransactions()).result.current).toBe(true);
  });

  it('libera a permissão específica e o acesso total', () => {
    permissions = ['fn:manage_finance'];
    expect(renderHook(() => useCanManageFinanceTransactions()).result.current).toBe(true);

    permissions = ['*'];
    expect(renderHook(() => useCanManageFinanceTransactions()).result.current).toBe(true);
  });

  it('não confunde acesso à tela com autorização para alterar dinheiro', () => {
    permissions = ['screen:finance', 'fn:use_bank_accounts'];
    expect(renderHook(() => useCanManageFinanceTransactions()).result.current).toBe(false);
  });

  it('falha fechado para usuário legado sem registro explícito', () => {
    hasPermissionRecord = false;
    permissions = ['fn:manage_finance'];
    expect(renderHook(() => useCanManageFinanceTransactions()).result.current).toBe(false);
  });
});

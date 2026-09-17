import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Régua do gate da receita da oportunidade ganha (`fn:manage_finance`).
 *
 * Gêmeo de useCanLaunchOsRevenue.test.ts, e pelo mesmo motivo: quem tem papel
 * mas NENHUMA linha em `user_permissions` recebe `true` de
 * `AuthContext.hasPermission` pra qualquer chave (a função termina em
 * `roles.length > 0`). Se este gate fosse só `hasPermission('fn:manage_finance')`,
 * o vendedor legado ganharia sozinho, no deploy, uma porta pro Financeiro.
 *
 * Se alguém "simplificar" o hook tirando o `hasPermissionRecord`, o caso
 * "legado sem registro" vira `true` e quebra aqui.
 */

const authState = {
  roles: [] as string[],
  permissions: [] as string[],
  hasPermissionRecord: false,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    ...authState,
    isAdminOrGestor: () =>
      authState.roles.includes('admin') || authState.roles.includes('gestor'),
    hasPermission: (key: string) => {
      if (authState.roles.includes('admin')) return true;
      if (authState.hasPermissionRecord) {
        return authState.permissions.includes('*') || authState.permissions.includes(key);
      }
      return authState.roles.length > 0;
    },
  }),
}));

import { useCanLaunchLeadRevenue } from './useCanLaunchLeadRevenue';

function setAuth(next: Partial<typeof authState>) {
  authState.roles = next.roles ?? [];
  authState.permissions = next.permissions ?? [];
  authState.hasPermissionRecord = next.hasPermissionRecord ?? false;
}

// Chamado direto, sem renderHook: o gate não usa NENHUM hook do React por
// dentro (só lê o contexto, que aqui está mockado como função pura). Evita
// depender de @testing-library/dom, que não está instalado neste projeto.
const canLaunch = () => useCanLaunchLeadRevenue();

describe('useCanLaunchLeadRevenue', () => {
  beforeEach(() => setAuth({}));

  it('libera admin (acesso total por papel)', () => {
    setAuth({ roles: ['admin'] });
    expect(canLaunch()).toBe(true);
  });

  it('libera gestor', () => {
    setAuth({ roles: ['gestor'] });
    expect(canLaunch()).toBe(true);
  });

  it('libera o curinga "*" (Acesso Total)', () => {
    setAuth({ roles: ['vendedor'], permissions: ['*'], hasPermissionRecord: true });
    expect(canLaunch()).toBe(true);
  });

  it('libera quem tem fn:manage_finance marcada', () => {
    setAuth({
      roles: ['vendedor'],
      permissions: ['screen:crm', 'fn:manage_finance'],
      hasPermissionRecord: true,
    });
    expect(canLaunch()).toBe(true);
  });

  it('barra quem tem registro sem a chave', () => {
    setAuth({ roles: ['vendedor'], permissions: ['screen:crm'], hasPermissionRecord: true });
    expect(canLaunch()).toBe(false);
  });

  it('barra o legado: papel sim, registro em user_permissions não', () => {
    setAuth({ roles: ['vendedor'], permissions: [], hasPermissionRecord: false });
    expect(canLaunch()).toBe(false);
  });

  it('barra registro vazio (permissionado explicitamente com nada)', () => {
    setAuth({ roles: ['vendedor'], permissions: [], hasPermissionRecord: true });
    expect(canLaunch()).toBe(false);
  });
});

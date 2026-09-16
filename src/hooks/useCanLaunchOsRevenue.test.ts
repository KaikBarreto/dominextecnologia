import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Régua do gate "Lançar Receita ao Finalizar OS" (`fn:os_finish_revenue`).
 *
 * O caso que dá nome a este arquivo é o do **usuário legado**: quem tem papel
 * mas NENHUMA linha em `user_permissions` recebe `true` de
 * `AuthContext.hasPermission` pra qualquer chave (a função termina em
 * `roles.length > 0`). Medição em produção de 11/09/2026: 88 profiles, 50 sem
 * linha, 11 deles não-admin. Se o gate desta feature usasse `hasPermission`,
 * esses 11 — técnicos inclusive — ganhariam a tela financeira sozinhos no
 * deploy.
 *
 * Este teste existe pra travar isso: se alguém "simplificar" o hook trocando a
 * leitura do array por `hasPermission('fn:os_finish_revenue')`, o caso
 * "legado sem registro" vira `true` e quebra aqui.
 */

const authState = {
  roles: [] as string[],
  permissions: [] as string[],
  hasPermissionRecord: false,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { useCanLaunchOsRevenue } from './useCanLaunchOsRevenue';

function setAuth(next: Partial<typeof authState>) {
  authState.roles = next.roles ?? [];
  authState.permissions = next.permissions ?? [];
  authState.hasPermissionRecord = next.hasPermissionRecord ?? false;
}

// Chamado direto, sem renderHook: o gate não usa NENHUM hook do React por
// dentro (só lê o contexto, que aqui está mockado como função pura). Evita
// depender de @testing-library/dom, que não está instalado neste projeto.
const canLaunch = () => useCanLaunchOsRevenue();

describe('useCanLaunchOsRevenue', () => {
  beforeEach(() => setAuth({}));

  it('libera admin (acesso total por papel)', () => {
    setAuth({ roles: ['admin'] });
    expect(canLaunch()).toBe(true);
  });

  it('libera super_admin', () => {
    setAuth({ roles: ['super_admin'] });
    expect(canLaunch()).toBe(true);
  });

  it('libera o curinga "*" (Acesso Total)', () => {
    setAuth({ roles: ['tecnico'], permissions: ['*'], hasPermissionRecord: true });
    expect(canLaunch()).toBe(true);
  });

  it('libera quem tem a chave marcada', () => {
    setAuth({
      roles: ['tecnico'],
      permissions: ['screen:service_orders', 'fn:os_finish_revenue'],
      hasPermissionRecord: true,
    });
    expect(canLaunch()).toBe(true);
  });

  it('BARRA quem tem registro mas não tem a chave', () => {
    setAuth({
      roles: ['tecnico'],
      permissions: ['screen:service_orders', 'fn:edit_os'],
      hasPermissionRecord: true,
    });
    expect(canLaunch()).toBe(false);
  });

  it('BARRA usuário legado: tem papel, mas NENHUMA linha em user_permissions', () => {
    // O furo do default-allow. `hasPermission` devolveria true aqui.
    setAuth({ roles: ['tecnico'], permissions: [], hasPermissionRecord: false });
    expect(canLaunch()).toBe(false);
  });

  it('BARRA quem tem registro vazio (configurado sem nenhuma permissão)', () => {
    setAuth({ roles: ['tecnico'], permissions: [], hasPermissionRecord: true });
    expect(canLaunch()).toBe(false);
  });

  it('não confunde a chave com outra do mesmo prefixo', () => {
    setAuth({
      roles: ['tecnico'],
      permissions: ['fn:os_finish_revenue_extra'],
      hasPermissionRecord: true,
    });
    expect(canLaunch()).toBe(false);
  });
});

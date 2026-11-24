import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock },
}));

vi.mock('@/lib/sessionUtils', () => ({
  generateSessionToken: () => 'new-session-token',
  getDeviceInfo: () => 'Desktop - Teste',
}));

import {
  PostLoginTimeoutError,
  bootstrapPostLoginSession,
  hasSystemAccess,
  resolvePostLoginRedirect,
  withPostLoginTimeout,
} from './postLogin';

type QueryResult = { data: unknown; error: Error | null };

function query(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    'select',
    'insert',
    'delete',
    'eq',
    'neq',
    'gte',
    'order',
    'limit',
    'maybeSingle',
  ]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe('postLogin', () => {
  beforeEach(() => {
    fromMock.mockReset();
    localStorage.clear();
  });

  it('resolve roles e perfil em paralelo e envia super_admin ao painel master', async () => {
    const roleQuery = query({ data: [{ role: 'super_admin' }], error: null });
    const profileQuery = query({ data: { company_id: null }, error: null });
    const permissionsQuery = query({ data: null, error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return roleQuery;
      if (table === 'profiles') return profileQuery;
      if (table === 'user_permissions') return permissionsQuery;
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(resolvePostLoginRedirect('user-1')).resolves.toBe('/admin/empresas');
    expect(fromMock).toHaveBeenCalledWith('user_roles');
    expect(fromMock).toHaveBeenCalledWith('profiles');
  });

  it('libera usuário interno sem papel quando empresa, perfil e permissões estão ativos', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return query({ data: [], error: null });
      if (table === 'profiles') {
        return query({ data: { company_id: 'company-1', is_active: true }, error: null });
      }
      if (table === 'user_permissions') return query({ data: { is_active: true }, error: null });
      if (table === 'companies') {
        return query({
          data: { subscription_status: 'active', payment_lock_bypass: false },
          error: null,
        });
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(resolvePostLoginRedirect('interno-sem-role')).resolves.toBe('/dashboard');
    await expect(hasSystemAccess('interno-sem-role')).resolves.toBe(true);
  });

  it('falha fechado quando o usuário não possui papel nem permissões explícitas', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return query({ data: [], error: null });
      if (table === 'profiles') {
        return query({ data: { company_id: 'company-1', is_active: true }, error: null });
      }
      if (table === 'user_permissions') return query({ data: null, error: null });
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(resolvePostLoginRedirect('sem-role')).rejects.toThrow(
      'Authenticated user has no active system access',
    );
  });

  it.each([
    ['permissões inativas', { company_id: 'company-1', is_active: true }, { is_active: false }],
    ['perfil inativo', { company_id: 'company-1', is_active: false }, { is_active: true }],
    ['perfil sem empresa', { company_id: null, is_active: true }, { is_active: true }],
  ])('nega usuário sem papel com %s', async (_label, profile, permissionRecord) => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return query({ data: [], error: null });
      if (table === 'profiles') return query({ data: profile, error: null });
      if (table === 'user_permissions') return query({ data: permissionRecord, error: null });
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(hasSystemAccess('acesso-invalido')).resolves.toBe(false);
    await expect(resolvePostLoginRedirect('acesso-invalido')).rejects.toThrow(
      'Authenticated user has no active system access',
    );
  });

  it('nega acesso quando qualquer consulta de vínculo falha', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return query({ data: [], error: new Error('query indisponível') });
      if (table === 'profiles') {
        return query({ data: { company_id: 'company-1', is_active: true }, error: null });
      }
      if (table === 'user_permissions') return query({ data: { is_active: true }, error: null });
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(hasSystemAccess('erro-query')).resolves.toBe(false);
    await expect(resolvePostLoginRedirect('erro-query')).rejects.toThrow('query indisponível');
  });

  it('mantém o bloqueio de pagamento quando não há bypass', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return query({ data: [{ role: 'admin' }], error: null });
      if (table === 'profiles') return query({ data: { company_id: 'company-1', is_active: true }, error: null });
      if (table === 'user_permissions') return query({ data: null, error: null });
      if (table === 'companies') {
        return query({
          data: { subscription_status: 'pending_payment', payment_lock_bypass: false },
          error: null,
        });
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(resolvePostLoginRedirect('user-1')).resolves.toBe('/checkout');
  });

  it('interrompe uma etapa que ultrapassa o teto configurado', async () => {
    vi.useFakeTimers();
    const pending = withPostLoginTimeout(new Promise<never>(() => undefined), 'teste', 50);
    const expectation = expect(pending).rejects.toEqual(new PostLoginTimeoutError('teste'));
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
    vi.useRealTimers();
  });

  it('desconecta outras sessões somente depois de registrar a sessão atual', async () => {
    const insertQuery = query({ data: null, error: null });
    const disconnectQuery = query({ data: null, error: null });
    const roleQuery = query({ data: [{ role: 'super_admin' }], error: null });
    const profileQuery = query({ data: { company_id: null }, error: null });
    const permissionsQuery = query({ data: null, error: null });
    let activeSessionsCalls = 0;

    fromMock.mockImplementation((table: string) => {
      if (table === 'active_sessions') {
        activeSessionsCalls += 1;
        return activeSessionsCalls === 1 ? insertQuery : disconnectQuery;
      }
      if (table === 'user_roles') return roleQuery;
      if (table === 'profiles') return profileQuery;
      if (table === 'user_permissions') return permissionsQuery;
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(
      bootstrapPostLoginSession('user-1', { disconnectOthers: true }),
    ).resolves.toEqual({
      destination: '/admin/empresas',
      sessionToken: 'new-session-token',
    });
    expect(localStorage.getItem('session_token')).toBe('new-session-token');
    expect(disconnectQuery.neq).toHaveBeenCalledWith(
      'session_token',
      'new-session-token',
    );
  });

  it('remove a sessão recém-criada quando desconectar as demais falha', async () => {
    const insertQuery = query({ data: null, error: null });
    const disconnectError = new Error('falha ao desconectar');
    const disconnectQuery = query({ data: null, error: disconnectError });
    const rollbackQuery = query({ data: null, error: null });
    const roleQuery = query({ data: [{ role: 'super_admin' }], error: null });
    const profileQuery = query({ data: { company_id: null }, error: null });
    const permissionsQuery = query({ data: null, error: null });
    let activeSessionsCalls = 0;

    fromMock.mockImplementation((table: string) => {
      if (table === 'active_sessions') {
        activeSessionsCalls += 1;
        if (activeSessionsCalls === 1) return insertQuery;
        if (activeSessionsCalls === 2) return disconnectQuery;
        return rollbackQuery;
      }
      if (table === 'user_roles') return roleQuery;
      if (table === 'profiles') return profileQuery;
      if (table === 'user_permissions') return permissionsQuery;
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(
      bootstrapPostLoginSession('user-1', { disconnectOthers: true }),
    ).rejects.toBe(disconnectError);
    expect(localStorage.getItem('session_token')).toBeNull();
    expect(rollbackQuery.eq).toHaveBeenCalledWith(
      'session_token',
      'new-session-token',
    );
  });
});

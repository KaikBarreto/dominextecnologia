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
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return roleQuery;
      if (table === 'profiles') return profileQuery;
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(resolvePostLoginRedirect('user-1')).resolves.toBe('/admin/empresas');
    expect(fromMock).toHaveBeenCalledWith('user_roles');
    expect(fromMock).toHaveBeenCalledWith('profiles');
  });

  it('falha fechado quando o usuário autenticado não possui papel', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return query({ data: [], error: null });
      if (table === 'profiles') return query({ data: { company_id: null }, error: null });
      throw new Error(`Tabela inesperada: ${table}`);
    });

    await expect(resolvePostLoginRedirect('sem-role')).rejects.toThrow(
      'Authenticated user has no system role',
    );
  });

  it('mantém o bloqueio de pagamento quando não há bypass', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_roles') return query({ data: [{ role: 'admin' }], error: null });
      if (table === 'profiles') return query({ data: { company_id: 'company-1' }, error: null });
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
    let activeSessionsCalls = 0;

    fromMock.mockImplementation((table: string) => {
      if (table === 'active_sessions') {
        activeSessionsCalls += 1;
        return activeSessionsCalls === 1 ? insertQuery : disconnectQuery;
      }
      if (table === 'user_roles') return roleQuery;
      if (table === 'profiles') return profileQuery;
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

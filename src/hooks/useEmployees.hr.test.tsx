// Prova da leitura de RH em `employees` (fase B, 21/11/2026):
//   • não-RH lê só as 17 colunas públicas, recebe os campos de RH em null e
//     NUNCA chama get_employees_hr;
//   • RH lê pela RPC get_employees_hr (linha completa);
//   • RH com permissão revogada no banco (42501) cai para a leitura pública;
//   • insert/update não pedem a linha de volta (`.select()`), e recarregam
//     pelo caminho certo.
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  auth: {
    adminOrGestor: false,
    hasPermissionRecord: true,
    permissions: [] as string[],
    profileLoading: false,
  },
  calls: [] as { kind: string; table?: string; fn?: string; args?: unknown; method?: string; columns?: unknown }[],
  rpcResult: { data: [] as unknown[], error: null as null | { code: string; message: string } },
  publicRows: [] as Record<string, unknown>[],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdminOrGestor: () => state.auth.adminOrGestor,
    hasPermissionRecord: state.auth.hasPermissionRecord,
    hasPermission: (key: string) => state.auth.permissions.includes('*') || state.auth.permissions.includes(key),
    profileLoading: state.auth.profileLoading,
  }),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useUserCompany', () => ({ getCurrentUserCompanyId: async () => 'company-1' }));

vi.mock('@/integrations/supabase/client', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    let method = 'select';
    const result = () => {
      if (method === 'select') return { data: state.publicRows, error: null };
      return { data: null, error: null, count: 1 };
    };
    builder.select = (columns?: unknown) => {
      state.calls.push({ kind: 'from', table, method: method === 'select' ? 'select' : `${method}.select`, columns });
      return builder;
    };
    builder.insert = (args: unknown) => { method = 'insert'; state.calls.push({ kind: 'from', table, method: 'insert', args }); return builder; };
    builder.update = (args: unknown, opts?: unknown) => { method = 'update'; state.calls.push({ kind: 'from', table, method: 'update', args, columns: opts }); return builder; };
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.order = () => builder;
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      rpc: (fn: string, args: unknown) => {
        state.calls.push({ kind: 'rpc', fn, args });
        return Promise.resolve(state.rpcResult);
      },
    },
  };
});

import {
  EMPLOYEE_PUBLIC_SELECT,
  EMPLOYEE_SENSITIVE_COLUMNS,
  useEmployeeHrDetails,
  useEmployees,
} from './useEmployees';

const PUBLIC_ROW = {
  id: 'e1', name: 'Ana', email: 'ana@x.com', position: 'Técnica', hire_date: '2026-01-02',
  photo_url: null, is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01',
  user_id: null, company_id: 'company-1', ponto_slug: null, ponto_enabled: false,
  public_short_code: 'abc', employment_regime: 'clt', cbo: null, matricula: '7',
};
const HR_ROW = { ...PUBLIC_ROW, salary: 4550, cpf: '123', pix_key: 'pix', monthly_cost: 6000, phone: '119' };

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const rpcCalls = () => state.calls.filter((c) => c.kind === 'rpc');
const selects = () => state.calls.filter((c) => c.kind === 'from' && c.method === 'select');

beforeEach(() => {
  state.auth = { adminOrGestor: false, hasPermissionRecord: true, permissions: [], profileLoading: false };
  state.calls = [];
  state.rpcResult = { data: [HR_ROW], error: null };
  state.publicRows = [PUBLIC_ROW];
});

describe('useEmployees — leitura sem RH', () => {
  it('pede só as colunas públicas, devolve RH em null e não chama a RPC de RH', async () => {
    state.auth.permissions = ['screen:employees', 'fn:manage_timeclock'];
    const { result } = renderHook(() => useEmployees(), { wrapper });
    await waitFor(() => expect(result.current.employees).toHaveLength(1));

    expect(result.current.canManage).toBe(false);
    expect(rpcCalls()).toEqual([]);
    expect(selects().map((c) => c.columns)).toEqual([EMPLOYEE_PUBLIC_SELECT]);
    const [employee] = result.current.employees;
    expect(employee.name).toBe('Ana');
    for (const column of EMPLOYEE_SENSITIVE_COLUMNS) {
      expect(employee[column], column).toBeNull();
    }
  });

  it('usuário legado sem registro de permissões não é RH (falha fechado como o banco)', async () => {
    state.auth.hasPermissionRecord = false;
    state.auth.permissions = ['fn:manage_employees'];
    const { result } = renderHook(() => useEmployees(), { wrapper });
    await waitFor(() => expect(result.current.employees).toHaveLength(1));
    expect(rpcCalls()).toEqual([]);
    expect(result.current.employees[0].salary).toBeNull();
  });

  it('espera o perfil carregar antes de ler (sem leitura pública inútil para RH)', async () => {
    state.auth.profileLoading = true;
    const { result } = renderHook(() => useEmployees(), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(state.calls).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});

describe('useEmployees — leitura de RH', () => {
  it.each([
    ['admin/gestor', () => { state.auth.adminOrGestor = true; }],
    ['fn:manage_employees', () => { state.auth.permissions = ['fn:manage_employees']; }],
    ['Acesso Total', () => { state.auth.permissions = ['*']; }],
  ])('%s lê a linha completa pela get_employees_hr', async (_label, grant) => {
    grant();
    const { result } = renderHook(() => useEmployees(), { wrapper });
    await waitFor(() => expect(result.current.employees).toHaveLength(1));

    expect(result.current.canManage).toBe(true);
    expect(rpcCalls()).toEqual([{ kind: 'rpc', fn: 'get_employees_hr', args: {} }]);
    expect(selects()).toEqual([]);
    expect(result.current.employees[0].salary).toBe(4550);
    expect(result.current.employees[0].cpf).toBe('123');
  });

  it('banco recusa (42501): cai para a leitura pública em vez de derrubar a tela', async () => {
    state.auth.permissions = ['fn:manage_employees'];
    state.rpcResult = { data: null as unknown as unknown[], error: { code: '42501', message: 'Sem permissão' } };
    const { result } = renderHook(() => useEmployees(), { wrapper });
    await waitFor(() => expect(result.current.employees).toHaveLength(1));
    expect(selects().map((c) => c.columns)).toEqual([EMPLOYEE_PUBLIC_SELECT]);
    expect(result.current.employees[0].salary).toBeNull();
  });
});

describe('useEmployees — escrita sem devolver a linha', () => {
  it('insert gera o id no client, não usa .select() e recarrega pela RPC (RH)', async () => {
    state.auth.adminOrGestor = true;
    const { result } = renderHook(() => useEmployees(), { wrapper });
    await waitFor(() => expect(result.current.employees).toHaveLength(1));
    state.calls = [];

    let saved: { id: string; salary: number | null } | undefined;
    await act(async () => {
      saved = await result.current.createEmployee.mutateAsync({ name: 'Ana', salary: 4550 } as never) as never;
    });

    const insert = state.calls.find((c) => c.method === 'insert');
    expect((insert?.args as { id?: string }).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.calls.some((c) => c.method === 'insert.select')).toBe(false);
    const reload = rpcCalls().find((c) => c.fn === 'get_employees_hr');
    expect(reload?.args).toEqual({ p_ids: [(insert?.args as { id: string }).id] });
    expect(saved?.salary).toBe(4550);
  });

  it('update usa count exato (prova de linha gravada) e não pede a linha de volta', async () => {
    state.auth.adminOrGestor = true;
    const { result } = renderHook(() => useEmployees(), { wrapper });
    await waitFor(() => expect(result.current.employees).toHaveLength(1));
    state.calls = [];

    await act(async () => {
      await result.current.updateEmployee.mutateAsync({ id: 'e1', name: 'Ana Maria' });
    });

    const update = state.calls.find((c) => c.method === 'update');
    expect(update?.columns).toEqual({ count: 'exact' });
    expect(state.calls.some((c) => c.method === 'update.select')).toBe(false);
    // 1º: recarrega só o funcionário salvo. Depois: a lista invalidada refaz a leitura de RH.
    expect(rpcCalls()[0].args).toEqual({ p_ids: ['e1'] });
    expect(rpcCalls().every((c) => c.fn === 'get_employees_hr')).toBe(true);
  });
});

describe('useEmployeeHrDetails', () => {
  it('não-RH: nunca chama a RPC e devolve null', async () => {
    const { result } = renderHook(() => useEmployeeHrDetails('e1'), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(rpcCalls()).toEqual([]);
    expect(result.current.employee).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('RH: busca só aquele funcionário pela RPC', async () => {
    state.auth.permissions = ['fn:manage_employees'];
    const { result } = renderHook(() => useEmployeeHrDetails('e1'), { wrapper });
    await waitFor(() => expect(result.current.employee?.salary).toBe(4550));
    expect(rpcCalls()).toEqual([{ kind: 'rpc', fn: 'get_employees_hr', args: { p_ids: ['e1'] } }]);
  });
});

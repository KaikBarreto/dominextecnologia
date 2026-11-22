// Aba Funcionários do "Exportar meus dados" depois da fase B da leitura de RH:
//   • RH: lê pela RPC get_employees_hr e exporta as colunas de RH;
//   • não-RH: lê só colunas não sensíveis direto da tabela e a planilha sai
//     SEM as colunas de RH (não ficam vazias fingindo cadastro incompleto).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
  canManage: false,
  reads: [] as { table: string; columns: string }[],
  rpcs: [] as string[],
  generated: null as null | { sheets: { key: string; columns: { key: string }[]; rows: unknown[][] }[] },
}));

const PUBLIC_ROW = { id: 'e1', name: 'Ana', matricula: '7', position: 'Técnica', cbo: null, employment_regime: 'clt', hire_date: null, is_active: true, email: 'a@x.com', created_at: null };
const HR_ROW = { ...PUBLIC_ROW, cpf: '123.456.789-00', salary: 4550, pix_key: 'pix-ana', phone: '11999' };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = (columns: string) => { state.reads.push({ table, columns }); return builder; };
      builder.eq = () => builder;
      builder.is = () => builder;
      builder.order = () => builder;
      builder.range = (from: number) =>
        Promise.resolve({ data: from === 0 && table === 'employees' ? [PUBLIC_ROW] : [], error: null });
      return builder;
    },
    rpc: (fn: string) => {
      state.rpcs.push(fn);
      return Promise.resolve({ data: fn === 'get_employees_hr' ? [HR_ROW] : [], error: null });
    },
  },
}));

vi.mock('@/utils/companyBackupExcelGenerator', () => ({
  generateCompanyBackupExcel: vi.fn(async (params: unknown) => {
    state.generated = params as typeof state.generated;
  }),
}));
vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }),
}));
vi.mock('@/hooks/useCompanySettings', () => ({ useCompanySettings: () => ({ settings: { name: 'Empresa Teste' } }) }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => true }) }));
vi.mock('@/hooks/useCanManageEmployees', () => ({ useCanManageEmployees: () => state.canManage }));

import { EXPORT_GROUPS, useCompanyDataExport, type ExportGroupKey } from './useCompanyDataExport';
import { EMPLOYEE_PUBLIC_COLUMNS } from './useEmployees';

function soFuncionarios(): Record<ExportGroupKey, boolean> {
  const out = {} as Record<ExportGroupKey, boolean>;
  for (const key of EXPORT_GROUPS) out[key] = key === 'employees';
  return out;
}

const HR_KEYS = ['cpf', 'phone', 'address', 'salary', 'monthly_cost', 'dependents_count', 'payment_frequency',
  'payment_day', 'payment_day_2', 'payment_day_type', 'payment_weekday', 'vt_enabled', 'vt_monthly_value', 'pix_key'];

async function exportar() {
  const { result } = renderHook(() => useCompanyDataExport());
  await act(async () => { await result.current.run(soFuncionarios()); });
  return state.generated!.sheets.find((s) => s.key === 'employees')!;
}

beforeEach(() => {
  state.canManage = false;
  state.reads = [];
  state.rpcs = [];
  state.generated = null;
});

describe('Exportar meus dados — aba Funcionários', () => {
  it('sem RH: lê só colunas concedidas, não chama a RPC de RH e a aba sai sem colunas de RH', async () => {
    const sheet = await exportar();

    expect(state.rpcs).not.toContain('get_employees_hr');
    const employeeReads = state.reads.filter((r) => r.table === 'employees');
    expect(employeeReads).toHaveLength(1);
    for (const column of employeeReads[0].columns.split(',').map((c) => c.trim())) {
      expect(EMPLOYEE_PUBLIC_COLUMNS as readonly string[]).toContain(column);
    }
    const keys = sheet.columns.map((c) => c.key);
    for (const key of HR_KEYS) expect(keys).not.toContain(key);
    expect(keys).toEqual(['name', 'matricula', 'position', 'cbo', 'employment_regime', 'hire_date', 'is_active', 'email', 'created_at']);
    expect(sheet.rows[0][0]).toBe('Ana');
    expect(sheet.rows[0]).toHaveLength(keys.length);
  });

  it('RH: lê pela get_employees_hr e exporta o cadastro completo, na ordem de antes', async () => {
    state.canManage = true;
    const sheet = await exportar();

    expect(state.rpcs).toContain('get_employees_hr');
    expect(state.reads.filter((r) => r.table === 'employees')).toEqual([]);
    const keys = sheet.columns.map((c) => c.key);
    expect(keys).toEqual([
      'name', 'matricula', 'cpf', 'position', 'cbo', 'employment_regime', 'hire_date', 'is_active',
      'email', 'phone', 'address', 'salary', 'monthly_cost', 'dependents_count',
      'payment_frequency', 'payment_day', 'payment_day_2', 'payment_day_type',
      'payment_weekday', 'vt_enabled', 'vt_monthly_value', 'pix_key', 'created_at',
    ]);
    const row = sheet.rows[0];
    expect(row[keys.indexOf('cpf')]).toBe('123.456.789-00');
    expect(row[keys.indexOf('salary')]).toBe(4550);
    expect(row[keys.indexOf('pix_key')]).toBe('pix-ana');
  });
});

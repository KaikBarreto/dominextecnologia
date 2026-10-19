// ─────────────────────────────────────────────────────────────────────────────
// Prova da DÍVIDA 3 da Onda 1 do PDV: a portabilidade LGPD (Art. 18, V) passa a
// exportar o histórico de compras do balcão E o extrato de fiado (que é dado
// financeiro pessoal), SEM que a empresa que não contratou o add-on `pdv` note
// qualquer diferença no arquivo dela.
//
// As duas situações estão provadas aqui lado a lado:
//   • SEM o módulo: a lista de grupos e o conjunto de abas do arquivo são
//     IDÊNTICOS aos de antes desta mudança (lista congelada em
//     ABAS_SEM_PDV), e nenhuma das 4 tabelas do PDV é LIDA — nem pra montar
//     aba vazia, nem pro Resumo.
//   • COM o módulo: entram 4 abas novas, na posição certa, e o saldo do
//     extrato de fiado fecha linha a linha.
//
// Tem também o caso malicioso/bugado: `selection` com a chave do PDV marcada na
// mão numa empresa sem o módulo. O gate está DENTRO do `run`, não só na lista
// que o dialog desenha, então continua não saindo aba.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
  hasPdv: false,
  tables: {} as Record<string, Record<string, unknown>[]>,
  reads: [] as string[],
  generated: null as null | { sheets: { key: string; columns: { key: string }[]; rows: unknown[][] }[] },
}));

// Supabase: devolve as linhas semeadas em `state.tables` na 1ª página e vazio
// nas seguintes (é o que encerra a paginação do fetchAllPaged).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      state.reads.push(table);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.is = () => builder;
      builder.order = () => builder;
      builder.range = (from: number) =>
        Promise.resolve({ data: from === 0 ? (state.tables[table] ?? []) : [], error: null });
      return builder;
    },
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

vi.mock('@/utils/companyBackupExcelGenerator', () => ({
  generateCompanyBackupExcel: vi.fn(async (params: unknown) => {
    state.generated = params as typeof state.generated;
  }),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('@/hooks/useCompanySettings', () => ({
  useCompanySettings: () => ({ settings: { name: 'Empresa Teste' } }),
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({
    hasModule: (code: string) => (code === 'pdv' ? state.hasPdv : true),
  }),
}));

import {
  EXPORT_GROUPS,
  PDV_EXPORT_GROUPS,
  useCompanyDataExport,
  type ExportGroupKey,
} from './useCompanyDataExport';

/**
 * As abas que o arquivo tinha ANTES do PDV existir, na ordem. Esta lista é o
 * contrato do "sem o add-on, nada muda": se alguém mexer nela pra fazer um
 * teste passar, o que quebrou foi a lei do módulo, não o teste.
 */
const ABAS_SEM_PDV = [
  'customers', 'customerContacts', 'equipment', 'serviceOrders', 'serviceMaterials',
  'quotes', 'quoteItems', 'contracts', 'contractItems',
  'financialTransactions', 'financialAccounts', 'inventory', 'inventoryMovements',
  'employees', 'leads', 'timeRecords',
];

const ABAS_DO_PDV = ['pdvOrders', 'pdvOrderItems', 'pdvOrderPayments', 'customerCredit'];

const TABELAS_DO_PDV = ['pdv_orders', 'pdv_order_items', 'pdv_order_payments', 'customer_credit_ledger'];

function tudoMarcado(): Record<ExportGroupKey, boolean> {
  const out = {} as Record<ExportGroupKey, boolean>;
  for (const key of EXPORT_GROUPS) out[key] = true;
  return out;
}

function sheetKeys(): string[] {
  return (state.generated?.sheets ?? []).map((s) => s.key);
}

function sheet(key: string) {
  return (state.generated?.sheets ?? []).find((s) => s.key === key);
}

beforeEach(() => {
  state.hasPdv = false;
  state.tables = {};
  state.reads = [];
  state.generated = null;
});

describe('useCompanyDataExport — add-on PDV no "Exportar meus dados"', () => {
  it('SEM o módulo: a lista de grupos é a de antes, sem nenhuma chave do PDV', () => {
    state.hasPdv = false;
    const { result } = renderHook(() => useCompanyDataExport());

    for (const key of PDV_EXPORT_GROUPS) {
      expect(result.current.groups).not.toContain(key);
    }
    expect(result.current.groups.length).toBe(EXPORT_GROUPS.length - PDV_EXPORT_GROUPS.length);
  });

  it('SEM o módulo: o arquivo sai IDÊNTICO ao de antes (abas iguais, nem aba vazia do PDV)', async () => {
    state.hasPdv = false;
    const { result } = renderHook(() => useCompanyDataExport());

    await act(async () => {
      await result.current.run(tudoMarcado());
    });

    expect(sheetKeys()).toEqual(ABAS_SEM_PDV);
    for (const key of ABAS_DO_PDV) expect(sheet(key)).toBeUndefined();
  });

  it('SEM o módulo: nenhuma tabela do PDV é LIDA (não é aba vazia, é consulta que não acontece)', async () => {
    state.hasPdv = false;
    const { result } = renderHook(() => useCompanyDataExport());

    await act(async () => {
      await result.current.run(tudoMarcado());
    });

    for (const table of TABELAS_DO_PDV) expect(state.reads).not.toContain(table);
  });

  it('SEM o módulo: marcar a chave do PDV na mão no selection não gera aba (gate está no run)', async () => {
    state.hasPdv = false;
    const { result } = renderHook(() => useCompanyDataExport());

    const selection = {} as Record<ExportGroupKey, boolean>;
    for (const key of EXPORT_GROUPS) selection[key] = false;
    selection.customers = true;
    selection.pdvOrders = true;
    selection.customerCredit = true;

    await act(async () => {
      await result.current.run(selection);
    });

    expect(sheetKeys()).toEqual(['customers', 'customerContacts']);
    for (const table of TABELAS_DO_PDV) expect(state.reads).not.toContain(table);
  });

  it('COM o módulo: entram as 4 abas do PDV, logo depois de Movimentações de Estoque', async () => {
    state.hasPdv = true;
    const { result } = renderHook(() => useCompanyDataExport());

    expect(result.current.groups).toContain('pdvOrders');
    expect(result.current.groups).toContain('customerCredit');

    await act(async () => {
      await result.current.run(tudoMarcado());
    });

    const esperado = [...ABAS_SEM_PDV];
    esperado.splice(esperado.indexOf('inventoryMovements') + 1, 0, ...ABAS_DO_PDV);
    expect(sheetKeys()).toEqual(esperado);
    for (const table of TABELAS_DO_PDV) expect(state.reads).toContain(table);
  });

  it('COM o módulo: a venda sai com itens e com UMA LINHA POR FORMA DE PAGAMENTO', async () => {
    state.hasPdv = true;
    state.tables = {
      pdv_orders: [
        { id: 'o1', number: 7, status: 'pago', total: 150, subtotal: 150, customer_id: 'c1' },
      ],
      pdv_order_items: [
        { id: 'i1', order_id: 'o1', description: 'Gás R410a', quantity: 2, unit_price: 50, total: 100, unit_cost: 30, sort_order: 1 },
        { id: 'i2', order_id: 'o1', description: 'Filtro', quantity: 1, unit_price: 50, total: 50, unit_cost: 20, sort_order: 2 },
      ],
      pdv_order_payments: [
        { id: 'p1', order_id: 'o1', method: 'dinheiro', amount: 100, change_amount: 0 },
        { id: 'p2', order_id: 'o1', method: 'pix', amount: 50, change_amount: 0 },
      ],
    };

    const { result } = renderHook(() => useCompanyDataExport());
    await act(async () => {
      await result.current.run({ ...tudoMarcado() });
    });

    const pedidos = sheet('pdvOrders')!;
    expect(pedidos.rows).toHaveLength(1);
    // Número do pedido na 1ª coluna e status com o rótulo da tela, não o enum cru.
    expect(pedidos.rows[0][0]).toBe(7);
    expect(pedidos.rows[0][1]).toBe('Pago');

    const itens = sheet('pdvOrderItems')!;
    expect(itens.rows).toHaveLength(2);
    // Toda linha de item aponta pro NÚMERO do pedido (nunca pro uuid).
    expect(itens.rows.map((r) => r[0])).toEqual([7, 7]);

    const pagamentos = sheet('pdvOrderPayments')!;
    expect(pagamentos.rows).toHaveLength(2);
    expect(pagamentos.rows.map((r) => r[1])).toEqual(['Dinheiro', 'PIX']);
    expect(pagamentos.rows.map((r) => r[2])).toEqual([100, 50]);
  });

  it('COM o módulo: o extrato de fiado traz o saldo acumulado POR CLIENTE', async () => {
    state.hasPdv = true;
    state.tables = {
      customer_credit_ledger: [
        { id: 'l1', customer_id: 'c1', kind: 'venda_fiado', amount: 500, created_at: '2026-10-01T12:00:00Z' },
        { id: 'l2', customer_id: 'c1', kind: 'venda_fiado', amount: 300, created_at: '2026-10-05T12:00:00Z' },
        { id: 'l3', customer_id: 'c1', kind: 'pagamento', amount: -200, created_at: '2026-10-09T12:00:00Z' },
        { id: 'l4', customer_id: 'c2', kind: 'venda_fiado', amount: 40.1, created_at: '2026-10-02T12:00:00Z' },
        { id: 'l5', customer_id: 'c2', kind: 'venda_fiado', amount: 0.2, created_at: '2026-10-03T12:00:00Z' },
      ],
    };

    const selection = {} as Record<ExportGroupKey, boolean>;
    for (const key of EXPORT_GROUPS) selection[key] = false;
    selection.customerCredit = true;

    const { result } = renderHook(() => useCompanyDataExport());
    await act(async () => {
      await result.current.run(selection);
    });

    const extrato = sheet('customerCredit')!;
    const colunas = extrato.columns.map((c) => c.key);
    expect(colunas).toEqual(['customer', 'created_at', 'kind', 'amount', 'balance', 'number', 'notes']);

    const amount = colunas.indexOf('amount');
    const balance = colunas.indexOf('balance');
    const kind = colunas.indexOf('kind');

    expect(extrato.rows.map((r) => r[amount])).toEqual([500, 300, -200, 40.1, 0.2]);
    // Saldo acumulado reinicia por cliente (c1: 500→800→600; c2: 40.1→40.3).
    expect(extrato.rows.map((r) => r[balance])).toEqual([500, 800, 600, 40.1, 40.3]);
    // Tipo de lançamento vira rótulo em PT-BR, nunca 'venda_fiado' cru.
    expect(extrato.rows[0][kind]).toBe('Venda no Fiado');
    expect(extrato.rows[2][kind]).toBe('Pagamento');
  });
});

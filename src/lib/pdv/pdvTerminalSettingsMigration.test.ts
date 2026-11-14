import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111090000_pdv_terminal_settings_v2.sql',
  'utf8',
);

describe('cadastro seguro dos caixas da loja', () => {
  it('fecha escrita direta e exige tela e acao de configuracao', () => {
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.pdv_terminals FROM authenticated');
    expect(migration).toContain("'screen:pdv_settings'");
    expect(migration).toContain("'fn:manage_pdv_settings'");
    expect(migration).toContain('pdv_counter_context_v2');
    expect(migration).toMatch(/pdv_list_cash_terminal_settings_v2[\s\S]*?'screen:pdv_settings',[\s\S]*?NULL,[\s\S]*?false/);
    expect(migration).toMatch(/pdv_save_cash_terminal_v2[\s\S]*?'screen:pdv_settings',[\s\S]*?'fn:manage_pdv_settings'/);
  });

  it('isola empresa e rejeita estoque de cliente', () => {
    expect(migration).toContain('stock.company_id = v_context.company_id');
    expect(migration).toContain('stock.customer_id IS NULL');
    expect(migration).toContain('terminal.company_id = v_context.company_id');
    expect(migration).toContain('code=pdv_terminal_stock_not_found');
    expect(migration).toContain('code=pdv_terminal_not_found');
  });

  it('entrega o estoque na listagem operacional e protege caixa aberto', () => {
    expect(migration).toContain("'stock_id', terminal.stock_id");
    expect(migration).toContain("session.status = 'aberta'");
    expect(migration).toContain('code=pdv_terminal_open_session');
  });

  it('nao expoe as RPCs ao anonimo', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.pdv_list_cash_terminal_settings_v2\(\) FROM PUBLIC, anon/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.pdv_save_cash_terminal_v2[\s\S]*FROM PUBLIC, anon/);
  });
});

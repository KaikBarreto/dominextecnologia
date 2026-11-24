import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261117200000_quote_approval_without_financial.sql',
  'utf8',
);

describe('migration — aprovação sem financeiro e reconciliação com a OS', () => {
  it('adiciona apenas aprovar como opção e padrão seguro para novas empresas', () => {
    expect(migration).toContain("'apenas_aprovar', 'a_receber', 'recebido'");
    expect(migration).toContain("SET DEFAULT 'apenas_aprovar'");
  });

  it('vincula somente receitas do mesmo tenant e da OS gerada pelo orçamento', () => {
    expect(migration).toContain('so.quote_id = NEW.id');
    expect(migration).toContain('so.company_id = NEW.company_id');
    expect(migration).toContain("ft.transaction_type = 'entrada'");
    expect(migration).toContain('ft.service_order_id IS NULL');
  });

  it('preserva menor privilégio na função do trigger', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.link_quote_financial_entries_to_service_order\(\)[\s\S]*FROM public, anon, authenticated/,
    );
  });

  it('reconcilia conversões anteriores sem sobrescrever outro vínculo', () => {
    expect(migration).toContain('WITH quote_links AS');
    expect(migration).toContain('so.quote_id = q.id');
    expect(migration).toContain('ft.service_order_id IS NULL');
  });
});

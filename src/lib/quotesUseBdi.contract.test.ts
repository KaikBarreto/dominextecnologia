import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261102160000_quotes_use_bdi.sql'),
  'utf8',
);

describe('contrato de persistência do modo BDI em orçamentos', () => {
  it('mantém BDI ligado por padrão e classifica legados sem cálculo como manuais', () => {
    expect(migration).toMatch(/use_bdi\s+boolean\s+NOT NULL\s+DEFAULT\s+true/i);
    expect(migration).toMatch(/SET\s+use_bdi\s*=\s*false\s+WHERE\s+bdi\s*<=\s*0/i);
  });

  it('não altera policies nem desabilita RLS', () => {
    expect(migration).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(migration).not.toMatch(/CREATE\s+POLICY|DROP\s+POLICY/i);
  });
});

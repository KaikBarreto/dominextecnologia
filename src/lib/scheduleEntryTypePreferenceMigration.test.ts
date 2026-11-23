import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261123170000_user_preferences_schedule_entry_type_filter.sql',
  ),
  'utf8',
);

describe('preferencia de filtro por tipo na Agenda', () => {
  it('cria preferencia pessoal com Tudo como padrao', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS schedule_entry_type_filter text\[\] NOT NULL DEFAULT '\{\}'/i);
    expect(migration).toMatch(/schedule_entry_type_filter <@ ARRAY\['os', 'tarefa'\]::text\[\]/i);
    expect(migration).toMatch(/cardinality\(schedule_entry_type_filter\) <= 1/i);
  });

  it('documenta que as policies own-row existentes protegem a escolha', () => {
    expect(migration).toMatch(/policies own-row/i);
  });
});

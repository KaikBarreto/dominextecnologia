import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261013160000_add_excecao_subscription_plan.sql',
  ),
  'utf8',
);

describe('plano EXCEÇÃO', () => {
  it('fixa preço, limite e módulos sem Portal do Cliente', () => {
    expect(migration).toMatch(/'excecao',[\s\S]*?'EXCEÇÃO',[\s\S]*?97,[\s\S]*?3,/);
    expect(migration).toContain("'[\"basic\",\"pricing_advanced\",\"video_questions\"]'::jsonb");
  });

  it('bloqueia Orçamentos e Financeiro também no servidor', () => {
    expect(migration).toContain("p_area IN ('quotes', 'finance')");
    expect(migration).toContain('ON public.quotes AS RESTRICTIVE');
    expect(migration).toContain('ON public.financial_transactions AS RESTRICTIVE');
  });
});

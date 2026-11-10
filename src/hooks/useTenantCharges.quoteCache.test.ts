import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { QUOTE_CHARGED_IDS_QUERY_KEY } from './useQuoteChargedIds';

describe('cache de cobranca de orcamento', () => {
  it('expoe uma chave por prefixo para invalidar todas as empresas em cache', () => {
    expect(QUOTE_CHARGED_IDS_QUERY_KEY).toEqual(['quote-charged-ids']);
    expect([...QUOTE_CHARGED_IDS_QUERY_KEY, 'empresa-1']).toEqual([
      'quote-charged-ids',
      'empresa-1',
    ]);
  });

  it('invalida o bloqueio de aprovacao depois de criar cobranca de orcamento', () => {
    const source = readFileSync('src/hooks/useTenantCharges.ts', 'utf8');
    expect(source).toContain("if (input.source_type === 'quote')");
    expect(source).toContain(
      'queryClient.invalidateQueries({ queryKey: QUOTE_CHARGED_IDS_QUERY_KEY })',
    );
  });

  it('invalida todas as leituras de faturamento depois de criar cobranca de OS', () => {
    const source = readFileSync('src/hooks/useTenantCharges.ts', 'utf8');
    expect(source).toContain("if (input.source_type === 'service_order')");
    expect(source).toContain('queryKey: [OS_REVENUE_SUMMARY_KEY]');
    expect(source).toContain('? [OS_BILLING_STATE_KEY, input.source_id]');
    expect(source).toContain('queryKey: [OS_BILLING_FLAGS_KEY]');
  });
});

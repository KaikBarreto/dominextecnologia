import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getQuoteCommercialTotal } from './quote-commercial-total';

describe('getQuoteCommercialTotal', () => {
  it('prioriza total_value quando os campos historicos divergem', () => {
    expect(getQuoteCommercialTotal({
      total_value: 103.5,
      total_price: 107.14,
    })).toBe(103.5);
  });

  it('mantem fallback para registros antigos sem total_value', () => {
    expect(getQuoteCommercialTotal({ total_price: 100 })).toBe(100);
  });

  it('a conversao no banco prioriza total_value sem remover os fallbacks legados', () => {
    const migration = readFileSync(
      'supabase/migrations/20261027120000_orcamento_total_comercial_na_conversao_os.sql',
      'utf8',
    );
    expect(migration).toContain(
      'COALESCE(v_quote.total_value, v_quote.total_price, v_items_total, 0)',
    );
  });
});

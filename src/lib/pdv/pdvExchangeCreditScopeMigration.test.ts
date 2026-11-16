import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', file), 'utf8');
const original = read('20261115130000_pdv_paid_residual_disposition.sql');
const patch = read('20261116031200_pdv_exchange_private_credit_statement.sql');
const start = original.indexOf('CREATE OR REPLACE FUNCTION public.pdv_customer_credit_statement_v2(');
const statement = original.slice(start, original.indexOf('$function$;', start));
const queryStart = statement.indexOf('  RETURN QUERY');
const queryEnd = statement.indexOf('  ORDER BY occurred_at, entry_id;') + '  ORDER BY occurred_at, entry_id;'.length;
const query = statement.slice(queryStart, queryEnd);

describe('fiado da troca reutiliza a posição assinada sem herdar tela do caixa', () => {
  it('conserva literalmente os seis ramos de crédito, incluindo saldos negativos e legado', () => {
    expect(start).toBeGreaterThan(0); expect(queryStart).toBeGreaterThan(0); expect(queryEnd).toBeGreaterThan(queryStart);
    const internal = statement.replace('public.pdv_customer_credit_statement_v2(', 'public.pdv_customer_credit_statement_internal_v4(')
      .replace('p_customer_id uuid)', 'p_company_id uuid, p_customer_id uuid)')
      .replace('  SELECT * INTO v_context FROM public.pdv_cash_v2_context();', '  SELECT p_company_id AS company_id INTO v_context;');
    expect(internal).toContain(query);
    expect(query.match(/UNION ALL/g)).toHaveLength(5);
    expect(query).toContain("'legacy_direct_settlement'::text, (-parent.amount)::numeric");
    expect(query).toContain("'legacy_ledger'::text, ledger.amount::numeric");
    expect(query).toContain("'party_credit_position'::text, (-entry.amount)::numeric");
    expect(query).toContain('entry.target_financial_transaction_id IS NULL');
    expect(patch).toContain('EXECUTE internal_definition');
    expect(internal).not.toContain('pdv_cash_v2_context');
  });

  it('o RPC original mantém todo o prefixo de autorização e apenas delega o cálculo', () => {
    const delegated = statement.replace(query, '  RETURN QUERY SELECT * FROM public.pdv_customer_credit_statement_internal_v4(v_context.company_id,p_customer_id);');
    expect(delegated.slice(0, queryStart)).toBe(statement.slice(0, queryStart));
    expect(delegated).toContain('pdv_cash_v2_context()');
    expect(delegated).toContain('customer.company_id = v_context.company_id');
    expect(patch).not.toMatch(/GRANT|set_config|current_setting/i);
    expect(patch).toContain('FROM PUBLIC,anon,authenticated,service_role');
  });

  it('troca muda só a fonte do extrato, mantendo soma, centavos e limite originais', () => {
    const exchange = read('20261107141000_pdv_after_sale_value_v2.sql');
    const block = patch.split('DO $exchange_credit_scope$')[1];
    const anchor = /anchor:=\$anchor\$([\s\S]*?)\$anchor\$/.exec(block)![1];
    const replacement = /replacement:=\$replacement\$([\s\S]*?)\$replacement\$/.exec(block)![1];
    expect(exchange).toContain(anchor);
    expect(replacement).toContain('SELECT round(COALESCE(sum(statement.amount),0),2) INTO v_open_credit');
    expect(replacement).toContain('pdv_customer_credit_statement_internal_v4(v_context.company_id,v_order.customer_id)');
    expect(replacement.indexOf('pdv_assert_exchange_coupon_access_internal_v1')).toBeLessThan(replacement.indexOf('sum(statement.amount)'));
    expect(replacement).toContain('pdv_current_actor_can_access_session_v3(v_target_session.id) IS DISTINCT FROM TRUE');
    const changed = exchange.replace(anchor, replacement);
    expect(changed).toContain('v_open_credit+v_difference<=customer.credit_limit');
    expect(replacement).not.toContain('screen:pdv');
  });
});

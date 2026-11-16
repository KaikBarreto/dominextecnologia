import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const read = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
const migration = read('20261116030900_pdv_exchange_explicit_target_cash.sql');
const block = (source: string, name: string) => source.split(`DO $${name}$`)[1].split(`END $${name}$;`)[0];

// Avalia somente concatenações literais dos patches. Cada âncora deve aparecer
// exatamente uma vez no corpo composto real; não simula PostgreSQL nem corrida.
function compose(body: string, source: string): string {
  const vars: Record<string, string> = {};
  const assignment = /\b([ab]):=/g;
  for (let match = assignment.exec(source); match; match = assignment.exec(source)) {
    let pos = assignment.lastIndex;
    let value = '';
    while (source[pos] !== ';') {
      if (/\s/.test(source[pos]) || source.slice(pos, pos + 2) === '||') { pos += source.slice(pos, pos + 2) === '||' ? 2 : 1; continue; }
      if (source[pos] === "'") {
        pos++;
        while (true) {
          if (source.slice(pos, pos + 2) === "''") { value += "'"; pos += 2; }
          else if (source[pos] === "'") { pos++; break; }
          else value += source[pos++];
        }
      } else if (source[pos] === '$') {
        const tag = /^\$[a-z_]+\$/i.exec(source.slice(pos))![0];
        const end = source.indexOf(tag, pos + tag.length);
        value += source.slice(pos + tag.length, end); pos = end + tag.length;
      } else if (source.slice(pos, pos + 7) === 'chr(10)') { value += '\n'; pos += 7; }
      else if (source[pos] === 'a') { value += vars.a; pos++; }
      else throw new Error(`Expressão inesperada em ${source.slice(pos, pos + 40)}`);
    }
    vars[match[1]] = value;
    assignment.lastIndex = pos + 1;
    if (match[1] === 'b') {
      expect(body.split(vars.a).length - 1, vars.a).toBe(1);
      body = body.replace(vars.a, vars.b);
    }
  }
  return body;
}
function canonicalCore() {
  const original = read('20261107141000_pdv_after_sale_value_v2.sql');
  const source = /CREATE OR REPLACE FUNCTION public\.pdv_cover_exchange_order_v2\(([\s\S]*?)\) RETURNS jsonb([\s\S]*?)AS \$fn\$([\s\S]*?)END \$fn\$;/.exec(original)!;
  expect(source).not.toBeNull();
  let body = `CREATE OR REPLACE FUNCTION public.pdv_cover_exchange_order_core_015_v2(${source[1].replace(/\s+/g, ' ').trim()}) RETURNS jsonb${source[2]}AS $fn$${source[3]}END $fn$;`;
  body = compose(body, block(read('20261116030400_pdv_exchange_coupon_coverage.sql'), 'exchange_core'));
  body = compose(body, block(read('20261116030700_pdv_exchange_atomic_stock_reservation.sql'), 'exchange_reservation'));
  return compose(body, block(migration, 'target_core'));
}

describe('custódia explícita da troca', () => {
  it('compõe todas as âncoras 304→307→309 uma única vez no writer real', () => {
    const body = canonicalCore();
    const claim = body.indexOf('pdv_claim_operation_request');
    const replay = body.indexOf('IF v_claim.is_replay THEN');
    const required = body.indexOf('IF p_target_cash_session_id IS NULL THEN');
    const bind = body.indexOf('UPDATE public.pdv_orders SET terminal_id=v_target_terminal.id,cash_session_id=v_target_session.id');
    const reserve = body.indexOf('PERFORM public.pdv_ensure_exchange_order_stock_internal_v1');
    const coupon = body.indexOf('PERFORM public.pdv_consume_order_coupon_internal_v1');
    const debit = body.indexOf('INSERT INTO public.pdv_voucher_entries');
    expect(claim).toBeLessThan(replay); expect(replay).toBeLessThan(required);
    expect(required).toBeLessThan(bind); expect(bind).toBeLessThan(reserve); expect(reserve).toBeLessThan(coupon); expect(coupon).toBeLessThan(debit);
    expect(body.slice(reserve, coupon)).toContain('pdv_assert_exchange_coupon_access_internal_v1');
    expect(body).not.toContain('cash_session_id=COALESCE(p_cash_session_id,cash_session_id)');
  });
  it('mantém hash legado condicional e replica sessão histórica sem exigir aberta', () => {
    const body = canonicalCore();
    expect(body).toContain("THEN 'after_sale.exchange.cover.v2' ELSE 'after_sale.exchange.cover.v3'");
    expect(body).toContain("jsonb_build_object('target_cash_session_id',p_target_cash_session_id) ELSE '{}'::jsonb END");
    const replay = body.slice(body.indexOf('IF v_claim.is_replay THEN'), body.indexOf('IF p_target_cash_session_id IS NULL THEN'));
    expect(replay).toContain('replay_order.cash_session_id=p_target_cash_session_id');
    expect(replay).not.toContain("status='aberta'");
  });
  it('retém um único writer e restringe a fila sem coberturas', () => {
    const delegate = migration.split('CREATE OR REPLACE FUNCTION public.pdv_cover_exchange_order_coupon_base_v1')[1].split('END $fn$;')[0];
    expect(delegate).toContain('RETURN public.pdv_cover_exchange_order_target_base_v2');
    expect(delegate).not.toContain('INSERT INTO');
    expect(migration).toContain("o.status=''aguardando_pagamento'' AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments");
    expect(migration).not.toMatch(/GRANT.*pdv_exchange_target_cash_snapshot_internal/);
  });
  it('não promove pré-aplicação nem usa sessão ativa como fallback do writer', () => {
    expect(migration).toContain("code=pdv_voucher_checkout_required");
    expect(migration).toContain("'{capabilities,apply_voucher}','false'::jsonb");
    const body = canonicalCore();
    expect(body).toContain('session.id=p_target_cash_session_id');
    expect(body).toContain('p_cash_session_id IS DISTINCT FROM v_target_session.id');
    expect(body).toContain('p_difference_account_id IS DISTINCT FROM v_target_session.cash_account_id');
  });
});

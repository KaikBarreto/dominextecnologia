import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
const patch = migration('20261116030400_pdv_exchange_coupon_coverage.sql');
const source = migration('20261107141000_pdv_after_sale_value_v2.sql');
const workspace = migration('20261107142000_pdv_after_sale_ui_projection.sql');

// Reproduz apenas os enxertos literais da migration para detectar qualquer
// âncora ausente nos writers antes da verificação transacional com PostgreSQL.
function apply(body: string, label: string) {
  const block = patch.split(`DO $${label}$`)[1].split(`END $${label}$`)[0];
  let a = ''; let b = '';
  const tokens = /\b([ab]):=(\$([ab])\$[\s\S]*?\$\3\$|'(?:''|[^'])*'|a\|\|'(?:''|[^'])*')\s*;|(?:s:=replace\(s,a,b\)|EXECUTE replace\(s,a,b\))/g;
  for (const token of block.matchAll(tokens)) {
    if (token[1]) {
      const value = token[2].startsWith('$') ? token[2].slice(3, -3)
        : token[2].startsWith('a||') ? a + token[2].slice(4, -1).replace(/''/g, "'")
          : token[2].slice(1, -1).replace(/''/g, "'");
      if (token[1] === 'a') a = value; else b = value;
    } else {
      expect(a.length).toBeGreaterThan(0);
      expect(body, `Âncora do bloco ${label}: ${a}`).toContain(a);
      body = body.split(a).join(b);
    }
  }
  return body;
}
function definition(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const definition = sql.slice(start);
  const end = definition.indexOf('END $fn$;') + 'END $fn$;'.length;
  const result = definition.slice(0, end);
  const returns = result.indexOf(' RETURNS');
  // pg_get_functiondef normaliza o cabeçalho para uma linha.
  return result.slice(0, returns).replace(/\s+/g, ' ').replace('text )', 'text)') + result.slice(returns);
}

describe('liquidação de troca com cupom', () => {
  it('aplica as âncoras e confirma promoção depois dos locks, antes do primeiro débito', () => {
    const body = apply(definition(source, 'pdv_cover_exchange_order_v2').replace('public.pdv_cover_exchange_order_v2(', 'public.pdv_cover_exchange_order_core_015_v2('), 'exchange_core');
    expect(body).toContain('public.pdv_cover_exchange_order_coupon_base_v1(');
    expect(body).toContain('p_expected_coupon_revision integer)');
    const lock = body.indexOf('orders.company_id=v_context.company_id FOR UPDATE');
    const auth = body.indexOf('pdv_assert_exchange_coupon_access_internal_v1', lock);
    const consume = body.indexOf('pdv_consume_order_coupon_internal_v1');
    const debit = body.indexOf('INSERT INTO public.pdv_voucher_entries');
    expect(lock).toBeGreaterThan(0); expect(auth).toBeGreaterThan(lock);
    expect(consume).toBeGreaterThan(auth); expect(debit).toBeGreaterThan(consume);
    expect(body).toContain('v_order.coupon_id IS NOT NULL OR v_order.coupon_revision_v1<>0');
    expect(body).toContain('CASE WHEN p_expected_coupon_revision>0 THEN');
    const replay = body.slice(body.indexOf("IF v_claim.request_status='completed'"), body.indexOf('Counter e venda direta'));
    expect(replay).toContain('pdv_assert_exchange_coupon_access_internal_v1');
    expect(replay).not.toContain('pdv_consume_order_coupon_internal_v1');
  });

  it('bloqueia pré-aplicação em qualquer histórico promocional, preservando replay anterior', () => {
    const body = apply(definition(workspace, 'pdv_apply_voucher_to_order_v2'), 'legacy_preapply');
    const completed = body.indexOf("IF v_claim.request_status='completed'");
    const guard = body.indexOf('v_order.coupon_id IS NOT NULL OR v_order.coupon_revision_v1<>0');
    const debit = body.indexOf('INSERT INTO public.pdv_voucher_entries');
    expect(completed).toBeGreaterThan(0); expect(guard).toBeGreaterThan(completed);
    expect(debit).toBeGreaterThan(guard);
    expect(body).not.toContain('pdv_consume_order_coupon_internal_v1');
  });

  it('publica a revisão dos dois tipos de candidato e remove a ação insegura', () => {
    const body = apply(workspace, 'workspace_snapshot');
    expect(body.match(/'coupon_revision',candidate.coupon_revision_v1/g)).toHaveLength(2);
    expect(body.match(/v_apply AND candidate.coupon_id IS NULL AND candidate.coupon_revision_v1=0/g)).toHaveLength(2);
  });

  it('mantém os helpers privados, a autorização antes do CAS e nenhum bypass configurável', () => {
    const wrapper = patch.slice(patch.indexOf('CREATE FUNCTION public.pdv_cover_exchange_order_coupon_v1('));
    expect(wrapper.indexOf('pdv_assert_exchange_coupon_access_internal_v1')).toBeLessThan(wrapper.indexOf('p_expected_coupon_revision IS NULL'));
    expect(patch).toContain('FROM PUBLIC,anon,authenticated,service_role');
    expect(patch).not.toMatch(/set_config|current_setting|EXCEPTION WHEN/i);
  });
});

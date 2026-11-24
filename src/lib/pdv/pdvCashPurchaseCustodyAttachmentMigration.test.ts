import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');
const migration = read('supabase/migrations/20261116193000_pdv_cash_purchase_custody_attachment.sql');
const original = read('supabase/migrations/20261108019000_pdv_cash_purchase_context.sql').split('CREATE FUNCTION public.pdv_registrar_compra_material_direta_v2(')[1].split('END $fn$;')[0];
const clear = /clear_context:=\$clear\$([\s\S]*?)\$clear\$/.exec(migration)![1];
const anchor = /final_anchor:=\$anchor\$([\s\S]*?)\$anchor\$/.exec(migration)![1];
const patched = original.replace(clear+'\n','').replace(anchor,clear+'\n\n'+anchor);
const withoutClear = (s: string) => s.replace(clear,'').split('\n').filter(line => line.trim()).join('\n');

describe('compra usa o próprio dinheiro reservado na gaveta', () => {
  it('preserva todo o writer e muda somente o ponto da limpeza do contexto', () => {
    expect(original.split(clear)).toHaveLength(2);expect(original.split(anchor)).toHaveLength(2);
    expect(withoutClear(patched)).toBe(withoutClear(original));
    expect(patched.split(clear)).toHaveLength(2);
    expect(migration).not.toMatch(/CREATE (OR REPLACE )?FUNCTION|GRANT|UPDATE public\.financial_transactions|pdv_guard_financial_treasury_v2/);
  });
  it('mantém o contexto durante INSERT financeiro e o BEFORE attach, limpando antes do resultado', () => {
    const set = patched.indexOf("set_config('app.pdv_treasury_custody_delta',jsonb_build_object");
    const core = patched.indexOf('v_purchase:=public.registrar_compra_material_direta_core_019');
    const custody = patched.indexOf('INSERT INTO public.pdv_cash_custody_entries');
    expect(set).toBeLessThan(core);expect(core).toBeLessThan(custody);
    expect(custody).toBeLessThan(patched.indexOf(clear));expect(patched.indexOf(clear)).toBeLessThan(patched.indexOf(anchor));
    expect(patched).toContain("'request_id',v_claim.request_id,'delta',-v_total");
  });
  it('não muda replay, validação de saldo nem autoridade da requisição canônica', () => {
    expect(patched).toContain("v_company,'cash.event.v2',p_client_request_id::text");
    expect(patched).toContain("DETAIL='PDV_CASH_CUSTODY_INSUFFICIENT'");
    expect(patched).toContain("IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF;");
    expect(patched.indexOf('IF v_claim.is_replay THEN')).toBeLessThan(patched.indexOf("set_config('app.pdv_treasury_custody_delta',jsonb_build_object"));
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261107170000_quote_number_reservations.sql', 'utf8');
const reserve = sql.split('CREATE FUNCTION public.reserve_quote_number')[1].split('REVOKE ALL ON FUNCTION public.reserve_quote_number')[0];
const create = sql.split('CREATE FUNCTION public.create_reserved_quote')[1];

describe('quote number reservation security contract', () => {
  it('uses the canonical sequence with request identity and does not create commercial quotes on reserve', () => {
    expect(reserve).toContain("nextval('public.quotes_quote_number_seq'::regclass)");
    expect(reserve).toContain('pg_advisory_xact_lock');
    expect(reserve).toContain('WHERE id=p_request_id FOR UPDATE');
    expect(reserve).toContain('VALUES(p_request_id,p_company_id,auth.uid(),v_number)');
    expect(reserve).not.toMatch(/INSERT INTO public\.(quotes|quote_items)\b/);
    expect(sql).not.toMatch(/SELECT\s+MAX\s*\(/i);
    expect(sql).not.toMatch(/setval\s*\(/i);
  });

  it('asserts auth identity, tenant, active profile, subscription and quote plan before both RPCs', () => {
    expect(sql).toContain('auth.uid() IS DISTINCT FROM p_user_id');
    expect(sql).toContain('p_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())');
    expect(sql).toContain('p.is_active IS TRUE');
    expect(sql).toContain('public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM true');
    expect(sql).toContain("public.company_plan_allows_product_area(p_company_id,'quotes') IS DISTINCT FROM true");
    expect(sql.match(/PERFORM public.quote_number_assert_access\(p_company_id,p_user_id\)/g)).toHaveLength(2);
  });

  it('keeps the ledger private with RLS and no direct mutation grants', () => {
    expect(sql).toContain('ALTER TABLE public.quote_number_reservations ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('user_id=(SELECT auth.uid())');
    expect(sql).toContain('REVOKE ALL ON public.quote_number_reservations FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).toContain('GRANT SELECT ON public.quote_number_reservations TO authenticated');
    expect(sql).not.toMatch(/GRANT (?:ALL|INSERT|UPDATE|DELETE) ON public.quote_number_reservations/i);
    expect(sql).toContain('SET search_path=pg_catalog,public');
  });

  it('never recycles the request or number after expiration or quote deletion', () => {
    expect(sql).toContain('id uuid PRIMARY KEY');
    expect(sql).toContain('quote_number integer NOT NULL UNIQUE');
    expect(sql).toContain('quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL');
    expect(create).toContain('IF v_res.consumed_at IS NOT NULL THEN');
    expect(create).toContain('OR v_res.quote_id IS NULL');
    expect(sql).not.toMatch(/DELETE FROM public.quote_number_reservations/i);
    expect(reserve).toContain("ERRCODE='QNR02'");
  });

  it('stores only a fingerprint and checks it before idempotent replay', () => {
    expect(sql).toContain('request_hash text');
    expect(sql).not.toMatch(/request_payload\s+jsonb|snapshot\s+jsonb/i);
    expect(create).toContain('extensions.digest');
    expect(create).toContain("'sha256'");
    expect(create).toContain('v_res.request_hash IS DISTINCT FROM v_request_hash');
    expect(create).toContain('RETURN to_jsonb(v_saved)');
    expect(create).not.toMatch(/UPDATE public.quotes/);
  });

  it('protects reserved numbers against legacy manual INSERT and later identity changes', () => {
    expect(sql).toContain("'quote-number-value:'||v_number::text");
    expect(sql).toContain("'quote-number-value:'||NEW.quote_number::text");
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF id,quote_number,company_id,created_by');
    expect(sql).toContain('WHERE quote_id=OLD.id');
    expect(sql).toContain('NEW.quote_number IS DISTINCT FROM v_res.quote_number');
    expect(sql).toContain('v_res.quote_id IS DISTINCT FROM NEW.id');
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(create.indexOf('SET quote_id=v_saved.id,consumed_at')).toBeLessThan(create.indexOf('INSERT INTO public.quotes'));
  });

  it('renews a pending number only for the same owner and live personal draft', () => {
    expect(sql).toContain('company_id=NEW.company_id AND user_id=NEW.user_id AND consumed_at IS NULL');
    expect(sql).toContain("id::text=lower(NEW.payload->>'numberRequestId')");
    expect(sql).toContain('GREATEST(expires_at,NEW.expires_at)');
    expect(sql).toContain('AFTER INSERT OR UPDATE OF payload,expires_at');
  });

  it('whitelists form data and validates every private foreign reference within the tenant', () => {
    const keys = create.match(/v_quote_keys text\[\]:=ARRAY\[(.*?)\]/)?.[1] ?? '';
    for (const field of ['company_id', 'created_by', 'token', 'financial_generated_at', 'financial_transaction_id', 'converted_to_os_id']) {
      expect(keys).not.toContain(`'${field}'`);
    }
    expect(create).toContain('WHERE id=v_quote.customer_id AND company_id=p_company_id');
    expect(create).toContain('WHERE id=v_item.inventory_id AND company_id=p_company_id');
    expect(create).toContain('WHERE id=v_item.service_type_id AND company_id=p_company_id');
    expect(create).toContain('WHERE (user_id=v_quote.assigned_to OR id=v_quote.assigned_to) AND company_id=p_company_id');
    expect(create).toContain("v_quote.status IS DISTINCT FROM 'rascunho'");
  });

  it('inserts quote and items together, derives item totals and rejects nonfinite values', () => {
    expect(create).toContain('INSERT INTO public.quotes');
    expect(create).toContain('INSERT INTO public.quote_items');
    expect(create).toContain('v_item.total_price:=v_item.quantity*v_item.unit_price');
    expect(create).toContain("jsonb_typeof(value) NOT IN('number','null')");
    expect(create).toContain('EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range');
    expect(create.match(/COMMIT;/g)).toHaveLength(1);
    expect(create).not.toMatch(/\bCALL\s|\bdblink\s*\(/i);
  });
});

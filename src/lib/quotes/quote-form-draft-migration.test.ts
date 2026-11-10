import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261107023000_quote_personal_form_drafts.sql', 'utf8');
describe('personal quote draft security contract', () => {
  it('derives the owner from auth and denies inactive or foreign tenants before every RPC', () => {
    expect(sql).toContain('auth.uid() IS DISTINCT FROM p_user_id');
    expect(sql).toContain('p_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())');
    expect(sql).toContain('p.is_active IS TRUE');
    expect(sql).toContain('public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM true');
    expect(sql.match(/PERFORM public.quote_form_draft_assert_access\(p_company_id, p_user_id\)/g)).toHaveLength(2);
    expect(sql).toContain('SET search_path = pg_catalog, public');
  });
  it('allows only own unexpired SELECT via RLS and no direct writes', () => {
    expect(sql).toContain('ALTER TABLE public.quote_form_drafts ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('user_id = (SELECT auth.uid())');
    expect(sql).toContain('expires_at > now()');
    expect(sql).toContain('REVOKE ALL ON public.quote_form_drafts FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).toContain('GRANT SELECT ON public.quote_form_drafts TO authenticated');
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON public.quote_form_drafts/i);
  });
  it('uses CAS, request idempotency and globally unique revisions across cleanup', () => {
    expect(sql).toContain('v_row.last_request_id = p_request_id');
    expect(sql).toContain('v_row.payload IS DISTINCT FROM p_payload');
    expect(sql).toContain('COALESCE(v_row.revision, 0) <> p_expected_revision');
    expect(sql).toContain("ERRCODE = '40001'");
    expect(sql).toContain("nextval('public.quote_form_draft_revision_seq'::regclass)");
    expect(sql).toContain('pg_advisory_xact_lock');
  });
  it('expires server-side after 30 days and physically purges every day', () => {
    expect(sql).toContain("v_now+interval '30 days'");
    expect(sql).toContain('CASE WHEN v_row.expires_at > now() THEN v_row.payload ELSE NULL END');
    expect(sql).toContain("'expire-personal-quote-form-drafts', '20 3 * * *'");
    expect(sql).toContain('DELETE FROM public.quote_form_drafts WHERE expires_at <= now()');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261126182000_payment_receipts_and_quote_execution.sql', 'utf8');
describe('fronteiras dos recibos', () => {
 it('portal reusa o gate completo e exige a seção financeira desbloqueada', () => {
  expect(sql).toContain('payload:=public.get_portal_data(p_token,p_session_token)');
  expect(sql).toContain("payload->>'access' IS DISTINCT FROM 'granted'");
  expect(sql).toContain("payload#>>'{permissions,charges}'");
  expect(sql).toContain("payload->'locked_sections','[]'::jsonb) ? 'charges'");
 });
 it('consulta pública da OS usa a vigência interna sem exigir sessão de empresa do visitante', () => {
  const document = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_os_commercial_document'), sql.indexOf('CREATE FUNCTION public._financial_payment_receipt'));
  expect(document).toContain('public.pdv_company_access_entitled_internal(so.company_id)');
  expect(document).not.toContain('public.tenant_subscription_allows_access(so.company_id)');
 });
 it('não publica helpers internos nem RPC de leitura financeira para anônimos', () => {
  for (const signature of ['_financial_receipt_customer(uuid)', '_financial_payment_receipt(uuid)', '_charge_payment_receipt(uuid)', '_os_receipt_context(uuid)', '_os_confirmed_payments(uuid)', '_can_read_payment_receipt(uuid)', '_portal_receipt_customer(text,text)']) {
   expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC,anon,authenticated;`);
  }
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_financial_payment_receipt(uuid) FROM PUBLIC,anon');
 });
 it('autoriza cliente e tenant antes de chamar os helpers', () => {
  expect(sql).toContain('f.company_id=company AND public._financial_receipt_customer(f.id)=customer');
  expect(sql).toContain('id=p_id AND company_id=company AND customer_id=customer');
  expect(sql).toContain('s.customer_id=c.customer_id');
  expect(sql).toContain('s.customer_id=v_customer');
  expect(sql).toContain('COALESCE(f.customer_id,parent.customer_id,so.customer_id)');
  expect(sql).toContain('so.company_id=f.company_id');
 });
});

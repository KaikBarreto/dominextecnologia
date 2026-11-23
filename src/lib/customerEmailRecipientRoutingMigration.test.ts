import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261123172000_customer_email_recipient_routing.sql',
  ),
  'utf8',
);

describe('roteamento de destinatários de e-mail por cliente', () => {
  it('modela rota explícita, destinatários e eventos individuais', () => {
    expect(migration).toContain('CREATE TABLE public.customer_email_routes');
    expect(migration).toContain('CREATE TABLE public.customer_email_route_recipients');
    expect(migration).toContain("recipient_kind IN ('customer_primary', 'customer_contact')");
    expect(migration).toContain('charge_created_enabled');
    expect(migration).toContain('due_reminder_enabled');
    expect(migration).toContain('charge_overdue_enabled');
    expect(migration).toContain('charge_paid_enabled');
    expect(migration).toContain('charge_refunded_enabled');
  });

  it('isola a leitura por tenant e bloqueia escrita direta autenticada', () => {
    expect(migration).toContain('customer_email_routes_customer_company_fkey');
    expect(migration).toContain('company_id = public.get_user_company_id(auth.uid())');
    expect(migration).toContain('public.tenant_subscription_allows_access(company_id)');
    expect(migration).toMatch(
      /REVOKE ALL ON public\.customer_email_routes, public\.customer_email_route_recipients[\s\S]{0,100}FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /GRANT SELECT ON public\.customer_email_routes, public\.customer_email_route_recipients[\s\S]{0,100}TO authenticated/,
    );
  });

  it('salva por RPC atômica com gate de módulo e permissão financeira', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.set_customer_email_route');
    expect(migration).toContain("public.company_has_module(v_company_id, 'cobrancas')");
    expect(migration).toContain("public.user_has_permission(v_user_id, 'fn:manage_finance')");
    expect(migration).toContain('public.is_admin_or_gestor(v_user_id)');
    expect(migration).toContain('cc.customer_id = p_customer_id');
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_customer_email_route[\s\S]{0,180}FROM PUBLIC, anon/,
    );
  });

  it('usa o e-mail principal somente sem rota explícita e falha fechado no opt-out', () => {
    const resolver = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.email_resolve_recipients'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.set_customer_email_route'),
    );

    expect(resolver).toContain('c.company_id = p_company_id');
    expect(resolver).toContain('c.is_deleted IS FALSE');
    expect(resolver).toContain('WHERE NOT EXISTS (SELECT 1 FROM route_row)');
    expect(resolver).toContain('WHERE r.enabled');
    expect(resolver).toContain('DISTINCT ON (normalized_email)');
  });

  it('faz fan-out com dedupe por destinatário e mantém o evento global como limite mestre', () => {
    const enqueue = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_customer_billing_email'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_customer_billing_due_reminders'),
    );

    expect(enqueue).toContain('CROSS JOIN LATERAL public.email_resolve_recipients');
    expect(enqueue).toContain("p_dedupe_key || ':' || r.recipient_kind");
    expect(enqueue).toContain("public.company_has_module(tc.company_id, 'cobrancas') IS TRUE");
    expect(enqueue).toContain("WHEN 'charge_paid' THEN s.charge_paid_enabled");
    expect(enqueue).toContain('recipient_kind, customer_contact_id, recipient_route_id');
  });

  it('cancela entregas pendentes que deixaram de ser autorizadas', () => {
    expect(migration).toContain("d.status IN ('pending', 'retry')");
    expect(migration).toContain("last_error_code = 'customer_email_route_changed'");
    expect(migration).toContain('r.recipient_email = d.recipient_email');
  });

  it('aplica mudancas globais e de endereco tambem sobre a fila pendente', () => {
    expect(migration).toContain('cancel_disallowed_customer_email_deliveries');
    expect(migration).toContain("WHEN 'charge_paid' THEN NEW.charge_paid_enabled IS NOT TRUE");
    expect(migration).toContain("'customer_email_event_disabled'");
    expect(migration).toContain('cancel_pending_customer_emails_on_primary_change');
    expect(migration).toContain('cancel_pending_customer_emails_on_contact_change');
    expect(migration).toContain("'customer_email_recipient_changed'");
  });
});

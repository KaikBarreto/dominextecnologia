import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261115120000_customer_whatsapp_recipient_routing.sql',
  ),
  'utf8',
);

describe('roteamento de destinatarios do WhatsApp por cliente', () => {
  it('modela rota explicita e varios destinatarios sem inferir pelo cargo', () => {
    expect(migration).toContain('CREATE TABLE public.customer_whatsapp_routes');
    expect(migration).toContain('CREATE TABLE public.customer_whatsapp_route_recipients');
    expect(migration).toContain("category IN ('service_order', 'billing')");
    expect(migration).toContain("recipient_kind IN ('customer_primary', 'customer_contact')");
    expect(migration).not.toMatch(/position\s*=|cargo\s*=/i);
  });

  it('isola as rotas por tenant e bloqueia escrita direta autenticada', () => {
    expect(migration).toContain('customer_whatsapp_routes_customer_company_fkey');
    expect(migration).toMatch(
      /Users can view whatsapp routes from their company[\s\S]{0,300}company_id = public\.get_user_company_id\(auth\.uid\(\)\)/,
    );
    expect(migration).toContain('public.tenant_subscription_allows_access(company_id)');
    expect(migration).toContain("public.user_has_permission(auth.uid(), 'fn:view_customer_financial')");
    expect(migration).toMatch(
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE[\s\S]{0,180}FROM authenticated, anon/,
    );
    expect(migration).toMatch(
      /Users can view whatsapp opt-outs from their company[\s\S]{0,260}public\.is_super_admin\(auth\.uid\(\)\)[\s\S]{0,180}company_id = public\.get_user_company_id\(auth\.uid\(\)\)/,
    );
  });

  it('configura por RPC atomica com permissoes distintas para OS e financeiro', () => {
    expect(migration).toContain('public.set_customer_whatsapp_route');
    expect(migration).toContain("public.user_has_permission(v_user_id, 'fn:edit_customer')");
    expect(migration).toContain("public.user_has_permission(v_user_id, 'fn:manage_finance')");
    expect(migration).toContain('public.is_admin_or_gestor(v_user_id)');
    expect(migration).toContain('Um ou mais contatos nao pertencem ao cliente');
    expect(migration).toContain('Selecione ao menos um destinatario para ativar a categoria');
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_customer_whatsapp_route[\s\S]{0,160}FROM PUBLIC, anon/,
    );
  });

  it('usa fallback legado somente quando a rota nao existe e falha fechado depois', () => {
    expect(migration).toContain('public.whatsapp_resolve_recipients');
    expect(migration).toContain('WHERE NOT EXISTS (SELECT 1 FROM route_row)');
    expect(migration).toContain('WHERE r.enabled IS TRUE');
    expect(migration).toContain('public.whatsapp_opt_outs');
    expect(migration).toContain('DISTINCT ON (e.normalized_phone)');
  });

  it('falha fechado para assinatura sem acesso e cliente excluido logicamente', () => {
    const resolver = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.whatsapp_resolve_recipients'),
      migration.indexOf('-- 5) Enfileiramento transacional'),
    );
    const transactional = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_transactional_job'),
      migration.indexOf('-- 6) Lembrete agendado'),
    );
    const scheduled = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.whatsapp_enqueue_scheduled_os_reminder_job'),
      migration.indexOf('-- 7) Revalidacao final'),
    );

    expect(resolver).toContain('public.tenant_subscription_allows_access(p_company_id)');
    expect(transactional).toContain('public.tenant_subscription_allows_access(p_company_id) IS NOT TRUE');
    expect(scheduled).toContain('public.tenant_subscription_allows_access(p_company_id) IS NOT TRUE');
    expect(resolver).toContain('c.is_deleted IS FALSE');
    expect(transactional).toContain('c.is_deleted IS FALSE');
    expect(scheduled).toContain('c.is_deleted IS FALSE');
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.set_customer_whatsapp_route[\s\S]{0,1800}c\.is_deleted IS FALSE/,
    );
    expect(migration).toContain("RETURN 'subscription_inactive'");
  });

  it('registra o destinatario em jobs e eventos sem apagar historico ao excluir contato', () => {
    expect(migration).toContain('whatsapp_send_jobs_customer_contact_id_fkey');
    expect(migration).toContain('whatsapp_events_customer_contact_id_fkey');
    expect(migration.match(/ON DELETE SET NULL/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toMatch(
      /ALTER TABLE public\.whatsapp_send_jobs[\s\S]{0,900}ADD COLUMN recipient_kind[\s\S]{0,900}ADD COLUMN customer_contact_id[\s\S]{0,900}ADD COLUMN recipient_route_id/,
    );
  });

  it('faz fan-out com dedupe por telefone normalizado', () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.whatsapp_enqueue_transactional_job[\s\S]*FOR v_recipient IN[\s\S]*whatsapp_resolve_recipients/,
    );
    expect(migration).toContain("'%s:recipient:%s'");
    expect(migration).toContain('md5(v_recipient.normalized_phone)');
    expect(migration).toMatch(
      /INSERT INTO public\.whatsapp_send_jobs[\s\S]{0,600}recipient_kind, customer_contact_id, recipient_route_id/,
    );
  });

  it('revalida rota e telefone do lembrete antes do envio e preserva jobs antigos', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.whatsapp_validate_scheduled_os_reminder');
    expect(migration).toContain("p_company_id, v_order.customer_id, 'os.scheduled_reminder'");
    expect(migration).toContain("RETURN 'recipient_unavailable'");
    expect(migration).toContain("RETURN 'recipient_phone_changed'");
    expect(migration).toContain('v_job.dedupe_key IS DISTINCT FROM v_expected_dedupe_base');
    expect(migration).toContain('v_job.dedupe_key IS DISTINCT FROM v_expected_dedupe_recipient');
    expect(migration).toMatch(
      /whatsapp_finalize_send_job[\s\S]*recipient_kind, customer_contact_id, recipient_route_id/,
    );
  });

  it('marca e finaliza qualquer envio de forma transacional sem duplicar apos crash', () => {
    const begin = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.whatsapp_begin_send_job_dispatch'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.whatsapp_begin_scheduled_os_dispatch'),
    );
    const finalize = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.whatsapp_finalize_send_job'),
      migration.indexOf('-- Compatibilidade com o worker anterior durante rollout.', migration.indexOf('CREATE OR REPLACE FUNCTION public.whatsapp_finalize_send_job')),
    );

    expect(begin).toContain("j.status = 'processing'");
    expect(begin).toContain('j.dispatch_started_at IS NULL');
    expect(begin).toContain("v_job.event_key = 'os.scheduled_reminder'");
    expect(begin).toContain('public.whatsapp_validate_scheduled_os_reminder');
    expect(begin).toContain('SET dispatch_started_at = now()');

    expect(finalize).not.toContain("j.event_key = 'os.scheduled_reminder'");
    expect(finalize).toContain('j.dispatch_started_at IS NOT NULL');
    expect(finalize).toContain("CASE WHEN v_job.source_type = 'service_order' THEN v_job.source_id ELSE NULL END");
    expect(finalize).toContain('recipient_kind, customer_contact_id, recipient_route_id');
    expect(finalize).toContain('UPDATE public.whatsapp_connections');

    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.whatsapp_begin_scheduled_os_dispatch[\s\S]{0,500}whatsapp_begin_send_job_dispatch/,
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.whatsapp_finalize_scheduled_os_reminder[\s\S]{0,700}whatsapp_finalize_send_job/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.whatsapp_begin_send_job_dispatch[\s\S]{0,220}FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.whatsapp_finalize_send_job[\s\S]{0,220}FROM PUBLIC, anon, authenticated/,
    );
  });
});

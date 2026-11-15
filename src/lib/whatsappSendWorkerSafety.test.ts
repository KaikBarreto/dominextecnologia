import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const worker = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-send-worker/index.ts'),
  'utf8',
);
const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'),
  'utf8',
);

describe('seguranca do worker de WhatsApp', () => {
  it('normaliza telefone conforme o pais e usa o telefone alternativo quando celular esta vazio', () => {
    expect(worker).toContain('const COUNTRY_PHONE_RULES');
    expect(worker).toContain('BR: { dialCode: "55"');
    expect(worker).toContain('PT: { dialCode: "351"');
    expect(worker).toContain('IT: { dialCode: "39", nationalMin: 6, nationalMax: 11, stripTrunkZero: false }');
    expect(worker).toContain('value.startsWith("+") || value.startsWith("00")');
    expect(worker).toContain('customer.celular?.trim() || customer.phone');
    expect(worker).toContain('regionalSettings.country_code');
  });

  it('espera localmente e revalida todo envio antes do provedor sem delay remoto', () => {
    const localDelay = worker.indexOf('await sleep(delayMs);');
    const secondValidation = worker.lastIndexOf('validateFinalDispatchState(');
    const dispatchMarker = worker.lastIndexOf('beginSendJobDispatch(supabase, job, phone)');
    const reminderSend = worker.indexOf('const sent = await sendText');

    expect(localDelay).toBeGreaterThan(-1);
    expect(secondValidation).toBeGreaterThan(localDelay);
    expect(dispatchMarker).toBeGreaterThan(secondValidation);
    expect(reminderSend).toBeGreaterThan(dispatchMarker);
    expect(worker).not.toContain('job.event_key === "os.scheduled_reminder" ? undefined : { delayMs }');
  });

  it('falha fechado nas leituras e nao sobrescreve cancelamento concorrente', () => {
    expect(worker).toContain('initial_data_unavailable');
    expect(worker).toContain('opt_out_check_unavailable');
    expect(worker).toContain('quota_check_unavailable');
    expect(worker).toContain('volume_check_unavailable');
    expect(worker).toContain('source_check_unavailable');
    expect(worker.match(/\.eq\("status", "processing"\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(worker).toMatch(/provider_not_implemented[\s\S]{0,220}deferJob|deferJob\([\s\S]{0,220}provider_not_implemented/);
  });

  it('nao repete automaticamente uma entrega de resultado ambiguo', () => {
    expect(worker).toContain('status === 0 || status === 408 || status >= 500');
    expect(worker).toContain('failJob(supabase, job, "delivery_unknown"');
    expect(worker).toContain('!(error instanceof EvolutionConfigError)');
    expect(worker).toContain('whatsapp_begin_send_job_dispatch');
    expect(worker).toContain('whatsapp_finalize_send_job');
    expect(worker).toContain('dispatch_started_at: null');
    expect(worker).toContain('result === "job_unavailable" || typeof result !== "string"');
    const begin = worker.lastIndexOf('beginSendJobDispatch(supabase, job, phone)');
    const send = worker.indexOf('const sent = await sendText');
    const finalize = worker.indexOf('"whatsapp_finalize_send_job"');
    expect(begin).toBeLessThan(send);
    expect(finalize).toBeGreaterThan(send);
  });

  it('mantem leituras auxiliares de OS dentro do tenant', () => {
    expect(worker).toMatch(/from\("profiles"\)[\s\S]{0,160}eq\("company_id", job\.company_id\)/);
    expect(worker).toMatch(/from\("service_types"\)[\s\S]{0,160}eq\("company_id", job\.company_id\)/);
  });

  it('resolve e revalida destinatario personalizado dentro do cliente e tenant', () => {
    expect(worker).toContain('recipient_kind?: "customer_primary" | "customer_contact"');
    expect(worker).toContain('.from("customer_whatsapp_routes")');
    expect(worker).toContain('.eq("company_id", job.company_id)');
    expect(worker).toContain('.eq("customer_id", job.customer_id)');
    expect(worker).toContain('.from("customer_whatsapp_route_recipients")');
    expect(worker).toMatch(
      /from\("customer_contacts"\)[\s\S]{0,220}eq\("id", job\.customer_contact_id\)[\s\S]{0,120}eq\("customer_id", job\.customer_id\)/,
    );
    expect(worker).toContain('recipient_route_changed');
  });

  it('audita o destinatario e nao transforma opt-out de um telefone em bloqueio global', () => {
    expect(worker).toContain('recipient_kind: recipientKind(job)');
    expect(worker).toContain('customer_contact_id: job.customer_contact_id ?? null');
    expect(worker).toContain('recipient_route_id: job.recipient_route_id ?? null');
    expect(worker).not.toContain('!customer.whatsapp_notifications_enabled || customer.whatsapp_opt_out_at');

    expect(webhook).toContain('.from("whatsapp_opt_outs")');
    expect(webhook).toContain('{ onConflict: "company_id,phone" }');
    expect(webhook).not.toMatch(/from\("customers"\)[\s\S]{0,500}whatsapp_notifications_enabled:\s*false/);
  });

  it('revalida entitlement, destinatario, origem, rota e opt-out depois da espera', () => {
    const finalCheck = worker.lastIndexOf('validateFinalDispatchState(');
    const send = worker.indexOf('const sent = await sendText');

    expect(finalCheck).toBeGreaterThan(worker.indexOf('await sleep(delayMs);'));
    expect(send).toBeGreaterThan(finalCheck);
    expect(worker).toContain('supabase.rpc("tenant_subscription_allows_access"');
    expect(worker).toContain('whatsapp_notifications_enabled, is_deleted');
    expect(worker).toContain('recipient_phone_changed');
    expect(worker).toContain('source_obsolete');
    expect(worker).toContain('["PENDING", "OVERDUE"]');
    expect(worker).toContain('"os.a_caminho": "a_caminho"');
  });

  it('preserva opt-out em falha transitoria e aceita E.164 curto', () => {
    expect(webhook).toContain('digits.length < 8 || digits.length > 15');
    expect(webhook).toContain('instance_resolution_unavailable');
    expect(webhook).toContain('opt_out_persistence_unavailable');
    expect(webhook).toContain('isWhatsAppOptOutText(text)');
    expect(webhook).not.toContain('function isOptOutText');
    expect(webhook.match(/return jsonResponse\([^;]+, 503\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(webhook).toContain('{ onConflict: "company_id,phone" }');
  });

  it('nao associa ACK sem id do provedor apenas pelo telefone', () => {
    const finder = webhook.slice(
      webhook.indexOf('async function findDeliveryEvent'),
      webhook.indexOf('Deno.serve(async'),
    );
    expect(finder).toContain('if (!providerMessageId) return null');
    expect(finder).not.toContain('.eq("phone"');
  });
});

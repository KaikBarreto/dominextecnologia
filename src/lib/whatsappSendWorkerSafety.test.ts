import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const worker = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-send-worker/index.ts'),
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

  it('espera localmente e revalida o lembrete antes de enviar sem delay no provedor', () => {
    const localDelay = worker.indexOf('await sleep(delayMs);');
    const secondValidation = worker.lastIndexOf('beginScheduledReminderDispatch(supabase, job, phone)');
    const reminderSend = worker.indexOf('const sent = await sendText');

    expect(localDelay).toBeGreaterThan(-1);
    expect(secondValidation).toBeGreaterThan(localDelay);
    expect(reminderSend).toBeGreaterThan(secondValidation);
    expect(worker).toContain('job.event_key === "os.scheduled_reminder" ? undefined : { delayMs }');
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
    expect(worker).toContain('whatsapp_finalize_scheduled_os_reminder');
    expect(worker).toContain('dispatch_started_at: null');
  });

  it('mantem leituras auxiliares de OS dentro do tenant', () => {
    expect(worker).toMatch(/from\("profiles"\)[\s\S]{0,160}eq\("company_id", job\.company_id\)/);
    expect(worker).toMatch(/from\("service_types"\)[\s\S]{0,160}eq\("company_id", job\.company_id\)/);
  });
});

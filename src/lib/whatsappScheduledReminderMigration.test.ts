import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261027130000_whatsapp_lembrete_os_agendada.sql'),
  'utf8',
);
const worker = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-send-worker/index.ts'),
  'utf8',
);

describe('lembrete de OS agendada por WhatsApp', () => {
  it('aceita o evento na fila e o classifica na janela restrita', () => {
    expect(migration).toMatch(/whatsapp_template_bindings_event_key_check[\s\S]*os\.scheduled_reminder/);
    expect(migration).toMatch(/whatsapp_send_jobs_event_key_check[\s\S]*os\.scheduled_reminder/);
    expect(migration).toMatch(/WHEN COALESCE\(p_event_key, ''\) = 'os\.scheduled_reminder' THEN 'reminders'/);
  });

  it('fotografa primeira jornada, timing e instante no mesmo insert do job', () => {
    expect(migration).toContain("so.schedule_plan->0->>'date'");
    expect(migration).toContain("so.schedule_plan->0->>'time'");
    expect(migration).toMatch(
      /INSERT INTO public\.whatsapp_send_jobs[\s\S]*schedule_snapshot_at, schedule_snapshot_timing[\s\S]*p_scheduled_at, p_timing/,
    );
    expect(migration).toContain("'os.scheduled_reminder:%s:at=%s:timing=%s'");
  });

  it('usa somente timezone IANA valido e falha fechado quando ele falta', () => {
    expect(migration).toContain('JOIN pg_catalog.pg_timezone_names');
    expect(migration).not.toMatch(/whatsapp_company_timezone[\s\S]{0,900}America\/Sao_Paulo/);
    expect(migration).toContain('IF v_timezone IS NULL THEN RETURN false; END IF;');
    expect(migration).toContain("IF v_timezone IS NULL THEN RETURN 'timezone_unavailable'; END IF;");
  });

  it('cancela jobs obsoletos e revalida tenant, cliente, status e horario', () => {
    expect(migration).toContain('OLD.schedule_plan IS DISTINCT FROM NEW.schedule_plan');
    expect(migration).toContain('OLD.entry_type IS DISTINCT FROM NEW.entry_type');
    expect(migration).toContain("AND j.status IN ('pending', 'retry', 'processing')");
    expect(migration).toContain("AND j.status = 'processing'");
    expect(migration).toContain('v_job.customer_id IS DISTINCT FROM v_order.customer_id');
    expect(migration).toContain("public.company_has_module(p_company_id, 'whatsapp') IS NOT TRUE");
    expect(migration).toContain('v_settings.active_connection_id IS DISTINCT FROM v_job.connection_id');
    expect(migration).toContain('FROM public.whatsapp_opt_outs o');
    expect(migration).toContain("RETURN 'appointment_passed'");
    expect(migration).toContain('whatsapp_send_jobs.provider_message_id IS NULL');
  });

  it('o worker relê o snapshot imediatamente antes de chamar o provedor', () => {
    const validationPosition = worker.indexOf('whatsapp_validate_scheduled_os_reminder');
    const markReadPosition = worker.indexOf('markConversationRead(supabase, job', validationPosition);
    const presencePosition = worker.indexOf('sendPresence(connection.instance_name, phone, "available")', validationPosition);
    const dispatchPosition = worker.indexOf('beginScheduledReminderDispatch(supabase, job, phone)', presencePosition);
    const sendPosition = worker.indexOf('const sent = await sendText', dispatchPosition);

    expect(validationPosition).toBeGreaterThan(-1);
    expect(markReadPosition).toBeGreaterThan(validationPosition);
    expect(presencePosition).toBeGreaterThan(validationPosition);
    expect(dispatchPosition).toBeGreaterThan(presencePosition);
    expect(sendPosition).toBeGreaterThan(dispatchPosition);
    expect(worker.match(/validateScheduledReminderBeforeSend\(supabase, job, phone\)/g)).toHaveLength(1);
    expect(worker).toContain('scheduled_reminder_validation_unavailable');
    expect(worker).toContain('O horário agendado da visita já passou.');
  });

  it('nao reenvia orfao apos iniciar o provedor e finaliza o sucesso atomicamente', () => {
    expect(migration).toContain('dispatch_started_at timestamptz');
    expect(migration).toContain('whatsapp_begin_scheduled_os_dispatch');
    expect(migration).toMatch(/SET dispatch_started_at = now\(\),[\s\S]{0,80}locked_at = now\(\)/);
    expect(migration).toMatch(/status = 'failed'[\s\S]{0,250}last_error_code = 'delivery_unknown'/);
    expect(migration).toContain('whatsapp_finalize_scheduled_os_reminder');
    expect(migration).toMatch(/INSERT INTO public\.whatsapp_events[\s\S]*UPDATE public\.whatsapp_connections/);
    expect(worker).toContain('whatsapp_finalize_scheduled_os_reminder');
  });

  it('mantem a normalizacao SQL alinhada ao pais e aos limites E.164', () => {
    expect(migration).toMatch(/SELECT upper\(btrim\(cs\.country_code\)\)[\s\S]{0,900}IF v_international THEN/);
    expect(migration).toContain('length(v_digits) BETWEEN 8 AND 15');
    expect(migration).toContain("('BR',10,11,true)");
    expect(migration).toContain("('PT',9,9,false)");
    expect(migration).toContain("('DE',5,11,true)");
  });
});

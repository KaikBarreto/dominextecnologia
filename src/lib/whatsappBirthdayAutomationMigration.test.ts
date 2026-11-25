import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261125120000_whatsapp_birthday_automation.sql'),
  'utf8',
);

describe('migration da automacao de aniversario por WhatsApp', () => {
  it('adiciona a data de nascimento dos contatos sem backfill', () => {
    expect(migration).toContain('ALTER TABLE public.customer_contacts');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS birth_date date');
    expect(migration).not.toMatch(/UPDATE\s+public\.customer_contacts[\s\S]{0,300}birth_date/i);
  });

  it('preserva a preferencia existente e forca o opt-in desligado', () => {
    expect(migration).toContain("'birthday'");
    expect(migration).toContain("'{birthday,events,greeting}'");
    expect(migration).toContain("'{\"enabled\": false}'::jsonb");
    expect(migration).toMatch(/UPDATE public\.company_whatsapp_settings[\s\S]+automation_preferences\s*=\s*s\.automation_preferences\s*\|\|/);
  });

  it('agenda a busca horaria e deduplica por pessoa e ano local', () => {
    expect(migration).toContain("'37 * * * *'");
    expect(migration).toContain("ON CONFLICT (company_id, dedupe_key) DO NOTHING");
    expect(migration).toContain("EXTRACT(YEAR FROM now() AT TIME ZONE r.timezone)");
    expect(migration).toContain("CASE WHEN r.recipient_kind = 'customer_contact' THEN 'contact' ELSE 'customer' END");
  });

  it('permite aniversario no domingo sem deslocar o dia civil', () => {
    expect(migration).toContain("p_event_key IN ('os.scheduled_reminder', 'birthday.greeting')");
    expect(migration).toContain("p_event_key NOT IN ('os.scheduled_reminder', 'birthday.greeting')");
    expect(migration).toContain('AT TIME ZONE ec.timezone');
  });

  it('restringe tenant, consentimento, telefone, data e despacho final', () => {
    expect(migration).toContain("c.provider = 'evolution_qr'");
    expect(migration).toContain("public.company_has_module(s.company_id, 'whatsapp') IS TRUE");
    expect(migration).toContain('public.tenant_subscription_allows_access(s.company_id) IS TRUE');
    expect(migration).toContain('c.whatsapp_notifications_enabled IS TRUE');
    expect(migration).toContain('c.whatsapp_opt_out_at IS NULL');
    expect(migration).toContain('public.whatsapp_normalize_phone(r.company_id, r.raw_phone)');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.whatsapp_validate_birthday_dispatch');
    expect(migration).toContain("ELSIF v_job.event_key = 'birthday.greeting'");
    expect(migration).toContain("RETURN 'recipient_phone_changed'");
    expect(migration).toContain("RETURN 'birthday_date_changed'");
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261123150000_whatsapp_event_module_gates.sql'),
  'utf8',
);

describe('gates de módulo dos eventos de WhatsApp', () => {
  it('bloqueia a criação de jobs de OS e cobrança sem o módulo funcional', () => {
    expect(migration).toContain("NEW.event_key LIKE 'os.%'");
    expect(migration).toContain("company_has_module(NEW.company_id, 'service_operations')");
    expect(migration).toContain("NEW.event_key LIKE 'billing.%'");
    expect(migration).toContain("company_has_module(NEW.company_id, 'cobrancas')");
    expect(migration).toContain('BEFORE INSERT ON public.whatsapp_send_jobs');
  });

  it('revalida os módulos imediatamente antes do envio externo', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.whatsapp_begin_send_job_dispatch');
    expect(migration).toContain("company_has_module(p_company_id, 'whatsapp')");
    expect(migration).toContain("company_has_module(p_company_id, 'service_operations')");
    expect(migration).toContain("company_has_module(p_company_id, 'cobrancas')");
    expect(migration).toContain("RETURN 'event_module_inactive'");
  });
});

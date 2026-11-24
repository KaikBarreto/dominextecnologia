import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261123180000_admin_communication_statistics.sql',
  ),
  'utf8',
);

describe('estatísticas administrativas de comunicações', () => {
  it('mantém o agregado cross-tenant atrás do gate estrito de super admin', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('PERFORM public._assert_super_admin()');
    expect(migration).not.toContain('is_admin_user');
  });

  it('agrega as duas filas persistidas sem consultar conteúdo de mensagens', () => {
    expect(migration).toContain('public.customer_email_deliveries');
    expect(migration).toContain('public.whatsapp_send_jobs');
    expect(migration).toContain('public.whatsapp_connections');
    expect(migration).not.toMatch(/recipient_email|display_number|provider_message_id/);
  });

  it('não devolve o erro cru do provedor na resposta administrativa', () => {
    expect(migration).toContain('safe_error');
    expect(migration).not.toContain("'last_error_code',");
    expect(migration).not.toContain("'last_error',");
  });

  it('fecha o execute público e anônimo, mantendo o guard para autenticados', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_admin_communication_statistics[\s\S]{0,180}FROM PUBLIC/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_admin_communication_statistics[\s\S]{0,180}FROM anon/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_admin_communication_statistics[\s\S]{0,180}TO authenticated, service_role/,
    );
  });
});


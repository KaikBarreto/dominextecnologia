import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(
    process.cwd(),
    'supabase/functions/admin-communication-provider-metrics/index.ts',
  ),
  'utf8',
);

describe('métricas administrativas do provedor de comunicação', () => {
  it('exige sessão e super admin estrito antes de consultar o Resend', () => {
    const authPosition = source.indexOf('auth.getUser()');
    const rolePosition = source.indexOf('admin.rpc("has_role"');
    const fetchPosition = source.indexOf('fetch("https://api.resend.com/usage"');

    expect(authPosition).toBeGreaterThan(0);
    expect(rolePosition).toBeGreaterThan(authPosition);
    expect(fetchPosition).toBeGreaterThan(rolePosition);
    expect(source).toContain('_role: "super_admin"');
    expect(source).not.toContain('is_admin_user');
  });

  it('mantém o segredo no servidor e nunca o inclui no contrato de resposta', () => {
    expect(source).toContain('Deno.env.get("RESEND_API_KEY")');
    expect(source).toContain('Authorization: `Bearer ${resendApiKey}`');
    expect(source).not.toContain('apiKey: resendApiKey');
    expect(source).not.toContain('resendApiKey,');
  });

  it('isola falha externa sem derrubar o restante da aba', () => {
    expect(source).toContain('available: false');
    expect(source).toContain('return unavailable(');
    expect(source).toContain('Cache-Control');
  });

  it('expõe uso diário, mensal e o rate limit da própria conta', () => {
    expect(source).toContain('daily: usageWindow(emails.daily)');
    expect(source).toContain('monthly: usageWindow(emails.monthly)');
    expect(source).toContain('rateLimit:');
    expect(source).toContain('limit: finiteOrNull(rate.limit)');
    expect(source).toContain('duration: typeof rate.duration === "string"');
  });
});

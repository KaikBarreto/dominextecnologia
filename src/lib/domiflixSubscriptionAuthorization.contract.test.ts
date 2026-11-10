import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edge = readFileSync(
  `${process.cwd()}/supabase/functions/change-subscription-plan/index.ts`,
  'utf8',
);
const auth = readFileSync(
  `${process.cwd()}/supabase/functions/_shared/asaas-auth.ts`,
  'utf8',
);

describe('autorização de contratação pela DomiFlix', () => {
  it('usa a guarda de gestor na mutação de assinatura', () => {
    expect(edge).toContain('authorizeAsaasCompanyManager');
    expect(edge).not.toMatch(/const auth = await authorizeAsaasCompany\(/);
  });

  it('mantém tenant, superadmin e papéis administrativos validados no servidor', () => {
    expect(auth).toContain('const base = await authorizeAsaasCompany(');
    expect(auth).toContain('base.isSuperAdmin');
    expect(auth).toContain('_role: "admin"');
    expect(auth).toContain('_role: "gestor"');
    expect(auth).toContain('status: 403');
  });
});

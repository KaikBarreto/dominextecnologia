import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edge = readFileSync(
  `${process.cwd()}/supabase/functions/admin-company-access/index.ts`,
  'utf8',
);
const hook = readFileSync(
  `${process.cwd()}/src/hooks/useAdminCompanyAccess.ts`,
  'utf8',
);

describe('acesso administrativo da empresa', () => {
  it('exige sessão válida e permissão explícita antes de usar service role', () => {
    expect(edge).toContain("authHeader?.startsWith('Bearer ')");
    expect(edge).toContain('admin.auth.getUser(token)');
    expect(edge).toContain("_role: 'super_admin'");
    expect(edge).toContain("_permission: 'admin_empresas_acesso'");
    expect(edge).toContain("_permission: 'admin_vendedores_ver_todos'");
    expect(edge).toContain('roleError || permissionError');
    expect(edge).toContain('!isSuperAdmin && !hasPermission');
  });

  it('limita vendedor comum às empresas da própria carteira', () => {
    expect(edge).toContain(".from('salespeople')");
    expect(edge).toContain(".eq('user_id', callerId)");
    expect(edge).toContain(".eq('salesperson_id', salesperson.id)");
    expect(edge).toContain('Empresa não encontrada ou fora da sua carteira.');
  });

  it('confirma no servidor que o usuário pertence à empresa enviada', () => {
    expect(edge).toContain(".eq('company_id', body.company_id)");
    expect(edge).toContain(".eq('user_id', body.user_id)");
    expect(edge).toContain('admin.auth.admin.getUserById(body.user_id)');
    expect(edge).toContain('Usuário não encontrado nesta empresa.');
  });

  it('gera código de uso único no fluxo nativo e devolve somente o link', () => {
    expect(edge).toContain(".from('password_reset_codes')");
    expect(edge).toContain("new URL('/reset-password', getResetBaseUrl(req))");
    expect(edge).toContain("resetUrl.searchParams.set('code', code)");
    expect(edge).toContain('return json({ link: resetUrl.toString() });');
    expect(edge).not.toContain('otp');
  });

  it('mantém Supabase dentro do hook e não no componente de UI', () => {
    expect(hook).toContain("supabase.functions.invoke('admin-company-access'");
    expect(hook).toContain("action: 'list_users'");
    expect(hook).toContain("action: 'generate_reset_link'");
  });
});

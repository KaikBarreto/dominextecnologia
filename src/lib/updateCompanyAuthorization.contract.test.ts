import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edge = readFileSync(
  `${process.cwd()}/supabase/functions/update-company/index.ts`,
  'utf8',
);
const permissionMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/20261030224600_grant_maicon_company_edit_permission.sql`,
  'utf8',
);

describe('autorizacao da edicao administrativa de empresas', () => {
  it('aceita super-admin ou a permissao granular de empresas', () => {
    expect(edge).toContain("_role: 'super_admin'");
    expect(edge).toContain("_permission: 'admin_empresas'");
    expect(edge).toContain('!superAdminResult.data && !companyPermissionResult.data');
  });

  it('falha fechado quando a verificacao de permissao nao pode ser concluida', () => {
    expect(edge).toContain('superAdminResult.error || companyPermissionResult.error');
    expect(edge).toContain('Não foi possível validar sua permissão para editar empresas.');
  });

  it('concede ao Maicon somente a permissao necessaria, de forma idempotente', () => {
    expect(permissionMigration).toContain("lower(u.email) = 'maicon@dominex.app'");
    expect(permissionMigration).toContain("'admin_empresas'");
    expect(permissionMigration).toContain('ON CONFLICT (user_id, permission) DO NOTHING');
    expect(permissionMigration).not.toContain('user_roles');
  });
});

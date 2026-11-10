import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const successAccessMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/20261102143000_admin_empresas_le_sucesso_domiflix.sql`,
  'utf8',
);
const activityAccessMigration = readFileSync(
  `${process.cwd()}/supabase/migrations/20260528232435_admin_users_read_usage_events.sql`,
  'utf8',
);

describe('acesso às abas de acompanhamento da empresa', () => {
  it('libera a leitura de Sucesso pela permissão granular de Empresas', () => {
    expect(successAccessMigration).toContain("public.has_admin_permission(auth.uid(), 'admin_empresas')");
    expect(successAccessMigration).toContain("'public.cs_domiflix_usuarios(uuid)'::regprocedure");
    expect(successAccessMigration).not.toContain('CREATE OR REPLACE FUNCTION public._domiflix_assert_admin');
  });

  it('mantém Atividade coberta pela policy de usuários administrativos', () => {
    expect(activityAccessMigration).toContain('CREATE POLICY "admin users read usage_events"');
    expect(activityAccessMigration).toContain('public.is_admin_user(auth.uid())');
  });
});

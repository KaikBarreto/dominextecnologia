import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditMigrationDirectory,
  auditStatements,
  splitSqlStatements,
} from './audit-rls.mjs';

function audit(...migrations) {
  const statements = migrations.flatMap((sql, index) =>
    splitSqlStatements(sql, `migration-${index + 1}.sql`),
  );
  return auditStatements(statements).findings;
}

test('reprova tabela public criada sem RLS', () => {
  const findings = audit('CREATE TABLE public.orders (id uuid);');
  assert.deepEqual(findings.map(({ code, table }) => ({ code, table })), [
    { code: 'RLS_DISABLED', table: 'orders' },
  ]);
});

test('reprova tabela public apenas alterada sem RLS conhecido', () => {
  const findings = audit('ALTER TABLE public.legacy ADD COLUMN note text;');
  assert.equal(findings[0]?.code, 'RLS_DISABLED');
  assert.equal(findings[0]?.table, 'legacy');
});

test('aceita RLS habilitado em migration posterior e reprova DISABLE posterior', () => {
  assert.equal(
    audit(
      'CREATE TABLE public.orders (id uuid);',
      'ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;',
    ).length,
    0,
  );

  const findings = audit(
    'CREATE TABLE public.orders (id uuid); ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;',
    'ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;',
  );
  assert.equal(findings[0]?.code, 'RLS_DISABLED');
});

test('reprova policy anon em tabela sensivel mesmo com predicado', () => {
  const findings = audit(`
    CREATE TABLE public.profiles (id uuid);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT ON TABLE public.profiles FROM anon;
    CREATE POLICY "anon profiles" ON public.profiles
      FOR SELECT TO anon USING (id = auth.uid());
  `);

  assert.equal(findings[0]?.code, 'SENSITIVE_PUBLIC_POLICY');
});

test('reprova USING true implicito para public em tabela sensivel', () => {
  const findings = audit(`
    CREATE TABLE public.user_roles (id uuid);
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT ON TABLE public.user_roles FROM anon;
    CREATE POLICY "read all" ON public.user_roles FOR SELECT USING (true);
  `);

  assert.deepEqual(
    findings.map(({ code }) => code).sort(),
    ['SENSITIVE_PUBLIC_POLICY', 'SENSITIVE_TRIVIAL_POLICY'],
  );
});

test('reprova predicado true mesmo quando limitado a authenticated', () => {
  const findings = audit(`
    CREATE TABLE public.admin_permissions (id uuid);
    ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT ON TABLE public.admin_permissions FROM anon;
    CREATE POLICY "authenticated writes all" ON public.admin_permissions
      FOR INSERT TO authenticated WITH CHECK (true);
  `);

  assert.deepEqual(findings.map(({ code }) => code), ['SENSITIVE_TRIVIAL_POLICY']);
});

test('aceita policy incondicional exclusiva de service_role', () => {
  const findings = audit(`
    CREATE TABLE public.usage_events (id uuid);
    ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT ON TABLE public.usage_events FROM anon;
    CREATE POLICY "service writes" ON public.usage_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  `);

  assert.equal(findings.length, 0);
});

test('DROP POLICY remove policy historica da avaliacao final', () => {
  const findings = audit(`
    CREATE TABLE public.profiles (id uuid);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT ON TABLE public.profiles FROM anon;
    CREATE POLICY "old public" ON public.profiles FOR SELECT USING (true);
    DROP POLICY "old public" ON public.profiles;
  `);

  assert.equal(findings.length, 0);
});

test('exige REVOKE SELECT de anon e detecta GRANT posterior', () => {
  const missingRevoke = audit(`
    CREATE TABLE public.companies (id uuid);
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
  `);
  assert.equal(missingRevoke[0]?.code, 'SENSITIVE_ANON_SELECT_NOT_REVOKED');

  const reopened = audit(`
    CREATE TABLE public.companies (id uuid);
    ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
    REVOKE ALL PRIVILEGES ON TABLE public.companies FROM anon;
    GRANT SELECT ON TABLE public.companies TO anon;
  `);
  assert.equal(reopened[0]?.code, 'SENSITIVE_ANON_SELECT_NOT_REVOKED');
});

test('aceita REVOKE em lista para as tabelas sensiveis', () => {
  const findings = audit(`
    CREATE TABLE public.profiles (id uuid);
    CREATE TABLE public.user_roles (id uuid);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT ON TABLE public.profiles, public.user_roles FROM anon;
  `);

  assert.equal(findings.length, 0);
});

test('ignora SQL em comentarios, strings e corpos de funcoes', () => {
  const statements = splitSqlStatements(`
    -- CREATE TABLE public.fake_comment (id uuid);
    CREATE FUNCTION public.example() RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      EXECUTE 'CREATE TABLE public.fake_dynamic (id uuid);';
    END;
    $$;
    /* ALTER TABLE public.fake_comment DISABLE ROW LEVEL SECURITY; */
  `);

  assert.equal(auditStatements(statements).findings.length, 0);
});

test('reconhece o molde estatico de RLS dinamico usado no repositorio', () => {
  const findings = audit(`
    CREATE TABLE public.first_table (id uuid);
    CREATE TABLE public.second_table (id uuid);
    DO $$
    DECLARE
      table_name text;
      protected_tables text[] := ARRAY['first_table', 'second_table'];
    BEGIN
      FOREACH table_name IN ARRAY protected_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', table_name);
      END LOOP;
    END $$;
  `);

  assert.equal(findings.length, 0);
});

test('reconhece limpeza dinamica de todas as policies de uma lista estatica', () => {
  const findings = audit(`
    CREATE TABLE public.profiles (id uuid);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT ON TABLE public.profiles FROM anon;
    CREATE POLICY "old public" ON public.profiles FOR SELECT USING (true);
    DO $drop_policies$
    DECLARE policy_row record;
    BEGIN
      FOR policy_row IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY (ARRAY['profiles'])
      LOOP
        EXECUTE format(
          'DROP POLICY %I ON %I.%I',
          policy_row.policyname,
          policy_row.schemaname,
          policy_row.tablename
        );
      END LOOP;
    END
    $drop_policies$;
    CREATE POLICY "own profile" ON public.profiles
      FOR SELECT TO authenticated USING (id = auth.uid());
  `);

  assert.equal(findings.length, 0);
});

test('mantem menor privilegio em companies e leitura coerente de company_modules', async () => {
  const { policies } = await auditMigrationDirectory(
    `${process.cwd()}/supabase/migrations`,
  );
  const finalPolicies = [...policies.values()];
  const findPolicy = (table, name) =>
    finalPolicies.find(
      (policy) => policy.relation.table === table && policy.name === name,
    );

  const companiesUpdate = findPolicy(
    'companies',
    'company admins can update companies',
  );
  assert.ok(companiesUpdate, 'policy granular de UPDATE em companies ausente');
  assert.match(companiesUpdate.statement.text, /has_admin_permission[\s\S]*admin_empresas/i);
  assert.doesNotMatch(companiesUpdate.statement.text, /is_admin_user/i);

  const modulesSelect = findPolicy(
    'company_modules',
    'company admins can view all company modules',
  );
  assert.ok(modulesSelect, 'admin_empresas precisa ler modulos antes de editar');
  assert.match(modulesSelect.statement.text, /has_admin_permission[\s\S]*admin_empresas/i);
});

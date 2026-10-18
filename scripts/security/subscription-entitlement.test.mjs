import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { auditMigrationDirectory } from './audit-rls.mjs';

const migrationPath = new URL(
  '../../supabase/migrations/20261004213000_tenant_subscription_entitlement_rls.sql',
  import.meta.url,
);
const customerPortalMigrationPath = new URL(
  '../../supabase/migrations/20261018234000_customer_portal_password_and_permissions.sql',
  import.meta.url,
);

test('entitlement canônico mantém carência, fail-closed e bypass explícito', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /subscription_status = 'active'[\s\S]+?::date \+ 1/);
  assert.match(sql, /subscription_status = 'testing'[\s\S]+?subscription_expires_at IS NOT NULL/);
  assert.match(sql, /subscription_status = 'pending_payment'[\s\S]+?payment_lock_bypass IS TRUE/);
  assert.doesNotMatch(sql, /subscription_status\s*(?:<>|!=)\s*'inactive'/);
  assert.match(sql, /_company_id = \(SELECT public\.get_user_company_id\(auth\.uid\(\)\)\)/);
  assert.match(sql, /GRANT EXECUTE[\s\S]+?TO authenticated, service_role/);
});

test('policies finais aplicam entitlement e mantêm portais públicos com menor privilégio', async () => {
  const { policies } = await auditMigrationDirectory(
    `${process.cwd()}/supabase/migrations`,
  );
  const finalPolicies = [...policies.values()];
  const criticalTables = new Set(['customers', 'service_orders', 'financial_transactions']);
  const critical = finalPolicies.filter((policy) => criticalTables.has(policy.relation.table));

  const authenticatedPermissive = critical.filter(
    (policy) =>
      policy.roles.includes('authenticated') &&
      !/\bas\s+restrictive\b/i.test(policy.statement.text),
  );
  assert.ok(authenticatedPermissive.length >= 9, 'policies autenticadas críticas ausentes');
  for (const policy of authenticatedPermissive) {
    assert.match(
      policy.statement.text,
      /tenant_subscription_allows_access|is_super_admin/i,
      `${policy.relation.table}.${policy.name} não aplica entitlement/bypass admin`,
    );
    if (!/is_super_admin/i.test(policy.statement.text)) {
      assert.fail(`${policy.relation.table}.${policy.name} perdeu bypass de super_admin`);
    }
    assert.match(
      policy.statement.text,
      /tenant_subscription_allows_access/i,
      `${policy.relation.table}.${policy.name} permite tenant vencido`,
    );
  }

  assert.ok(
    critical.some(
      (policy) => policy.relation.table === 'customers' && policy.roles.includes('anon'),
    ),
    'policy anon de customers foi removida',
  );
  assert.equal(
    critical.some(
      (policy) => policy.relation.table === 'service_orders' && policy.roles.includes('anon'),
    ),
    false,
    'service_orders não deve aceitar INSERT anon direto; portais usam RPC validada',
  );
  assert.equal(
    critical.some((policy) => policy.roles.includes('service_role')),
    false,
    'service_role não deve depender de policy; mantém BYPASSRLS',
  );
});

test('chamados públicos passam por RPC e o INSERT anon direto fica revogado', async () => {
  const sql = await readFile(customerPortalMigrationPath, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_customer_portal_ticket/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_contract_portal_ticket/);
  assert.match(sql, /DROP POLICY IF EXISTS "Public can create portal tickets"/);
  assert.match(sql, /REVOKE INSERT ON TABLE public\.service_orders FROM anon/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const edge = readFileSync(
  new URL('../../supabase/functions/create-user-notification/index.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../../supabase/migrations/20261111170000_notification_platform_v1.sql', import.meta.url),
  'utf8',
);

test('edge genérica de notificação é self-only e deriva o tenant do perfil ativo', () => {
  assert.match(edge, /callerId\s*!==\s*user_id/);
  assert.doesNotMatch(edge, /\.rpc\(['"]has_role['"]/);
  assert.match(edge, /\.from\(['"]profiles['"]\)/);
  assert.match(edge, /\.select\(['"]company_id, is_active['"]\)/);
  assert.match(edge, /company_id:\s*profile\.company_id/);
});

test('edge genérica limita conteúdo e aceita apenas deep link interno', () => {
  assert.match(edge, /MAX_EXPIRATION_MS/);
  assert.match(edge, /title\.length\s*>\s*120/);
  assert.match(edge, /message\.length\s*>\s*500/);
  assert.match(edge, /value\.startsWith\(['"]\/['"]\)/);
  assert.match(edge, /!value\.startsWith\(['"]\/\/['"]\)/);
});

test('produtores geram resumos específicos sem misturar tenants', () => {
  assert.match(migration, /Pagamento de '[\s\S]*v_amount_label[\s\S]*v_customer_name/);
  assert.match(migration, /c\.company_id = NEW\.company_id/g);
  assert.match(migration, /'amount', NEW\.value/);
  assert.match(migration, /'order_number', NEW\.order_number/);
  assert.match(migration, /'form_title', v_form_title/);
});

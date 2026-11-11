import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manager = readFileSync(
  new URL('../../supabase/functions/manage-push-subscription/index.ts', import.meta.url),
  'utf8',
);
const worker = readFileSync(
  new URL('../../supabase/functions/process-notification-deliveries/index.ts', import.meta.url),
  'utf8',
);
const serviceWorker = readFileSync(
  new URL('../../public/push-sw.js', import.meta.url),
  'utf8',
);
const pwaClient = readFileSync(
  new URL('../../src/lib/pwa.ts', import.meta.url),
  'utf8',
);
const pushClient = readFileSync(
  new URL('../../src/lib/pushNotifications.ts', import.meta.url),
  'utf8',
);
const authContext = readFileSync(
  new URL('../../src/contexts/AuthContext.tsx', import.meta.url),
  'utf8',
);

test('assinatura push deriva tenant e exige perfil ativo', () => {
  assert.match(manager, /\.select\(['"]company_id, is_active['"]\)/);
  assert.match(manager, /profile\.is_active\s*!==\s*true/);
  assert.match(manager, /body\.company_id\s*!==\s*profile\.company_id/);
  assert.match(manager, /\.eq\(['"]user_id['"], user\.id\)/);
});

test('chave pública VAPID vem do servidor autenticado sem expor a chave privada', () => {
  assert.match(manager, /body\.action === ['"]public-key['"]/);
  assert.match(manager, /Deno\.env\.get\(['"]VAPID_PUBLIC_KEY['"]\)/);
  assert.doesNotMatch(manager, /VAPID_PRIVATE_KEY/);
  assert.match(pushClient, /action:\s*["']public-key["']/);
  assert.doesNotMatch(pushClient, /VAPID_PRIVATE_KEY/);
});

test('endpoint push fica limitado a provedores conhecidos e payload tem teto', () => {
  assert.match(manager, /fcm\.googleapis\.com/);
  assert.match(manager, /\.push\.apple\.com/);
  assert.match(manager, /\.notify\.windows\.com/);
  assert.match(manager, /16_384/);
  assert.match(worker, /validProviderEndpoint\(delivery\.endpoint\)/);
});

test('worker global exige CRON_SECRET em comparação segura', () => {
  assert.match(worker, /Deno\.env\.get\(['"]CRON_SECRET['"]\)/);
  assert.match(worker, /timingSafeEqual\(presented, cronSecret\)/);
  assert.doesNotMatch(worker, /auth\.getUser/);
});

test('push específico limita título e corpo e mantém deep link interno', () => {
  assert.match(worker, /previewText\(delivery\.title,[\s\S]*120\)/);
  assert.match(worker, /previewText\(delivery\.message,[\s\S]*240\)/);
  assert.match(worker, /web_push:\s*8030/);
  assert.match(worker, /silent:\s*false/);
  assert.match(worker, /notificationNavigateUrl\(actionUrl\)/);
  assert.match(serviceWorker, /payload\.web_push\s*===\s*8030/);
  assert.match(serviceWorker, /silent:\s*notification\.silent\s*===\s*true/);
  assert.match(serviceWorker, /notification\.body/);
  assert.match(serviceWorker, /slice\(0, 240\)/);
  assert.match(serviceWorker, /safeActionPath\(notification\.navigate\s*\|\|\s*payload\.action_url\)/);
});

test('release busca o script importado sem cache HTTP', () => {
  assert.match(pwaClient, /updateViaCache:\s*["']none["']/);
  assert.match(pwaClient, /registration\.update\(\)/);
});

test('logout mantém push fora do bundle eager e possui teto global de 2s', () => {
  assert.doesNotMatch(authContext, /^import .*pushNotifications/m);
  assert.match(authContext, /import\(['"]@\/lib\/pushNotifications['"]\)/);
  assert.match(authContext, /Promise\.race\(\[/);
  assert.match(authContext, /window\.setTimeout\(resolve, 2_000\)/);
});

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canInitializeRetailOffer, initialOfferSnapshot, initialOfferSnapshotMatches } from './billing-rules.ts';

// HTTP integralmente interceptado: fixtures fictícias e nenhum gateway real.
type Handler = (request: Request) => Promise<Response>;
let captured!: Handler;
const serve = Deno.serve;
(Deno as unknown as { serve: unknown }).serve = (fn: Handler) => { captured = fn; return {}; };
await import('../change-subscription-plan/index.ts'); const changePlan = captured;
await import('./index.ts'); const createPayment = captured;
await import('../asaas-webhook/index.ts'); const webhook = captured;
(Deno as unknown as { serve: unknown }).serve = serve;
const originalFetch = globalThis.fetch;
const tenant = 'b6110000-0000-4000-8000-000000000001';
const user = 'b6110000-0000-4000-8000-000000000002';
const quoteId = 'b6110000-0000-4000-8000-000000000003';
const fixture = {
  id: tenant, name: 'Empresa fictícia', business_core: 'retail', business_core_version: 2,
  subscription_status: 'testing', trial_days: 7, origin: null, subscription_plan: 'retail_start', subscription_value: 123,
  max_users: 1, extra_users: 0, ltv: 0, custom_price: null, custom_price_permanent: false, plan_locked: false,
  updated_at: '2026-01-01T00:00:00Z', cnpj: '00000000000000', asaas_customer_id: 'cus_fictitious',
};
type Scenario = {
  company?: Record<string, unknown>; plan?: Record<string, unknown>; body?: Record<string, unknown>;
  history?: boolean; pendingAttempt?: boolean; quote?: boolean; promotion?: boolean; readFailure?: string;
  quoteFailure?: boolean; nonManager?: boolean; otherTenant?: boolean; mutateBeforeGateway?: boolean;
  gatewayUnknown?: boolean; custom?: boolean; yearly?: boolean; baseMissing?: boolean; card?: boolean; futureInvoice?: boolean; direct?: boolean;
  inactiveProfile?: boolean; inactiveAfterQuote?: boolean; superAdmin?: boolean; roleFailure?: boolean; initialModules?: string[];
  revokeModuleBeforeClaim?: boolean; changeQuantityBeforeClaim?: boolean; mutateBeforeWebhook?: boolean;
  reverse?: 'refund' | 'chargeback'; replacement?: boolean; processFuture?: boolean;
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const request = (body: unknown) => new Request('https://edge.example.invalid', {
  method: 'POST', headers: { Authorization: 'Bearer fictitious-user-token', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
async function run(scenario: Scenario = {}, confirmWebhook = false) {
  Deno.env.set('SUPABASE_URL', 'https://backend.example.invalid');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fictitious-local-service-key');
  Deno.env.set('ASAAS_API_KEY', 'fictitious-local-gateway-key');
  Deno.env.set('ASAAS_WEBHOOK_TOKEN', 'fictitious-webhook-key');
  const company: Record<string, unknown> = { ...fixture, ...scenario.company };
  const writes: Record<string, unknown>[] = [];
  const charges: Record<string, unknown>[] = [];
  const rpcCalls: string[] = [];
  const modules: string[] = [...(scenario.initialModules ?? ['basic', 'trial_extra_fictitious'])];
  const originalModules = [...modules];
  let moduleQuantity = 1;
  const moduleRows = () => modules.map(module_code => ({ module_code, quantity: moduleQuantity }));
  let quote: Record<string, any> | null = null;
  let localPayment: Record<string, unknown> | null = null;
  let financialCount = 0;
  let futurePayment: Record<string, unknown> | null = null;
  let futureCredited = false;
  let profileInactive = scenario.inactiveProfile === true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert(['backend.example.invalid', 'api.asaas.com'].includes(url.hostname));
    const method = init?.method ?? 'GET';
    if (url.hostname === 'api.asaas.com') {
      if (['/v3/payments','/v3/subscriptions'].includes(url.pathname) && method === 'POST') {
        charges.push(JSON.parse(String(init?.body)));
        if (scenario.gatewayUnknown) throw new TypeError('Resposta fictícia perdida');
        return json({ id: url.pathname.endsWith('/subscriptions') ? 'sub_fictitious' : 'pay_fictitious', status: 'PENDING' });
      }
      if (url.pathname.startsWith('/v3/customers/')) {
        if (scenario.mutateBeforeGateway) company.plan_locked = true;
        if (scenario.revokeModuleBeforeClaim) modules.splice(modules.indexOf('service_operations'), 1);
        if (scenario.changeQuantityBeforeClaim) moduleQuantity = 2;
      }
      return json({});
    }
    const name = url.pathname.split('/').at(-1)!;
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname === '/auth/v1/user') return json({ id: user, aud: 'authenticated' });
    if (name === 'has_role') return scenario.roleFailure ? json({ code: 'fixture_role', message: 'Falha fictícia' }, 400)
      : json((payload._role === 'admin' && !scenario.nonManager) || (payload._role === 'super_admin' && scenario.superAdmin));
    if (name === 'profiles') return scenario.readFailure === 'profiles' ? json({ code: 'fixture_profile', message: 'Falha fictícia' }, 400)
      : json({ company_id: scenario.otherTenant ? 'other-fictitious-tenant' : tenant, is_active: !profileInactive });
    if (name === 'company_modules') return json(moduleRows());
    if (scenario.readFailure === name) return json({ code: 'fixture_error', message: 'Falha fictícia' }, 400);
    if (url.pathname.includes('/rpc/')) rpcCalls.push(name);
    if (name === 'get_company_effective_subscription_value') return json(company.subscription_value);
    if (name === 'company_has_module') return json(false);
    if (name === 'get_business_core_base_price_v1') return json({ business_core: 'retail', configured: !scenario.baseMissing, base_price: scenario.baseMissing ? null : 200 });
    if (name === 'prepare_initial_subscription_activation') {
      if (scenario.quoteFailure || scenario.history || scenario.pendingAttempt || scenario.quote
        || !canInitializeRetailOffer(company) || !initialOfferSnapshotMatches(payload.p_expected_snapshot, initialOfferSnapshot(company, moduleRows()))) {
        return json({ code: 'fixture_quote', message: 'Falha fictícia' }, 400);
      }
      const target = payload.p_target;
      quote = { id: quoteId, company_id: tenant, initial_activation: true, source_company_snapshot: payload.p_expected_snapshot,
        status: 'pending', payment_creation_state: 'idle', expires_at: '2099-01-01T00:00:00Z',
        target_plan_code: target.plan_code, target_monthly_value: target.monthly_value,
        target_billing_cycle: target.billing_cycle, target_modules: target.modules, target_max_users: target.max_users,
        target_extra_users: target.extra_users, credit_amount: 0, resets_billing_anchor: true,
        amount_due: target.billing_cycle === 'yearly' ? Math.round(target.monthly_value * 12 * .8) : target.monthly_value };
      return json(quote);
    }
    if (name === 'claim_initial_subscription_activation_payment') {
      const canClaim = quote && ['idle', 'failed'].includes(quote.payment_creation_state)
        && initialOfferSnapshotMatches(quote.source_company_snapshot, initialOfferSnapshot(company, moduleRows())) && !scenario.history;
      if (canClaim) quote!.payment_creation_state = 'creating';
      return json(Boolean(canClaim));
    }
    if (name === 'apply_initial_subscription_activation_payment') {
      assert(quote); assertEquals(payload.p_paid_at, '2026-02-01T03:00:00.000Z');
      if (quote.status === 'applied') return json({ already_applied: true, company_id: tenant });
      if (!initialOfferSnapshotMatches(quote.source_company_snapshot, initialOfferSnapshot(company, moduleRows()))) {
        quote.status = 'failed'; return json({ failed: true, company_id: tenant });
      }
      company.subscription_status = 'active'; company.subscription_value = quote.target_monthly_value;
      company.subscription_plan = quote.target_plan_code; company.billing_cycle = quote.target_billing_cycle; company.ltv = quote.amount_due;
      company.subscription_expires_at = quote.target_billing_cycle === 'yearly' ? '2027-02-01T03:00:00Z' : '2026-03-01T03:00:00Z';
      if (localPayment) Object.assign(localPayment, { asaas_payment_id: payload.p_asaas_payment_id, status: 'CONFIRMED', paid_at: payload.p_paid_at, ltv_credited_at: payload.p_paid_at, due_date: '2026-02-01', type: 'primeira_venda' });
      modules.splice(0, modules.length, ...quote.target_modules); moduleQuantity = 1; financialCount += 1; quote.status = 'applied'; quote.asaas_payment_id = payload.p_asaas_payment_id;
      return json({ company_id: tenant, applied: true, initial_activation: true });
    }
    if (name === 'record_admin_asaas_ledger') return json({ ok: true });
    if (name === 'admin_notifications' || name === 'admin_financial_transactions') return json({ id: 'fictitious-record' });
    if (name === 'company_subscription_promotion_consumptions') return new Response(null, { status: 200, headers: { 'Content-Range': '0-0/0' } });
    if (name === 'record_subscription_first_sale_attribution') return json({ recorded: false, eligible: false });
    if (name === 'credit_ltv_once_for_payment') {
      if (!scenario.processFuture || futureCredited) return json(false);
      assertEquals(payload.p_asaas_payment_id, 'pay_fictitious_next_month');
      futureCredited = true; company.ltv = Number(company.ltv) + Number(payload.p_amount);
      if (futurePayment) futurePayment.ltv_credited_at = new Date().toISOString();
      return json(true);
    }
    if (name === 'compute_next_expiration') { const date = new Date(payload.p_current); date.setUTCMonth(date.getUTCMonth() + 1); return json(date.toISOString()); }
    if (name === 'consume_company_subscription_promotions') return json({ consumed: 0 });
    if (name === 'company_payments') { if (method === 'POST') { financialCount += 1; return json({ id: 'fictitious-future-income' }); } return json([{ id: 'fictitious-initial-income' }]); }
    if (name === 'salesperson_sales') return json(null);
    if (name === 'subscription_checkout_attempts') return json(null);
    if (name === 'companies') {
      if (method === 'PATCH') { writes.push(payload); Object.assign(company, payload); }
      return json({ ...company });
    }
    if (name === 'subscription_plans') {
      const plan = { code: 'retail_start', business_core: 'retail', is_active: true, price: 123, max_users: 3, included_modules: ['basic','pdv'], ...scenario.plan };
      if (!plan.is_active || plan.business_core !== company.business_core || (url.searchParams.has('code') && url.searchParams.get('code') !== `eq.${plan.code}`)) return json(null);
      return json(plan);
    }
    if (name === 'subscription_modules') return json([
      { code: 'basic', price: 197 }, { code: 'extra_user', price: 20 }, { code: 'finance_advanced', price: 0 },
      { code: 'pricing_advanced', price: 0 }, { code: 'customer_portal', price: 0 }, { code: 'video_questions', price: 0 },
      { code: 'service_operations', price: 100 },
    ]);
    if (name === 'subscription_payments') {
      if (method === 'POST') {
        if (payload.asaas_payment_id === 'pay_fictitious_next_month') {
          futurePayment = { id: 'b6110000-0000-4000-8000-000000000005', ...futurePayment, ...payload };
          return json(futurePayment);
        }
        localPayment = { id: 'b6110000-0000-4000-8000-000000000004', ...payload }; return json(localPayment);
      }
      if (method === 'PATCH') {
        const current = url.searchParams.get('asaas_payment_id') === 'eq.pay_fictitious_next_month' ? futurePayment : localPayment;
        Object.assign(current ?? {}, payload); return json(current);
      }
      if (url.searchParams.get('asaas_payment_id') === 'eq.pay_fictitious_next_month') return json(futurePayment);
      if (localPayment && url.searchParams.has('asaas_payment_id') && url.searchParams.get('asaas_payment_id') === 'eq.pay_fictitious') return json(localPayment);
      if (url.searchParams.has('id') && url.searchParams.get('id')?.startsWith('neq.')) return json(scenario.replacement ? [{ asaas_payment_id: 'pay_replacement', status: 'CONFIRMED', due_date: '2026-03-01', paid_at: '2026-03-01T03:00:00Z', ltv_credited_at: '2026-03-01T03:00:00Z' }] : []);
      return json(scenario.history ? [{ id: 'old-fictitious-payment', status: 'CONFIRMED' }] : localPayment ? [localPayment] : []);
    }
    if (name === 'subscription_change_requests') {
      if (method === 'PATCH') { assert(quote); Object.assign(quote, payload); }
      return json(quote);
    }
    if (name === 'company_subscription_promotions') return new Response(null, { status: 200, headers: { 'Content-Range': `0-0/${scenario.promotion ? 1 : 0}` } });
    throw new Error(`Rota de teste inesperada: ${name}`);
  }) as typeof fetch;
  try {
    if (scenario.direct) {
      const response = await createPayment(request({ company_id: tenant, billing_type: 'BOLETO', amount: 123, plan_code: 'retail_start' }));
      return { response, payload: await response.json(), company, writes, charges, modules, rpcCalls };
    }
    const chosenPlan = scenario.custom ? 'personalizado' : 'retail_start';
    const changeResponse = await changePlan(request({ company_id: tenant, plan_code: chosenPlan, confirm: true,
      billing_cycle: scenario.yearly ? 'yearly' : 'monthly', custom_modules: scenario.custom ? ['service_operations'] : [], extra_users: scenario.custom ? 2 : 0 }));
    const changePayload = await changeResponse.json();
    if (changeResponse.status !== 200) return { response: changeResponse, payload: changePayload, company, writes, charges, modules, rpcCalls };
    const prepared = quote as Record<string, any> | null;
    assert(prepared); assertEquals(company.subscription_value, scenario.company?.subscription_value ?? fixture.subscription_value); assertEquals(modules, originalModules);
    const paymentBody = { company_id: tenant, billing_type: scenario.card ? 'CREDIT_CARD' : 'BOLETO', amount: prepared.amount_due, card_number: scenario.card ? '4111111111111111' : undefined,
      purpose: 'upgrade', change_request_id: quoteId, ...scenario.body };
    if (scenario.inactiveAfterQuote) profileInactive = true;
    const response = await createPayment(request(paymentBody)); const payload = await response.json();
    assertEquals(company.subscription_status, fixture.subscription_status);
    assertEquals(company.ltv, 0);
    if (!scenario.revokeModuleBeforeClaim) assertEquals(modules, originalModules);
    if (scenario.gatewayUnknown) {
      prepared.expires_at = '2000-01-01T00:00:00Z';
      await createPayment(request(paymentBody));
    }
    if (confirmWebhook && response.status === 200) {
      if (scenario.mutateBeforeWebhook) modules.splice(0, modules.length, 'basic');
      const payment = { id: 'pay_fictitious', value: prepared.amount_due, status: 'CONFIRMED', billingType: scenario.card ? 'CREDIT_CARD' : 'BOLETO', subscription: scenario.card ? 'sub_fictitious' : undefined,
        externalReference: `upgrade:${quoteId}:${tenant}`, paymentDate: '2026-02-01' };
      for (let n = 0; n < (scenario.mutateBeforeWebhook ? 1 : 2); n++) {
        const event = await webhook(new Request('https://edge.example.invalid', { method: 'POST',
          headers: { 'asaas-access-token': 'fictitious-webhook-key', 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment }) }));
        assertEquals(event.status, 200, await event.text());
      }
      if (scenario.reverse) {
        const reversalEvent = scenario.reverse === 'refund' ? 'PAYMENT_REFUNDED' : 'PAYMENT_CHARGEBACK_REQUESTED';
        for (let n = 0; n < 2; n++) {
          const reversed = await webhook(new Request('https://edge.example.invalid', { method: 'POST',
            headers: { 'asaas-access-token': 'fictitious-webhook-key', 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: reversalEvent, payment: { ...payment, status: 'REFUNDED' } }) }));
          assertEquals(reversed.status, 200, await reversed.text());
        }
        const oldConfirmation = await webhook(new Request('https://edge.example.invalid', { method: 'POST',
          headers: { 'asaas-access-token': 'fictitious-webhook-key', 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment }) }));
        assertEquals(oldConfirmation.status, 200, await oldConfirmation.text());
      }
      if (scenario.futureInvoice) {
        const renewal = await webhook(new Request('https://edge.example.invalid', { method: 'POST',
          headers: { 'asaas-access-token': 'fictitious-webhook-key', 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { ...payment, id: 'pay_fictitious_next_month', dueDate: '2026-03-01', paymentDate: '2026-03-01' } }) }));
        assertEquals(renewal.status, 200, await renewal.text());
        assert(rpcCalls.includes('credit_ltv_once_for_payment'));
        if (scenario.processFuture) {
          const replay = await webhook(new Request('https://edge.example.invalid', { method: 'POST',
            headers: { 'asaas-access-token': 'fictitious-webhook-key', 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: 'PAYMENT_CONFIRMED', payment: { ...payment, id: 'pay_fictitious_next_month', dueDate: '2026-03-01', paymentDate: '2026-03-01' } }) }));
          assertEquals(replay.status, 200, await replay.text());
        }
      }
    }
    return { response, payload, company, writes, charges, modules, rpcCalls, quote: quote as Record<string, any> | null, financialCount };
  } finally { globalThis.fetch = originalFetch; }
}

for (const scenario of [{}, { custom: true }, { yearly: true }, { card: true, futureInvoice: true }, { company: { subscription_value: 0 } }]) Deno.test(`contratação canônica até webhook, sem gateway real: ${JSON.stringify(scenario)}`, async () => {
  const result = await run(scenario, true);
  assertEquals(result.response.status, 200);
  assertEquals(result.writes, scenario.card ? [{ asaas_subscription_id: 'sub_fictitious', payment_method: 'credit_card' }] : []);
  assertEquals(result.charges.length, 1);
  assertEquals(result.charges[0].value, scenario.custom ? 340 : scenario.yearly ? 1181 : 123);
  assertEquals(result.company.subscription_status, 'active');
  assertEquals(result.company.ltv, result.charges[0].value);
  assertEquals(result.financialCount, 1);
  assert(!result.modules.includes('trial_extra_fictitious'));
  assertEquals(result.rpcCalls.filter(name => name === 'apply_initial_subscription_activation_payment').length, 2);
});
for (const scenario of [
  { history: true }, { pendingAttempt: true }, { quote: true }, { promotion: true }, { quoteFailure: true },
  { mutateBeforeGateway: true }, { readFailure: 'subscription_payments' },
  { company: { subscription_status: 'pending_payment', trial_days: 0, subscription_plan: 'retail_master', subscription_value: 999 } },
  { company: { subscription_status: 'testing', trial_days: 0, subscription_plan: 'retail_master', subscription_value: 999 } },
  { body: { billing_type: 'CREDIT_CARD', card_number: null } },
  { body: { billing_type: 'CREDIT_CARD', card_number: null, use_saved_card: true } },
  { body: { billing_type: 'CREDIT_CARD', card_number: '' } },
  { revokeModuleBeforeClaim: true, initialModules: ['basic','service_operations'], custom: true },
  { changeQuantityBeforeClaim: true },
  { body: { amount: 1 } }, { plan: { business_core: 'services' } }, { plan: { price: 0 } }, { plan: { is_active: false } },
  { custom: true, baseMissing: true },
] as Scenario[]) Deno.test(`contratação inicial falha fechado: ${JSON.stringify(scenario)}`, async () => {
  const result = await run(scenario);
  assertEquals(result.response.status, 400);
  assertEquals(result.charges, []);
});
Deno.test('trial com preço positivo não pula cotação pelo endpoint de cobrança', async () => {
  const result = await run({ direct: true });
  assertEquals(result.response.status, 400);
  assertEquals(result.charges, []);
  assert(!result.rpcCalls.includes('prepare_initial_subscription_activation'));
});
Deno.test('timeout de gateway congela claim e não repete cobrança', async () => {
  const result = await run({ gatewayUnknown: true });
  assertEquals(result.response.status, 500);
  assertEquals(result.charges.length, 1);
  assertEquals(result.quote?.payment_creation_state, 'unknown');
  assertEquals(result.quote?.status, 'pending');
});
Deno.test('contratação exige gestor e isolamento entre empresas', async () => {
  for (const scenario of [{ nonManager: true }, { otherTenant: true }]) {
    const result = await run(scenario);
    assertEquals(result.response.status, 403);
    assertEquals(result.writes, []);
    assertEquals(result.charges, []);
  }
});

for (const scenario of [{ inactiveProfile: true }, { inactiveProfile: true, superAdmin: true }, { readFailure: 'profiles' }, { roleFailure: true }]) Deno.test(`perfil/role desconhecido falha fechado: ${JSON.stringify(scenario)}`, async () => {
  const result = await run(scenario);
  assert([403, 503].includes(result.response.status));
  assertEquals(result.charges, []);
  assert(!result.rpcCalls.includes('prepare_initial_subscription_activation'));
});
for (const reverse of ['refund','chargeback'] as const) Deno.test(`primeira contratação ${reverse} corta acesso e fatura posterior renova sem reaplicar quote`, async () => {
  const result = await run({ card: true, reverse, futureInvoice: true }, true);
  assertEquals(result.response.status, 200);
  assertEquals(result.company.subscription_status, 'inactive');
  assertEquals(result.quote?.status, 'reversed');
  assertEquals(result.financialCount, 1);
  assertEquals(result.rpcCalls.filter(name => name === 'apply_initial_subscription_activation_payment').length, 2);
  assert(result.rpcCalls.includes('credit_ltv_once_for_payment'));
});
Deno.test('estorno inicial com outro pagamento válido preserva acesso', async () => {
  const result = await run({ card: true, reverse: 'refund', replacement: true }, true);
  assertEquals(result.company.subscription_status, 'active');
});

for (const reverse of ['refund','chargeback'] as const) Deno.test(`depois de ${reverse}, pagamento recorrente seguinte renova e replay não duplica receita nem comissão`, async () => {
  const result = await run({ card: true, reverse, futureInvoice: true, processFuture: true }, true);
  assertEquals(result.company.subscription_status, 'active');
  assertEquals(result.company.ltv, 246);
  assertEquals(result.financialCount, 2);
  assertEquals(result.quote?.status, 'reversed');
  assertEquals(result.rpcCalls.filter(name => name === 'apply_initial_subscription_activation_payment').length, 2);
  assertEquals(result.rpcCalls.filter(name => name === 'record_subscription_first_sale_attribution').length, 2);
});

Deno.test('perfil desativado após cotação não cria cobrança com JWT ainda válido', async () => {
  const result = await run({ inactiveAfterQuote: true });
  assertEquals(result.response.status, 403);
  assertEquals(result.charges, []);
});
Deno.test('alteração de módulos após claim e antes do pagamento confirmado não restaura acesso', async () => {
  const result = await run({ mutateBeforeWebhook: true }, true);
  assertEquals(result.charges.length, 1);
  assertEquals(result.company.subscription_status, 'testing');
  assertEquals(result.modules, ['basic']);
  assertEquals(result.financialCount, 0);
  assertEquals(result.quote?.status, 'failed');
  assert(!result.rpcCalls.includes('record_subscription_first_sale_attribution'));
});

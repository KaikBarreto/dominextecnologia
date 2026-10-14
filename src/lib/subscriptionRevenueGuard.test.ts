import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const edge = (name: string) => read(`supabase/functions/${name}/index.ts`);
const migration = read('supabase/migrations/20261014110000_subscription_upgrade_proration.sql');

describe('guardas de receita da assinatura', () => {
  it('upgrade de plano ativo cria cotação e não aplica entitlement antes do checkout', () => {
    const src = edge('change-subscription-plan');
    const quote = src.indexOf('requires_payment: true');
    const directCompanyUpdate = src.indexOf('const companyUpdate: Record<string, unknown>');
    expect(src).toContain('calculateUpgradeProration');
    expect(src).toContain('subscription_change_requests');
    expect(quote).toBeGreaterThan(-1);
    expect(directCompanyUpdate).toBeGreaterThan(quote);
    expect(src.slice(src.lastIndexOf('return new Response', quote), directCompanyUpdate)).toContain('return new Response');
  });

  it('valor cobrado no upgrade vem da request server-side e divergência falha fechada', () => {
    const src = edge('create-asaas-payment');
    expect(src).toContain('.eq("id", change_request_id)');
    expect(src).toContain('.eq("company_id", company_id)');
    expect(src).toContain('Math.abs(amount - expected) > 0.02');
    expect(src).toContain('requestRow.amount_due');
    expect(src).toContain('externalReference = `upgrade:${upgradeRequest.id}:${company_id}`');
    expect(src).toContain('if (upgradeRequest)');
    expect(src).toContain('const payment = await asaas.post(`/payments`, paymentPayload)');
  });

  it('cobrança pendente só é reutilizada depois da reconciliação server-side', () => {
    const src = edge('create-asaas-payment');
    const reconciliation = src.indexOf('const expected = chargeTerms.expectedAmount');
    const reuse = src.indexOf('reused_existing: true');
    expect(reconciliation).toBeGreaterThan(-1);
    expect(reuse).toBeGreaterThan(reconciliation);
    expect(src).toContain('Math.abs(Number(existing.amount) - chargeTerms.expectedAmount) > 0.02');
  });

  it('checkout anual à vista não pode ser forçado para cartão', () => {
    const src = edge('create-asaas-payment');
    expect(src).toContain('billing_type === "CREDIT_CARD"');
    expect(src).toContain('requestRow.resets_billing_anchor === true');
    expect(src).toContain('deve ser paga à vista por Pix ou boleto');
  });

  it('webhook processa upgrade antes da renovação comum', () => {
    const src = edge('asaas-webhook');
    const resolver = src.indexOf('resolveUpgradeRequestId(supabase, payment)');
    const renewal = src.indexOf('const resolved = await resolveCompany(supabase, payment)', resolver);
    expect(resolver).toBeGreaterThan(-1);
    expect(renewal).toBeGreaterThan(resolver);
    expect(src.slice(resolver, renewal)).toContain('processConfirmedUpgradePayment');
  });

  it('RPC só aplica request pagável, valor exato e snapshot de origem intacto', () => {
    expect(migration).toContain("v_request.status NOT IN ('pending', 'payment_pending')");
    expect(migration).toContain('abs(p_paid_amount - v_request.amount_due) > 0.02');
    expect(migration).toContain('upgrade_payment_id_mismatch');
    expect(migration).toContain('source_subscription_changed');
    expect(migration).toContain('v_request.source_monthly_value');
    expect(migration).toContain('v_company.custom_price_payments_made');
    expect(migration).toContain("SET status = 'applied'");
  });

  it('RPC privilegiada não fica executável por tenant ou usuário anônimo', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.apply_subscription_upgrade_payment[\s\S]*FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.apply_subscription_upgrade_payment[\s\S]*TO service_role;/,
    );
  });

  it.each([
    ['change-nfse-tier', 'nfse_tier'],
    ['change-whatsapp-tier', 'whatsapp_tier'],
  ])('%s exige cotação paga antes de elevar o entitlement do tenant', (name, entitlement) => {
    const src = edge(name);
    const quote = src.indexOf('createUpgradeRequest(supabase');
    const write = src.indexOf(`${entitlement}: targetTier`);
    expect(src).toContain('if (!auth.isSuperAdmin)');
    expect(quote).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(quote);
    expect(src.slice(quote, write)).toContain('requires_payment: true');
    expect(src.slice(quote, write)).toContain('return new Response');
  });

  it('downgrade preserva acesso atual e agenda preço, tiers e módulos para renovação', () => {
    const change = edge('change-subscription-plan');
    expect(change).toContain('pending_subscription_value: targetMonthlyValue');
    expect(change).toContain('pending_nfse_tier: targetNfseTier');
    expect(change).toContain('pending_whatsapp_tier: targetWhatsappTier');
    expect(change).toContain('pending_modules: targetModules');

    const renewal = read('supabase/functions/_shared/asaas-webhook-renewal.ts');
    expect(renewal).toContain('extras.nfse_tier = company.pending_nfse_tier');
    expect(renewal).toContain('extras.whatsapp_tier = company.pending_whatsapp_tier');
    expect(renewal).toContain('extras.pending_nfse_tier = null');
    expect(renewal).toContain('extras.pending_whatsapp_tier = null');

    expect(change).toContain('updatePendingPayments: true');
    expect(change).toContain('subscriptionPeriodValue(targetMonthlyValue, cycleForDb)');
  });

  it('a primeira renovação após downgrade já reconcilia o valor e ciclo pendentes', () => {
    const payment = edge('create-asaas-payment');
    expect(payment).toContain('purpose === "renewal"');
    expect(payment).toContain('company.pending_subscription_value');
    expect(payment).toContain('company.pending_billing_cycle');

    const checkout = read('src/pages/Checkout.tsx');
    expect(checkout).toContain('companyData?.pending_subscription_value');
    expect(checkout).toContain('companyData.pending_plan_code || companyData.subscription_plan');
    expect(checkout).toContain('companyData.pending_billing_cycle as BillingCycle');
  });

  it('recorrência do upgrade passa a cobrar o valor cheio no próximo vencimento', () => {
    const webhook = edge('asaas-webhook');
    expect(webhook).toContain('result.target_period_value');
    expect(webhook).toContain('result.target_billing_cycle');
    expect(webhook).toContain('updatePendingPayments: true');
    expect(migration).toContain("'target_period_value', v_request.target_period_value");
    expect(migration).toContain("'target_billing_cycle', v_request.target_billing_cycle");
  });

  it('confirmação administrativa sem payment_id não estende vencimento', () => {
    const src = edge('confirm-sale-payment');
    const noPayment = src.indexOf('if (!payment_id)');
    const companyUpdate = src.indexOf('const companyUpdate:', noPayment);
    expect(noPayment).toBeGreaterThan(-1);
    expect(src.slice(noPayment, companyUpdate)).toContain('return json({ success: true, already_processed: true');
    expect(src).toContain('credit_ltv_once_for_payment');
    expect(src).toContain('subscriptionPayment.company_id !== company_id');
    expect(src).toContain('O pagamento não pertence a esta empresa.');
  });

  it('ativação manual continua restrita a super_admin no servidor', () => {
    const src = edge('activate-subscription');
    const auth = src.indexOf('const { data: isAdmin } = await supabase.rpc("has_role"');
    const write = src.indexOf('.from("companies")\n      .update({');
    expect(auth).toBeGreaterThan(-1);
    expect(src.slice(auth, write)).toContain('if (!isAdmin)');
    expect(src.slice(auth, write)).toContain('403');
  });

  it('request de upgrade tem RLS de leitura por tenant e nenhuma policy de escrita', () => {
    expect(migration).toContain('ALTER TABLE public.subscription_change_requests ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FOR SELECT TO authenticated');
    expect(migration).toContain('company_id = public.get_user_company_id');
    expect(migration).not.toMatch(/subscription_change_requests FOR (INSERT|UPDATE|DELETE|ALL) TO authenticated/);
  });
});

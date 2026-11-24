import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('supabase/migrations/20261111150000_company_subscription_promotions.sql');

describe('contrato das promoções itemizadas da assinatura', () => {
  it('mantém o valor cheio na empresa e calcula desconto ativo no servidor', () => {
    expect(migration).toContain('get_company_effective_subscription_value');
    expect(migration).toContain('standard_unit_price - p.promotional_unit_price');
    expect(migration).toContain("pricing_adjustment_source = 'item_promotions'");
    expect(migration).toContain('valor_efetivo_invalido');
  });

  it('consome cada promoção no máximo uma vez por pagamento e ciclo', () => {
    expect(migration).toContain('UNIQUE (promotion_id, payment_key)');
    expect(migration).toContain('UNIQUE (promotion_id, cycle_number)');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('ON CONFLICT DO NOTHING');
    expect(migration).toContain("NOT IN ('primeira_venda', 'renovacao', 'renewal')");
  });

  it('não cria outbox inválido para trial gratuito sem mensalidade', () => {
    expect(migration).toMatch(/IF v_value IS NULL OR v_value <= 0 THEN[\s\S]*DELETE FROM public\.company_subscription_price_sync/);
  });

  it('restaura somente o último ciclo ao excluir pagamento manual', () => {
    expect(migration).toContain('restore_promotions_from_deleted_company_payment');
    expect(migration).toContain('pagamento_promocional_nao_e_ultimo');
    expect(migration).toContain("'company-payment:' || OLD.id::text");
    expect(migration).toContain('PERFORM public.enqueue_company_subscription_price_sync(OLD.company_id)');
    expect(migration).toContain("CASE WHEN p.status = 'completed' THEN 'active' ELSE p.status END");
  });

  it('fecha escrita para tenants e não expõe preço negociado fora do admin', () => {
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_company_effective_subscription_value\(uuid\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).not.toContain('company_id = public.get_user_company_id(auth.uid())');
  });

  it('preserva o progresso ao editar uma promoção existente', () => {
    const existingUpdate = migration.slice(migration.indexOf('IF v_id IS NOT NULL'));
    expect(existingUpdate).toContain('SELECT consumed_cycles INTO v_consumed');
    expect(existingUpdate).not.toMatch(/SET[\s\S]{0,300}consumed_cycles\s*=/);
    expect(migration).toContain('v_previous_active_ids');
  });

  it('bloqueia combinação com preço personalizado legado e ciclo anual', () => {
    expect(migration).toContain('preco_personalizado_incompativel');
    expect(migration).toContain('promocao_somente_mensal');
    expect(migration).toContain('prevent_subscription_change_with_active_promotions');
    expect(migration).toContain('alteracao_assinatura_bloqueada_por_promocao');
  });
});

describe('integrações de cobrança promocional', () => {
  it('checkout resolve o valor efetivo no banco', () => {
    const payment = read('supabase/functions/create-asaas-payment/index.ts');
    expect(payment).toContain('get_company_effective_subscription_value');
    expect(payment).toContain('effectiveValueRaw');
  });

  it('webhook e polling consomem com a mesma chave Asaas', () => {
    for (const path of [
      'supabase/functions/asaas-webhook/index.ts',
      'supabase/functions/confirm-sale-payment/index.ts',
    ]) {
      const source = read(path);
      expect(source).toContain('consume_company_subscription_promotions');
      expect(source).toContain('`asaas:${');
    }
  });

  it('virada atualiza também cobranças pendentes e persiste falha', () => {
    const sync = read('supabase/functions/_shared/company-subscription-price-sync.ts');
    expect(sync).toContain('updatePendingPayments');
    expect(sync).toContain("status: 'failed'");
    expect(sync).toContain('last_error');
    expect(sync).toContain(".eq('requested_at', requestedAt)");
    expect(sync).toContain("status: 'syncing'");
  });

  it('promoção em trial passa a usar a mensalidade-base de catálogo', () => {
    const updateCompany = read('supabase/functions/update-company/index.ts');
    expect(updateCompany).toContain('hasConfiguredPromotions');
    expect(updateCompany).toContain('&& !hasConfiguredPromotions');
    expect(updateCompany).toContain('hasPromotionsPayload && !isPureTrial');
  });
});

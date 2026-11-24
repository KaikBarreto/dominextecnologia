-- Itemiza o valor dos pagamentos administrativos com o catálogo da Dominex.
-- O legado permanece parcial: apenas módulos ainda comprováveis são exibidos.

BEGIN;

CREATE OR REPLACE FUNCTION public.enrich_admin_payment_snapshot_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nfse_tier integer;
  v_extra_user_price numeric;
  v_modules jsonb;
BEGIN
  IF NEW.quality <> 'exact'
     OR jsonb_typeof(NEW.snapshot->'modules') <> 'array' THEN
    RETURN NEW;
  END IF;

  SELECT c.nfse_tier INTO v_nfse_tier
    FROM public.companies c
   WHERE c.id = NEW.company_id;
  SELECT sm.price INTO v_extra_user_price
    FROM public.subscription_modules sm
   WHERE sm.code = 'extra_user';

  SELECT COALESCE(jsonb_agg(
           module.item
           || jsonb_strip_nulls(jsonb_build_object(
                'unit_price', CASE
                  WHEN module.item->>'code' = 'nfe'
                    THEN COALESCE(tier.price, NULLIF(module.item->>'unit_price', '')::numeric, catalog.price)
                  ELSE COALESCE(NULLIF(module.item->>'unit_price', '')::numeric, catalog.price)
                END,
                'price_detail', CASE
                  WHEN module.item->>'code' = 'nfe' THEN
                    COALESCE(tier.name, 'Nível ' || v_nfse_tier::text)
                    || CASE WHEN tier.monthly_limit IS NULL THEN ' · documentos ilimitados'
                            ELSE ' · até ' || tier.monthly_limit::text || ' documentos/mês' END
                  ELSE NULL
                END
              ))
           ORDER BY module.position
         ), '[]'::jsonb)
    INTO v_modules
    FROM jsonb_array_elements(NEW.snapshot->'modules') WITH ORDINALITY AS module(item, position)
    LEFT JOIN public.subscription_modules catalog ON catalog.code = module.item->>'code'
    LEFT JOIN public.nfse_tiers tier
      ON module.item->>'code' = 'nfe'
     AND tier.tier = v_nfse_tier;

  NEW.snapshot := jsonb_set(NEW.snapshot, '{modules}', v_modules, true);
  IF jsonb_typeof(NEW.snapshot->'users') = 'object'
     AND NOT (NEW.snapshot->'users' ? 'extra_unit_price')
     AND v_extra_user_price IS NOT NULL THEN
    NEW.snapshot := jsonb_set(
      NEW.snapshot,
      '{users}',
      (NEW.snapshot->'users') || jsonb_build_object('extra_unit_price', v_extra_user_price),
      true
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enrich_admin_payment_snapshot_breakdown()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enrich_admin_payment_snapshot_breakdown
  ON public.admin_payment_snapshots;
CREATE TRIGGER enrich_admin_payment_snapshot_breakdown
BEFORE INSERT OR UPDATE OF snapshot ON public.admin_payment_snapshots
FOR EACH ROW EXECUTE FUNCTION public.enrich_admin_payment_snapshot_breakdown();

CREATE OR REPLACE FUNCTION public.build_admin_payment_legacy_contract_snapshot(
  p_company_id uuid,
  p_payment_source text,
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_at timestamptz;
  v_cutoff timestamptz;
  v_amount numeric;
  v_asaas_payment_id text;
  v_cycle text;
  v_plan text;
  v_subscription_value numeric;
  v_nfse_tier integer;
  v_extra_users integer;
  v_extra_user_price numeric;
  v_modules jsonb := '[]'::jsonb;
  v_promotions jsonb := '[]'::jsonb;
  v_discount numeric := 0;
  v_sale jsonb;
  v_has_evidence boolean := false;
BEGIN
  IF p_payment_source = 'manual' THEN
    SELECT cp.payment_date, cp.amount, cp.asaas_payment_id
      INTO v_event_at, v_amount, v_asaas_payment_id
      FROM public.company_payments cp
     WHERE cp.id = p_payment_id AND cp.company_id = p_company_id;
  ELSIF p_payment_source = 'asaas' THEN
    SELECT COALESCE(sp.paid_at, sp.created_at), sp.amount, sp.asaas_payment_id, sp.billing_cycle
      INTO v_event_at, v_amount, v_asaas_payment_id, v_cycle
      FROM public.subscription_payments sp
     WHERE sp.id = p_payment_id AND sp.company_id = p_company_id;
  ELSE
    RETURN NULL;
  END IF;

  IF NOT FOUND OR v_event_at IS NULL THEN RETURN NULL; END IF;
  v_cutoff := date_trunc('day', v_event_at) + interval '1 day';

  SELECT c.nfse_tier INTO v_nfse_tier
    FROM public.companies c WHERE c.id = p_company_id;
  SELECT sm.price INTO v_extra_user_price
    FROM public.subscription_modules sm WHERE sm.code = 'extra_user';
  SELECT cm.quantity INTO v_extra_users
    FROM public.company_modules cm
   WHERE cm.company_id = p_company_id
     AND cm.module_code = 'extra_user'
     AND cm.activated_at < v_cutoff
   ORDER BY cm.activated_at DESC NULLS LAST, cm.id DESC
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'code', cm.module_code,
             'name', COALESCE(catalog.name, cm.module_code),
             'quantity', COALESCE(cm.quantity, 1),
             'unit_price', CASE WHEN cm.module_code = 'nfe'
               THEN COALESCE(tier.price, catalog.price)
               ELSE catalog.price END,
             'price_detail', CASE WHEN cm.module_code = 'nfe' THEN
               COALESCE(tier.name, 'Nível ' || COALESCE(v_nfse_tier, 1)::text)
               || CASE WHEN tier.monthly_limit IS NULL THEN ' · documentos ilimitados'
                       ELSE ' · até ' || tier.monthly_limit::text || ' documentos/mês' END
               ELSE NULL END
           )) ORDER BY COALESCE(catalog.name, cm.module_code)
         ), '[]'::jsonb)
    INTO v_modules
    FROM public.company_modules cm
    LEFT JOIN public.subscription_modules catalog ON catalog.code = cm.module_code
    LEFT JOIN public.nfse_tiers tier
      ON cm.module_code = 'nfe'
     AND tier.tier = COALESCE(v_nfse_tier, 1)
   WHERE cm.company_id = p_company_id
     AND cm.module_code <> 'extra_user'
     AND cm.activated_at < v_cutoff;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'scope_type', promotion.scope_type,
             'module_code', promotion.module_code,
             'module_name', catalog.name,
             'quantity', promotion.quantity,
             'standard_unit_price', promotion.standard_unit_price,
             'promotional_unit_price', promotion.promotional_unit_price,
             'discount', (promotion.standard_unit_price - promotion.promotional_unit_price) * promotion.quantity,
             'billing_cycles', promotion.billing_cycles,
             'cycle_number', consumption.cycle_number,
             'reason', promotion.reason
           ) ORDER BY promotion.created_at, promotion.id
         ), '[]'::jsonb),
         COALESCE(sum((promotion.standard_unit_price - promotion.promotional_unit_price) * promotion.quantity), 0)
    INTO v_promotions, v_discount
    FROM public.company_subscription_promotion_consumptions consumption
    JOIN public.company_subscription_promotions promotion ON promotion.id = consumption.promotion_id
    LEFT JOIN public.subscription_modules catalog ON catalog.code = promotion.module_code
   WHERE consumption.company_id = p_company_id
     AND consumption.payment_key IN (
       'company-payment:' || p_payment_id::text,
       'asaas:' || COALESCE(v_asaas_payment_id, '')
     );

  SELECT
    COALESCE(
      (SELECT sh.new_plan FROM public.subscription_history sh WHERE sh.company_id = p_company_id AND sh.created_at < v_cutoff AND sh.new_plan IS NOT NULL ORDER BY sh.created_at DESC LIMIT 1),
      (SELECT sh.previous_plan FROM public.subscription_history sh WHERE sh.company_id = p_company_id AND sh.created_at >= v_cutoff AND sh.previous_plan IS NOT NULL ORDER BY sh.created_at LIMIT 1)
    ),
    COALESCE(
      (SELECT sh.new_value FROM public.subscription_history sh WHERE sh.company_id = p_company_id AND sh.created_at < v_cutoff AND sh.new_value IS NOT NULL ORDER BY sh.created_at DESC LIMIT 1),
      (SELECT sh.previous_value FROM public.subscription_history sh WHERE sh.company_id = p_company_id AND sh.created_at >= v_cutoff AND sh.previous_value IS NOT NULL ORDER BY sh.created_at LIMIT 1)
    )
  INTO v_plan, v_subscription_value;

  IF v_cycle IS NULL THEN
    v_sale := public.build_admin_payment_sale_detail(p_company_id, p_payment_source, p_payment_id);
    v_cycle := v_sale #>> '{commercial,billing_cycle}';
  END IF;

  v_has_evidence := jsonb_array_length(v_modules) > 0
    OR jsonb_array_length(v_promotions) > 0
    OR v_plan IS NOT NULL OR v_cycle IS NOT NULL
    OR v_subscription_value IS NOT NULL OR v_extra_users IS NOT NULL;

  IF NOT v_has_evidence THEN
    RETURN jsonb_build_object('quality', 'legacy_unavailable');
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'version', 2,
    'quality', 'partial',
    'captured_from', 'historical_audit',
    'plan', CASE WHEN v_plan IS NULL THEN NULL ELSE jsonb_build_object('code', v_plan) END,
    'billing_cycle', v_cycle,
    'users', CASE WHEN v_extra_users IS NULL THEN NULL ELSE jsonb_build_object(
      'extra', v_extra_users,
      'extra_unit_price', v_extra_user_price
    ) END,
    'modules', v_modules,
    'promotions', v_promotions,
    'amounts', jsonb_build_object(
      'paid', v_amount,
      'subscription', v_subscription_value,
      'discount', v_discount
    )
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.build_admin_payment_legacy_contract_snapshot(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_admin_payment_legacy_contract_snapshot(uuid, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.build_admin_payment_legacy_contract_snapshot(uuid, text, uuid) IS
  'Reconstrucao parcial itemizada da cobranca com precos do catalogo Dominex.';

NOTIFY pgrst, 'reload schema';

COMMIT;

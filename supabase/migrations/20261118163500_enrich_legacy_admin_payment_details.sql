-- Completa pagamentos anteriores ao snapshot apenas com evidencias historicas.
-- Como a Dominex nao preservava remocoes antigas de modulo/usuarios, o retorno
-- continua explicitamente parcial e nunca copia o estado atual sem vigencia.

BEGIN;

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

  -- Uma linha ainda existente e ativada ate a cobranca comprova que o modulo
  -- fazia parte do contrato. Modulos removidos no legado permanecem ausentes.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'code', cm.module_code,
             'name', COALESCE(sm.name, cm.module_code),
             'quantity', COALESCE(cm.quantity, 1)
           ) ORDER BY COALESCE(sm.name, cm.module_code)
         ), '[]'::jsonb)
    INTO v_modules
    FROM public.company_modules cm
    LEFT JOIN public.subscription_modules sm ON sm.code = cm.module_code
   WHERE cm.company_id = p_company_id
     AND cm.activated_at < v_cutoff;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'scope_type', promotion.scope_type,
             'module_code', promotion.module_code,
             'module_name', sm.name,
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
    LEFT JOIN public.subscription_modules sm ON sm.code = promotion.module_code
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
    OR v_plan IS NOT NULL
    OR v_cycle IS NOT NULL
    OR v_subscription_value IS NOT NULL;

  IF NOT v_has_evidence THEN
    RETURN jsonb_build_object('quality', 'legacy_unavailable');
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'version', 1,
    'quality', 'partial',
    'captured_from', 'historical_audit',
    'plan', CASE WHEN v_plan IS NULL THEN NULL ELSE jsonb_build_object('code', v_plan) END,
    'billing_cycle', v_cycle,
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

CREATE OR REPLACE FUNCTION public.get_admin_payment_detail(
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
  v_snapshot_row public.admin_payment_snapshots%ROWTYPE;
  v_snapshot jsonb;
  v_quality text;
  v_legacy_snapshot jsonb;
  v_allowed boolean;
BEGIN
  v_allowed :=
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = p_company_id
        AND c.salesperson_id = public.current_salesperson_id()
    );

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_payment_source NOT IN ('manual', 'asaas') OR p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_detail_invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_snapshot_row
    FROM public.admin_payment_snapshots s
   WHERE s.company_id = p_company_id
     AND s.payment_source = p_payment_source
     AND s.payment_id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_detail_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_snapshot := v_snapshot_row.snapshot;
  v_quality := v_snapshot_row.quality;

  IF v_quality <> 'exact' THEN
    v_legacy_snapshot := public.build_admin_payment_legacy_contract_snapshot(
      p_company_id, p_payment_source, p_payment_id
    );

    IF v_legacy_snapshot->>'quality' = 'partial' THEN
      v_snapshot := v_legacy_snapshot || v_snapshot || jsonb_build_object(
        'quality', 'partial',
        'captured_from', 'historical_audit',
        'modules', CASE
          WHEN CASE WHEN jsonb_typeof(v_snapshot->'modules') = 'array'
            THEN jsonb_array_length(v_snapshot->'modules') ELSE 0 END > 0 THEN v_snapshot->'modules'
          ELSE v_legacy_snapshot->'modules'
        END,
        'promotions', CASE
          WHEN CASE WHEN jsonb_typeof(v_snapshot->'promotions') = 'array'
            THEN jsonb_array_length(v_snapshot->'promotions') ELSE 0 END > 0 THEN v_snapshot->'promotions'
          ELSE v_legacy_snapshot->'promotions'
        END,
        'plan', COALESCE(v_snapshot->'plan', v_legacy_snapshot->'plan'),
        'billing_cycle', COALESCE(v_snapshot->'billing_cycle', v_legacy_snapshot->'billing_cycle'),
        'amounts', COALESCE(v_legacy_snapshot->'amounts', '{}'::jsonb) || COALESCE(v_snapshot->'amounts', '{}'::jsonb)
      );
      v_quality := 'partial';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'payment_source', v_snapshot_row.payment_source,
    'payment_id', v_snapshot_row.payment_id,
    'company_id', v_snapshot_row.company_id,
    'quality', v_quality,
    'captured_at', v_snapshot_row.captured_at,
    'snapshot', v_snapshot,
    'sale', public.build_admin_payment_sale_detail(
      p_company_id, p_payment_source, p_payment_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_payment_detail(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_detail(uuid, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.build_admin_payment_legacy_contract_snapshot(uuid, text, uuid) IS
  'Reconstrucao parcial da composicao legada usando somente evidencias historicas preservadas.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Detalhe historico imutavel dos pagamentos exibidos na ficha administrativa.
-- O legado sem evidencia fica explicitamente indisponivel; nunca copiamos a
-- assinatura atual para fingir que ela era a composicao paga no passado.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_payment_snapshots (
  payment_source text NOT NULL CHECK (payment_source IN ('manual', 'asaas')),
  payment_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quality text NOT NULL CHECK (quality IN ('exact', 'partial', 'legacy_unavailable')),
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_source, payment_id)
);

CREATE INDEX IF NOT EXISTS admin_payment_snapshots_company_idx
  ON public.admin_payment_snapshots (company_id, captured_at DESC);

ALTER TABLE public.admin_payment_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_payment_snapshots'
      AND policyname = 'Admin reads payment snapshots in visible companies'
  ) THEN
    CREATE POLICY "Admin reads payment snapshots in visible companies"
      ON public.admin_payment_snapshots
      FOR SELECT TO authenticated
      USING (
        (SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role))
        OR (SELECT public.has_role(auth.uid(), 'admin'::public.app_role))
        OR (SELECT public.has_admin_permission(auth.uid(), 'admin_empresas'))
        OR EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = company_id
            AND c.salesperson_id = public.current_salesperson_id()
        )
      );
  END IF;
END;
$$;

REVOKE ALL ON public.admin_payment_snapshots FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_admin_payment_snapshot(
  p_company_id uuid,
  p_payment_source text,
  p_payment_id uuid,
  p_amount numeric,
  p_asaas_payment_id text DEFAULT NULL,
  p_change_request_id uuid DEFAULT NULL,
  p_billing_cycle text DEFAULT NULL,
  p_legacy boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company public.companies%ROWTYPE;
  v_change public.subscription_change_requests%ROWTYPE;
  v_modules jsonb := '[]'::jsonb;
  v_promotions jsonb := '[]'::jsonb;
  v_quality text := 'exact';
  v_plan_code text;
  v_plan_label text;
  v_cycle text;
  v_user_limit integer;
  v_extra_users integer;
  v_subscription_value numeric;
  v_base_value numeric;
  v_discount numeric := 0;
  v_change_json jsonb := NULL;
  v_has_historical_evidence boolean := false;
BEGIN
  IF p_company_id IS NULL OR p_payment_id IS NULL
     OR p_payment_source NOT IN ('manual', 'asaas') THEN
    RAISE EXCEPTION 'payment_snapshot_invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_snapshot_company_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'scope_type', p.scope_type,
             'module_code', p.module_code,
             'module_name', sm.name,
             'quantity', p.quantity,
             'standard_unit_price', p.standard_unit_price,
             'promotional_unit_price', p.promotional_unit_price,
             'discount', (p.standard_unit_price - p.promotional_unit_price) * p.quantity,
             'billing_cycles', p.billing_cycles,
             'cycle_number', pc.cycle_number,
             'reason', p.reason
           ) ORDER BY p.created_at, p.id
         ), '[]'::jsonb),
         COALESCE(sum((p.standard_unit_price - p.promotional_unit_price) * p.quantity), 0)
    INTO v_promotions, v_discount
    FROM public.company_subscription_promotion_consumptions pc
    JOIN public.company_subscription_promotions p ON p.id = pc.promotion_id
    LEFT JOIN public.subscription_modules sm ON sm.code = p.module_code
   WHERE pc.company_id = p_company_id
     AND pc.payment_key IN (
       'company-payment:' || p_payment_id::text,
       'asaas:' || COALESCE(p_asaas_payment_id, '')
     );

  v_has_historical_evidence := jsonb_array_length(v_promotions) > 0
    OR p_billing_cycle IS NOT NULL;

  IF p_change_request_id IS NOT NULL THEN
    SELECT * INTO v_change
      FROM public.subscription_change_requests
     WHERE id = p_change_request_id AND company_id = p_company_id;

    IF FOUND THEN
      SELECT COALESCE(jsonb_agg(
               jsonb_build_object(
                 'code', codes.code,
                 'name', COALESCE(sm.name, codes.code),
                 'quantity', 1,
                 'unit_price', sm.price
               ) ORDER BY COALESCE(sm.name, codes.code)
             ), '[]'::jsonb)
        INTO v_modules
        FROM unnest(v_change.target_modules) AS codes(code)
        LEFT JOIN public.subscription_modules sm ON sm.code = codes.code;

      v_plan_code := v_change.target_plan_code;
      v_plan_label := v_change.target_label;
      v_cycle := v_change.target_billing_cycle;
      v_user_limit := v_change.target_max_users;
      v_extra_users := v_change.target_extra_users;
      v_subscription_value := v_change.target_period_value;
      v_base_value := v_change.target_monthly_value;
      v_change_json := jsonb_build_object(
        'id', v_change.id,
        'kind', v_change.change_kind,
        'credit_amount', v_change.credit_amount,
        'amount_due', v_change.amount_due,
        'period_started_at', v_change.period_started_at,
        'period_ends_at', v_change.period_ends_at,
        'initial_activation', v_change.initial_activation
      );
      v_has_historical_evidence := true;
    END IF;
  END IF;

  IF v_change_json IS NULL AND NOT p_legacy THEN
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'code', cm.module_code,
               'name', COALESCE(sm.name, cm.module_code),
               'quantity', COALESCE(cm.quantity, 1),
               'unit_price', sm.price
             ) ORDER BY COALESCE(sm.name, cm.module_code)
           ), '[]'::jsonb)
      INTO v_modules
      FROM public.company_modules cm
      LEFT JOIN public.subscription_modules sm ON sm.code = cm.module_code
     WHERE cm.company_id = p_company_id;

    v_plan_code := v_company.subscription_plan;
    v_cycle := COALESCE(p_billing_cycle, v_company.billing_cycle);
    v_user_limit := v_company.max_users;
    v_extra_users := v_company.extra_users;
    v_subscription_value := v_company.subscription_value;
    v_base_value := v_company.custom_price;
  ELSIF v_change_json IS NULL AND p_legacy THEN
    v_quality := CASE WHEN v_has_historical_evidence THEN 'partial' ELSE 'legacy_unavailable' END;
    v_cycle := p_billing_cycle;
  END IF;

  INSERT INTO public.admin_payment_snapshots (
    payment_source, payment_id, company_id, quality, snapshot, captured_at
  ) VALUES (
    p_payment_source,
    p_payment_id,
    p_company_id,
    v_quality,
    jsonb_strip_nulls(jsonb_build_object(
      'version', 1,
      'quality', v_quality,
      'captured_from', CASE WHEN p_legacy THEN 'historical_ledger' ELSE 'payment_event' END,
      'change_request_id', p_change_request_id,
      'plan', CASE WHEN v_plan_code IS NULL THEN NULL ELSE
        jsonb_build_object('code', v_plan_code, 'label', v_plan_label) END,
      'billing_cycle', v_cycle,
      'users', CASE WHEN v_user_limit IS NULL AND v_extra_users IS NULL THEN NULL ELSE
        jsonb_build_object('limit', v_user_limit, 'extra', COALESCE(v_extra_users, 0)) END,
      'modules', v_modules,
      'promotions', v_promotions,
      'installment', NULL,
      'amounts', jsonb_build_object(
        'paid', p_amount,
        'subscription', v_subscription_value,
        'base', v_base_value,
        'discount', v_discount
      ),
      'change', v_change_json
    )),
    now()
  )
  ON CONFLICT (payment_source, payment_id) DO UPDATE
    SET quality = EXCLUDED.quality,
        snapshot = EXCLUDED.snapshot,
        captured_at = EXCLUDED.captured_at
  WHERE CASE EXCLUDED.quality WHEN 'exact' THEN 3 WHEN 'partial' THEN 2 ELSE 1 END
          > CASE admin_payment_snapshots.quality WHEN 'exact' THEN 3 WHEN 'partial' THEN 2 ELSE 1 END
     OR (
       EXCLUDED.snapshot->>'change_request_id' IS NOT NULL
       AND admin_payment_snapshots.snapshot->>'change_request_id' IS NULL
     );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_admin_payment_snapshot(uuid, text, uuid, numeric, text, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_admin_payment_snapshot(uuid, text, uuid, numeric, text, uuid, text, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.capture_admin_payment_snapshot_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'company_payments' THEN
    PERFORM public.capture_admin_payment_snapshot(
      NEW.company_id, 'manual', NEW.id, NEW.amount, NEW.asaas_payment_id,
      NULL, NULL, false
    );
  ELSE
    PERFORM public.capture_admin_payment_snapshot(
      NEW.company_id, 'asaas', NEW.id, NEW.amount, NEW.asaas_payment_id,
      NEW.subscription_change_request_id, NEW.billing_cycle, false
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_admin_payment_snapshot_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_capture_admin_payment_snapshot ON public.company_payments;
CREATE TRIGGER zz_capture_admin_payment_snapshot
AFTER INSERT ON public.company_payments
FOR EACH ROW EXECUTE FUNCTION public.capture_admin_payment_snapshot_trigger();

DROP TRIGGER IF EXISTS zz_capture_admin_subscription_payment_snapshot ON public.subscription_payments;
CREATE TRIGGER zz_capture_admin_subscription_payment_snapshot
AFTER INSERT OR UPDATE OF subscription_change_request_id, asaas_payment_id, billing_cycle
ON public.subscription_payments
FOR EACH ROW EXECUTE FUNCTION public.capture_admin_payment_snapshot_trigger();

INSERT INTO public.admin_payment_snapshots (
  payment_source, payment_id, company_id, quality, snapshot, captured_at
)
SELECT 'manual', cp.id, cp.company_id, 'legacy_unavailable',
       jsonb_build_object(
         'version', 1,
         'quality', 'legacy_unavailable',
         'captured_from', 'legacy_unavailable',
         'modules', '[]'::jsonb,
         'promotions', '[]'::jsonb,
         'amounts', jsonb_build_object('paid', cp.amount, 'discount', 0)
       ),
       now()
  FROM public.company_payments cp
ON CONFLICT (payment_source, payment_id) DO NOTHING;

INSERT INTO public.admin_payment_snapshots (
  payment_source, payment_id, company_id, quality, snapshot, captured_at
)
SELECT 'asaas', sp.id, sp.company_id, 'legacy_unavailable',
       jsonb_build_object(
         'version', 1,
         'quality', 'legacy_unavailable',
         'captured_from', 'legacy_unavailable',
         'modules', '[]'::jsonb,
         'promotions', '[]'::jsonb,
         'amounts', jsonb_build_object('paid', sp.amount, 'discount', 0)
       ),
       now()
  FROM public.subscription_payments sp
ON CONFLICT (payment_source, payment_id) DO NOTHING;

SELECT public.capture_admin_payment_snapshot(
  cp.company_id, 'manual', cp.id, cp.amount, cp.asaas_payment_id,
  NULL, NULL, true
)
FROM public.company_payments cp
WHERE EXISTS (
  SELECT 1 FROM public.company_subscription_promotion_consumptions pc
  WHERE pc.company_id = cp.company_id
    AND pc.payment_key IN ('company-payment:' || cp.id::text, 'asaas:' || COALESCE(cp.asaas_payment_id, ''))
);

SELECT public.capture_admin_payment_snapshot(
  sp.company_id, 'asaas', sp.id, sp.amount, sp.asaas_payment_id,
  sp.subscription_change_request_id, sp.billing_cycle, true
)
FROM public.subscription_payments sp
WHERE sp.subscription_change_request_id IS NOT NULL OR sp.billing_cycle IS NOT NULL;

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
  v_result jsonb;
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

  SELECT jsonb_build_object(
           'payment_source', s.payment_source,
           'payment_id', s.payment_id,
           'company_id', s.company_id,
           'quality', s.quality,
           'captured_at', s.captured_at,
           'snapshot', s.snapshot
         )
    INTO v_result
    FROM public.admin_payment_snapshots s
   WHERE s.company_id = p_company_id
     AND s.payment_source = p_payment_source
     AND s.payment_id = p_payment_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'payment_detail_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_payment_detail(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_payment_detail(uuid, text, uuid)
  TO authenticated, service_role;

COMMENT ON TABLE public.admin_payment_snapshots IS
  'Snapshot imutavel da composicao cobrada em cada pagamento SaaS. Legado sem evidencia permanece explicitamente indisponivel.';
COMMENT ON FUNCTION public.get_admin_payment_detail(uuid, text, uuid) IS
  'Retorna um unico detalhe de pagamento sob demanda, restrito ao gate da ficha administrativa da empresa.';

COMMIT;

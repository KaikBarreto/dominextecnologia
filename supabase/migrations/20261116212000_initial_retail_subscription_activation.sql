-- Primeira contratação Loja: cotação integral, claim persistido e liberação
-- transacional somente com pagamento confirmado. Não altera contratos legados.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.subscription_change_requests
 ADD COLUMN initial_activation boolean NOT NULL DEFAULT false,
 ADD COLUMN source_company_snapshot jsonb,
 ADD COLUMN payment_creation_state text NOT NULL DEFAULT 'idle'
 CHECK (payment_creation_state IN ('idle','creating','created','unknown','failed'));
-- O webhook pode confirmar antes de a edge persistir a linha do cartão. Uma
-- única linha por primeira contratação fecha essa corrida sem deixar um novo
-- PENDING órfão para ser vinculado à fatura do mês seguinte.
CREATE UNIQUE INDEX uq_subscription_payments_initial_quote
 ON public.subscription_payments(subscription_change_request_id)
 WHERE type='primeira_venda' AND subscription_change_request_id IS NOT NULL;

CREATE FUNCTION public.initial_subscription_activation_snapshot(p_company_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_object_agg(key,value) || jsonb_build_object('company_modules',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('module_code',m.module_code,'quantity',m.quantity)
 ORDER BY m.module_code COLLATE "C"),'[]'::jsonb) FROM public.company_modules m WHERE m.company_id=p_company_id))
 FROM public.companies c,
 LATERAL jsonb_each(to_jsonb(c)) WHERE c.id=p_company_id AND key=ANY(ARRAY[
 'business_core','business_core_version','subscription_status','subscription_plan','subscription_value',
 'max_users','extra_users','ltv','custom_price','custom_price_permanent','custom_price_months',
 'custom_price_payments_made','pricing_adjustment_source','plan_locked','billing_cycle',
 'subscription_expires_at','pending_subscription_value','pending_plan_code',
 'pending_billing_cycle','pending_modules','pending_max_users','pending_nfse_tier','pending_whatsapp_tier',
 'nfse_tier','whatsapp_tier','trial_days','origin']);
$$;
REVOKE ALL ON FUNCTION public.initial_subscription_activation_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.initial_subscription_activation_eligible(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT coalesce((SELECT business_core='retail' AND business_core_version=2
 AND subscription_status IN ('testing','Testando','trial') AND trial_days>0
 AND subscription_value>=0 AND coalesce(ltv,0)=0 AND custom_price IS NULL
 AND custom_price_permanent IS DISTINCT FROM true AND coalesce(custom_price_months,0)=0
 AND coalesce(custom_price_payments_made,0)=0 AND pricing_adjustment_source IS NULL
 AND plan_locked IS DISTINCT FROM true
 AND pending_subscription_value IS NULL AND pending_plan_code IS NULL AND pending_billing_cycle IS NULL
 AND pending_modules IS NULL AND pending_max_users IS NULL AND pending_nfse_tier IS NULL
 AND pending_whatsapp_tier IS NULL FROM public.companies WHERE id=p_company_id),false);
$$;
REVOKE ALL ON FUNCTION public.initial_subscription_activation_eligible(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.initial_subscription_activation_actor_allowed(p_company_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id AND p.is_active IS TRUE
 AND (public.has_role(p_user_id,'super_admin') OR (p.company_id=p_company_id
 AND (public.has_role(p_user_id,'admin') OR public.has_role(p_user_id,'gestor')))));
$$;
REVOKE ALL ON FUNCTION public.initial_subscription_activation_actor_allowed(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.prepare_initial_subscription_activation(
 p_company_id uuid,p_requested_by uuid,p_expected_snapshot jsonb,p_target jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.companies%ROWTYPE; q public.subscription_change_requests%ROWTYPE;
 v_fingerprint text; v_monthly numeric; v_amount numeric; v_cycle text; v_now timestamptz:=now();
BEGIN
 IF NOT public.initial_subscription_activation_actor_allowed(p_company_id,p_requested_by) THEN
  RAISE EXCEPTION 'initial_activation_actor_not_allowed';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text,0));
 SELECT * INTO c FROM public.companies WHERE id=p_company_id FOR UPDATE;
 IF NOT FOUND OR c.asaas_subscription_id IS NOT NULL OR NOT public.initial_subscription_activation_eligible(p_company_id)
 OR public.initial_subscription_activation_snapshot(p_company_id) IS DISTINCT FROM p_expected_snapshot THEN
  RAISE EXCEPTION 'initial_activation_source_changed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.subscription_payments WHERE company_id=p_company_id)
 OR EXISTS(SELECT 1 FROM public.subscription_checkout_attempts WHERE company_id=p_company_id
  AND checkout_status IN ('CREATING','CREATE_UNKNOWN','PENDING','CREATED','ACTIVE'))
 OR EXISTS(SELECT 1 FROM public.company_subscription_promotions WHERE company_id=p_company_id AND status='active') THEN
  RAISE EXCEPTION 'initial_activation_commitment_exists';
 END IF;
 v_cycle:=p_target->>'billing_cycle'; v_monthly:=(p_target->>'monthly_value')::numeric;
 IF v_cycle NOT IN ('monthly','yearly') OR v_monthly IS NULL OR v_monthly<=0
 OR coalesce((p_target->>'max_users')::integer,0)<=0
 OR NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code=p_target->>'plan_code' AND is_active
  AND (code='personalizado' OR (business_core=c.business_core AND code IN ('retail_start','retail_avancado','retail_master')))) THEN
  RAISE EXCEPTION 'initial_activation_invalid_offer';
 END IF;
 v_amount:=round(CASE WHEN v_cycle='yearly' THEN round(v_monthly*12*0.8) ELSE v_monthly END,2);
 v_fingerprint:='initial:'||md5(p_expected_snapshot::text||p_target::text);
 -- Só expira ofertas sem tentativa de gateway; valor incerto fica congelado.
 UPDATE public.subscription_change_requests SET status='expired'
 WHERE company_id=p_company_id AND initial_activation AND status='pending' AND expires_at<=v_now
 AND payment_creation_state IN ('idle','failed');
 SELECT * INTO q FROM public.subscription_change_requests WHERE company_id=p_company_id
 AND status IN ('pending','payment_pending') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  IF q.initial_activation AND q.request_fingerprint=v_fingerprint THEN RETURN to_jsonb(q); END IF;
  RAISE EXCEPTION 'initial_activation_quote_exists';
 END IF;
 INSERT INTO public.subscription_change_requests(
 company_id,requested_by,initial_activation,source_company_snapshot,source_plan_code,target_plan_code,
 source_billing_cycle,target_billing_cycle,source_subscription_value,source_monthly_value,target_monthly_value,
 source_period_value,target_period_value,credit_amount,amount_due,remaining_ratio,period_started_at,period_ends_at,
 next_renewal_at,resets_billing_anchor,target_modules,target_max_users,target_extra_users,source_nfse_tier,
 target_nfse_tier,source_whatsapp_tier,target_whatsapp_tier,request_fingerprint,expires_at)
 VALUES(p_company_id,p_requested_by,true,p_expected_snapshot,c.subscription_plan,p_target->>'plan_code',
 coalesce(c.billing_cycle,'monthly'),v_cycle,c.subscription_value,c.subscription_value,v_monthly,0,v_amount,0,v_amount,1,v_now,v_now,
 public.compute_next_expiration(v_now,v_cycle),true,
 ARRAY(SELECT jsonb_array_elements_text(p_target->'modules')),(p_target->>'max_users')::integer,
 coalesce((p_target->>'extra_users')::integer,0),coalesce(c.nfse_tier,1),(p_target->>'nfse_tier')::smallint,
 coalesce(c.whatsapp_tier,1),(p_target->>'whatsapp_tier')::smallint,v_fingerprint,v_now+interval '48 hours')
 RETURNING * INTO q;
 RETURN to_jsonb(q);
END $$;
REVOKE ALL ON FUNCTION public.prepare_initial_subscription_activation(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_initial_subscription_activation(uuid,uuid,jsonb,jsonb) TO service_role;

CREATE FUNCTION public.claim_initial_subscription_activation_payment(p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.subscription_change_requests%ROWTYPE; v_company_id uuid;
BEGIN
 SELECT company_id INTO v_company_id FROM public.subscription_change_requests WHERE id=p_request_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text,0));
 PERFORM 1 FROM public.companies WHERE id=v_company_id AND asaas_subscription_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO q FROM public.subscription_change_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR NOT q.initial_activation OR q.status NOT IN ('pending','payment_pending')
 OR NOT public.initial_subscription_activation_actor_allowed(v_company_id,q.requested_by)
 OR q.payment_creation_state NOT IN ('idle','failed') OR q.expires_at<=now()
 OR NOT public.initial_subscription_activation_eligible(v_company_id)
 OR public.initial_subscription_activation_snapshot(v_company_id) IS DISTINCT FROM q.source_company_snapshot
 OR EXISTS(SELECT 1 FROM public.subscription_payments WHERE company_id=v_company_id)
 OR EXISTS(SELECT 1 FROM public.subscription_checkout_attempts WHERE company_id=v_company_id
  AND checkout_status IN ('CREATING','CREATE_UNKNOWN','PENDING','CREATED','ACTIVE'))
 OR EXISTS(SELECT 1 FROM public.company_subscription_promotions WHERE company_id=v_company_id AND status='active') THEN
  RETURN false;
 END IF;
 UPDATE public.subscription_change_requests SET payment_creation_state='creating' WHERE id=p_request_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_initial_subscription_activation_payment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_initial_subscription_activation_payment(uuid) TO service_role;

-- A implementação contábil existente vira interna. O dispatcher preserva seu
-- contrato público e impede que uma ativação inicial pule a âncora específica.
ALTER FUNCTION public.apply_subscription_upgrade_payment(uuid,text,numeric,text)
 RENAME TO apply_subscription_upgrade_payment_legacy_v1;
REVOKE ALL ON FUNCTION public.apply_subscription_upgrade_payment_legacy_v1(uuid,text,numeric,text)
 FROM PUBLIC,anon,authenticated,service_role;

-- Mesmo motor contábil, com classificação/data iniciais antes dos triggers
-- de comissão. As demais mudanças preservam o comportamento do upgrade.
CREATE OR REPLACE FUNCTION public.apply_subscription_upgrade_payment_legacy_v1(
  p_request_id UUID,
  p_asaas_payment_id TEXT,
  p_paid_amount NUMERIC,
  p_billing_type TEXT DEFAULT 'PIX'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.subscription_change_requests%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_new_expiration TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_payment_type text := 'upgrade';
  v_payment_method TEXT := lower(COALESCE(NULLIF(p_billing_type, ''), 'PIX'));
BEGIN
  IF p_request_id IS NULL OR p_asaas_payment_id IS NULL OR btrim(p_asaas_payment_id) = '' THEN
    RAISE EXCEPTION 'upgrade_payment_missing_identifiers';
  END IF;

  SELECT * INTO v_request
    FROM public.subscription_change_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upgrade_request_not_found';
  END IF;

  IF v_request.initial_activation THEN
    v_payment_type := 'primeira_venda';
    SELECT coalesce(paid_at, now()) INTO v_now FROM public.subscription_payments
     WHERE asaas_payment_id=p_asaas_payment_id;
    v_now := coalesce(v_now, now());
  END IF;

  IF v_request.status = 'applied' THEN
    RETURN jsonb_build_object(
      'applied', false,
      'already_applied', true,
      'company_id', v_request.company_id,
      'target_monthly_value', v_request.target_monthly_value,
      'target_period_value', v_request.target_period_value,
      'target_billing_cycle', v_request.target_billing_cycle,
      'next_renewal_at', v_request.next_renewal_at
    );
  END IF;

  IF v_request.status NOT IN ('pending', 'payment_pending') THEN
    RAISE EXCEPTION 'upgrade_request_not_payable:%', v_request.status;
  END IF;

  IF p_paid_amount IS NULL OR abs(p_paid_amount - v_request.amount_due) > 0.02 THEN
    RAISE EXCEPTION 'upgrade_payment_amount_mismatch';
  END IF;

  IF v_request.asaas_payment_id IS NOT NULL
     AND v_request.asaas_payment_id <> p_asaas_payment_id THEN
    RAISE EXCEPTION 'upgrade_payment_id_mismatch';
  END IF;

  SELECT * INTO v_company
    FROM public.companies
   WHERE id = v_request.company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upgrade_company_not_found';
  END IF;

  -- A cotacao nao pode aplicar sobre uma assinatura que mudou enquanto o
  -- checkout estava aberto. Falha fechada; o pagamento fica rastreado para
  -- conciliacao humana em vez de conceder um entitlement incorreto.
  IF COALESCE(v_company.subscription_plan, '') <> COALESCE(v_request.source_plan_code, '')
     OR COALESCE(v_company.billing_cycle, 'monthly') <> v_request.source_billing_cycle
     OR abs(COALESCE(v_company.subscription_value, 0) - v_request.source_subscription_value) > 0.02
     OR abs(
       (CASE
          WHEN COALESCE(v_company.custom_price, 0) > 0
           AND COALESCE(v_company.custom_price_months, 0) > 0
           AND COALESCE(v_company.custom_price_payments_made, 0) < v_company.custom_price_months
          THEN v_company.custom_price
          ELSE COALESCE(v_company.subscription_value, 0)
        END) - v_request.source_monthly_value
     ) > 0.02
     OR (v_request.target_nfse_tier IS NOT NULL AND COALESCE(v_company.nfse_tier, 1) <> v_request.source_nfse_tier)
     OR (v_request.target_whatsapp_tier IS NOT NULL AND COALESCE(v_company.whatsapp_tier, 1) <> v_request.source_whatsapp_tier) THEN
    UPDATE public.subscription_change_requests
       SET status = 'failed',
           asaas_payment_id = p_asaas_payment_id,
           paid_at = v_now
     WHERE id = v_request.id;
    INSERT INTO public.subscription_payments (
      company_id, asaas_payment_id, asaas_customer_id, amount, status,
      billing_type, billing_cycle, due_date, paid_at, payment_method, type,
      subscription_change_request_id
    ) VALUES (
      v_request.company_id, p_asaas_payment_id, v_company.asaas_customer_id,
      p_paid_amount, 'CONFIRMED', upper(COALESCE(p_billing_type, 'PIX')),
      v_request.target_billing_cycle, v_now::date, v_now, v_payment_method,
      v_payment_type, v_request.id
    )
    ON CONFLICT (asaas_payment_id) DO UPDATE
      SET status = 'CONFIRMED', paid_at = v_now,
          subscription_change_request_id = EXCLUDED.subscription_change_request_id,
          updated_at = v_now;
    RETURN jsonb_build_object(
      'applied', false,
      'failed', true,
      'reason', 'source_subscription_changed',
      'company_id', v_request.company_id,
      'target_monthly_value', v_request.target_monthly_value
    );
  END IF;

  IF v_request.resets_billing_anchor THEN
    SELECT public.compute_next_expiration(v_now, v_request.target_billing_cycle)
      INTO v_new_expiration;
  ELSE
    v_new_expiration := v_request.period_ends_at;
  END IF;

  UPDATE public.companies
     SET subscription_plan = v_request.target_plan_code,
         subscription_status = CASE WHEN v_request.initial_activation THEN 'active' ELSE subscription_status END,
         subscription_value = v_request.target_monthly_value,
         billing_cycle = v_request.target_billing_cycle,
         subscription_expires_at = v_new_expiration,
         max_users = v_request.target_max_users,
         extra_users = v_request.target_extra_users,
         nfse_tier = COALESCE(v_request.target_nfse_tier, nfse_tier),
         whatsapp_tier = COALESCE(v_request.target_whatsapp_tier, whatsapp_tier),
         custom_price = NULL,
         custom_price_months = NULL,
         custom_price_payments_made = 0,
         custom_price_permanent = false,
         pending_subscription_value = NULL,
         pending_plan_code = NULL,
         pending_billing_cycle = NULL,
         pending_modules = NULL,
         pending_max_users = NULL,
         pending_nfse_tier = NULL,
         pending_whatsapp_tier = NULL,
         ltv = GREATEST(0, COALESCE(ltv, 0) + p_paid_amount)
   WHERE id = v_request.company_id;

  DELETE FROM public.company_modules
   WHERE company_id = v_request.company_id;

  INSERT INTO public.company_modules (company_id, module_code)
  SELECT v_request.company_id, module_code
    FROM unnest(v_request.target_modules) AS module_code
  ON CONFLICT DO NOTHING;

  INSERT INTO public.subscription_history (
    company_id, changed_by, previous_plan, new_plan,
    previous_value, new_value, previous_status, new_status, reason
  ) VALUES (
    v_request.company_id,
    v_request.requested_by,
    v_request.source_plan_code,
    v_request.target_plan_code,
    v_request.source_monthly_value,
    v_request.target_monthly_value,
    v_company.subscription_status,
    CASE WHEN v_request.initial_activation THEN 'active' ELSE v_company.subscription_status END,
    format(
      'Upgrade proporcional confirmado: cobrança %s; crédito %s; proporção restante %s; request %s',
      v_request.amount_due,
      v_request.credit_amount,
      v_request.remaining_ratio,
      v_request.id
    )
  );

  INSERT INTO public.company_payments (
    company_id, amount, type, payment_method, payment_date,
    notes, origin, asaas_payment_id
  ) VALUES (
    v_request.company_id,
    p_paid_amount,
    v_payment_type,
    v_payment_method,
    v_now,
    format('Upgrade proporcional via Asaas - %s', p_asaas_payment_id),
    v_company.origin,
    p_asaas_payment_id
  );

  BEGIN
    INSERT INTO public.admin_financial_transactions (
      type, category, amount, description, reference_id, reference_type,
      asaas_transaction_id, transaction_date
    ) VALUES (
      'income',
      CASE WHEN v_request.initial_activation THEN 'sale' ELSE 'renewal' END,
      p_paid_amount,
      format('Upgrade - %s (Asaas %s)', v_company.name, p_asaas_payment_id),
      v_request.company_id,
      CASE WHEN v_request.initial_activation THEN 'subscription_payment' ELSE 'subscription_upgrade' END,
      p_asaas_payment_id,
      v_now
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public.subscription_payments (
    company_id, asaas_payment_id, asaas_customer_id, amount, status,
    billing_type, billing_cycle, due_date, paid_at, payment_method, type,
    ltv_credited_at, subscription_change_request_id
  ) VALUES (
    v_request.company_id,
    p_asaas_payment_id,
    v_company.asaas_customer_id,
    p_paid_amount,
    'CONFIRMED',
    upper(COALESCE(p_billing_type, 'PIX')),
    v_request.target_billing_cycle,
    v_now::date,
    v_now,
    v_payment_method,
    v_payment_type,
    v_now,
    v_request.id
  )
  ON CONFLICT (asaas_payment_id) DO UPDATE
    SET status = 'CONFIRMED',
        amount = EXCLUDED.amount,
        billing_type = EXCLUDED.billing_type,
        billing_cycle = EXCLUDED.billing_cycle,
        paid_at = EXCLUDED.paid_at,
        payment_method = EXCLUDED.payment_method,
        type = v_payment_type,
        ltv_credited_at = COALESCE(public.subscription_payments.ltv_credited_at, EXCLUDED.ltv_credited_at),
        subscription_change_request_id = EXCLUDED.subscription_change_request_id,
        updated_at = v_now;

  UPDATE public.subscription_change_requests
     SET status = 'applied',
         asaas_payment_id = p_asaas_payment_id,
         paid_at = v_now,
         applied_at = v_now,
         next_renewal_at = v_new_expiration
   WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'applied', true,
    'already_applied', false,
    'company_id', v_request.company_id,
    'target_monthly_value', v_request.target_monthly_value,
    'target_period_value', v_request.target_period_value,
    'target_billing_cycle', v_request.target_billing_cycle,
    'next_renewal_at', v_new_expiration
  );
END;
$$;

CREATE FUNCTION public.apply_initial_subscription_activation_payment(
 p_request_id uuid,p_asaas_payment_id text,p_paid_amount numeric,p_billing_type text DEFAULT 'PIX',p_paid_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE q public.subscription_change_requests%ROWTYPE; c public.companies%ROWTYPE;
 v_result jsonb; v_paid_at timestamptz; v_new_expiration timestamptz; v_existing public.subscription_payments%ROWTYPE;
BEGIN
 SELECT company_id INTO q.company_id FROM public.subscription_change_requests WHERE id=p_request_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(q.company_id::text,0));
 SELECT * INTO c FROM public.companies WHERE id=q.company_id FOR UPDATE;
 SELECT * INTO q FROM public.subscription_change_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR NOT q.initial_activation THEN RAISE EXCEPTION 'initial_activation_not_found'; END IF;
 IF q.status='applied' THEN
  IF q.asaas_payment_id IS DISTINCT FROM p_asaas_payment_id THEN RAISE EXCEPTION 'initial_activation_payment_mismatch'; END IF;
  RETURN jsonb_build_object('already_applied',true,'company_id',q.company_id,'initial_activation',true,
   'target_monthly_value',q.target_monthly_value,'target_period_value',q.target_period_value,
   'target_billing_cycle',q.target_billing_cycle,'next_renewal_at',q.next_renewal_at);
 END IF;
 IF q.status NOT IN ('pending','payment_pending') OR p_paid_amount IS NULL
 OR abs(p_paid_amount-q.amount_due)>0.02 OR left(coalesce(p_asaas_payment_id,''),4)<>'pay_'
 OR (q.asaas_payment_id IS NOT NULL AND q.asaas_payment_id<>p_asaas_payment_id) THEN
  RAISE EXCEPTION 'initial_activation_payment_mismatch';
 END IF;
 UPDATE public.subscription_payments SET asaas_payment_id=p_asaas_payment_id
 WHERE subscription_change_request_id=q.id AND asaas_payment_id IS NULL AND type='primeira_venda';
 SELECT * INTO v_existing FROM public.subscription_payments WHERE asaas_payment_id=p_asaas_payment_id FOR UPDATE;
 IF FOUND AND (v_existing.company_id<>q.company_id OR abs(v_existing.amount-p_paid_amount)>0.02 OR v_existing.ltv_credited_at IS NOT NULL
 OR (v_existing.subscription_change_request_id IS NOT NULL AND v_existing.subscription_change_request_id<>q.id)) THEN
  RAISE EXCEPTION 'initial_activation_payment_already_accounted';
 END IF;
 v_paid_at:=coalesce(v_existing.paid_at,p_paid_at,now());
 INSERT INTO public.subscription_payments(company_id,asaas_payment_id,asaas_customer_id,amount,status,billing_type,
 billing_cycle,due_date,paid_at,payment_method,type,subscription_change_request_id)
 VALUES(q.company_id,p_asaas_payment_id,c.asaas_customer_id,p_paid_amount,'CONFIRMED',upper(p_billing_type),
 q.target_billing_cycle,v_paid_at::date,v_paid_at,lower(p_billing_type),'primeira_venda',q.id)
 ON CONFLICT(asaas_payment_id) DO UPDATE SET status='CONFIRMED',paid_at=EXCLUDED.paid_at,
 subscription_change_request_id=q.id;
 IF NOT public.initial_subscription_activation_eligible(q.company_id)
 OR public.initial_subscription_activation_snapshot(q.company_id) IS DISTINCT FROM q.source_company_snapshot
 OR EXISTS(SELECT 1 FROM public.subscription_payments WHERE company_id=q.company_id AND asaas_payment_id IS DISTINCT FROM p_asaas_payment_id)
 OR EXISTS(SELECT 1 FROM public.company_subscription_promotions WHERE company_id=q.company_id AND status='active') THEN
  UPDATE public.subscription_change_requests SET status='failed',asaas_payment_id=p_asaas_payment_id,paid_at=v_paid_at WHERE id=q.id;
  RETURN jsonb_build_object('failed',true,'company_id',q.company_id,'initial_activation',true);
 END IF;
 -- Contabilidade, LTV e módulos exatos do alvo permanecem numa única fonte.
 v_result:=public.apply_subscription_upgrade_payment_legacy_v1(q.id,p_asaas_payment_id,p_paid_amount,p_billing_type);
 IF coalesce((v_result->>'failed')::boolean,false) THEN RETURN v_result; END IF;
 v_new_expiration:=public.compute_next_expiration(v_paid_at,q.target_billing_cycle);
 UPDATE public.companies SET subscription_status='active',subscription_expires_at=v_new_expiration WHERE id=q.company_id;
 -- O trigger de módulos rodou ainda no estado anterior. Agora o gate pago já
 -- está vigente; somente o adicional contratado pode semear Serviços.
 PERFORM public.seed_company_catalog(q.company_id);
 UPDATE public.subscription_payments SET type='primeira_venda',paid_at=v_paid_at,due_date=v_paid_at::date WHERE asaas_payment_id=p_asaas_payment_id;
 UPDATE public.company_payments SET type='primeira_venda',payment_date=v_paid_at,
 notes='Primeira contratação via Asaas - '||p_asaas_payment_id WHERE asaas_payment_id=p_asaas_payment_id;
 UPDATE public.admin_financial_transactions SET category='sale',reference_type='subscription_payment',
 description='Primeira Venda - '||c.name||' (Asaas '||p_asaas_payment_id||')',transaction_date=v_paid_at
 WHERE asaas_transaction_id=p_asaas_payment_id AND type='income';
 UPDATE public.subscription_change_requests SET paid_at=v_paid_at,next_renewal_at=v_new_expiration WHERE id=q.id;
 RETURN v_result||jsonb_build_object('initial_activation',true,'next_renewal_at',v_new_expiration);
END $$;
REVOKE ALL ON FUNCTION public.apply_initial_subscription_activation_payment(uuid,text,numeric,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_initial_subscription_activation_payment(uuid,text,numeric,text,timestamptz) TO service_role;

CREATE FUNCTION public.apply_subscription_upgrade_payment(
 p_request_id uuid,p_asaas_payment_id text,p_paid_amount numeric,p_billing_type text DEFAULT 'PIX'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.subscription_change_requests WHERE id=p_request_id AND initial_activation) THEN
  RETURN public.apply_initial_subscription_activation_payment(p_request_id,p_asaas_payment_id,p_paid_amount,p_billing_type,NULL);
 END IF;
 RETURN public.apply_subscription_upgrade_payment_legacy_v1(p_request_id,p_asaas_payment_id,p_paid_amount,p_billing_type);
END $$;
REVOKE ALL ON FUNCTION public.apply_subscription_upgrade_payment(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_upgrade_payment(uuid,text,numeric,text) TO service_role;

-- Mesma regra do webhook anterior (mensal 100%, anual 20%; SDR 80/20),
-- agora sob lock e usando exclusivamente um pagamento confirmado persistido.
-- Afiliados continuam no trigger canônico de company_payments e excluem vendedor.
CREATE FUNCTION public.record_subscription_first_sale_attribution(p_company_id uuid,p_asaas_payment_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.companies%ROWTYPE; p public.subscription_payments%ROWTYPE;
 q public.subscription_change_requests%ROWTYPE; v_base numeric; v_total numeric; v_closer numeric; v_sdr numeric;
 v_yearly boolean; v_id uuid;
BEGIN
 SELECT * INTO c FROM public.companies WHERE id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'first_sale_company_not_found'; END IF;
 SELECT * INTO p FROM public.subscription_payments WHERE asaas_payment_id=p_asaas_payment_id AND company_id=p_company_id;
 IF NOT FOUND OR p.status NOT IN ('CONFIRMED','RECEIVED') OR p.type<>'primeira_venda'
 OR p.amount<=0 OR p.paid_at IS NULL OR p.ltv_credited_at IS NULL THEN
  RAISE EXCEPTION 'first_sale_payment_not_confirmed';
 END IF;
 IF c.affiliate_id IS NOT NULL OR c.salesperson_id IS NULL THEN RETURN jsonb_build_object('recorded',false,'eligible',false); END IF;
 SELECT id INTO v_id FROM public.salesperson_sales WHERE company_id=p_company_id LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('recorded',false,'already_recorded',true); END IF;
 IF p.subscription_change_request_id IS NOT NULL THEN
  SELECT * INTO q FROM public.subscription_change_requests WHERE id=p.subscription_change_request_id AND company_id=p_company_id;
  IF NOT FOUND OR NOT q.initial_activation OR q.status<>'applied' OR q.asaas_payment_id<>p.asaas_payment_id THEN
   RAISE EXCEPTION 'first_sale_request_mismatch';
  END IF;
 END IF;
 v_base:=coalesce(nullif(CASE WHEN q.initial_activation THEN q.target_monthly_value ELSE c.subscription_value END,0),p.amount);
 v_yearly:=coalesce(p.billing_cycle,c.billing_cycle)='yearly';
 v_total:=round(v_base*CASE WHEN v_yearly THEN 0.20 ELSE 1.00 END,2);
 v_closer:=CASE WHEN c.sdr_id IS NOT NULL THEN round(v_total*0.8,2) ELSE v_total END;
 v_sdr:=v_total-v_closer;
 INSERT INTO public.salesperson_sales(salesperson_id,sdr_id,company_id,customer_name,customer_origin,
 amount,paid_amount,commission_amount,closer_commission,sdr_commission,billing_cycle,status,notes)
 VALUES(c.salesperson_id,c.sdr_id,c.id,c.name,c.origin,v_base,
 coalesce(CASE WHEN q.initial_activation THEN q.target_monthly_value ELSE c.subscription_value END,p.amount),v_total,v_closer,v_sdr,
 CASE WHEN v_yearly THEN 'annual' ELSE 'monthly' END,
 CASE WHEN NOT coalesce(c.is_self_service,false) OR c.lead_worked_at IS NOT NULL THEN 'confirmed' ELSE 'pending_work' END,
 'Pagamento Asaas - '||p_asaas_payment_id) RETURNING id INTO v_id;
 RETURN jsonb_build_object('recorded',true,'id',v_id);
END $$;
REVOKE ALL ON FUNCTION public.record_subscription_first_sale_attribution(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_first_sale_attribution(uuid,text) TO service_role;
COMMIT;

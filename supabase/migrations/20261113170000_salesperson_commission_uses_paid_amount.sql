-- =============================================================================
-- Comissão de vendedor: base canônica = valor efetivamente pago
-- =============================================================================
-- O preço recorrente da assinatura pode ser diferente do primeiro pagamento
-- (desconto comercial, promoção ou cobrança parcial). subscription_value é o
-- valor contratado para recorrência; p_amount é o dinheiro que entrou.
--
-- Esta migration:
--   1. preserva integralmente a versão vigente de register_manual_company_payment
--      (incluindo âncora de vencimento e a guarda "afiliado zera vendedor");
--   2. muda somente a base/paid_amount da comissão para p_amount;
--   3. corrige de forma estreita o caso reportado de Carlos & Arruda, somente
--      quando a venda ainda está em 297 e o ledger confirma pagamento de 150.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_manual_company_payment(
  p_company_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_type text,
  p_payment_method text,
  p_notes text DEFAULT NULL::text,
  p_cpf_cnpj text DEFAULT NULL::text,
  p_closer_id uuid DEFAULT NULL::uuid,
  p_sdr_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $regmanual$
DECLARE
  v_company            public.companies%ROWTYPE;
  v_payment_id         uuid;
  v_payment_type       text;
  v_billing_cycle      text;
  v_category           text;
  v_description        text;
  v_has_pending_plan   boolean;
  v_effective_plan     text;
  v_included           jsonb;
  v_target_modules     text[];
  v_is_yearly          boolean;
  v_total_rate         numeric;
  v_commission_base    numeric;
  v_total_commission   numeric;
  v_closer_commission  numeric;
  v_sdr_commission     numeric;
  v_affiliate_id       uuid;
BEGIN
  -- SECURITY DEFINER: autorização explícita antes de qualquer escrita.
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  ) THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;

  IF p_type NOT IN ('venda', 'renovacao') THEN
    RAISE EXCEPTION 'tipo_invalido';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'valor_invalido';
  END IF;

  SELECT *
    INTO v_company
    FROM public.companies
   WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_nao_encontrada';
  END IF;

  v_affiliate_id := v_company.affiliate_id;

  -- Protege contra duplo clique no registro manual.
  IF EXISTS (
    SELECT 1
      FROM public.company_payments cp
     WHERE cp.company_id = p_company_id
       AND cp.amount = p_amount
       AND cp.payment_date::date = p_payment_date
       AND cp.created_at >= now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'pagamento_duplicado';
  END IF;

  IF p_cpf_cnpj IS NOT NULL AND p_type = 'venda' THEN
    UPDATE public.companies
       SET cnpj = p_cpf_cnpj
     WHERE id = p_company_id;

    UPDATE public.company_settings
       SET document = p_cpf_cnpj
     WHERE company_id = p_company_id;
  END IF;

  v_payment_type := CASE
    WHEN p_type = 'venda' THEN 'primeira_venda'
    ELSE 'renewal'
  END;

  INSERT INTO public.company_payments (
    company_id,
    amount,
    type,
    payment_method,
    payment_date,
    notes,
    origin,
    created_by
  ) VALUES (
    p_company_id,
    p_amount,
    v_payment_type,
    p_payment_method,
    p_payment_date::timestamptz,
    p_notes,
    v_company.origin,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  v_billing_cycle      := COALESCE(v_company.pending_billing_cycle, v_company.billing_cycle, 'monthly');
  v_has_pending_plan   := v_company.pending_plan_code IS NOT NULL;
  v_effective_plan     := COALESCE(v_company.pending_plan_code, v_company.subscription_plan);

  UPDATE public.companies c
     SET ltv                        = COALESCE(c.ltv, 0) + p_amount,
         subscription_status        = 'active',
         subscription_expires_at    = public.compute_next_expiration(
           CASE
             WHEN p_type = 'venda'
              AND COALESCE(v_company.subscription_status, '') <> 'active'
             THEN p_payment_date::timestamptz
             ELSE GREATEST(COALESCE(c.subscription_expires_at, now()), now())
           END,
           v_billing_cycle
         ),
         subscription_value         = COALESCE(c.pending_subscription_value, c.subscription_value),
         subscription_plan          = COALESCE(c.pending_plan_code, c.subscription_plan),
         billing_cycle              = COALESCE(c.pending_billing_cycle, c.billing_cycle),
         max_users                  = COALESCE(c.pending_max_users, c.max_users),
         pending_subscription_value = NULL,
         pending_plan_code          = NULL,
         pending_billing_cycle      = NULL,
         pending_max_users          = NULL,
         pending_modules            = NULL
   WHERE c.id = p_company_id;

  -- Sincronização de módulos preservada como best-effort.
  BEGIN
    IF v_has_pending_plan THEN
      IF jsonb_typeof(v_company.pending_modules) = 'array' THEN
        SELECT COALESCE(array_agg(e.value #>> '{}'), '{}'::text[])
          INTO v_target_modules
          FROM jsonb_array_elements(v_company.pending_modules) e
         WHERE jsonb_typeof(e.value) = 'string';
      ELSE
        SELECT sp.included_modules
          INTO v_included
          FROM public.subscription_plans sp
         WHERE sp.code = v_company.pending_plan_code;

        IF jsonb_typeof(v_included) = 'array' THEN
          SELECT COALESCE(array_agg(e.value #>> '{}'), '{}'::text[])
            INTO v_target_modules
            FROM jsonb_array_elements(v_included) e
           WHERE jsonb_typeof(e.value) = 'string';
        ELSE
          v_target_modules := '{}'::text[];
        END IF;
      END IF;

      DELETE FROM public.company_modules cm
       WHERE cm.company_id = p_company_id
         AND cm.module_code <> ALL (v_target_modules);

      INSERT INTO public.company_modules (company_id, module_code, quantity, activated_at)
      SELECT p_company_id, t.code, 1, now()
        FROM unnest(v_target_modules) AS t(code)
       WHERE NOT EXISTS (
         SELECT 1
           FROM public.company_modules cm
          WHERE cm.company_id = p_company_id
            AND cm.module_code = t.code
       );
    ELSE
      SELECT sp.included_modules
        INTO v_included
        FROM public.subscription_plans sp
       WHERE sp.code = v_effective_plan;

      IF jsonb_typeof(v_included) = 'array' THEN
        INSERT INTO public.company_modules (company_id, module_code, quantity, activated_at)
        SELECT p_company_id, e.value #>> '{}', 1, now()
          FROM jsonb_array_elements(v_included) e
         WHERE jsonb_typeof(e.value) = 'string'
           AND NOT EXISTS (
             SELECT 1
               FROM public.company_modules cm
              WHERE cm.company_id = p_company_id
                AND cm.module_code = e.value #>> '{}'
           );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'register_manual_company_payment: sync de módulos falhou (não-fatal): %', SQLERRM;
  END;

  v_category := CASE
    WHEN p_type = 'venda' THEN 'sale'
    ELSE 'renewal'
  END;
  v_description := CASE
    WHEN p_type = 'venda' THEN 'Venda manual — ' || v_company.name
    ELSE 'Renovação manual — ' || v_company.name
  END;

  INSERT INTO public.admin_financial_transactions (
    type,
    category,
    amount,
    description,
    transaction_date,
    reference_type,
    reference_id,
    created_by
  ) VALUES (
    'income',
    v_category,
    p_amount,
    v_description,
    p_payment_date::timestamptz,
    'company_payment',
    v_payment_id,
    auth.uid()
  );

  -- Empresa indicada por afiliado já é remunerada pelo programa de afiliados.
  IF v_affiliate_id IS NOT NULL THEN
    RAISE NOTICE '[afiliado zera vendedor] empresa % tem affiliate_id=%, sem comissão de vendedor',
      p_company_id, v_affiliate_id;
  END IF;

  IF p_type = 'venda'
     AND p_closer_id IS NOT NULL
     AND v_affiliate_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.salesperson_sales ss
       WHERE ss.company_id = p_company_id
    ) THEN
      v_is_yearly        := lower(COALESCE(v_billing_cycle, '')) IN ('yearly', 'annual', 'anual', 'year');
      v_total_rate       := CASE WHEN v_is_yearly THEN 0.20 ELSE 1.00 END;
      -- Fonte canônica: dinheiro realmente recebido neste pagamento.
      v_commission_base  := p_amount;
      v_total_commission := round(v_commission_base * v_total_rate, 2);

      IF p_sdr_id IS NOT NULL THEN
        v_closer_commission := round(v_total_commission * 0.8, 2);
        v_sdr_commission    := round(v_total_commission - v_closer_commission, 2);
      ELSE
        v_closer_commission := v_total_commission;
        v_sdr_commission    := 0;
      END IF;

      INSERT INTO public.salesperson_sales (
        salesperson_id,
        sdr_id,
        company_id,
        customer_name,
        customer_origin,
        amount,
        paid_amount,
        commission_amount,
        closer_commission,
        sdr_commission,
        billing_cycle,
        created_by,
        status
      ) VALUES (
        p_closer_id,
        p_sdr_id,
        p_company_id,
        v_company.name,
        v_company.origin,
        v_commission_base,
        p_amount,
        v_total_commission,
        v_closer_commission,
        v_sdr_commission,
        CASE WHEN v_is_yearly THEN 'annual' ELSE 'monthly' END,
        auth.uid(),
        CASE
          WHEN NOT v_company.is_self_service OR v_company.lead_worked_at IS NOT NULL
          THEN 'confirmed'
          ELSE 'pending_work'
        END
      );
    END IF;
  END IF;

  RETURN v_payment_id;
END;
$regmanual$;

REVOKE ALL ON FUNCTION public.register_manual_company_payment(
  uuid, numeric, date, text, text, text, text, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.register_manual_company_payment(
  uuid, numeric, date, text, text, text, text, uuid, uuid
) TO authenticated, service_role;

-- Correção idempotente e deliberadamente estreita do caso reportado:
-- - identifica a empresa pelo nome visível do relato;
-- - exige que venda, valor pago e comissão ainda estejam em 297;
-- - exige um pagamento persistido de exatamente 150;
-- - escolhe o pagamento mais próximo da criação da venda;
-- - preserva a regra mensal/anual e a quebra 80/20 quando houver SDR.
WITH affected_sale AS (
  SELECT
    ss.id,
    cp.amount AS canonical_paid_amount,
    round(
      cp.amount * CASE WHEN ss.billing_cycle = 'annual' THEN 0.20 ELSE 1.00 END,
      2
    ) AS canonical_commission,
    ss.sdr_id
  FROM public.salesperson_sales ss
  JOIN public.companies c
    ON c.id = ss.company_id
  JOIN LATERAL (
    SELECT p.amount
    FROM public.company_payments p
    WHERE p.company_id = ss.company_id
      AND p.amount = 150.00
      AND p.type IN ('primeira_venda', 'first_sale')
    ORDER BY
      abs(extract(epoch FROM (p.payment_date - ss.created_at))) ASC,
      p.created_at ASC
    LIMIT 1
  ) cp ON true
  WHERE lower(trim(c.name)) = lower('Carlos & Arruda Refrigeração')
    AND ss.amount = 297.00
    AND ss.paid_amount = 297.00
    AND ss.commission_amount = 297.00
)
UPDATE public.salesperson_sales ss
SET amount = a.canonical_paid_amount,
    paid_amount = a.canonical_paid_amount,
    commission_amount = a.canonical_commission,
    closer_commission = CASE
      WHEN a.sdr_id IS NOT NULL THEN round(a.canonical_commission * 0.8, 2)
      ELSE a.canonical_commission
    END,
    sdr_commission = CASE
      WHEN a.sdr_id IS NOT NULL
      THEN round(a.canonical_commission - round(a.canonical_commission * 0.8, 2), 2)
      ELSE 0
    END
FROM affected_sale a
WHERE ss.id = a.id;

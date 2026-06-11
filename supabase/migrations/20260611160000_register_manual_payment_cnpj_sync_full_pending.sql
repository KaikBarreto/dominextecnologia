-- ============================================================
-- register_manual_company_payment v2 — fecha as 2 pendências da 20260611150000
-- Plano: docs/planos/2026-06-11-historico-pagamentos-empresa-admin.md
--
-- 1) Sync de CNPJ na venda: além de companies.cnpj, espelha em
--    company_settings.document (só se a linha existir; não cria linha).
--    Sem loop: o único trigger envolvido é trg_sync_company_settings_to_companies
--    (company_settings → companies, 20260608110000), que re-escreve
--    companies.cnpj com o MESMO valor via COALESCE(NULLIF(NEW.document,''),...)
--    — inócuo. Não existe trigger em companies que escreva de volta em
--    company_settings (verificado em pg_trigger no prod em 2026-06-11).
--
-- 2) Promoção COMPLETA de pending_* (espelha o downgrade agendado do
--    asaas-webhook, supabase/functions/asaas-webhook/index.ts ~l.355-410):
--    - promove pending_max_users → max_users (e limpa pending_max_users e
--      pending_modules). No webhook a promoção é gated por pending_plan_code;
--      aqui usamos COALESCE incondicional pra manter o estilo desta RPC
--      (que já promove value/plan/cycle assim) — equivalente na prática,
--      pois pending_max_users só é setado junto com pending_plan_code.
--    - sincroniza company_modules conforme o plano promovido:
--        COM pending_plan_code → sync EXATO (syncCompanyModulesExact):
--          alvo = pending_modules (jsonb array de strings) se for array,
--          senão included_modules do plano-alvo; remove o que sobra e
--          insere o que falta (quantity=1, activated_at=now()).
--        SEM pending → aditivo (activatePlanModules): só insere os
--          included_modules do plano atual que faltam; nunca remove
--          (preserva módulo extra comprado à la carte).
--    - igual ao webhook, o sync de módulos é best-effort (não-fatal):
--      embrulhado em sub-bloco com EXCEPTION → WARNING, pra falha de módulo
--      não derrubar o registro do pagamento já efetivado.
--
-- Assinatura e retorno INALTERADOS (sem regen de types).
-- Idempotente: CREATE OR REPLACE + GRANT/REVOKE re-executáveis.
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_manual_company_payment(
  p_company_id     uuid,
  p_amount         numeric,
  p_payment_date   date,
  p_type           text,
  p_payment_method text,
  p_notes          text DEFAULT NULL,
  p_cpf_cnpj       text DEFAULT NULL,
  p_closer_id      uuid DEFAULT NULL,
  p_sdr_id         uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company           public.companies%ROWTYPE;
  v_payment_id        uuid;
  v_payment_type      text;
  v_billing_cycle     text;
  v_subscription_value numeric;
  v_category          text;
  v_description       text;
  -- promoção de pending / sync de módulos (espelha asaas-webhook)
  v_has_pending_plan  boolean;
  v_effective_plan    text;
  v_included          jsonb;
  v_target_modules    text[];
  -- comissão (regra espelhada de supabase/functions/asaas-webhook/index.ts)
  v_is_yearly         boolean;
  v_total_rate        numeric;
  v_commission_base   numeric;
  v_total_commission  numeric;
  v_closer_commission numeric;
  v_sdr_commission    numeric;
BEGIN
  -- 1. Gate explícito (DEFINER bypassa RLS) — Forma A.
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  ) THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;

  -- Validações de entrada.
  IF p_type NOT IN ('venda', 'renovacao') THEN
    RAISE EXCEPTION 'tipo_invalido';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'valor_invalido';
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_nao_encontrada';
  END IF;

  -- 2. Guarda de duplicidade: mesmo company+valor+data criado nos últimos 60s
  --    (protege contra duplo clique no salvar).
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

  -- 3. CNPJ na venda (empresa em teste sem documento): companies.cnpj +
  --    espelho em company_settings.document (identidade dual — companies é a
  --    visão admin, company_settings é a visão tenant). O UPDATE em
  --    company_settings dispara trg_sync_company_settings_to_companies, que
  --    re-escreve companies.cnpj com o mesmo valor (inócuo, sem loop).
  --    Só atualiza se a linha de company_settings existir; não cria linha.
  IF p_cpf_cnpj IS NOT NULL AND p_type = 'venda' THEN
    UPDATE public.companies SET cnpj = p_cpf_cnpj WHERE id = p_company_id;
    UPDATE public.company_settings
    SET document = p_cpf_cnpj
    WHERE company_id = p_company_id;
  END IF;

  -- 4. company_payments. Mapeamento de type: venda → 'primeira_venda'
  --    (mesmo valor que o webhook Asaas grava e que detectIsFirstSale lê);
  --    renovacao → 'renewal' (compat com o que o AdminRenewalModal já grava).
  v_payment_type := CASE WHEN p_type = 'venda' THEN 'primeira_venda' ELSE 'renewal' END;

  INSERT INTO public.company_payments (
    company_id, amount, type, payment_method, payment_date, notes, origin, created_by
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

  -- 5. Ativação/LTV/vencimento. Promove pending_* ANTES de calcular a
  --    extensão (o ciclo promovido define +1 mês ou +12 meses).
  v_billing_cycle      := COALESCE(v_company.pending_billing_cycle, v_company.billing_cycle, 'monthly');
  v_subscription_value := COALESCE(v_company.pending_subscription_value, v_company.subscription_value);
  v_has_pending_plan   := v_company.pending_plan_code IS NOT NULL;
  v_effective_plan     := COALESCE(v_company.pending_plan_code, v_company.subscription_plan);

  UPDATE public.companies c
  SET ltv                        = COALESCE(c.ltv, 0) + p_amount,
      subscription_status        = 'active',
      -- compute_next_expiration soma 1 mês/1 ano BRT-aware (mesma helper do webhook).
      subscription_expires_at    = public.compute_next_expiration(
                                     GREATEST(COALESCE(c.subscription_expires_at, now()), now()),
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

  -- 5b. Sync de company_modules (espelha o webhook; best-effort como lá:
  --     falha aqui NÃO derruba o pagamento já registrado).
  BEGIN
    IF v_has_pending_plan THEN
      -- Conjunto-alvo: pending_modules explícito (jsonb array de strings),
      -- senão included_modules do plano-alvo; senão vazio.
      IF jsonb_typeof(v_company.pending_modules) = 'array' THEN
        SELECT COALESCE(array_agg(e.value #>> '{}'), '{}'::text[])
        INTO v_target_modules
        FROM jsonb_array_elements(v_company.pending_modules) e
        WHERE jsonb_typeof(e.value) = 'string';
      ELSE
        SELECT sp.included_modules INTO v_included
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

      -- Sync EXATO (downgrade efetiva de verdade): remove o que sobra...
      DELETE FROM public.company_modules cm
      WHERE cm.company_id = p_company_id
        AND cm.module_code <> ALL (v_target_modules);

      -- ...e insere o que falta.
      INSERT INTO public.company_modules (company_id, module_code, quantity, activated_at)
      SELECT p_company_id, t.code, 1, now()
      FROM unnest(v_target_modules) AS t(code)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.company_modules cm
        WHERE cm.company_id = p_company_id AND cm.module_code = t.code
      );
    ELSE
      -- Sem pending: aditivo — garante os included_modules do plano atual,
      -- NUNCA remove (preserva módulo extra comprado à la carte).
      SELECT sp.included_modules INTO v_included
      FROM public.subscription_plans sp
      WHERE sp.code = v_effective_plan;

      IF jsonb_typeof(v_included) = 'array' THEN
        INSERT INTO public.company_modules (company_id, module_code, quantity, activated_at)
        SELECT p_company_id, e.value #>> '{}', 1, now()
        FROM jsonb_array_elements(v_included) e
        WHERE jsonb_typeof(e.value) = 'string'
          AND NOT EXISTS (
            SELECT 1 FROM public.company_modules cm
            WHERE cm.company_id = p_company_id
              AND cm.module_code = e.value #>> '{}'
          );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'register_manual_company_payment: sync de módulos falhou (não-fatal): %', SQLERRM;
  END;

  -- 6. Receita no financeiro admin (espelho 1:1 do pagamento).
  v_category := CASE WHEN p_type = 'venda' THEN 'sale' ELSE 'renewal' END;
  v_description := CASE WHEN p_type = 'venda'
    THEN 'Venda manual — ' || v_company.name
    ELSE 'Renovação manual — ' || v_company.name
  END;

  INSERT INTO public.admin_financial_transactions (
    type, category, amount, description, transaction_date,
    reference_type, reference_id, created_by
  ) VALUES (
    'income', v_category, p_amount, v_description, p_payment_date::timestamptz,
    'company_payment', v_payment_id, auth.uid()
  );

  -- 7. Comissão — SÓ venda, SÓ com closer, SÓ se a empresa ainda não tem
  --    venda registrada (comissão é exclusiva da 1ª venda).
  --    Regra espelhada do asaas-webhook (que espelha calculateCommission de
  --    src/hooks/useSalespersonData.ts):
  --      mensal: total = base * 0.50 | anual: total = base * 0.20 (sem /12)
  --      COM SDR → split 50/50 do total (closer metade arredondada, SDR o resto)
  --      SEM SDR → 100% closer
  --      base = subscription_value efetivo (pós-promoção); fallback p_amount.
  IF p_type = 'venda' AND p_closer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.salesperson_sales ss WHERE ss.company_id = p_company_id
    ) THEN
      v_is_yearly        := lower(COALESCE(v_billing_cycle, '')) IN ('yearly', 'annual', 'anual', 'year');
      v_total_rate       := CASE WHEN v_is_yearly THEN 0.20 ELSE 0.50 END;
      v_commission_base  := COALESCE(NULLIF(v_subscription_value, 0), p_amount);
      v_total_commission := round(v_commission_base * v_total_rate, 2);

      IF p_sdr_id IS NOT NULL THEN
        -- 50/50 centavo-safe: closer leva metade arredondada, SDR o resto.
        v_closer_commission := round(v_total_commission / 2, 2);
        v_sdr_commission    := round(v_total_commission - v_closer_commission, 2);
      ELSE
        v_closer_commission := v_total_commission;
        v_sdr_commission    := 0;
      END IF;

      INSERT INTO public.salesperson_sales (
        salesperson_id, sdr_id, company_id, customer_name, customer_origin,
        amount, paid_amount, commission_amount,
        closer_commission, sdr_commission, billing_cycle, created_by
      ) VALUES (
        p_closer_id, p_sdr_id, p_company_id, v_company.name, v_company.origin,
        v_commission_base, COALESCE(v_subscription_value, p_amount), v_total_commission,
        v_closer_commission, v_sdr_commission,
        CASE WHEN v_is_yearly THEN 'annual' ELSE 'monthly' END,
        auth.uid()
      );
    END IF;
  END IF;

  -- 8. Id do pagamento criado.
  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_manual_company_payment(uuid, numeric, date, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_manual_company_payment(uuid, numeric, date, text, text, text, text, uuid, uuid) TO authenticated, service_role;

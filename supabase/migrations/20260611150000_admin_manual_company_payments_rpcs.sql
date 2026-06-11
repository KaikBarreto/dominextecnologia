-- ============================================================
-- Histórico de pagamentos da empresa (admin Auctus) — Frente 1 (banco)
-- Plano: docs/planos/2026-06-11-historico-pagamentos-empresa-admin.md
--
-- Por quê: o AdminRenewalModal hoje faz 3 writes client-side não-atômicos,
-- não credita LTV e não tem guarda de duplicidade. Centralizamos registro
-- e estorno de pagamento manual em duas RPCs SECURITY DEFINER atômicas:
--
--   1) register_manual_company_payment  — venda/renovação manual: guarda de
--      duplicidade 60s, CNPJ (venda), company_payments, LTV + ativação +
--      extensão de vencimento (promovendo pending_*), receita admin e
--      comissão closer/SDR (só 1ª venda), replicando a regra do webhook Asaas.
--   2) delete_company_payment_with_rollback — estorna LTV, retrai vencimento
--      (se era o pagamento mais recente), apaga a receita espelho e a linha.
--
-- Gate (Forma A, igual admin_leads): has_role super_admin OR
-- has_admin_permission 'admin_empresas' (screen key real da tela Empresas —
-- src/App.tsx rota /admin/empresas). O gate vive NO CORPO porque SECURITY
-- DEFINER bypassa RLS.
--
-- Policy de company_payments: SELECT já é is_admin_user (20260515160438),
-- que é SUPERSET da Forma A (super_admin OR qualquer admin_permission) e é
-- consumida também pelo AdminDashboard/AdminTopClientsLTV (admin_dashboard).
-- Mantida como está — estreitar pra Forma A cegaria o dashboard de admins
-- sem 'admin_empresas'. Escrita continua super_admin-only via tabela;
-- não-super escreve SÓ via estas RPCs.
--
-- Idempotente: CREATE OR REPLACE + GRANT/REVOKE re-executáveis.
-- ============================================================

-- ------------------------------------------------------------
-- 1) register_manual_company_payment
-- ------------------------------------------------------------
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

  -- 3. CNPJ na venda (empresa em teste sem documento). Só companies.cnpj —
  --    NÃO mexer em company_settings direto (decisão do plano).
  --    ⚠️ Pendência reportada ao Tech Lead: NÃO existe trigger
  --    companies→company_settings hoje (só o reverso, 20260608110000);
  --    company_settings.document não é sincronizado por este UPDATE.
  IF p_cpf_cnpj IS NOT NULL AND p_type = 'venda' THEN
    UPDATE public.companies SET cnpj = p_cpf_cnpj WHERE id = p_company_id;
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
      pending_subscription_value = NULL,
      pending_plan_code          = NULL,
      pending_billing_cycle      = NULL
  WHERE c.id = p_company_id;

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

-- ------------------------------------------------------------
-- 2) delete_company_payment_with_rollback
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_company_payment_with_rollback(
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payment       public.company_payments%ROWTYPE;
  v_billing_cycle text;
  v_is_latest     boolean;
BEGIN
  -- Gate explícito (DEFINER bypassa RLS) — Forma A.
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  ) THEN
    RAISE EXCEPTION 'acesso_negado';
  END IF;

  -- 1. Pagamento existe?
  SELECT * INTO v_payment FROM public.company_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pagamento_nao_encontrado';
  END IF;

  -- Cobrança espelhada do Asaas não é excluível por aqui (UI só oferece
  -- excluir em pagamento manual; o server reforça — RLS é segurança).
  IF v_payment.asaas_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'pagamento_asaas_nao_excluivel';
  END IF;

  -- 3 (calculado antes do UPDATE). É o pagamento MAIS RECENTE da empresa?
  v_is_latest := NOT EXISTS (
    SELECT 1
    FROM public.company_payments cp
    WHERE cp.company_id = v_payment.company_id
      AND cp.id <> p_payment_id
      AND (cp.payment_date > v_payment.payment_date
           OR (cp.payment_date = v_payment.payment_date AND cp.created_at > v_payment.created_at))
  );

  SELECT lower(COALESCE(billing_cycle, 'monthly')) INTO v_billing_cycle
  FROM public.companies WHERE id = v_payment.company_id;

  -- 2 + 3. Estorna LTV (nunca negativo) e, se era o mais recente, retrai o
  -- vencimento pelo ciclo (aproximação por ciclo, igual EcoSistema; BRT-aware
  -- pra espelhar compute_next_expiration).
  UPDATE public.companies c
  SET ltv = GREATEST(COALESCE(c.ltv, 0) - v_payment.amount, 0),
      subscription_expires_at = CASE
        WHEN v_is_latest AND c.subscription_expires_at IS NOT NULL THEN
          ((c.subscription_expires_at AT TIME ZONE 'America/Sao_Paulo')
            - CASE WHEN v_billing_cycle IN ('yearly', 'annual', 'anual', 'year')
                THEN interval '12 months' ELSE interval '1 month' END
          ) AT TIME ZONE 'America/Sao_Paulo'
        ELSE c.subscription_expires_at
      END
  WHERE c.id = v_payment.company_id;

  -- 4. Apaga a receita espelho.
  DELETE FROM public.admin_financial_transactions
  WHERE reference_type = 'company_payment'
    AND reference_id = p_payment_id;

  -- 5. Apaga o pagamento. (salesperson_sales NÃO é tocada — estorno de
  -- comissão é decisão manual.)
  DELETE FROM public.company_payments WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_company_payment_with_rollback(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_company_payment_with_rollback(uuid) TO authenticated, service_role;

-- =============================================================================
-- register_manual_company_payment: 1ª venda ancora na DATA DO PAGAMENTO
-- =============================================================================
-- PROBLEMA: o passo 5 calculava o novo vencimento sempre a partir do vencimento
-- vigente (GREATEST(subscription_expires_at, now())). Para p_type = 'renovacao'
-- isso está certo (pagar adiantado não perde dias). Para p_type = 'venda' numa
-- empresa ainda em teste, o vencimento vigente é o FIM DO TESTE GRÁTIS — logo o
-- mês pago era empilhado em cima do teste e o cliente ganhava ~1 mês de graça.
--
-- CASO PROVADO: Predial Service, criada 25/08/2026 (teste até 24/09), pagou R$447
-- em 25/08 → o sistema gravou vencimento 24/10. Com a correção sai 25/09 (mês
-- calendário a partir do pagamento). Dado corrigido à mão em 11/09/2026.
--
-- CORREÇÃO: espelhar a regra que o asaas-webhook JÁ aplica — primeira venda
-- ancora na data do pagamento; renovação ancora no vencimento vigente. Guarda
-- extra em subscription_status <> 'active' preserva o comportamento antigo no
-- caso de borda de 'venda' registrada numa empresa já ativa (ancorar na data do
-- pagamento aí ENCURTARIA o vencimento dela).
--
-- Assinatura inalterada — types.ts não precisa ser regenerado.
-- Corpo reproduzido a partir da definição VIVA em produção (pg_get_functiondef),
-- com alteração APENAS na expressão de subscription_expires_at do passo 5.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_manual_company_payment(p_company_id uuid, p_amount numeric, p_payment_date date, p_type text, p_payment_method text, p_notes text DEFAULT NULL::text, p_cpf_cnpj text DEFAULT NULL::text, p_closer_id uuid DEFAULT NULL::uuid, p_sdr_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
      --
      -- ÂNCORA (espelha supabase/functions/asaas-webhook/index.ts):
      --  - PRIMEIRA VENDA (p_type = 'venda' numa empresa que ainda NÃO está active):
      --    ancora na DATA DO PAGAMENTO. Antes ancorava em subscription_expires_at,
      --    que numa empresa em teste é o FIM DO TESTE GRÁTIS — o mês pago era
      --    empilhado em cima do teste e o cliente ganhava ~1 mês de graça
      --    (incidente Predial Service 25/08 → gravou 24/10 em vez de 24/09).
      --  - RENOVAÇÃO: ancora no subscription_expires_at vigente (assim pagar
      --    adiantado NÃO perde dias — o próximo ciclo continua do vencimento atual).
      --  - GUARDA subscription_status <> 'active': se alguém registrar 'venda' numa
      --    empresa JÁ ativa (com período pago corrente), ancorar na data do pagamento
      --    ENCURTARIA o vencimento dela — nesse caso de borda mantemos o comportamento
      --    antigo (empilhar sobre o vencimento vigente).
      --  v_company foi lido ANTES deste UPDATE, então subscription_status aqui é o
      --  status PRÉ-pagamento (testing / pending_payment / inactive na 1ª venda).
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
  --    RÉGUA NOVA (CEO 2026-07-16), espelhada do asaas-webhook:
  --      mensal: total = base * 1.00 | anual: total = base * 0.20 (sem /12)
  --      COM SDR → closer 80% / SDR 20% (closer arredondado, SDR o resto)
  --      SEM SDR → 100% closer
  --      base = subscription_value efetivo (pós-promoção); fallback p_amount.
  --    [LEAD SELF-SERVICE] status da comissão: 'pending_work' (segurada) só
  --      quando é lead self-service ainda não trabalhado; senão 'confirmed'.
  IF p_type = 'venda' AND p_closer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.salesperson_sales ss WHERE ss.company_id = p_company_id
    ) THEN
      v_is_yearly        := lower(COALESCE(v_billing_cycle, '')) IN ('yearly', 'annual', 'anual', 'year');
      v_total_rate       := CASE WHEN v_is_yearly THEN 0.20 ELSE 1.00 END;
      v_commission_base  := COALESCE(NULLIF(v_subscription_value, 0), p_amount);
      v_total_commission := round(v_commission_base * v_total_rate, 2);

      IF p_sdr_id IS NOT NULL THEN
        -- 80/20 centavo-safe: closer leva 80% arredondado, SDR o resto.
        v_closer_commission := round(v_total_commission * 0.8, 2);
        v_sdr_commission    := round(v_total_commission - v_closer_commission, 2);
      ELSE
        v_closer_commission := v_total_commission;
        v_sdr_commission    := 0;
      END IF;

      INSERT INTO public.salesperson_sales (
        salesperson_id, sdr_id, company_id, customer_name, customer_origin,
        amount, paid_amount, commission_amount,
        closer_commission, sdr_commission, billing_cycle, created_by, status
      ) VALUES (
        p_closer_id, p_sdr_id, p_company_id, v_company.name, v_company.origin,
        v_commission_base, COALESCE(v_subscription_value, p_amount), v_total_commission,
        v_closer_commission, v_sdr_commission,
        CASE WHEN v_is_yearly THEN 'annual' ELSE 'monthly' END,
        auth.uid(),
        -- segura a comissão só quando é lead self-service ainda não trabalhado
        CASE WHEN (NOT v_company.is_self_service OR v_company.lead_worked_at IS NOT NULL)
             THEN 'confirmed' ELSE 'pending_work' END
      );
    END IF;
  END IF;

  -- 8. Id do pagamento criado.
  RETURN v_payment_id;
END;
$function$;


REVOKE ALL ON FUNCTION public.register_manual_company_payment(uuid, numeric, date, text, text, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_manual_company_payment(uuid, numeric, date, text, text, text, text, uuid, uuid) TO authenticated, service_role;

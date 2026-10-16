-- =============================================================================
-- Notas Fiscais: nível inicial por R$ 150/mês
-- =============================================================================
-- A fonte comercial do módulo é subscription_modules.nfe. Já o seletor de
-- volume usa nfse_tiers e substitui o preço do módulo pelo preço do nível.
-- Os dois catálogos precisam mudar juntos para cadastro, teste, links de venda
-- e afiliado, /proposta e troca de plano exibirem/calcularem o mesmo valor.
--
-- Somente o nível 1 muda de R$ 100 para R$ 150. Os níveis 2, 3 e 4 continuam
-- custando R$ 200, R$ 300 e R$ 400, respectivamente.
--
-- RENOVAÇÕES EXISTENTES
-- Empresas no plano Personalizado materializam o módulo em company_modules e
-- guardam a mensalidade-base em companies.subscription_value. Para não deixar
-- a próxima renovação em R$ 100, somamos apenas a diferença real do catálogo e
-- somente em empresas no nível 1. Preços promocionais continuam respeitados:
-- custom_price não é alterado; o novo valor-base passa a valer quando a promoção
-- terminar. Downgrades Personalizados já agendados também recebem a diferença.
--
-- O bloco calcula a diferença ANTES de atualizar o catálogo. Assim a migration
-- é idempotente: se reaplicada com o preço já em R$ 150, o delta será zero.
-- =============================================================================

DO $$
DECLARE
  v_old_price numeric;
  v_delta numeric;
  v_current_count integer := 0;
  v_pending_count integer := 0;
BEGIN
  SELECT price
    INTO v_old_price
    FROM public.subscription_modules
   WHERE code = 'nfe'
   FOR UPDATE;

  IF NOT FOUND OR v_old_price IS NULL THEN
    RAISE EXCEPTION 'Módulo nfe ausente ou sem preço no catálogo.';
  END IF;

  IF v_old_price NOT IN (100, 150) THEN
    RAISE EXCEPTION
      'Preço inesperado do módulo nfe: R$ %. Esperado R$ 100 ou R$ 150.',
      v_old_price;
  END IF;

  v_delta := 150 - v_old_price;

  IF v_delta <> 0 THEN
    INSERT INTO public.subscription_history (
      company_id,
      changed_by,
      previous_plan,
      new_plan,
      previous_value,
      new_value,
      previous_status,
      new_status,
      reason
    )
    SELECT
      company.id,
      NULL,
      company.subscription_plan,
      company.subscription_plan,
      company.subscription_value,
      company.subscription_value + v_delta,
      company.subscription_status,
      company.subscription_status,
      'Reajuste do nível 1 de Notas Fiscais de R$ 100 para R$ 150'
    FROM public.companies AS company
    WHERE company.subscription_plan = 'personalizado'
      AND COALESCE(company.nfse_tier, 1) = 1
      AND company.subscription_value IS NOT NULL
      AND company.subscription_value > 0
      AND EXISTS (
        SELECT 1
          FROM public.company_modules AS module
         WHERE module.company_id = company.id
           AND module.module_code = 'nfe'
      );

    UPDATE public.companies AS company
       SET subscription_value = company.subscription_value + v_delta
     WHERE company.subscription_plan = 'personalizado'
       AND COALESCE(company.nfse_tier, 1) = 1
       AND company.subscription_value IS NOT NULL
       AND company.subscription_value > 0
       AND EXISTS (
         SELECT 1
           FROM public.company_modules AS module
          WHERE module.company_id = company.id
            AND module.module_code = 'nfe'
       );
    GET DIAGNOSTICS v_current_count = ROW_COUNT;

    UPDATE public.companies AS company
       SET pending_subscription_value = company.pending_subscription_value + v_delta
     WHERE company.pending_plan_code = 'personalizado'
       AND COALESCE(company.pending_nfse_tier, 1) = 1
       AND company.pending_subscription_value IS NOT NULL
       AND company.pending_subscription_value > 0
       AND jsonb_typeof(company.pending_modules) = 'array'
       AND company.pending_modules ? 'nfe';
    GET DIAGNOSTICS v_pending_count = ROW_COUNT;
  END IF;

  UPDATE public.subscription_modules
     SET price = 150
   WHERE code = 'nfe';

  UPDATE public.nfse_tiers
     SET price = 150,
         updated_at = now()
   WHERE tier = 1;

  IF NOT EXISTS (
    SELECT 1
      FROM public.subscription_modules
     WHERE code = 'nfe'
       AND price = 150
  ) THEN
    RAISE EXCEPTION 'Falha ao fixar o módulo nfe em R$ 150.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.nfse_tiers
     WHERE tier = 1
       AND price = 150
  ) THEN
    RAISE EXCEPTION 'Falha ao fixar o nível 1 de NFS-e em R$ 150.';
  END IF;

  RAISE NOTICE
    'Notas Fiscais R$ 150: % mensalidade(s) e % valor(es) pendente(s) reajustados.',
    v_current_count,
    v_pending_count;
END $$;

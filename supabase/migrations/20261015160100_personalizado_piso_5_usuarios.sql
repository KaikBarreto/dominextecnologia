-- =============================================================================
-- Plano Personalizado: piso de 5 usuários base (decisão do CEO, 2026-10-15)
-- =============================================================================
-- O plano 'personalizado' inclui 5 usuários na BASE. Qualquer empresa
-- personalizada com max_users < 5 está com menos acesso do que pagou.
--
-- Único plano que legitimamente fica abaixo de 5 é o 'excecao' (teto do próprio
-- plano = 3), por isso o piso é aplicado SÓ em 'personalizado'.
--
-- Backfill: em produção havia 1 empresa furando o piso
-- (67fd725c-86d1-4944-b8f0-964fe74ae8c2, "Sanbreeze ar climatizacao Ltda",
-- personalizado, R$250, max_users 3). Subir pra 5 só CONCEDE acesso — não muda
-- subscription_value, não mexe em cobrança.
--
-- Guarda no servidor: trigger BEFORE INSERT OR UPDATE que CLAMPA max_users
-- pra 5. Clampa em vez de RAISE EXCEPTION porque isto é regra de negócio
-- auto-corretiva: não pode derrubar checkout, create-company, conversão de
-- grandfathering nem apply_subscription_upgrade_request. Erro aqui viraria
-- incidente de receita; clamp vira silenciosamente o valor certo.
--
-- Idempotente: UPDATE com WHERE max_users < 5; CREATE OR REPLACE FUNCTION +
-- DROP TRIGGER IF EXISTS antes do CREATE TRIGGER.
--
-- Conferido antes de criar: nenhum outro trigger em public.companies mexe em
-- max_users (só updated_at, segment e seeds AFTER INSERT) — sem conflito.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Backfill dos personalizados abaixo do piso
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_afetadas INT;
BEGIN
  UPDATE public.companies
     SET max_users = 5
   WHERE subscription_plan = 'personalizado'
     AND COALESCE(max_users, 0) < 5;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RAISE NOTICE 'piso personalizado: % empresa(s) subida(s) para max_users = 5.', v_afetadas;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Guarda no servidor: clampa max_users do personalizado em 5
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clamp_personalizado_min_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Piso de 5 usuários base do plano Personalizado. CLAMPA (não levanta erro)
  -- porque é correção automática de regra de negócio: nenhum fluxo de
  -- assinatura pode quebrar por causa disso.
  IF NEW.subscription_plan = 'personalizado'
     AND COALESCE(NEW.max_users, 0) < 5 THEN
    NEW.max_users := 5;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.clamp_personalizado_min_users() IS
  'Garante o piso de 5 usuarios base no plano personalizado. Clampa max_users em vez de levantar excecao para nao derrubar checkout/criacao/upgrade de assinatura.';

DROP TRIGGER IF EXISTS trg_companies_clamp_personalizado_min_users ON public.companies;

CREATE TRIGGER trg_companies_clamp_personalizado_min_users
  BEFORE INSERT OR UPDATE OF subscription_plan, max_users ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.clamp_personalizado_min_users();

-- ---------------------------------------------------------------------------
-- 3) Auditoria do resultado
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_furando INT;
BEGIN
  SELECT count(*) INTO v_furando
    FROM public.companies
   WHERE subscription_plan = 'personalizado'
     AND COALESCE(max_users, 0) < 5;

  IF v_furando > 0 THEN
    RAISE WARNING 'piso personalizado: % empresa(s) ainda abaixo de 5 usuarios.', v_furando;
  ELSE
    RAISE NOTICE 'piso personalizado: nenhuma empresa abaixo de 5 usuarios.';
  END IF;
END $$;

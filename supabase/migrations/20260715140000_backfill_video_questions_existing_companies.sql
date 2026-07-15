-- =============================================================================
-- BACKFILL: liberar o módulo `video_questions` (teto 1) para as empresas reais
-- já existentes (grandfathered no plano `personalizado`).
-- =============================================================================
-- CONTEXTO (decisão do CEO 2026-07-15):
-- O recurso "pergunta de vídeo na OS" (módulo `video_questions`, criado na
-- migration 20260715120000) hoje só chega aos planos Pro (avancado, teto 1) e
-- Business (master, teto 3), porque foi incluído em `included_modules` desses
-- planos. As ~16 empresas reais estão no plano compartilhado `personalizado`,
-- cujos módulos são materializados linha-a-linha em `company_modules` (padrão do
-- grandfather, migration 2026-06-13). Como `personalizado.included_modules = []`
-- e `personalizado.max_video_questions = 0`, elas NÃO têm o recurso.
--
-- Objetivo: TODAS as empresas `personalizado` ganham `video_questions` com
-- teto = 1 pergunta de vídeo por modelo de checklist. NÃO reduzir Pro (1) nem
-- Business (3). NÃO tocar Essencial (start).
--
-- COMO O GATE RESOLVE (confirmado no hook useCompanyModules.ts):
--   hasModule('video_questions') = super_admin OR trial OR
--     linha em company_modules OR subscription_plans.included_modules do plano ativo.
--   maxVideoQuestions = super_admin->3, trial->3, senão
--     subscription_plans.max_video_questions do PLANO ATIVO (NÃO usa company_modules.quantity).
-- Portanto, pra uma empresa `personalizado` ter o recurso com teto 1 precisamos das
-- DUAS coisas:
--   (a) grant do módulo em company_modules  -> hasModule = true
--   (b) personalizado.max_video_questions = 1 -> maxVideoQuestions = 1
--
-- MECANISMO ESCOLHIDO (menos arriscado, reversível por empresa, idempotente):
--   (a) INSERT em company_modules (mesmo padrão dos outros módulos dessas empresas:
--       module_code + quantity=1), com ON CONFLICT DO NOTHING. NÃO mexemos em
--       included_modules do `personalizado` (evita conceder acesso amplo a linha
--       compartilhada de forma não-rastreável por empresa).
--   (b) UPDATE em subscription_plans do `personalizado` (linha compartilhada por
--       todas as empresas grandfather), com guarda `< 1` pra nunca reduzir.
--
-- Multi-tenant: cada empresa recebe SÓ a sua linha em company_modules (escopo
-- restrito ao plano `personalizado`). Sem acesso cruzado.
-- Idempotente: ON CONFLICT DO NOTHING no INSERT; UPDATE literal com guarda.
-- Backfill de dados puro (não altera schema) => NÃO precisa regenerar types.ts.
-- =============================================================================

DO $$
DECLARE
  v_granted    integer;
  v_plan_fixed integer;
BEGIN
  -- -------------------------------------------------------------------------
  -- (a) Grant do módulo `video_questions` para toda empresa no plano
  --     `personalizado`. Materializa linha-a-linha como os demais módulos delas.
  -- -------------------------------------------------------------------------
  INSERT INTO public.company_modules (company_id, module_code, quantity)
  SELECT c.id, 'video_questions', 1
  FROM public.companies c
  WHERE c.subscription_plan = 'personalizado'
  ON CONFLICT (company_id, module_code) DO NOTHING;

  GET DIAGNOSTICS v_granted = ROW_COUNT;

  -- -------------------------------------------------------------------------
  -- (b) Teto = 1 no plano compartilhado `personalizado`. Guarda `< 1` garante
  --     idempotência e nunca reduz caso o valor suba no futuro.
  --     NÃO toca start / avancado / master.
  -- -------------------------------------------------------------------------
  UPDATE public.subscription_plans
     SET max_video_questions = 1
   WHERE code = 'personalizado'
     AND max_video_questions < 1;

  GET DIAGNOSTICS v_plan_fixed = ROW_COUNT;

  RAISE NOTICE 'backfill video_questions: % empresas ganharam o modulo (novas linhas em company_modules); personalizado.max_video_questions ajustado em % linha(s).',
    v_granted, v_plan_fixed;
END $$;

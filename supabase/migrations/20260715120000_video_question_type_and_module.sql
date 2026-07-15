-- =============================================================================
-- Novo tipo de pergunta de checklist de OS: `video`
-- =============================================================================
-- CONTEXTO: adiciona o tipo de pergunta "vídeo" (clipe curto 10-15s / 720p) como
-- resposta de checklist, espelhando o padrão da FOTO existente. O vídeo vai pro
-- storage; o banco guarda só a URL. Cada pergunta de vídeo aceita EXATAMENTE 1
-- clipe (1 URL única), diferente da foto que guarda CSV de URLs.
--
-- DECISÃO TRAVADA sobre o limite: NÃO é cota de runtime. É "quantas perguntas de
-- vídeo um MODELO de checklist pode ter", por PLANO:
--   Essencial (start)   = 0  (não tem o módulo)
--   Pro       (avancado)= 1
--   Business  (master)  = 3
-- Por isso o limite mora numa coluna inteira em subscription_plans, não numa
-- tabela de tiers de runtime.
--
-- question_type É TEXT LIVRE (não enum, não CHECK enumerando valores): confirmado
-- em prod — a única CHECK que cita question_type é `pmoc_measurement_requires_unit`
-- (só afeta 'pmoc_measurement'). Logo o valor 'video' cabe SEM alteração de schema.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO UPDATE, UPDATE literais.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Coluna de resposta em form_responses (1 URL única, nullable).
--    Herda a RLS multi-tenant existente da tabela — NÃO cria policy nova.
-- -----------------------------------------------------------------------------
ALTER TABLE public.form_responses
  ADD COLUMN IF NOT EXISTS response_video_url text;

COMMENT ON COLUMN public.form_responses.response_video_url IS
  'URL única (storage) do clipe de vídeo respondido numa pergunta de checklist do tipo question_type = ''video''. 1 vídeo por pergunta (não é CSV como response_photo_url).';

-- -----------------------------------------------------------------------------
-- 2) Tipo de pergunta 'video': nada a fazer no schema.
--    question_type é TEXT livre; 'video' já é um valor válido. (Sem ALTER TYPE /
--    sem nova CHECK — a app decide os tipos aceitos.)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 3) Catálogo do módulo `video_questions` em subscription_modules.
--    Segue o padrão dos módulos existentes (code UNIQUE, type module/addon).
--    É um módulo pago; type 'addon' para poder ser vendido avulso via
--    company_modules além de vir incluso nos planos Pro/Business.
-- -----------------------------------------------------------------------------
INSERT INTO public.subscription_modules (code, name, description, price, type, sort_order, is_active)
VALUES (
  'video_questions',
  'Perguntas em Vídeo',
  'Permite adicionar perguntas do tipo vídeo nos modelos de checklist da OS: o técnico grava um clipe curto (10-15s) como resposta. Limite de perguntas de vídeo por modelo conforme o plano.',
  50,
  'addon',
  11,
  true
)
ON CONFLICT (code) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      price       = EXCLUDED.price,
      is_active   = true;

-- company_has_module NÃO precisa de alteração: a função é genérica por code
-- (trial libera tudo; senão company_modules OR subscription_plans.included_modules).
-- Basta o code existir no catálogo e nos included_modules dos planos (passo 5).

-- -----------------------------------------------------------------------------
-- 4) Limite por plano: coluna inteira em subscription_plans (default 0).
-- -----------------------------------------------------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_video_questions integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscription_plans.max_video_questions IS
  'Quantidade MÁXIMA de perguntas do tipo vídeo que um MODELO de checklist pode ter neste plano. Essencial=0, Pro=1, Business=3. Não é cota de runtime.';

-- Mapeamento (confirmado em prod):
--   start    = "Essencial" -> 0 (default, sem módulo)
--   avancado = "Pro"       -> 1
--   master   = "Business"  -> 3
UPDATE public.subscription_plans SET max_video_questions = 1 WHERE code = 'avancado';
UPDATE public.subscription_plans SET max_video_questions = 3 WHERE code = 'master';
UPDATE public.subscription_plans SET max_video_questions = 0 WHERE code IN ('start', 'personalizado');

-- -----------------------------------------------------------------------------
-- 5) Incluir 'video_questions' em included_modules dos planos Pro e Business.
--    Usa jsonb append idempotente: só adiciona se ainda não estiver presente,
--    preservando a ordem/itens existentes.
-- -----------------------------------------------------------------------------
UPDATE public.subscription_plans
   SET included_modules = included_modules || '["video_questions"]'::jsonb
 WHERE code IN ('avancado', 'master')
   AND NOT (included_modules ? 'video_questions');

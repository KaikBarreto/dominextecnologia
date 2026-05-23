-- =============================================================================
-- PMOC v1.9.x — Onda D: Checklist Sanitário + Drop dos Legados
-- =============================================================================
--
-- Esta migration encerra o ciclo PMOC v1.9.x:
--
-- 1. Estende form_questions com metadados de medida PMOC
--    (unit, expected_min, expected_max, auto_classify)
-- 2. Adiciona campo de classificação de conformidade em service_orders
--    (pmoc_conformity_status, pmoc_conformity_notes) + trigger validador
-- 3. Adiciona flag is_pmoc_default em form_templates
-- 4. Semeia 3 templates PMOC padrão (Split / Central Água Gelada / Fancoil)
--    por tenant existente (form_templates.company_id é NOT NULL).
-- 5. AUDIT pré-drop das tabelas legadas (pmoc_plans/pmoc_items/pmoc_generated_os)
-- 6. DROP definitivo dos legados (read-only desde v1.9.0).
--
-- form_questions.question_type é TEXT (não enum) — então NÃO há ALTER TYPE.
-- O valor 'pmoc_measurement' é livre; validação acontece no client/shim de tipos.
--
-- Idempotente: pode rodar 2x sem quebrar (ADD COLUMN IF NOT EXISTS,
-- DROP TRIGGER IF EXISTS, DROP TABLE IF EXISTS).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Novas colunas em form_questions (metadados de medida PMOC)
-- -----------------------------------------------------------------------------

ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS expected_min numeric,
  ADD COLUMN IF NOT EXISTS expected_max numeric,
  ADD COLUMN IF NOT EXISTS auto_classify boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.form_questions.unit IS
  'Unidade da medida (PMOC): "°C", "V", "A", "psi", "m³/min". Usado quando question_type = pmoc_measurement.';
COMMENT ON COLUMN public.form_questions.expected_min IS
  'Faixa esperada mínima (PMOC). NULL = sem mínimo.';
COMMENT ON COLUMN public.form_questions.expected_max IS
  'Faixa esperada máxima (PMOC). NULL = sem máximo.';
COMMENT ON COLUMN public.form_questions.auto_classify IS
  'Se TRUE, valor fora da faixa contribui automaticamente pra classificação de conformidade.';

-- -----------------------------------------------------------------------------
-- 2. Colunas de conformidade em service_orders
-- -----------------------------------------------------------------------------

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS pmoc_conformity_status text,
  ADD COLUMN IF NOT EXISTS pmoc_conformity_notes text;

-- CHECK separado pra ser idempotente (não dá pra usar IF NOT EXISTS em CHECK)
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_orders_pmoc_conformity_status_check'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_pmoc_conformity_status_check
      CHECK (pmoc_conformity_status IS NULL OR pmoc_conformity_status IN ('conforme', 'nao_conforme', 'parcial'));
  END IF;
END $constraint$;

COMMENT ON COLUMN public.service_orders.pmoc_conformity_status IS
  'Classificação PMOC da OS: conforme / nao_conforme / parcial. Só preenchível em OS de contrato PMOC.';
COMMENT ON COLUMN public.service_orders.pmoc_conformity_notes IS
  'Observação do técnico sobre a classificação PMOC (não-conformidade, restrições).';

-- -----------------------------------------------------------------------------
-- 3. Trigger: pmoc_conformity_status só preenchível em OS de contrato PMOC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_pmoc_conformity_only_for_pmoc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_pmoc boolean;
BEGIN
  -- NULL é sempre permitido (status opcional)
  IF NEW.pmoc_conformity_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só faz sentido se a OS está vinculada a um contrato
  IF NEW.contract_id IS NULL THEN
    RAISE EXCEPTION 'pmoc_conformity_status só pode ser preenchido em OS de contrato PMOC (contract_id é NULL)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- E esse contrato precisa ser is_pmoc=true
  SELECT is_pmoc INTO v_is_pmoc
    FROM public.contracts
    WHERE id = NEW.contract_id;

  IF v_is_pmoc IS NOT TRUE THEN
    RAISE EXCEPTION 'pmoc_conformity_status só pode ser preenchido em OS de contrato PMOC (contrato % não é PMOC)', NEW.contract_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pmoc_conformity ON public.service_orders;
CREATE TRIGGER trg_enforce_pmoc_conformity
  BEFORE INSERT OR UPDATE OF pmoc_conformity_status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pmoc_conformity_only_for_pmoc();

-- -----------------------------------------------------------------------------
-- 4. Coluna is_pmoc_default em form_templates
-- -----------------------------------------------------------------------------

ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS is_pmoc_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.form_templates.is_pmoc_default IS
  'Marca template como PMOC default semeado (Split / Central Água Gelada / Fancoil). Tenant pode duplicar pra editar.';

CREATE INDEX IF NOT EXISTS idx_form_templates_is_pmoc_default
  ON public.form_templates (company_id, is_pmoc_default)
  WHERE is_pmoc_default = true;

-- -----------------------------------------------------------------------------
-- 5. Seed dos 3 templates PMOC padrão POR TENANT
-- -----------------------------------------------------------------------------
-- form_templates.company_id é NOT NULL (vide migration 20260418155127).
-- Em vez de "global com company_id=null", semeamos uma cópia por tenant existente.
-- Idempotente: só insere se ainda não existe template default desse tipo pra esse tenant.
-- -----------------------------------------------------------------------------

DO $seed$
DECLARE
  v_company RECORD;
  v_template_id uuid;
  v_seeded_companies int := 0;
  v_skipped_companies int := 0;
BEGIN
  FOR v_company IN
    SELECT id, name FROM public.companies
  LOOP
    -- =========================================================================
    -- Template 1: Split (residencial/comercial)
    -- =========================================================================
    IF NOT EXISTS (
      SELECT 1 FROM public.form_templates
      WHERE company_id = v_company.id
        AND is_pmoc_default = true
        AND name = 'PMOC — Split (residencial/comercial)'
    ) THEN
      INSERT INTO public.form_templates
        (id, name, description, company_id, is_pmoc_default, is_active, created_at, updated_at)
      VALUES
        (gen_random_uuid(),
         'PMOC — Split (residencial/comercial)',
         'Checklist padrão de manutenção preventiva PMOC para ar-condicionados tipo Split. Conforme Lei 13.589/2018.',
         v_company.id, true, true, now(), now())
      RETURNING id INTO v_template_id;

      INSERT INTO public.form_questions
        (template_id, question, question_type, position, is_required, unit, expected_min, expected_max, auto_classify, description)
      VALUES
        (v_template_id, 'Temperatura de insuflamento', 'pmoc_measurement', 0, true, '°C', 8, 14, true,
         'Medir no soprador. Esperado entre 8°C e 14°C com sistema operando em regime.'),
        (v_template_id, 'Temperatura de retorno', 'pmoc_measurement', 1, true, '°C', 22, 27, true,
         'Medir no retorno (entrada da evaporadora). Diferencial esperado de 10-14°C vs insuflamento.'),
        (v_template_id, 'Tensão de alimentação', 'pmoc_measurement', 2, true, 'V', 200, 240, true,
         'Medir entre fases. Verificar conforme placa do equipamento (127V ou 220V).'),
        (v_template_id, 'Corrente do compressor', 'pmoc_measurement', 3, true, 'A', null, null, false,
         'Comparar com corrente nominal da placa. Acima de 110% nominal indica sobrecarga.'),
        (v_template_id, 'Pressão de gás refrigerante (alta)', 'pmoc_measurement', 4, true, 'psi', null, null, false,
         'Pressão de descarga. Depende do tipo de gás (R22/R410A) e temperatura ambiente.'),
        (v_template_id, 'Pressão de gás refrigerante (baixa)', 'pmoc_measurement', 5, true, 'psi', null, null, false,
         'Pressão de sucção. Depende do tipo de gás (R22/R410A) e temperatura ambiente.'),
        (v_template_id, 'Estado dos filtros', 'select', 6, true, null, null, null, false,
         'Avaliar visualmente: limpo / sujo (limpar) / saturado (substituir).'),
        (v_template_id, 'Drenagem (escoamento)', 'boolean', 7, true, null, null, null, false,
         'Verificar se o dreno escoa livremente sem retorno.'),
        (v_template_id, 'Limpeza da serpentina evaporadora', 'boolean', 8, true, null, null, null, false,
         'Serpentina limpa, sem incrustação ou obstrução.'),
        (v_template_id, 'Foto do equipamento após manutenção', 'photo', 9, false, null, null, null, false,
         'Registro fotográfico do equipamento limpo e operando.');

      -- Atualizar options da pergunta select de filtros
      UPDATE public.form_questions
        SET options = '["Limpo", "Sujo (limpo durante a manutenção)", "Saturado (substituído)", "Substituição programada"]'::jsonb
        WHERE template_id = v_template_id
          AND question_type = 'select'
          AND position = 6;
    END IF;

    -- =========================================================================
    -- Template 2: Central de Água Gelada
    -- =========================================================================
    IF NOT EXISTS (
      SELECT 1 FROM public.form_templates
      WHERE company_id = v_company.id
        AND is_pmoc_default = true
        AND name = 'PMOC — Central de Água Gelada'
    ) THEN
      INSERT INTO public.form_templates
        (id, name, description, company_id, is_pmoc_default, is_active, created_at, updated_at)
      VALUES
        (gen_random_uuid(),
         'PMOC — Central de Água Gelada',
         'Checklist padrão de manutenção preventiva PMOC para centrais de água gelada (chillers e sistemas hidrônicos). Conforme Lei 13.589/2018.',
         v_company.id, true, true, now(), now())
      RETURNING id INTO v_template_id;

      INSERT INTO public.form_questions
        (template_id, question, question_type, position, is_required, unit, expected_min, expected_max, auto_classify, description)
      VALUES
        (v_template_id, 'Temperatura de entrada da água gelada', 'pmoc_measurement', 0, true, '°C', 10, 14, true,
         'Medir na entrada do chiller. Esperado entre 10°C e 14°C.'),
        (v_template_id, 'Temperatura de saída da água gelada', 'pmoc_measurement', 1, true, '°C', 5, 8, true,
         'Medir na saída do chiller. Esperado entre 5°C e 8°C.'),
        (v_template_id, 'Pressão do circuito hidráulico', 'pmoc_measurement', 2, true, 'psi', null, null, false,
         'Pressão de trabalho do circuito de água gelada.'),
        (v_template_id, 'Vazão de água gelada', 'pmoc_measurement', 3, true, 'm³/h', null, null, false,
         'Vazão nominal conforme projeto.'),
        (v_template_id, 'Tensão de alimentação', 'pmoc_measurement', 4, true, 'V', 360, 440, true,
         'Tensão entre fases. Esperado 380V trifásico ± 10%.'),
        (v_template_id, 'Corrente do compressor', 'pmoc_measurement', 5, true, 'A', null, null, false,
         'Comparar com corrente nominal da placa.'),
        (v_template_id, 'Qualidade da água (visual)', 'select', 6, true, null, null, null, false,
         'Avaliação visual da água do circuito.'),
        (v_template_id, 'Tratamento anti-incrustante aplicado', 'boolean', 7, true, null, null, null, false,
         'Dosagem de produto químico anti-incrustante conforme cronograma.'),
        (v_template_id, 'Limpeza/inspeção das torres de resfriamento', 'boolean', 8, true, null, null, null, false,
         'Aplicável a sistemas com torre (water-cooled). Inspeção visual de fouling.'),
        (v_template_id, 'Foto do equipamento após manutenção', 'photo', 9, false, null, null, null, false,
         'Registro fotográfico.');
    END IF;

    -- =========================================================================
    -- Template 3: Fancoil
    -- =========================================================================
    IF NOT EXISTS (
      SELECT 1 FROM public.form_templates
      WHERE company_id = v_company.id
        AND is_pmoc_default = true
        AND name = 'PMOC — Fancoil'
    ) THEN
      INSERT INTO public.form_templates
        (id, name, description, company_id, is_pmoc_default, is_active, created_at, updated_at)
      VALUES
        (gen_random_uuid(),
         'PMOC — Fancoil',
         'Checklist padrão de manutenção preventiva PMOC para unidades fancoil. Conforme Lei 13.589/2018.',
         v_company.id, true, true, now(), now())
      RETURNING id INTO v_template_id;

      INSERT INTO public.form_questions
        (template_id, question, question_type, position, is_required, unit, expected_min, expected_max, auto_classify, description)
      VALUES
        (v_template_id, 'Temperatura de insuflamento', 'pmoc_measurement', 0, true, '°C', 12, 18, true,
         'Medir na grelha de insuflamento do fancoil.'),
        (v_template_id, 'Temperatura de retorno', 'pmoc_measurement', 1, true, '°C', 22, 27, true,
         'Medir na grelha de retorno.'),
        (v_template_id, 'Vazão de ar', 'pmoc_measurement', 2, true, 'm³/min', null, null, false,
         'Vazão conforme projeto. Medir com anemômetro.'),
        (v_template_id, 'Nível de ruído operacional', 'pmoc_measurement', 3, false, 'dB', null, 65, true,
         'Medir a 1m do equipamento. Acima de 65dB em ambiente comercial indica problema.'),
        (v_template_id, 'Estado dos filtros', 'select', 4, true, null, null, null, false,
         'Avaliar visualmente.'),
        (v_template_id, 'Drenagem (escoamento)', 'boolean', 5, true, null, null, null, false,
         'Dreno desobstruído.'),
        (v_template_id, 'Limpeza da serpentina', 'boolean', 6, true, null, null, null, false,
         'Serpentina limpa, sem incrustação.'),
        (v_template_id, 'Inspeção do motor/ventilador', 'boolean', 7, true, null, null, null, false,
         'Rolamentos, fixação, vibração.'),
        (v_template_id, 'Foto do equipamento após manutenção', 'photo', 8, false, null, null, null, false,
         'Registro fotográfico.');
    END IF;

    v_seeded_companies := v_seeded_companies + 1;
  END LOOP;

  RAISE NOTICE 'SEED PMOC DEFAULTS: % empresas processadas (templates inseridos sob demanda; idempotente).', v_seeded_companies;
END $seed$;

-- -----------------------------------------------------------------------------
-- 6. Audit pré-drop
-- -----------------------------------------------------------------------------

DO $audit$
DECLARE
  v_plans int;
  v_items int;
  v_gen_os int;
  v_pmoc_contracts int;
  v_so_contracts int;
  v_pmoc_legacy_exists boolean;
BEGIN
  -- Detecta se tabelas legadas ainda existem (defensivo: se já foi dropado em outro env, segue em frente)
  SELECT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pmoc_plans'
  ) INTO v_pmoc_legacy_exists;

  IF v_pmoc_legacy_exists THEN
    EXECUTE 'SELECT count(*) FROM public.pmoc_plans' INTO v_plans;
    EXECUTE 'SELECT count(*) FROM public.pmoc_items' INTO v_items;
    EXECUTE 'SELECT count(*) FROM public.pmoc_generated_os' INTO v_gen_os;
  ELSE
    v_plans := 0;
    v_items := 0;
    v_gen_os := 0;
  END IF;

  SELECT count(*) INTO v_pmoc_contracts FROM public.contracts WHERE is_pmoc = true;
  SELECT count(*) INTO v_so_contracts FROM public.service_orders WHERE contract_id IS NOT NULL;

  RAISE NOTICE '======================================';
  RAISE NOTICE 'AUDIT PRE-DROP (PMOC v1.9.x Onda D):';
  RAISE NOTICE '  pmoc_plans (legado): %', v_plans;
  RAISE NOTICE '  pmoc_items (legado): %', v_items;
  RAISE NOTICE '  pmoc_generated_os (legado): %', v_gen_os;
  RAISE NOTICE '  contracts is_pmoc=true (ativo): %', v_pmoc_contracts;
  RAISE NOTICE '  service_orders com contract_id (ativo): %', v_so_contracts;
  RAISE NOTICE '======================================';

  -- Defesa: se temos legado MAS nenhum dado migrado (contracts is_pmoc=true == 0 com pmoc_plans > 0),
  -- a migração Onda A não rodou. Abortar.
  IF v_plans > 0 AND v_pmoc_contracts = 0 THEN
    RAISE EXCEPTION 'INCONSISTÊNCIA: % pmoc_plans legados encontrados mas 0 contracts is_pmoc=true. Migração Onda A não rodou — abortando drop.', v_plans;
  END IF;

  -- Defesa: se temos pmoc_generated_os mas 0 service_orders com contract_id, OS não foram backfilled.
  IF v_gen_os > 0 AND v_so_contracts = 0 THEN
    RAISE EXCEPTION 'INCONSISTÊNCIA: % pmoc_generated_os legados encontrados mas 0 service_orders com contract_id. Backfill Onda A incompleto — abortando drop.', v_gen_os;
  END IF;
END $audit$;

-- -----------------------------------------------------------------------------
-- 7. Drop dos legados (read-only desde v1.9.0 — Onda A)
-- -----------------------------------------------------------------------------

DROP TABLE IF EXISTS public.pmoc_generated_os CASCADE;
DROP TABLE IF EXISTS public.pmoc_items CASCADE;
DROP TABLE IF EXISTS public.pmoc_plans CASCADE;

-- -----------------------------------------------------------------------------
-- 8. Audit pós-drop
-- -----------------------------------------------------------------------------

DO $audit_post$
DECLARE
  v_plans_exists boolean;
  v_items_exists boolean;
  v_gen_os_exists boolean;
  v_seeded_templates int;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pmoc_plans') INTO v_plans_exists;
  SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pmoc_items') INTO v_items_exists;
  SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='pmoc_generated_os') INTO v_gen_os_exists;

  SELECT count(*) INTO v_seeded_templates FROM public.form_templates WHERE is_pmoc_default = true;

  RAISE NOTICE '======================================';
  RAISE NOTICE 'POST-DROP AUDIT:';
  RAISE NOTICE '  pmoc_plans still exists?       %', v_plans_exists;
  RAISE NOTICE '  pmoc_items still exists?       %', v_items_exists;
  RAISE NOTICE '  pmoc_generated_os still exists? %', v_gen_os_exists;
  RAISE NOTICE '  form_templates is_pmoc_default total: %', v_seeded_templates;
  RAISE NOTICE '======================================';

  IF v_plans_exists OR v_items_exists OR v_gen_os_exists THEN
    RAISE EXCEPTION 'DROP falhou — tabelas legadas ainda existem.';
  END IF;
END $audit_post$;

COMMIT;

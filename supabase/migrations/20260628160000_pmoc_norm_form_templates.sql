-- =============================================================================
-- PMOC P1 — Materializar o catálogo PMOC em form_templates "de norma" (por tenant)
-- Plano: refactor que unifica o PMOC no motor do "contrato comum". Fase de DADOS.
--
-- O QUE FAZ (e por quê):
--   O catálogo `pmoc_activity_catalog` é GLOBAL (super_admin) e descreve a norma
--   (Lei 13.589/2018). Hoje o plano PMOC consome o catálogo direto (por máquina,
--   via contract_plan_activities). O refactor passa a tratar PMOC como um
--   "checklist comum" (form_templates + form_questions, POR TENANT e editável).
--   Esta migration cria a INFRAESTRUTURA pra materializar o catálogo em
--   form_templates de norma, por empresa, de forma IDEMPOTENTE.
--
--   Famílias (espelham EXATAMENTE o PmocChecklistPicker + pmocMachineRoutine):
--     - 'expansao_direta'  = seções de ar-condicionado (isAcSection):
--                            condicionadores, medicoes, testes.
--     - 'sistemas_centrais'= todas as demais seções (infra/torres/bombas/dutos/
--                            casa de máquinas/QAI/tubulação/quadros/tratamento).
--   Por que 2 famílias (não 3): a UI (PmocChecklistPicker) só renderiza essas 2.
--   O tier 'infra' NÃO é uma família — é o conjunto ESSENCIAL *dentro* de
--   Sistemas Centrais (predicado isInfraEssential). Criar uma 3ª família
--   divergiria da UI. Mantemos 2 pra não inventar separação que o picker não faz.
--
--   Tiers de template (por família):
--     - 'essencial'    = atividades com essential_tier NOT NULL da família
--                        (o conjunto enxuto que nasce pré-marcado).
--     - 'complementar' = atividades da família com essential_tier NULL (o resto,
--                        a "norma completa" que se adiciona a um clique).
--   Essencial e complementar são DISJUNTOS (NOT NULL vs NULL) → nunca duplicam
--   uma pergunta entre os dois templates.
--
-- BACKWARD-COMPAT TOTAL:
--   - Todas as colunas novas são NULLABLE / default NULL ou false.
--   - O catálogo antigo (pmoc_activity_catalog / contract_plan_activities /
--     pmoc_start_visit / buildPerMachineVisits) NÃO é tocado — é a prova legal
--     dos contratos PMOC existentes. Esta migration só ADICIONA coisa que coexiste.
--
-- Notação de frequência: M=mensal(1m), T=trimestral(3m), S=semestral(6m),
-- A=anual(12m), E=eventual/NULL=toda visita. Espelha freqCodeToFields do
-- ChecklistCatalogModal.tsx.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Colunas de rastreabilidade/exibição em form_questions (nullable, default NULL)
-- -----------------------------------------------------------------------------
-- pmoc_catalog_activity_id liga a pergunta materializada à atividade da norma.
-- É a CHAVE de sincronização idempotente (match por essa coluna) E o que a
-- Planilha legal (P4) usa pra reconstruir a norma a partir das respostas.
ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS pmoc_catalog_activity_id uuid
    REFERENCES public.pmoc_activity_catalog(id) ON DELETE SET NULL;

ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS pmoc_section text;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS pmoc_group text;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS pmoc_essential_tier text;

-- Índice de apoio à sincronização (lookup por (template, atividade)).
CREATE INDEX IF NOT EXISTS idx_form_questions_pmoc_catalog_activity
  ON public.form_questions (template_id, pmoc_catalog_activity_id)
  WHERE pmoc_catalog_activity_id IS NOT NULL;

COMMENT ON COLUMN public.form_questions.pmoc_catalog_activity_id IS
  'FK opcional para pmoc_activity_catalog. Setada nas perguntas materializadas a partir da norma PMOC (templates is_pmoc_default). Chave de sincronização idempotente e base da Planilha legal. NULL em perguntas comuns/manuais.';
COMMENT ON COLUMN public.form_questions.pmoc_section IS
  'Cópia de pmoc_activity_catalog.section (exibição/agrupamento). NULL fora do PMOC.';
COMMENT ON COLUMN public.form_questions.pmoc_group IS
  'Cópia de pmoc_activity_catalog.activity_group (limpeza/inspecao/medicao/teste). NULL fora do PMOC ou quando agrupa por section.';
COMMENT ON COLUMN public.form_questions.pmoc_essential_tier IS
  'Cópia de pmoc_activity_catalog.essential_tier (base/central/infra). NULL = atividade complementar (não-essencial) ou pergunta fora do PMOC.';

-- -----------------------------------------------------------------------------
-- 2) Colunas de identidade de template em form_templates (idempotência)
-- -----------------------------------------------------------------------------
ALTER TABLE public.form_templates ADD COLUMN IF NOT EXISTS pmoc_family text;
ALTER TABLE public.form_templates ADD COLUMN IF NOT EXISTS pmoc_tier text;

-- CHECKs brandos (permitem NULL — preenchidos só nos templates de norma).
ALTER TABLE public.form_templates DROP CONSTRAINT IF EXISTS form_templates_pmoc_family_check;
ALTER TABLE public.form_templates
  ADD CONSTRAINT form_templates_pmoc_family_check
  CHECK (pmoc_family IS NULL OR pmoc_family IN ('expansao_direta', 'sistemas_centrais'));

ALTER TABLE public.form_templates DROP CONSTRAINT IF EXISTS form_templates_pmoc_tier_check;
ALTER TABLE public.form_templates
  ADD CONSTRAINT form_templates_pmoc_tier_check
  CHECK (pmoc_tier IS NULL OR pmoc_tier IN ('essencial', 'complementar'));

-- 1 template de norma por (empresa, família, tier). Índice único PARCIAL: só
-- vale pros templates de norma (pmoc_family NOT NULL); templates comuns ficam
-- livres. É o que garante o UPSERT idempotente (não cria 2º template igual).
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_templates_pmoc_identity
  ON public.form_templates (company_id, pmoc_family, pmoc_tier)
  WHERE pmoc_family IS NOT NULL;

COMMENT ON COLUMN public.form_templates.pmoc_family IS
  'Família PMOC do template de norma: expansao_direta (ar-condicionado) | sistemas_centrais (infra/grande porte). NULL = template comum (não-norma). Espelha as 2 famílias do PmocChecklistPicker.';
COMMENT ON COLUMN public.form_templates.pmoc_tier IS
  'Camada do template de norma: essencial (conjunto enxuto, essential_tier NOT NULL) | complementar (resto da norma, essential_tier NULL). NULL = template comum.';

-- -----------------------------------------------------------------------------
-- 3) ensure_pmoc_norm_templates(p_company_id) — materializador idempotente
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER porque escreve em form_templates/form_questions da empresa
-- (não dá pra delegar 100% à RLS: o UPSERT precisa enxergar/casar registros).
-- Guard multi-tenant: o chamador (auth.uid()) TEM que pertencer ao p_company_id
-- (ou ser super_admin). Sem isso, vaza entre tenants.
--
-- IDEMPOTÊNCIA (por que rodar 2x não duplica):
--   (a) Templates: UPSERT casando por (company_id, pmoc_family, pmoc_tier) via o
--       índice único parcial uq_form_templates_pmoc_identity → 2ª chamada só
--       atualiza name/description, nunca insere de novo.
--   (b) Perguntas: pra cada template, casa a atividade do catálogo por
--       pmoc_catalog_activity_id. INSERT só das que faltam; UPDATE das que já
--       existem (texto/frequência/medição). Nada é duplicado, pois o match é
--       pela FK da atividade, não pelo texto.
--   (c) Só atividades is_active=true; essencial e complementar são disjuntos
--       (essential_tier NOT NULL vs NULL), então a mesma atividade nunca cai nos
--       dois templates.
--
-- A função NÃO mexe em template editado pelo usuário que não seja de norma:
-- todo write é filtrado por pmoc_family IS NOT NULL (templates de norma) e, nas
-- perguntas, por pmoc_catalog_activity_id IS NOT NULL.
CREATE OR REPLACE FUNCTION public.ensure_pmoc_norm_templates(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_company uuid;
  v_fam          record;
  v_tier         record;
  v_template_id  uuid;
  v_essential_filter boolean;  -- true = template essencial; false = complementar
BEGIN
  -- ── Guard multi-tenant ────────────────────────────────────────────────────
  v_user_company := public.get_user_company_id(auth.uid());
  IF NOT (v_user_company = p_company_id OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: empresa não pertence ao usuário.'
      USING ERRCODE = '42501';
  END IF;

  -- ── Para cada (família, tier): UPSERT do template + sync das perguntas ─────
  FOR v_fam IN
    SELECT * FROM (VALUES
      ('expansao_direta',  'Expansão Direta'),
      ('sistemas_centrais','Sistemas Centrais')
    ) AS f(family, family_label)
  LOOP
    FOR v_tier IN
      SELECT * FROM (VALUES
        ('essencial',    'Essencial'),
        ('complementar', 'Norma completa')
      ) AS t(tier, tier_label)
    LOOP
      v_essential_filter := (v_tier.tier = 'essencial');

      -- (a) UPSERT do form_templates de norma (idempotente pela identidade).
      INSERT INTO public.form_templates
        (company_id, name, description, is_active, is_pmoc_default, pmoc_family, pmoc_tier)
      VALUES (
        p_company_id,
        'PMOC — ' || v_fam.family_label || ' (' || v_tier.tier_label || ')',
        'Checklist da norma PMOC (Lei 13.589/2018) — '
          || v_fam.family_label || ', camada ' || lower(v_tier.tier_label)
          || '. Gerado automaticamente a partir do catálogo da norma; editável.',
        true,
        true,
        v_fam.family,
        v_tier.tier
      )
      ON CONFLICT (company_id, pmoc_family, pmoc_tier) WHERE pmoc_family IS NOT NULL
      DO UPDATE SET
        name        = EXCLUDED.name,
        description  = EXCLUDED.description,
        is_active    = true,
        is_pmoc_default = true,
        updated_at   = now()
      RETURNING id INTO v_template_id;

      -- (b1) UPDATE das perguntas já materializadas que mudaram no catálogo.
      --      Casa por pmoc_catalog_activity_id. Aplica o conversor (freq/medição).
      UPDATE public.form_questions q
      SET
        question      = c.description,
        description   = c.guidance,
        question_type = CASE WHEN c.is_measurement THEN 'number' ELSE 'conformidade' END,
        unit          = CASE WHEN c.is_measurement THEN c.unit ELSE NULL END,
        expected_min  = CASE WHEN c.is_measurement THEN c.expected_min ELSE NULL END,
        expected_max  = CASE WHEN c.is_measurement THEN c.expected_max ELSE NULL END,
        position      = c.sort_order,
        -- Frequência: M/T/S/A → time + meses + start contract_start; E/NULL → toda visita.
        freq_kind     = CASE c.default_freq_code WHEN 'M' THEN 'time' WHEN 'T' THEN 'time'
                                                 WHEN 'S' THEN 'time' WHEN 'A' THEN 'time'
                                                 ELSE NULL END,
        freq_months   = CASE c.default_freq_code WHEN 'M' THEN 1 WHEN 'T' THEN 3
                                                 WHEN 'S' THEN 6 WHEN 'A' THEN 12
                                                 ELSE NULL END,
        freq_days     = NULL,
        freq_visits   = NULL,
        start_kind    = CASE WHEN c.default_freq_code IN ('M','T','S','A') THEN 'contract_start' ELSE NULL END,
        start_visit   = NULL,
        is_required   = false,
        -- Metadados de exibição copiados do catálogo.
        pmoc_section       = c.section,
        pmoc_group         = c.activity_group,
        pmoc_essential_tier = c.essential_tier
      FROM public.pmoc_activity_catalog c
      WHERE q.template_id = v_template_id
        AND q.pmoc_catalog_activity_id = c.id
        AND c.is_active = true;

      -- (b2) INSERT das atividades que faltam neste template (família + tier).
      --      Família por SECTION (espelha partitionPickerSections):
      --        expansao_direta  = section IN (condicionadores, medicoes, testes)
      --        sistemas_centrais= demais seções.
      --      Tier por essential_tier (essencial = NOT NULL; complementar = NULL).
      INSERT INTO public.form_questions
        (template_id, question, question_type, description, position, is_required,
         freq_kind, freq_months, freq_days, freq_visits, start_kind, start_visit,
         unit, expected_min, expected_max,
         pmoc_catalog_activity_id, pmoc_section, pmoc_group, pmoc_essential_tier)
      SELECT
        v_template_id,
        c.description,
        CASE WHEN c.is_measurement THEN 'number' ELSE 'conformidade' END,
        c.guidance,
        c.sort_order,
        false,
        CASE WHEN c.default_freq_code IN ('M','T','S','A') THEN 'time' ELSE NULL END,
        CASE c.default_freq_code WHEN 'M' THEN 1 WHEN 'T' THEN 3 WHEN 'S' THEN 6 WHEN 'A' THEN 12 ELSE NULL END,
        NULL,
        NULL,
        CASE WHEN c.default_freq_code IN ('M','T','S','A') THEN 'contract_start' ELSE NULL END,
        NULL,
        CASE WHEN c.is_measurement THEN c.unit ELSE NULL END,
        CASE WHEN c.is_measurement THEN c.expected_min ELSE NULL END,
        CASE WHEN c.is_measurement THEN c.expected_max ELSE NULL END,
        c.id,
        c.section,
        c.activity_group,
        c.essential_tier
      FROM public.pmoc_activity_catalog c
      WHERE c.is_active = true
        -- Família por seção.
        AND (
          (v_fam.family = 'expansao_direta'
             AND c.section IN ('condicionadores', 'medicoes', 'testes'))
          OR
          (v_fam.family = 'sistemas_centrais'
             AND c.section NOT IN ('condicionadores', 'medicoes', 'testes'))
        )
        -- Tier: essencial = essential_tier NOT NULL; complementar = NULL.
        AND (
          (v_essential_filter AND c.essential_tier IS NOT NULL)
          OR
          (NOT v_essential_filter AND c.essential_tier IS NULL)
        )
        -- Não reinserir o que já foi materializado neste template.
        AND NOT EXISTS (
          SELECT 1 FROM public.form_questions q2
          WHERE q2.template_id = v_template_id
            AND q2.pmoc_catalog_activity_id = c.id
        );
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.ensure_pmoc_norm_templates(uuid) IS
  'Materializa o catálogo PMOC global em form_templates de norma (2 famílias × 2 tiers) por empresa, de forma idempotente. Valida tenant via get_user_company_id/is_super_admin. Sincroniza form_questions casando por pmoc_catalog_activity_id (insere as que faltam, atualiza as que mudaram). Não toca templates comuns (pmoc_family IS NULL).';

-- (d) GRANT execute pra usuários logados (a função se auto-protege por tenant).
GRANT EXECUTE ON FUNCTION public.ensure_pmoc_norm_templates(uuid) TO authenticated, service_role;

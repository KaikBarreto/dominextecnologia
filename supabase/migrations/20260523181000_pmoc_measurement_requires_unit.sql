-- =============================================================================
-- PMOC v1.9.x — CHECK constraint: pmoc_measurement requires unit
-- =============================================================================
--
-- Gate da Plataforma (§1.2 / §6 do plano de RLS rules da Onda D):
--
-- form_questions com question_type='pmoc_measurement' DEVE ter `unit`
-- preenchido. Medida sem unidade vira dado inútil no PDF do PMOC
-- ("temperatura: 23"... 23 o quê?). Bloqueio no banco evita lixo
-- regulatório.
--
-- A migration 20260523165401 (Onda D) introduziu a coluna `unit` e o
-- tipo de pergunta `pmoc_measurement`, mas NÃO incluiu este CHECK
-- constraint. Esta migration fecha o gap.
--
-- Idempotente: pula se o constraint já existe.
-- =============================================================================

BEGIN;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_questions_pmoc_measurement_requires_unit'
      AND conrelid = 'public.form_questions'::regclass
  ) THEN
    ALTER TABLE public.form_questions
      ADD CONSTRAINT form_questions_pmoc_measurement_requires_unit
      CHECK (
        question_type <> 'pmoc_measurement'
        OR (unit IS NOT NULL AND length(unit) > 0)
      );
    RAISE NOTICE 'CHECK form_questions_pmoc_measurement_requires_unit aplicado.';
  ELSE
    RAISE NOTICE 'CHECK form_questions_pmoc_measurement_requires_unit já existe — skip.';
  END IF;
END $constraint$;

COMMIT;

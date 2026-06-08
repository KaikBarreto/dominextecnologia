-- Tarefa 3 — Remover colunas (stages) duplicadas do kanban CRM Auctus.
--
-- Por quê: admin_crm_stages (global Auctus, sem coluna de tenant) tem 5 nomes
-- duplicados, cada um com 2 linhas. Um seed rodou duas vezes (2026-04-15 e
-- 2026-04-25). Mantemos a linha canônica (menor position; empate -> mais antiga)
-- e removemos as duplicatas, repointando antes quaisquer leads que apontem pra
-- elas (a FK é ON DELETE SET NULL, então repointamos pra não perder o estágio).
-- Por fim criamos índice único em lower(name) pra impedir nova duplicação.

DO $$
DECLARE
  v_repointed integer;
  v_deleted   integer;
BEGIN
  -- Repointa leads das duplicatas para a stage canônica de mesmo nome.
  -- Canônica = menor position; empate -> created_at mais antigo.
  WITH ranked AS (
    SELECT
      id,
      lower(name) AS lname,
      first_value(id) OVER (
        PARTITION BY lower(name)
        ORDER BY position ASC, created_at ASC
      ) AS keeper_id
    FROM public.admin_crm_stages
  ),
  dups AS (
    SELECT id AS dup_id, keeper_id
    FROM ranked
    WHERE id <> keeper_id
  )
  UPDATE public.admin_leads al
     SET stage_id = d.keeper_id
    FROM dups d
   WHERE al.stage_id = d.dup_id;
  GET DIAGNOSTICS v_repointed = ROW_COUNT;
  RAISE NOTICE 'Tarefa 3 repoint admin_leads: % leads movidos da stage duplicada para a canônica.', v_repointed;

  -- Remove as stages duplicadas (já sem leads apontando).
  WITH ranked AS (
    SELECT
      id,
      first_value(id) OVER (
        PARTITION BY lower(name)
        ORDER BY position ASC, created_at ASC
      ) AS keeper_id
    FROM public.admin_crm_stages
  )
  DELETE FROM public.admin_crm_stages s
   USING ranked r
   WHERE s.id = r.id
     AND r.id <> r.keeper_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Tarefa 3 dedupe admin_crm_stages: % stages duplicadas removidas.', v_deleted;
END $$;

-- Impede nova duplicação por nome (case-insensitive). Global: sem coluna de tenant.
CREATE UNIQUE INDEX IF NOT EXISTS admin_crm_stages_name_unique
  ON public.admin_crm_stages (lower(name));

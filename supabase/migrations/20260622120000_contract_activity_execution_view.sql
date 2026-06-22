-- =============================================================================
-- Frente F / Fase 2 — VIEW de histórico de execução por tarefa, por contrato
-- =============================================================================
-- Objetivo: expor, tarefa-a-tarefa, o cumprimento das atividades de conformidade
-- PMOC (service_order_activities com freq_code) já carimbadas na Fase 1
-- (responded_at / responded_by), com o contexto de contrato / visita /
-- equipamento / quando / quem / status. É a base que o detalhe do contrato e a
-- Planilha PMOC (Fase 4) usam pra provar conformidade por máquina.
--
-- ESCOPO CONSCIENTE: aqui só entram as ATIVIDADES DE CONFORMIDADE
-- (service_order_activities, filtradas por freq_code IS NOT NULL). As respostas
-- de checklist personalizado (form_responses, que também têm responded_at) ficam
-- pra Fase 4 — podem virar uma 2ª view / UNION no futuro. NÃO entram nesta view.
--
-- TENANT-SAFETY: criada com security_invoker = on (Postgres 15+; aqui é PG17).
-- Assim a view roda com as permissões de QUEM consulta, respeitando o RLS das
-- tabelas-base (service_order_activities / service_orders / contracts já filtram
-- por company_id). Cada tenant só enxerga o seu — sem policy própria na view.
-- =============================================================================

DROP VIEW IF EXISTS public.contract_activity_execution;

CREATE VIEW public.contract_activity_execution
WITH (security_invoker = on)
AS
SELECT
  -- tenant
  soa.company_id                              AS company_id,

  -- contrato
  so.contract_id                              AS contract_id,
  c.name                                      AS contract_name,

  -- ordem de serviço / visita
  so.id                                       AS service_order_id,
  so.order_number                             AS order_number,
  so.scheduled_date                           AS scheduled_date,
  so.pmoc_conformity_status                   AS visit_conformity,

  -- atividade (tarefa de conformidade)
  soa.id                                       AS activity_id,
  soa.plan_activity_id                         AS plan_activity_id,
  cpa.contract_item_id                         AS contract_item_id,

  -- equipamento
  soa.equipment_id                             AS equipment_id,
  e.name                                       AS equipment_name,

  -- conteúdo da tarefa
  soa.section                                  AS section,
  soa.component                                AS component,
  soa.description                              AS description,
  soa.freq_code                                AS freq_code,
  soa.is_measurement                           AS is_measurement,
  soa.measured_value                           AS measured_value,
  soa.unit                                     AS unit,
  soa.conformity_status                        AS conformity_status,
  soa.sort_order                               AS sort_order,

  -- carimbo de execução (Fase 1)
  soa.responded_at                             AS responded_at,
  soa.responded_by                             AS responded_by,
  resp.full_name                               AS responded_by_name
FROM public.service_order_activities soa
JOIN public.service_orders so
  ON so.id = soa.service_order_id
JOIN public.contracts c
  ON c.id = so.contract_id
LEFT JOIN public.contract_plan_activities cpa
  ON cpa.id = soa.plan_activity_id
LEFT JOIN public.equipment e
  ON e.id = soa.equipment_id
LEFT JOIN public.profiles resp
  ON resp.user_id = soa.responded_by
WHERE soa.freq_code IS NOT NULL   -- só atividades de conformidade PMOC
  AND so.contract_id IS NOT NULL; -- só execução vinculada a contrato

COMMENT ON VIEW public.contract_activity_execution IS
  'Frente F/Fase 2: histórico de execução por tarefa de conformidade PMOC, por contrato. security_invoker=on (respeita RLS das tabelas-base). Escopo: só service_order_activities (freq_code IS NOT NULL); form_responses ficam pra Fase 4.';

-- Histórico é interno: só usuário autenticado. NUNCA anon.
-- O default privilege do schema public no Supabase concede ALL pra anon em
-- objetos novos — então revogamos explicitamente o anon antes de conceder o
-- authenticated, garantindo que a tela pública (?modo=cliente) não alcance esta view.
REVOKE ALL ON public.contract_activity_execution FROM anon;
GRANT SELECT ON public.contract_activity_execution TO authenticated;

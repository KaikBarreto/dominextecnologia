-- =============================================================================
-- Remover a cadência automática de 10 follow-ups por lead (CRM master Auctus)
-- =============================================================================
--
-- Por quê: todo INSERT em public.admin_leads disparava
-- create_followups_on_admin_lead_insert(), que criava 10 tarefas
-- ("Follow up 1/10 - <nome>" ... "10/10") em public.admin_tasks, com due_date
-- em D+1,2,4,6,8,11,15,19,25,31 a partir do created_at do lead. Medido em
-- produção em 2026-10-05: 2816 tarefas "follow-up/novo" abertas contra apenas
-- 11 tarefas reais no resto do board (chamado=6, implantacao=1, melhoria=2,
-- cs_checkup=2). A automação poluiu a tela de Tarefas do painel master a
-- ponto de esconder o que de fato precisa de atenção humana. Decisão do CEO
-- em 2026-10-05: matar a cadência por completo (vendedor fica livre pra
-- decidir quando fazer follow-up) e apagar as 2816 tarefas abertas, mas
-- PRESERVAR as 129 tarefas "follow-up/resolvido" como histórico do que já foi
-- feito.
--
-- A automação de cs_checkup (create_cs_first_month_checkups_on_first_sale,
-- cs_criar_checkup_semanal, _cs_checkup_responsavel, cron cs-checkup-semanal)
-- é INDEPENDENTE e NÃO é tocada por esta migration.
--
-- O que sai (5 triggers + 5 funções + 1 tabela de config, todos exclusivos da
-- automação de follow-up):
--   1. trg_create_followups_on_admin_lead_insert          (admin_leads)
--      -> create_followups_on_admin_lead_insert()
--   2. trg_delete_pending_followups_on_admin_lead_stage_change (admin_leads)
--      -> delete_pending_followups_on_admin_lead_stage_change()
--   3. sync_followup_assignee_on_lead_update               (admin_leads)
--      -> sync_followup_assignee_on_lead_update()
--   4. trg_sync_followup_titles_on_lead_update             (admin_leads)
--      -> sync_followup_titles_on_lead_update()
--   5. trg_auto_interaction_on_followup_complete           (admin_tasks)
--      -> auto_interaction_on_followup_complete()
--   + tabela public.admin_crm_followup_template (só alimentava o item 1).
--
-- O que FICA de propósito (histórico, não é dívida):
--   - coluna admin_tasks.followup_step (as 129 tarefas resolvidas usam)
--   - valor 'follow-up' do enum admin_task_type (idem)
--   - as 129 linhas com status='resolvido' e type='follow-up'
--
-- Idempotente: DROP TRIGGER/FUNCTION/TABLE IF EXISTS em tudo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Triggers (4 em admin_leads, 1 em admin_tasks)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_create_followups_on_admin_lead_insert ON public.admin_leads;
DROP TRIGGER IF EXISTS trg_delete_pending_followups_on_admin_lead_stage_change ON public.admin_leads;
DROP TRIGGER IF EXISTS sync_followup_assignee_on_lead_update ON public.admin_leads;
DROP TRIGGER IF EXISTS trg_sync_followup_titles_on_lead_update ON public.admin_leads;
DROP TRIGGER IF EXISTS trg_auto_interaction_on_followup_complete ON public.admin_tasks;

-- -----------------------------------------------------------------------------
-- 2. Funções (todas RETURNS trigger, sem argumentos)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_followups_on_admin_lead_insert();
DROP FUNCTION IF EXISTS public.delete_pending_followups_on_admin_lead_stage_change();
DROP FUNCTION IF EXISTS public.sync_followup_assignee_on_lead_update();
DROP FUNCTION IF EXISTS public.sync_followup_titles_on_lead_update();
DROP FUNCTION IF EXISTS public.auto_interaction_on_followup_complete();

-- -----------------------------------------------------------------------------
-- 3. Tabela de configuração da cadência (só alimentava o trigger 1)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.admin_crm_followup_template;

-- -----------------------------------------------------------------------------
-- 4. Apagar as tarefas de follow-up ABERTAS (preserva as resolvidas)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.admin_tasks
   WHERE type = 'follow-up'::public.admin_task_type
     AND status <> 'resolvido'::public.admin_task_status;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Remoção cadência follow-up: % tarefas abertas apagadas (resolvidas preservadas).', v_deleted;
END $$;

-- -----------------------------------------------------------------------------
-- Nota final: followup_step (coluna) e 'follow-up' (valor de enum
-- admin_task_type) foram mantidos DE PROPÓSITO — são usados pelas 129 tarefas
-- "follow-up/resolvido" preservadas como histórico. Não é dívida técnica.
-- -----------------------------------------------------------------------------

-- Tarefa 2 — Follow-ups herdam o responsável do lead quando ele muda.
--
-- Por quê: o trigger de INSERT (create_followups_on_admin_lead_insert) já copia
-- NEW.responsible_id para assigned_to das 10 tarefas de cadência. Mas quando o
-- lead nasce sem responsável e ganha um depois (ou troca de responsável), as
-- tarefas de follow-up não-resolvidas ficavam apontando pro responsável antigo
-- (ou NULL). Este trigger AFTER UPDATE propaga a mudança de responsável para as
-- tarefas de follow-up ainda abertas. Tarefas resolvidas são preservadas.

CREATE OR REPLACE FUNCTION public.sync_followup_assignee_on_lead_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.responsible_id IS DISTINCT FROM NEW.responsible_id THEN
    UPDATE public.admin_tasks
       SET assigned_to = NEW.responsible_id
     WHERE crm_lead_id = NEW.id
       AND type = 'follow-up'::public.admin_task_type
       AND status <> 'resolvido'::public.admin_task_status;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_followup_assignee_on_lead_update ON public.admin_leads;
CREATE TRIGGER sync_followup_assignee_on_lead_update
  AFTER UPDATE ON public.admin_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_followup_assignee_on_lead_update();

-- Backfill: tarefas de follow-up abertas que ficaram órfãs (assigned_to NULL)
-- mas cujo lead já tem responsável definido herdam esse responsável.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.admin_tasks t
     SET assigned_to = l.responsible_id
    FROM public.admin_leads l
   WHERE t.crm_lead_id = l.id
     AND t.type = 'follow-up'::public.admin_task_type
     AND t.assigned_to IS NULL
     AND l.responsible_id IS NOT NULL
     AND t.status <> 'resolvido'::public.admin_task_status;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Tarefa 2 backfill admin_tasks (follow-up assigned_to): % linhas atualizadas.', v_count;
END $$;

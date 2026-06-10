-- Follow-ups: manter o TÍTULO sincronizado quando o NOME do lead é editado.
--
-- Por quê: o título da tarefa de follow-up é DESNORMALIZADO. No INSERT do lead,
-- create_followups_on_admin_lead_insert() grava
--   title = 'Follow up ' || step || '/10 - ' || <nome do lead>
-- onde o nome é derivado de company_name -> contact_name -> title. Quando o
-- usuário renomeia o lead depois, os títulos das 10 tarefas ficam mostrando o
-- nome ANTIGO. Este trigger AFTER UPDATE recalcula os títulos sempre que algum
-- dos campos que compõem o nome muda.
--
-- Derivação do nome: IDÊNTICA à da criação (mesma COALESCE/NULLIF), pra garantir
-- que o título recalculado bata 1:1 com o que teria sido gerado no INSERT.
--
-- Decisão de status (DIFERENTE da trigger irmã sync_followup_assignee_on_lead_update):
-- a irmã só toca tarefas NÃO resolvidas porque "responsável" é uma atribuição
-- operacional viva — não faz sentido reatribuir tarefa já fechada. O TÍTULO é
-- outro caso: o nome do lead é um FATO de identidade, e queremos consistência
-- histórica visual (uma tarefa resolvida do lead "ACME" não deve continuar
-- exibindo "Fulano" no título). Por isso atualizamos TODAS as tarefas de
-- follow-up do lead, INCLUSIVE as resolvidas, SEM filtro de status.
-- Seguro: nenhum código depende do TEXTO do título — a lógica de cadência usa
-- followup_step (smallint) e type; auto_interaction_on_followup_complete monta a
-- descrição a partir de followup_step, não do title. Logo reescrever o título é
-- puramente cosmético.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS antes do CREATE.

CREATE OR REPLACE FUNCTION public.sync_followup_titles_on_lead_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_entity_name text;
BEGIN
  -- Só recalcula se algum campo que compõe o nome mudou.
  IF OLD.company_name IS DISTINCT FROM NEW.company_name
     OR OLD.contact_name IS DISTINCT FROM NEW.contact_name
     OR OLD.title IS DISTINCT FROM NEW.title THEN

    -- Mesma derivação usada em create_followups_on_admin_lead_insert().
    v_entity_name := COALESCE(
      NULLIF(NEW.company_name, ''),
      NULLIF(NEW.contact_name, ''),
      NULLIF(NEW.title, ''),
      'Lead sem nome'
    );

    UPDATE public.admin_tasks
       SET title = 'Follow up ' || followup_step || '/10 - ' || v_entity_name
     WHERE crm_lead_id = NEW.id
       AND type = 'follow-up'::public.admin_task_type
       AND followup_step IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_followup_titles_on_lead_update ON public.admin_leads;
CREATE TRIGGER trg_sync_followup_titles_on_lead_update
  AFTER UPDATE ON public.admin_leads
  FOR EACH ROW
  WHEN (
    OLD.company_name IS DISTINCT FROM NEW.company_name
    OR OLD.contact_name IS DISTINCT FROM NEW.contact_name
    OR OLD.title IS DISTINCT FROM NEW.title
  )
  EXECUTE FUNCTION public.sync_followup_titles_on_lead_update();

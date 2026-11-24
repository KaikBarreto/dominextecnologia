-- CRM + Orçamentos: vínculo forte oportunidade/orçamento e primeiro evento de
-- negócio agnóstico. `quote.created` reutiliza as ações existentes do motor;
-- nenhuma regra ou comportamento é condicionado a uma empresa específica.

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotes_company_lead_created_idx
  ON public.quotes (company_id, lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS crm_automation_action_key text;

CREATE INDEX IF NOT EXISTS service_orders_crm_automation_action_idx
  ON public.service_orders (lead_id, crm_automation_rule_id, crm_automation_action_key)
  WHERE crm_automation_rule_id IS NOT NULL;

-- Regras antigas ganham identidade estável por ação. Isso permite duas ações
-- create_task na mesma regra sem a segunda reutilizar a tarefa da primeira.
CREATE OR REPLACE FUNCTION public.crm_normalize_automation_action_ids(p_actions jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE
  v_action jsonb;
  v_result jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_id text;
BEGIN
  IF jsonb_typeof(p_actions) <> 'array' THEN RETURN p_actions; END IF;
  FOR v_action IN SELECT value FROM jsonb_array_elements(p_actions) LOOP
    IF jsonb_typeof(v_action) <> 'object' THEN
      v_result := v_result || jsonb_build_array(v_action);
      CONTINUE;
    END IF;
    v_id := CASE WHEN jsonb_typeof(v_action->'id') = 'string'
      THEN NULLIF(btrim(v_action->>'id'), '') ELSE NULL END;
    IF v_id IS NULL OR v_id = ANY(v_seen) THEN v_id := gen_random_uuid()::text; END IF;
    v_seen := array_append(v_seen, v_id);
    v_result := v_result || jsonb_build_array(jsonb_set(v_action, '{id}', to_jsonb(v_id), true));
  END LOOP;
  RETURN v_result;
END;
$$;

WITH normalized AS MATERIALIZED (
  SELECT id, public.crm_normalize_automation_action_ids(actions) AS actions
  FROM public.crm_automation_rules
)
UPDATE public.crm_automation_rules rule
SET actions = normalized.actions
FROM normalized
WHERE rule.id = normalized.id AND rule.actions IS DISTINCT FROM normalized.actions;

CREATE OR REPLACE FUNCTION public.crm_normalize_automation_rule_actions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  NEW.actions := public.crm_normalize_automation_action_ids(NEW.actions);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_normalize_automation_rule_actions_trigger ON public.crm_automation_rules;
CREATE TRIGGER crm_normalize_automation_rule_actions_trigger
  BEFORE INSERT OR UPDATE OF actions ON public.crm_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.crm_normalize_automation_rule_actions();

CREATE OR REPLACE FUNCTION public.crm_automation_actions_valid(p_actions jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public AS $$
DECLARE
  v_action jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_id text;
BEGIN
  IF jsonb_typeof(p_actions) <> 'array' OR jsonb_array_length(p_actions) NOT BETWEEN 1 AND 20 THEN
    RETURN false;
  END IF;
  FOR v_action IN SELECT value FROM jsonb_array_elements(p_actions) LOOP
    v_id := CASE WHEN jsonb_typeof(v_action->'id') = 'string'
      THEN NULLIF(btrim(v_action->>'id'), '') ELSE NULL END;
    IF jsonb_typeof(v_action) <> 'object'
       OR v_id IS NULL OR length(v_id) > 100 OR v_id = ANY(v_seen)
       OR COALESCE(v_action->>'action', '') NOT IN (
         'create_task', 'apply_checklist', 'set_due', 'assign_user',
         'add_label', 'move_card', 'copy_card'
       )
       OR jsonb_typeof(COALESCE(v_action->'config', '{}'::jsonb)) <> 'object' THEN
      RETURN false;
    END IF;
    v_seen := array_append(v_seen, v_id);
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.crm_automation_rules
  DROP CONSTRAINT IF EXISTS crm_automation_rules_trigger_type_check;
ALTER TABLE public.crm_automation_rules
  ADD CONSTRAINT crm_automation_rules_trigger_type_check
  CHECK (trigger_type IN (
    'stage_enter', 'task_completed', 'checklist_completed', 'all_completed',
    'business_event'
  ));

CREATE OR REPLACE FUNCTION public.crm_create_automation_task(
  p_rule_id uuid, p_lead public.leads, p_config jsonb, p_fallback_title text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_task_id uuid;
  v_actor uuid := COALESCE(auth.uid(), p_lead.created_by, p_lead.assigned_to);
  v_assignee uuid;
  v_title text;
  v_customer text;
  v_action_key text := NULLIF(p_config->>'_actionKey', '');
BEGIN
  SELECT name INTO v_customer FROM public.customers WHERE id = p_lead.customer_id;
  v_title := public.crm_expand_automation_text(COALESCE(NULLIF(p_config->>'title', ''), p_fallback_title), p_lead.title, v_customer);
  IF COALESCE(p_config->>'reentry', 'reuse') <> 'new' THEN
    SELECT id INTO v_task_id FROM public.service_orders
    WHERE company_id = p_lead.company_id AND lead_id = p_lead.id
      AND crm_automation_rule_id = p_rule_id AND entry_type = 'tarefa'
      AND (crm_automation_action_key = v_action_key OR crm_automation_action_key IS NULL)
    ORDER BY (crm_automation_action_key = v_action_key) DESC NULLS LAST, created_at DESC
    LIMIT 1;
    IF v_task_id IS NOT NULL THEN
      UPDATE public.service_orders
      SET crm_automation_action_key = COALESCE(crm_automation_action_key, v_action_key)
      WHERE id = v_task_id;
      RETURN v_task_id;
    END IF;
  END IF;

  BEGIN v_assignee := NULLIF(COALESCE(p_config->>'userId', p_config->'assigneeIds'->>0), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN v_assignee := NULL; END;
  IF v_assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = v_assignee AND company_id = p_lead.company_id AND is_active
  ) THEN v_assignee := NULL; END IF;
  v_assignee := COALESCE(v_assignee, p_lead.assigned_to);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Não foi possível identificar o autor da tarefa automática'; END IF;

  INSERT INTO public.service_orders (
    company_id, created_by, technician_id, task_title, description, entry_type,
    scheduled_date, status, os_type, lead_id, show_in_schedule, duration_minutes,
    crm_automation_rule_id, crm_checklist_id, crm_automation_action_key
  ) VALUES (
    p_lead.company_id, v_actor, v_assignee, v_title,
    NULLIF(public.crm_expand_automation_text(p_config->>'description', p_lead.title, v_customer), ''),
    'tarefa', public.crm_automation_due_date(p_config), 'pendente', 'visita_tecnica',
    p_lead.id, COALESCE((p_config->>'showInSchedule')::boolean, true), 60,
    p_rule_id, NULLIF(p_config->>'checklistId', '')::uuid, v_action_key
  ) RETURNING id INTO v_task_id;

  IF v_assignee IS NOT NULL THEN
    INSERT INTO public.service_order_assignees (service_order_id, user_id)
    VALUES (v_task_id, v_assignee) ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_task_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_run_automation_event(
  p_lead_id uuid, p_trigger_type text, p_event_key text,
  p_completion_name text DEFAULT NULL, p_depth integer DEFAULT 0
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_rule public.crm_automation_rules%ROWTYPE;
  v_action jsonb;
  v_action_position integer;
  v_config jsonb;
  v_execution_id uuid;
  v_executed integer := 0;
  v_target public.crm_stages%ROWTYPE;
  v_task_id uuid;
  v_checklist_id uuid;
  v_checklist jsonb;
  v_items jsonb;
  v_existing jsonb;
  v_name text;
  v_customer text;
  v_user_id uuid;
  v_label_id uuid;
  v_copy_assignee uuid;
  v_card_moved boolean := false;
BEGIN
  IF p_depth >= 30 OR p_trigger_type NOT IN (
    'stage_enter', 'task_completed', 'checklist_completed', 'all_completed', 'business_event'
  ) THEN RETURN 0; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('crm-lead:' || p_lead_id::text));
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND OR v_lead.stage_id IS NULL OR v_lead.pipeline_id IS NULL THEN RETURN 0; END IF;
  SELECT name INTO v_customer FROM public.customers WHERE id = v_lead.customer_id;

  IF p_trigger_type = 'all_completed' AND (
    EXISTS (SELECT 1 FROM public.service_orders WHERE lead_id = v_lead.id AND entry_type = 'tarefa' AND status NOT IN ('concluida', 'cancelada'))
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lead.crm_checklists) checklist,
        jsonb_array_elements(COALESCE(checklist->'items', '[]'::jsonb)) item
      WHERE NOT COALESCE((item->>'done')::boolean, false)
    )
  ) THEN RETURN 0; END IF;

  FOR v_rule IN SELECT * FROM public.crm_automation_rules
    WHERE company_id = v_lead.company_id AND pipeline_id = v_lead.pipeline_id
      AND trigger_stage_id = v_lead.stage_id AND trigger_type = p_trigger_type AND enabled
    ORDER BY position, created_at, id
  LOOP
    v_card_moved := false;
    IF p_trigger_type = 'task_completed' AND NULLIF(v_rule.trigger_config->>'taskName', '') IS NOT NULL
       AND public.crm_expand_automation_text(v_rule.trigger_config->>'taskName', v_lead.title, v_customer) <> p_completion_name THEN CONTINUE; END IF;
    IF p_trigger_type = 'checklist_completed' AND NULLIF(v_rule.trigger_config->>'name', '') IS NOT NULL
       AND public.crm_expand_automation_text(v_rule.trigger_config->>'name', v_lead.title, v_customer) <> p_completion_name THEN CONTINUE; END IF;
    IF p_trigger_type = 'business_event'
       AND NULLIF(v_rule.trigger_config->>'event', '') IS DISTINCT FROM p_completion_name THEN CONTINUE; END IF;

    INSERT INTO public.crm_automation_executions (company_id, rule_id, lead_id, event_key)
    VALUES (v_lead.company_id, v_rule.id, v_lead.id, left(p_event_key, 300))
    ON CONFLICT (company_id, rule_id, lead_id, event_key) DO NOTHING RETURNING id INTO v_execution_id;
    IF v_execution_id IS NULL THEN CONTINUE; END IF;

    BEGIN
      FOR v_action, v_action_position IN
        SELECT value, ordinality::integer
        FROM jsonb_array_elements(v_rule.actions) WITH ORDINALITY source(value, ordinality)
      LOOP
        v_config := COALESCE(v_action->'config', '{}'::jsonb) || jsonb_build_object(
          '_actionKey', COALESCE(NULLIF(v_action->>'id', ''), v_action_position::text)
        );
        CASE v_action->>'action'
          WHEN 'create_task' THEN
            PERFORM public.crm_create_automation_task(v_rule.id, v_lead, v_config, 'Acompanhar ' || v_lead.title);
          WHEN 'set_due' THEN
            UPDATE public.leads SET expected_close_date = public.crm_automation_due_date(v_config) WHERE id = v_lead.id;
          WHEN 'assign_user' THEN
            BEGIN v_user_id := NULLIF(v_config->>'userId', '')::uuid;
            EXCEPTION WHEN invalid_text_representation THEN v_user_id := NULL; END;
            IF v_user_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM public.profiles WHERE user_id = v_user_id AND company_id = v_lead.company_id AND is_active
            ) THEN RAISE EXCEPTION 'Responsável da automação não pertence à empresa'; END IF;
            UPDATE public.leads SET assigned_to = v_user_id WHERE id = v_lead.id;
            v_lead.assigned_to := v_user_id;
          WHEN 'add_label' THEN
            BEGIN v_label_id := NULLIF(v_config->>'labelId', '')::uuid;
            EXCEPTION WHEN invalid_text_representation THEN v_label_id := NULL; END;
            IF v_label_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM public.crm_labels WHERE id = v_label_id AND company_id = v_lead.company_id
            ) THEN RAISE EXCEPTION 'Etiqueta da automação não pertence à empresa'; END IF;
            UPDATE public.leads SET crm_label_ids = CASE
              WHEN v_label_id = ANY(crm_label_ids) THEN crm_label_ids ELSE array_append(crm_label_ids, v_label_id) END
            WHERE id = v_lead.id;
          WHEN 'apply_checklist' THEN
            SELECT checklist INTO v_existing FROM jsonb_array_elements(v_lead.crm_checklists) checklist
            WHERE checklist->>'automation_rule_id' = v_rule.id::text
              AND (
                checklist->>'automation_action_key' = v_config->>'_actionKey'
                OR NULLIF(checklist->>'automation_action_key', '') IS NULL
              )
            ORDER BY (checklist->>'automation_action_key' = v_config->>'_actionKey') DESC NULLS LAST
            LIMIT 1;
            -- A primeira reentrada após esta migration adota o snapshot legado
            -- sem duplicá-lo. Em regras com várias ações, cada snapshot sem
            -- chave é reivindicado por uma ação diferente, na ordem da regra.
            IF v_existing IS NOT NULL
               AND COALESCE(v_config->>'reentry', 'reuse') <> 'new'
               AND NULLIF(v_existing->>'automation_action_key', '') IS NULL THEN
              v_existing := jsonb_set(
                v_existing, '{automation_action_key}', to_jsonb(v_config->>'_actionKey'), true
              );
              UPDATE public.leads
              SET crm_checklists = (
                SELECT jsonb_agg(
                  CASE WHEN checklist->>'id' = v_existing->>'id' THEN v_existing ELSE checklist END
                  ORDER BY ordinality
                )
                FROM jsonb_array_elements(crm_checklists) WITH ORDINALITY source(checklist, ordinality)
              )
              WHERE id = v_lead.id
              RETURNING crm_checklists INTO v_lead.crm_checklists;
              UPDATE public.service_orders
              SET crm_automation_action_key = COALESCE(crm_automation_action_key, v_config->>'_actionKey')
              WHERE id = NULLIF(v_existing->>'linked_task_id', '')::uuid
                AND company_id = v_lead.company_id
                AND lead_id = v_lead.id
                AND crm_automation_rule_id = v_rule.id;
            END IF;
            IF v_existing IS NULL OR COALESCE(v_config->>'reentry', 'reuse') = 'new' THEN
              v_checklist_id := gen_random_uuid();
              v_name := public.crm_expand_automation_text(COALESCE(NULLIF(v_config->>'name', ''), 'Checklist'), v_lead.title, v_customer);
              IF NULLIF(v_config->>'templateId', '') IS NOT NULL THEN
                BEGIN
                  SELECT items INTO v_items FROM public.crm_checklist_templates
                  WHERE id = (v_config->>'templateId')::uuid AND company_id = v_lead.company_id;
                EXCEPTION WHEN invalid_text_representation THEN v_items := NULL; END;
              ELSE v_items := COALESCE(v_config->'items', '[]'::jsonb); END IF;
              IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
                RAISE EXCEPTION 'Checklist automático precisa ter itens';
              END IF;
              SELECT jsonb_agg(jsonb_build_object(
                'id', gen_random_uuid(),
                'text', public.crm_expand_automation_text(CASE WHEN jsonb_typeof(item) = 'string' THEN item #>> '{}' ELSE item->>'text' END, v_lead.title, v_customer),
                'done', false
              ) ORDER BY ordinality) INTO v_items
              FROM jsonb_array_elements(v_items) WITH ORDINALITY AS source(item, ordinality);
              IF COALESCE((v_config->>'createTask')::boolean, false) THEN
                v_task_id := public.crm_create_automation_task(
                  v_rule.id, v_lead, v_config || jsonb_build_object('title', v_name, 'checklistId', v_checklist_id), v_name
                );
                UPDATE public.service_orders SET crm_checklist_id = v_checklist_id WHERE id = v_task_id;
              ELSE v_task_id := NULL; END IF;
              v_checklist := jsonb_build_object(
                'id', v_checklist_id, 'name', v_name, 'title', v_name, 'items', v_items,
                'automation_rule_id', v_rule.id, 'automation_action_key', v_config->>'_actionKey',
                'linked_task_id', v_task_id
              );
              UPDATE public.leads SET crm_checklists = crm_checklists || jsonb_build_array(v_checklist)
              WHERE id = v_lead.id RETURNING crm_checklists INTO v_lead.crm_checklists;
            END IF;
          WHEN 'move_card', 'copy_card' THEN
            BEGIN
              SELECT s.* INTO v_target FROM public.crm_stages s
              JOIN public.crm_pipelines p ON p.id = s.pipeline_id
              WHERE s.id = (v_config->>'stageId')::uuid
                AND p.id = (v_config->>'workflowId')::uuid
                AND s.company_id = v_lead.company_id AND p.company_id = v_lead.company_id;
            EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Destino da automação inválido'; END;
            IF NOT FOUND OR v_target.is_lost THEN RAISE EXCEPTION 'Destino da automação indisponível'; END IF;
            PERFORM public.crm_assert_stage_ready(v_lead.id);
            PERFORM set_config('app.crm_automation_depth', (p_depth + 1)::text, true);
            IF v_action->>'action' = 'move_card' THEN
              UPDATE public.leads SET pipeline_id = v_target.pipeline_id, stage_id = v_target.id WHERE id = v_lead.id;
              SELECT * INTO v_lead FROM public.leads WHERE id = v_lead.id;
              v_card_moved := true;
              EXIT;
            ELSE
              BEGIN v_copy_assignee := NULLIF(v_config->>'userId', '')::uuid;
              EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Responsável da cópia inválido'; END;
              IF v_copy_assignee IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM public.profiles WHERE user_id = v_copy_assignee AND company_id = v_lead.company_id AND is_active
              ) THEN RAISE EXCEPTION 'Responsável da cópia não pertence à empresa'; END IF;
              INSERT INTO public.leads (
                company_id, pipeline_id, stage_id, title, customer_id, assigned_to,
                created_by, expected_close_date, notes, probability, source, status, value
              ) VALUES (
                v_lead.company_id, v_target.pipeline_id, v_target.id,
                public.crm_expand_automation_text(COALESCE(NULLIF(v_config->>'title', ''), v_lead.title), v_lead.title, v_customer),
                v_lead.customer_id, COALESCE(v_copy_assignee, v_lead.assigned_to), COALESCE(auth.uid(), v_lead.created_by),
                v_lead.expected_close_date, v_lead.notes, v_lead.probability, v_lead.source, 'lead', v_lead.value
              );
            END IF;
          ELSE RAISE EXCEPTION 'Ação de automação não suportada: %', v_action->>'action';
        END CASE;
      END LOOP;
      UPDATE public.crm_automation_executions SET status = 'completed', executed_at = now() WHERE id = v_execution_id;
      INSERT INTO public.lead_interactions (lead_id, interaction_type, description, created_by)
      VALUES (v_lead.id, 'outro', format('Automação executada: %s', v_rule.name), auth.uid());
      v_executed := v_executed + 1;
      IF v_card_moved THEN RETURN v_executed; END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.crm_automation_executions
      SET status = 'failed', error_message = left(SQLERRM, 500), executed_at = now() WHERE id = v_execution_id;
      IF p_trigger_type = 'business_event' THEN
        -- Eventos derivados não desfazem o fato de negócio nem apagam a
        -- trilha de falha. Outras regras do mesmo evento ainda podem executar.
        -- O EXCEPTION reverte SQL do bloco, mas não variáveis PL/pgSQL;
        -- recarrega o snapshot para a próxima regra não usar estado fantasma.
        SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
        INSERT INTO public.lead_interactions (lead_id, interaction_type, description, created_by)
        VALUES (
          v_lead.id,
          'outro',
          format('A automação %s não pôde ser executada e precisa de revisão.', v_rule.name),
          auth.uid()
        );
        CONTINUE;
      END IF;
      RAISE;
    END;
  END LOOP;
  RETURN v_executed;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_validate_quote_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.lead_id IS NOT DISTINCT FROM OLD.lead_id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
    RETURN NEW;
  END IF;
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leads lead
    WHERE lead.id = NEW.lead_id AND lead.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'A oportunidade selecionada não está disponível nesta empresa.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin(auth.uid())
     AND NOT public.can_access_lead(NEW.lead_id, auth.uid()) THEN
    RAISE EXCEPTION 'Você não tem acesso a esta oportunidade.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_validate_quote_lead_trigger ON public.quotes;
CREATE TRIGGER crm_validate_quote_lead_trigger
  BEFORE INSERT OR UPDATE OF lead_id, company_id ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.crm_validate_quote_lead();

CREATE OR REPLACE FUNCTION public.crm_trigger_quote_created_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lead_id IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.lead_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.crm_run_automation_event(
      NEW.lead_id,
      'business_event',
      format('quote:%s:created', NEW.id),
      'quote.created',
      0
    );
  EXCEPTION WHEN OTHERS THEN
    -- A automação é consequência, não parte do salvamento comercial. Uma regra
    -- inválida não pode apagar o orçamento recém-criado.
    INSERT INTO public.lead_interactions (lead_id, interaction_type, description, created_by)
    VALUES (
      NEW.lead_id,
      'outro',
      format('O orçamento #%s foi criado, mas uma automação não pôde ser executada.', NEW.quote_number),
      auth.uid()
    );
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_quote_created_event_insert ON public.quotes;
CREATE TRIGGER crm_quote_created_event_insert
  AFTER INSERT ON public.quotes
  FOR EACH ROW WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.crm_trigger_quote_created_event();

DROP TRIGGER IF EXISTS crm_quote_created_event_link ON public.quotes;
CREATE TRIGGER crm_quote_created_event_link
  AFTER UPDATE OF lead_id ON public.quotes
  FOR EACH ROW WHEN (OLD.lead_id IS NULL AND NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.crm_trigger_quote_created_event();

-- Wrapper atômico da criação numerada existente. Mantém a allowlist original
-- intacta e só acrescenta o vínculo validado antes de devolver o orçamento.
CREATE OR REPLACE FUNCTION public.create_reserved_quote_from_lead(
  p_reservation_id uuid,
  p_quote jsonb,
  p_items jsonb,
  p_company_id uuid,
  p_user_id uuid,
  p_lead_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_saved jsonb;
  v_quote_id uuid;
BEGIN
  IF p_lead_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.leads lead
    WHERE lead.id = p_lead_id AND lead.company_id = p_company_id
      AND public.can_access_lead(lead.id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'A oportunidade selecionada não está disponível.' USING ERRCODE = '42501';
  END IF;
  v_saved := public.create_reserved_quote(
    p_reservation_id, p_quote, p_items, p_company_id, p_user_id
  );
  v_quote_id := NULLIF(v_saved->>'id', '')::uuid;
  UPDATE public.quotes
  SET lead_id = p_lead_id
  WHERE id = v_quote_id
    AND company_id = p_company_id
    AND (lead_id IS NULL OR lead_id = p_lead_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível vincular o orçamento à oportunidade. A reserva já está associada a outro contexto.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN v_saved || jsonb_build_object('lead_id', p_lead_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_reserved_quote_from_lead(uuid,jsonb,jsonb,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_reserved_quote_from_lead(uuid,jsonb,jsonb,uuid,uuid,uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.crm_validate_quote_lead() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_trigger_quote_created_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_create_automation_task(uuid, public.leads, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_run_automation_event(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_normalize_automation_action_ids(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_normalize_automation_rule_actions() FROM PUBLIC, anon, authenticated;

-- Snapshots manuais antigos usavam `title`; automações usavam `name`. Mantém
-- os dois aliases no JSON para compatibilidade e preserva todos os metadados.
WITH normalized AS (
  SELECT lead.id,
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(checklist) = 'object' THEN checklist || jsonb_build_object(
          'title', COALESCE(NULLIF(checklist->>'title', ''), checklist->>'name'),
          'name', COALESCE(NULLIF(checklist->>'name', ''), checklist->>'title')
        )
        ELSE checklist
      END
      ORDER BY ordinality
    ) AS checklists
  FROM public.leads lead,
    jsonb_array_elements(lead.crm_checklists) WITH ORDINALITY source(checklist, ordinality)
  GROUP BY lead.id
)
UPDATE public.leads lead
SET crm_checklists = normalized.checklists
FROM normalized
WHERE lead.id = normalized.id
  AND lead.crm_checklists IS DISTINCT FROM normalized.checklists;

COMMENT ON COLUMN public.quotes.lead_id IS 'Oportunidade de origem do orçamento; vínculo opcional, validado no mesmo tenant.';
COMMENT ON COLUMN public.service_orders.crm_automation_action_key IS 'Identidade estável da ação dentro da regra para idempotência por ação.';

COMMIT;

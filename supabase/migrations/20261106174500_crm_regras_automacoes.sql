-- CRM/Kanban: requisitos de saída, automações e vínculo transacional entre
-- checklist do cartão e a mesma tarefa (service_orders) usada pela Agenda.
-- A migration é aditiva; regra vazia e automação ausente preservam o legado.

BEGIN;

ALTER TABLE public.crm_stages
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.crm_stage_requirements_valid(p_requirements jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_entry record;
BEGIN
  IF jsonb_typeof(p_requirements) <> 'object' THEN RETURN false; END IF;
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_requirements) LOOP
    IF v_entry.key IN ('tasks', 'checklists', 'assignee', 'dueDate', 'customer', 'description')
       AND jsonb_typeof(v_entry.value) <> 'boolean' THEN RETURN false; END IF;
    IF v_entry.key IN ('taskNames', 'checklistNames', 'checklistItems', 'customFields', 'fieldRules')
       AND jsonb_typeof(v_entry.value) <> 'array' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.crm_stages DROP CONSTRAINT IF EXISTS crm_stages_requirements_object_check;
ALTER TABLE public.crm_stages ADD CONSTRAINT crm_stages_requirements_object_check
  CHECK (public.crm_stage_requirements_valid(requirements));

CREATE TABLE IF NOT EXISTS public.crm_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  trigger_stage_id uuid NOT NULL REFERENCES public.crm_stages(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  trigger_type text NOT NULL DEFAULT 'stage_enter'
    CHECK (trigger_type IN ('stage_enter', 'task_completed', 'checklist_completed', 'all_completed')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(trigger_config) = 'object'),
  actions jsonb NOT NULL CHECK (jsonb_typeof(actions) = 'array' AND jsonb_array_length(actions) BETWEEN 1 AND 20),
  enabled boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, company_id)
);

CREATE INDEX IF NOT EXISTS crm_automation_rules_trigger_idx
  ON public.crm_automation_rules
  (company_id, pipeline_id, trigger_stage_id, trigger_type, enabled, position, created_at);

DROP TRIGGER IF EXISTS update_crm_automation_rules_updated_at ON public.crm_automation_rules;
CREATE TRIGGER update_crm_automation_rules_updated_at
  BEFORE UPDATE ON public.crm_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.crm_automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  CONSTRAINT crm_automation_executions_rule_company_fkey
    FOREIGN KEY (rule_id, company_id) REFERENCES public.crm_automation_rules(id, company_id) ON DELETE CASCADE,
  UNIQUE (company_id, rule_id, lead_id, event_key)
);

CREATE INDEX IF NOT EXISTS crm_automation_executions_lead_idx
  ON public.crm_automation_executions (company_id, lead_id, created_at DESC);

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS crm_automation_rule_id uuid,
  ADD COLUMN IF NOT EXISTS crm_checklist_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_orders'::regclass
      AND conname = 'service_orders_crm_automation_rule_id_fkey'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_crm_automation_rule_id_fkey
      FOREIGN KEY (crm_automation_rule_id) REFERENCES public.crm_automation_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS service_orders_crm_automation_rule_idx
  ON public.service_orders (crm_automation_rule_id) WHERE crm_automation_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_orders_crm_checklist_idx
  ON public.service_orders (lead_id, crm_checklist_id) WHERE crm_checklist_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_automation_actions_valid(p_actions jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_action jsonb;
BEGIN
  IF jsonb_typeof(p_actions) <> 'array' OR jsonb_array_length(p_actions) NOT BETWEEN 1 AND 20 THEN
    RETURN false;
  END IF;
  FOR v_action IN SELECT value FROM jsonb_array_elements(p_actions) LOOP
    IF jsonb_typeof(v_action) <> 'object'
       OR COALESCE(v_action->>'action', '') NOT IN (
         'create_task', 'apply_checklist', 'set_due', 'assign_user',
         'add_label', 'move_card', 'copy_card'
       )
       OR jsonb_typeof(COALESCE(v_action->'config', '{}'::jsonb)) <> 'object' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.crm_automation_rules DROP CONSTRAINT IF EXISTS crm_automation_rules_actions_contract_check;
ALTER TABLE public.crm_automation_rules ADD CONSTRAINT crm_automation_rules_actions_contract_check
  CHECK (public.crm_automation_actions_valid(actions));

CREATE OR REPLACE FUNCTION public.crm_validate_automation_rule_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_pipelines p
    JOIN public.crm_stages s ON s.pipeline_id = p.id
    WHERE p.id = NEW.pipeline_id AND p.company_id = NEW.company_id
      AND s.id = NEW.trigger_stage_id AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'AUTOMATION_STAGE_OUTSIDE_COMPANY_OR_PIPELINE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_validate_automation_rule_tenant_trigger ON public.crm_automation_rules;
CREATE TRIGGER crm_validate_automation_rule_tenant_trigger
  BEFORE INSERT OR UPDATE OF company_id, pipeline_id, trigger_stage_id ON public.crm_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.crm_validate_automation_rule_tenant();

CREATE OR REPLACE FUNCTION public.crm_expand_automation_text(p_text text, p_title text, p_customer text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT replace(replace(replace(replace(
    COALESCE(p_text, ''), '{NOME}', COALESCE(p_title, '')),
    '{{NOME}}', COALESCE(p_title, '')),
    '{CLIENTE}', COALESCE(p_customer, '')),
    '{{CLIENTE}}', COALESCE(p_customer, ''));
$$;

CREATE OR REPLACE FUNCTION public.crm_automation_due_date(p_config jsonb)
RETURNS date LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_days integer := LEAST(3650, GREATEST(0, COALESCE((p_config->>'dueDays')::integer, 1)));
  v_date date := current_date;
  v_added integer := 0;
  v_holidays jsonb := COALESCE(p_config->'holidays', '[]'::jsonb);
BEGIN
  IF COALESCE(p_config->>'dayMode', 'calendar') <> 'business' THEN RETURN v_date + v_days; END IF;
  WHILE v_added < v_days LOOP
    v_date := v_date + 1;
    IF extract(isodow FROM v_date) < 6 AND NOT (v_holidays ? to_char(v_date, 'YYYY-MM-DD')) THEN
      v_added := v_added + 1;
    END IF;
  END LOOP;
  RETURN v_date;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Prazo da automação inválido';
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_stage_missing_requirements(p_lead_id uuid, p_stage_id uuid DEFAULT NULL)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_requirements jsonb;
  v_missing text[] := ARRAY[]::text[];
  v_name text;
  v_item jsonb;
  v_rule jsonb;
  v_key text;
  v_value jsonb;
  v_label text;
  v_has_match boolean;
  v_has_incomplete boolean;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND OR (
    COALESCE(auth.role(), '') <> 'service_role'
    AND NOT (
      public.is_super_admin(auth.uid())
      OR (
        v_lead.company_id = public.get_user_company_id(auth.uid())
        AND public.can_access_pipeline(v_lead.pipeline_id, auth.uid())
      )
    )
  ) THEN RAISE EXCEPTION 'not authorized'; END IF;

  SELECT requirements INTO v_requirements FROM public.crm_stages
  WHERE id = COALESCE(p_stage_id, v_lead.stage_id) AND company_id = v_lead.company_id;
  v_requirements := COALESCE(v_requirements, '{}'::jsonb);

  IF COALESCE((v_requirements->>'tasks')::boolean, false) AND EXISTS (
    SELECT 1 FROM public.service_orders
    WHERE lead_id = v_lead.id AND entry_type = 'tarefa' AND status NOT IN ('concluida', 'cancelada')
  ) THEN v_missing := array_append(v_missing, 'Conclua as tarefas pendentes.'); END IF;

  IF COALESCE((v_requirements->>'checklists')::boolean, false) AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_lead.crm_checklists) checklist,
      jsonb_array_elements(COALESCE(checklist->'items', '[]'::jsonb)) item
    WHERE NOT COALESCE((item->>'done')::boolean, false)
  ) THEN v_missing := array_append(v_missing, 'Conclua todos os itens dos checklists.'); END IF;

  IF COALESCE((v_requirements->>'assignee')::boolean, false) AND v_lead.assigned_to IS NULL THEN
    v_missing := array_append(v_missing, 'Defina um responsável.');
  END IF;
  IF COALESCE((v_requirements->>'dueDate')::boolean, false) AND v_lead.expected_close_date IS NULL THEN
    v_missing := array_append(v_missing, 'Defina uma previsão de fechamento.');
  END IF;
  IF COALESCE((v_requirements->>'customer')::boolean, false) AND v_lead.customer_id IS NULL THEN
    v_missing := array_append(v_missing, 'Vincule um cliente.');
  END IF;
  IF COALESCE((v_requirements->>'description')::boolean, false)
     AND NULLIF(btrim(COALESCE(v_lead.notes, '')), '') IS NULL THEN
    v_missing := array_append(v_missing, 'Preencha as observações do cartão.');
  END IF;

  FOR v_name IN SELECT jsonb_array_elements_text(COALESCE(v_requirements->'taskNames', '[]'::jsonb)) LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.service_orders WHERE lead_id = v_lead.id AND entry_type = 'tarefa' AND task_title = v_name
    ), EXISTS (
      SELECT 1 FROM public.service_orders WHERE lead_id = v_lead.id AND entry_type = 'tarefa'
        AND task_title = v_name AND status <> 'concluida'
    ) INTO v_has_match, v_has_incomplete;
    IF NOT v_has_match OR v_has_incomplete THEN
      v_missing := array_append(v_missing, format('Conclua a tarefa: %s.', v_name));
    END IF;
  END LOOP;

  FOR v_name IN SELECT jsonb_array_elements_text(COALESCE(v_requirements->'checklistNames', '[]'::jsonb)) LOOP
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lead.crm_checklists) checklist WHERE checklist->>'name' = v_name
    ), EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lead.crm_checklists) checklist
      WHERE checklist->>'name' = v_name AND (
        jsonb_array_length(COALESCE(checklist->'items', '[]'::jsonb)) = 0 OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(checklist->'items', '[]'::jsonb)) item
          WHERE NOT COALESCE((item->>'done')::boolean, false)
        )
      )
    ) INTO v_has_match, v_has_incomplete;
    IF NOT v_has_match OR v_has_incomplete THEN
      v_missing := array_append(v_missing, format('Conclua o checklist: %s.', v_name));
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_requirements->'checklistItems', '[]'::jsonb)) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lead.crm_checklists) checklist,
        jsonb_array_elements(COALESCE(checklist->'items', '[]'::jsonb)) item
      WHERE checklist->>'name' = v_item->>'checklistName'
        AND item->>'text' = v_item->>'text' AND COALESCE((item->>'done')::boolean, false)
    ) THEN
      v_missing := array_append(v_missing, format('Conclua o item “%s” de %s.', v_item->>'text', v_item->>'checklistName'));
    END IF;
  END LOOP;

  FOR v_key IN SELECT jsonb_array_elements_text(COALESCE(v_requirements->'customFields', '[]'::jsonb)) LOOP
    v_value := to_jsonb(v_lead)->v_key;
    IF v_value IS NULL OR v_value = 'null'::jsonb OR btrim(v_value #>> '{}') = '' OR v_value = 'false'::jsonb THEN
      v_missing := array_append(v_missing, format('Preencha o campo: %s.', v_key));
    END IF;
  END LOOP;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(COALESCE(v_requirements->'fieldRules', '[]'::jsonb)) LOOP
    v_key := COALESCE(v_rule->>'key', '');
    v_label := COALESCE(NULLIF(v_rule->>'label', ''), v_key);
    v_value := to_jsonb(v_lead)->v_key;
    IF COALESCE(v_rule->>'operator', 'filled') = 'checked' THEN
      v_has_match := v_value = 'true'::jsonb;
    ELSIF v_rule->>'operator' = 'equals' THEN
      v_has_match := v_value IS NOT NULL AND v_value <> 'null'::jsonb
        AND btrim(v_value #>> '{}') = btrim(COALESCE(v_rule->>'value', ''));
    ELSIF v_rule->>'operator' = 'url' THEN
      v_has_match := COALESCE(v_value #>> '{}', '') ~* '^https?://[^[:space:]]+$';
    ELSE
      v_has_match := v_value IS NOT NULL AND v_value <> 'null'::jsonb AND btrim(v_value #>> '{}') <> '';
    END IF;
    IF NOT v_has_match THEN
      v_missing := array_append(v_missing, CASE COALESCE(v_rule->>'operator', 'filled')
        WHEN 'checked' THEN format('Confirme o campo: %s.', v_label)
        WHEN 'equals' THEN format('O campo %s deve ser “%s”.', v_label, v_rule->>'value')
        WHEN 'url' THEN format('Informe um link válido em: %s.', v_label)
        ELSE format('Preencha o campo: %s.', v_label) END);
    END IF;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT value FROM unnest(v_missing) value);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_assert_stage_ready(p_lead_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_missing text[];
BEGIN
  v_missing := public.crm_stage_missing_requirements(p_lead_id, NULL);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = array_to_string(v_missing, ' '), HINT = 'STAGE_REQUIREMENTS_PENDING';
  END IF;
END;
$$;

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
BEGIN
  SELECT name INTO v_customer FROM public.customers WHERE id = p_lead.customer_id;
  v_title := public.crm_expand_automation_text(COALESCE(NULLIF(p_config->>'title', ''), p_fallback_title), p_lead.title, v_customer);
  IF COALESCE(p_config->>'reentry', 'reuse') <> 'new' THEN
    SELECT id INTO v_task_id FROM public.service_orders
    WHERE company_id = p_lead.company_id AND lead_id = p_lead.id
      AND crm_automation_rule_id = p_rule_id AND entry_type = 'tarefa'
    ORDER BY created_at DESC LIMIT 1;
    IF v_task_id IS NOT NULL THEN RETURN v_task_id; END IF;
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
    crm_automation_rule_id, crm_checklist_id
  ) VALUES (
    p_lead.company_id, v_actor, v_assignee, v_title,
    NULLIF(public.crm_expand_automation_text(p_config->>'description', p_lead.title, v_customer), ''),
    'tarefa', public.crm_automation_due_date(p_config), 'pendente', 'visita_tecnica',
    p_lead.id, COALESCE((p_config->>'showInSchedule')::boolean, true), 60,
    p_rule_id, NULLIF(p_config->>'checklistId', '')::uuid
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
  IF p_depth >= 30 OR p_trigger_type NOT IN ('stage_enter', 'task_completed', 'checklist_completed', 'all_completed') THEN RETURN 0; END IF;
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

    INSERT INTO public.crm_automation_executions (company_id, rule_id, lead_id, event_key)
    VALUES (v_lead.company_id, v_rule.id, v_lead.id, left(p_event_key, 300))
    ON CONFLICT (company_id, rule_id, lead_id, event_key) DO NOTHING RETURNING id INTO v_execution_id;
    IF v_execution_id IS NULL THEN CONTINUE; END IF;

    BEGIN
      FOR v_action IN SELECT value FROM jsonb_array_elements(v_rule.actions) LOOP
        v_config := COALESCE(v_action->'config', '{}'::jsonb);
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
            WHERE checklist->>'automation_rule_id' = v_rule.id::text LIMIT 1;
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
                'id', v_checklist_id, 'name', v_name, 'items', v_items,
                'automation_rule_id', v_rule.id, 'linked_task_id', v_task_id
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
      RAISE;
    END;
  END LOOP;
  RETURN v_executed;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_guard_stage_advance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND OLD.stage_id IS NOT NULL THEN
    PERFORM public.crm_assert_stage_ready(OLD.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_trigger_stage_automations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_position integer;
  v_new_position integer;
  v_depth integer := COALESCE(NULLIF(current_setting('app.crm_automation_depth', true), '')::integer, 0);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      PERFORM public.crm_run_automation_event(NEW.id, 'stage_enter', format('stage:%s:%s:%s', NEW.id, NEW.stage_id, txid_current()), NULL, v_depth);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
    SELECT position INTO v_old_position FROM public.crm_stages WHERE id = OLD.stage_id;
    SELECT position INTO v_new_position FROM public.crm_stages WHERE id = NEW.stage_id;
    IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id OR v_old_position IS NULL OR v_new_position > v_old_position THEN
      PERFORM public.crm_run_automation_event(NEW.id, 'stage_enter', format('stage:%s:%s:%s', NEW.id, NEW.stage_id, txid_current()), NULL, v_depth);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_sync_checklist_tasks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_checklist jsonb;
  v_old_checklist jsonb;
  v_complete boolean;
  v_old_complete boolean;
  v_checklist_id uuid;
  v_linked_task_id uuid;
BEGIN
  FOR v_checklist IN SELECT value FROM jsonb_array_elements(NEW.crm_checklists) LOOP
    BEGIN v_checklist_id := (v_checklist->>'id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN CONTINUE; END;
    SELECT value INTO v_old_checklist FROM jsonb_array_elements(OLD.crm_checklists)
    WHERE value->>'id' = v_checklist_id::text LIMIT 1;
    v_complete := jsonb_array_length(COALESCE(v_checklist->'items', '[]'::jsonb)) > 0 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(v_checklist->'items', '[]'::jsonb)) item
      WHERE NOT COALESCE((item->>'done')::boolean, false)
    );
    v_old_complete := v_old_checklist IS NOT NULL
      AND jsonb_array_length(COALESCE(v_old_checklist->'items', '[]'::jsonb)) > 0 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_old_checklist->'items', '[]'::jsonb)) item
        WHERE NOT COALESCE((item->>'done')::boolean, false)
      );
    BEGIN v_linked_task_id := NULLIF(v_checklist->>'linked_task_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_linked_task_id := NULL; END;
    IF v_linked_task_id IS NOT NULL THEN
      UPDATE public.service_orders
      SET status = CASE WHEN v_complete THEN 'concluida'::public.os_status ELSE 'pendente'::public.os_status END,
          completed_at = CASE WHEN v_complete THEN COALESCE(completed_at, now()) ELSE NULL END
      WHERE id = v_linked_task_id AND lead_id = NEW.id
        AND status IS DISTINCT FROM CASE WHEN v_complete THEN 'concluida'::public.os_status ELSE 'pendente'::public.os_status END;
    END IF;
    IF v_complete AND NOT v_old_complete THEN
      PERFORM public.crm_run_automation_event(NEW.id, 'checklist_completed', format('checklist:%s:%s:%s', NEW.id, v_checklist_id, txid_current()), v_checklist->>'name', 0);
      PERFORM public.crm_run_automation_event(NEW.id, 'all_completed', format('all:%s:%s', NEW.id, txid_current()), NULL, 0);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_sync_task_checklist_and_automations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checklists jsonb;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.entry_type <> 'tarefa' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.crm_checklist_id IS NOT NULL AND (NEW.status = 'concluida' OR OLD.status = 'concluida') THEN
    SELECT jsonb_agg(
      CASE WHEN checklist->>'id' = NEW.crm_checklist_id::text THEN
        jsonb_set(checklist, '{items}', COALESCE((
          SELECT jsonb_agg(jsonb_set(item, '{done}', to_jsonb(NEW.status = 'concluida')) ORDER BY ordinality)
          FROM jsonb_array_elements(COALESCE(checklist->'items', '[]'::jsonb)) WITH ORDINALITY source(item, ordinality)
        ), '[]'::jsonb)) ELSE checklist END ORDER BY ordinality
    ) INTO v_checklists
    FROM public.leads lead,
      jsonb_array_elements(lead.crm_checklists) WITH ORDINALITY source(checklist, ordinality)
    WHERE lead.id = NEW.lead_id;
    IF v_checklists IS NOT NULL THEN
      UPDATE public.leads SET crm_checklists = v_checklists
      WHERE id = NEW.lead_id AND crm_checklists IS DISTINCT FROM v_checklists;
    END IF;
  END IF;
  IF NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
    PERFORM public.crm_run_automation_event(NEW.lead_id, 'task_completed', format('task:%s:%s:%s', NEW.lead_id, NEW.id, txid_current()), NEW.task_title, 0);
    PERFORM public.crm_run_automation_event(NEW.lead_id, 'all_completed', format('all:%s:%s', NEW.lead_id, txid_current()), NULL, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_guard_stage_advance_trigger ON public.leads;
CREATE TRIGGER crm_guard_stage_advance_trigger BEFORE UPDATE OF stage_id ON public.leads
  FOR EACH ROW WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id) EXECUTE FUNCTION public.crm_guard_stage_advance();

DROP TRIGGER IF EXISTS crm_trigger_stage_automations_insert ON public.leads;
CREATE TRIGGER crm_trigger_stage_automations_insert AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_trigger_stage_automations();

DROP TRIGGER IF EXISTS crm_trigger_stage_automations_update ON public.leads;
CREATE TRIGGER crm_trigger_stage_automations_update AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id) EXECUTE FUNCTION public.crm_trigger_stage_automations();

DROP TRIGGER IF EXISTS crm_sync_checklist_tasks_trigger ON public.leads;
CREATE TRIGGER crm_sync_checklist_tasks_trigger AFTER UPDATE OF crm_checklists ON public.leads
  FOR EACH ROW WHEN (OLD.crm_checklists IS DISTINCT FROM NEW.crm_checklists) EXECUTE FUNCTION public.crm_sync_checklist_tasks();

DROP TRIGGER IF EXISTS crm_sync_task_checklist_and_automations_trigger ON public.service_orders;
CREATE TRIGGER crm_sync_task_checklist_and_automations_trigger AFTER UPDATE OF status ON public.service_orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.crm_sync_task_checklist_and_automations();

ALTER TABLE public.crm_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_automation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_crm_automation_rules" ON public.crm_automation_rules;
CREATE POLICY "service_role_full_access_crm_automation_rules" ON public.crm_automation_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users view accessible crm automation rules" ON public.crm_automation_rules;
CREATE POLICY "Users view accessible crm automation rules" ON public.crm_automation_rules
  FOR SELECT TO authenticated USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_access_pipeline(pipeline_id, auth.uid())
  );
DROP POLICY IF EXISTS "System managers manage crm automation rules" ON public.crm_automation_rules;
CREATE POLICY "System managers manage crm automation rules" ON public.crm_automation_rules
  FOR ALL TO authenticated USING (
    public.is_super_admin(auth.uid()) OR (
      public.can_manage_system(auth.uid())
      AND company_id = public.get_user_company_id(auth.uid())
      AND public.can_access_pipeline(pipeline_id, auth.uid())
    )
  ) WITH CHECK (
    public.is_super_admin(auth.uid()) OR (
      public.can_manage_system(auth.uid())
      AND company_id = public.get_user_company_id(auth.uid())
      AND public.can_access_pipeline(pipeline_id, auth.uid())
    )
  );
DROP POLICY IF EXISTS "service_role_full_access_crm_automation_executions" ON public.crm_automation_executions;
CREATE POLICY "service_role_full_access_crm_automation_executions" ON public.crm_automation_executions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Users view own crm automation executions" ON public.crm_automation_executions;
CREATE POLICY "Users view own crm automation executions" ON public.crm_automation_executions
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_automation_rules TO authenticated, service_role;
GRANT SELECT ON public.crm_automation_executions TO authenticated;
GRANT ALL ON public.crm_automation_executions TO service_role;
REVOKE ALL ON public.crm_automation_rules, public.crm_automation_executions FROM anon;
REVOKE TRUNCATE ON public.crm_automation_rules, public.crm_automation_executions FROM authenticated;

REVOKE ALL ON FUNCTION public.crm_automation_actions_valid(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_stage_requirements_valid(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_automation_actions_valid(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_stage_requirements_valid(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_validate_automation_rule_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_expand_automation_text(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_automation_due_date(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_stage_missing_requirements(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_stage_missing_requirements(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_assert_stage_ready(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_create_automation_task(uuid, public.leads, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_run_automation_event(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_guard_stage_advance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_trigger_stage_automations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sync_checklist_tasks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_sync_task_checklist_and_automations() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.crm_automation_rules IS 'Automações do CRM por empresa, funil e etapa; novas regras nascem pausadas.';
COMMENT ON COLUMN public.crm_stages.requirements IS 'Requisitos opcionais para sair da etapa. Objeto vazio preserva o comportamento legado.';
COMMENT ON COLUMN public.service_orders.crm_checklist_id IS 'Checklist snapshot do lead vinculado à tarefa; sincronização bidirecional por trigger.';

-- Rollback funcional imediato: UPDATE crm_automation_rules SET enabled=false.
-- Rollback do bloqueio: DROP TRIGGER crm_guard_stage_advance_trigger ON leads.
-- Não apagar tabelas/colunas com dados gerados em rollback emergencial.

COMMIT;

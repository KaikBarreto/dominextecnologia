-- Protege respostas preenchidas ao reduzir o escopo da OS e permite que a
-- conversão de orçamento já distribua cada serviço entre os equipamentos.

BEGIN;

CREATE OR REPLACE FUNCTION public.preview_service_order_scope_removal(
  _service_order_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_contract_id uuid;
  v_answers integer := 0;
  v_checklists integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT company_id, contract_id INTO v_company, v_contract_id
    FROM public.service_orders WHERE id = _service_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço não encontrada'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR v_company = public.get_user_company_id(v_uid)) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem de serviço';
  END IF;
  IF NOT (
    public.is_super_admin(v_uid) OR public.can_edit_os(v_uid)
    OR public.is_admin_or_gestor(v_uid) OR public.has_full_permissions(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
       WHERE up.user_id = v_uid AND up.is_active = true
         AND (up.permissions ? '*' OR up.permissions @> '"fn:edit_os"'::jsonb)
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta ordem de serviço';
  END IF;

  -- Em OS contratual o histórico é regido pelo plano/itens do contrato e a RPC
  -- consolidada deliberadamente nunca remove respostas.
  IF v_contract_id IS NOT NULL THEN
    RETURN jsonb_build_object('answered_responses', 0, 'checklists', 0, 'contract_protected', true);
  END IF;

  DROP TABLE IF EXISTS pg_temp._desired_scope_preview;
  CREATE TEMP TABLE _desired_scope_preview (equipment_id uuid, form_template_id uuid) ON COMMIT DROP;
  INSERT INTO _desired_scope_preview (equipment_id, form_template_id)
  SELECT NULLIF(item->>'equipment_id', '')::uuid, template_id::uuid
    FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) item
    LEFT JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(item->'form_template_ids') = 'array'
                AND jsonb_array_length(item->'form_template_ids') > 0
           THEN item->'form_template_ids' ELSE '[null]'::jsonb END
    ) template_id ON true;

  WITH removed AS (
    SELECT soe.equipment_id, soe.form_template_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = _service_order_id
       AND soe.form_template_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM _desired_scope_preview desired
          WHERE desired.equipment_id IS NOT DISTINCT FROM soe.equipment_id
            AND desired.form_template_id IS NOT DISTINCT FROM soe.form_template_id
       )
  )
  SELECT count(DISTINCT (r.equipment_id, r.form_template_id)), count(fr.id)
    INTO v_checklists, v_answers
    FROM removed r
    LEFT JOIN public.form_questions fq ON fq.template_id = r.form_template_id
    LEFT JOIN public.form_responses fr
      ON fr.service_order_id = _service_order_id
     AND fr.equipment_id IS NOT DISTINCT FROM r.equipment_id
     AND fr.question_id = fq.id;

  RETURN jsonb_build_object(
    'answered_responses', COALESCE(v_answers, 0),
    'checklists', COALESCE(v_checklists, 0),
    'contract_protected', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_service_order_scope_removal(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_service_order_scope_removal(uuid, jsonb) TO authenticated, service_role;

DROP FUNCTION public.sync_service_order_scope_with_services(uuid, jsonb);

CREATE FUNCTION public.sync_service_order_scope_with_services(
  _service_order_id uuid,
  _items jsonb,
  _confirm_response_deletion boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_scope jsonb;
  v_services jsonb;
  v_preview jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT company_id INTO v_company FROM public.service_orders WHERE id = _service_order_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Ordem de serviço não encontrada'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR v_company = public.get_user_company_id(v_uid)) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem de serviço';
  END IF;

  v_preview := public.preview_service_order_scope_removal(_service_order_id, _items);
  IF COALESCE((v_preview->>'answered_responses')::integer, 0) > 0
     AND NOT _confirm_response_deletion THEN
    RAISE EXCEPTION 'SCOPE_RESPONSES_REQUIRE_CONFIRMATION|%|%',
      v_preview->>'answered_responses', v_preview->>'checklists';
  END IF;

  DROP TABLE IF EXISTS pg_temp._desired_equipment_services;
  CREATE TEMP TABLE _desired_equipment_services (
    equipment_id uuid NOT NULL, service_type_id uuid NOT NULL, position integer NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _desired_equipment_services (equipment_id, service_type_id, position)
  SELECT NULLIF(item.value->>'equipment_id', '')::uuid,
         service.value::uuid, service.ordinality::integer - 1
    FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) WITH ORDINALITY item(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(item.value->'service_type_ids') = 'array'
           THEN item.value->'service_type_ids' ELSE '[]'::jsonb END
    ) WITH ORDINALITY service(value, ordinality)
   WHERE NULLIF(item.value->>'equipment_id', '') IS NOT NULL;

  DROP TABLE IF EXISTS pg_temp._desired_equipment_services_dedup;
  CREATE TEMP TABLE _desired_equipment_services_dedup ON COMMIT DROP AS
    SELECT equipment_id, service_type_id, min(position)::integer position
      FROM _desired_equipment_services GROUP BY equipment_id, service_type_id;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) item
    LEFT JOIN public.equipment e ON e.id = NULLIF(item->>'equipment_id', '')::uuid
    WHERE NULLIF(item->>'equipment_id', '') IS NOT NULL
      AND (e.id IS NULL OR e.company_id IS DISTINCT FROM v_company)
  ) THEN RAISE EXCEPTION 'Equipamento inválido para esta empresa'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) item
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(item->'form_template_ids') = 'array'
           THEN item->'form_template_ids' ELSE '[]'::jsonb END
    ) template_id(value)
    LEFT JOIN public.form_templates ft ON ft.id = template_id.value::uuid
    WHERE ft.id IS NULL OR ft.company_id IS DISTINCT FROM v_company
  ) THEN RAISE EXCEPTION 'Checklist inválido para esta empresa'; END IF;

  IF EXISTS (
    SELECT 1 FROM _desired_equipment_services_dedup desired
    LEFT JOIN public.service_order_service_types sost
      ON sost.service_order_id = _service_order_id
     AND sost.service_type_id = desired.service_type_id
     AND sost.company_id = v_company
    WHERE sost.service_type_id IS NULL
  ) THEN RAISE EXCEPTION 'Serviço do equipamento não pertence a esta ordem de serviço'; END IF;

  v_scope := public.sync_service_order_scope(_service_order_id, _items);

  DELETE FROM public.service_order_equipment_service_types current
   WHERE current.service_order_id = _service_order_id
     AND NOT EXISTS (
       SELECT 1 FROM _desired_equipment_services_dedup desired
        WHERE desired.equipment_id = current.equipment_id
          AND desired.service_type_id = current.service_type_id
     );

  INSERT INTO public.service_order_equipment_service_types
    (service_order_id, equipment_id, service_type_id, company_id, position)
  SELECT _service_order_id, equipment_id, service_type_id, v_company, position
    FROM _desired_equipment_services_dedup
  ON CONFLICT (service_order_id, equipment_id, service_type_id)
  DO UPDATE SET position = EXCLUDED.position;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'equipment_id', equipment_id, 'service_type_id', service_type_id, 'position', position
  ) ORDER BY equipment_id, position, service_type_id), '[]'::jsonb)
  INTO v_services FROM public.service_order_equipment_service_types
  WHERE service_order_id = _service_order_id;

  RETURN v_scope || jsonb_build_object('equipment_services', v_services);
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_service_order_scope_with_services(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_service_order_scope_with_services(uuid, jsonb, boolean) TO authenticated, service_role;

DROP FUNCTION public.generate_service_order_from_quote(uuid);

CREATE FUNCTION public.generate_service_order_from_quote(
  p_quote_id uuid,
  p_equipment_services jsonb DEFAULT '[]'::jsonb
)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_quote public.quotes%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_service_type_id uuid;
  v_services numeric(14,2) := 0;
  v_materials numeric(14,2) := 0;
  v_items_total numeric(14,2) := 0;
  v_final_total numeric(14,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(v_user_id) OR public.is_admin_or_gestor(v_user_id)
          OR public.user_has_permission(v_user_id, 'fn:create_os')) THEN
    RAISE EXCEPTION 'Sem permissão para gerar uma ordem de serviço.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote FROM public.quotes q
   WHERE q.id = p_quote_id
     AND (public.is_super_admin(v_user_id)
          OR (q.company_id = public.get_user_company_id(v_user_id)
              AND public.tenant_subscription_allows_access(q.company_id)))
   FOR UPDATE;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Orçamento não encontrado ou sem permissão.'; END IF;
  IF v_quote.converted_to_os_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.service_orders WHERE id = v_quote.converted_to_os_id;
    IF v_order.id IS NOT NULL THEN RETURN v_order; END IF;
  END IF;
  IF v_quote.status <> 'aprovado' THEN RAISE EXCEPTION 'Apenas orçamentos aprovados podem gerar uma OS.'; END IF;
  IF jsonb_typeof(COALESCE(p_equipment_services, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'A distribuição de serviços precisa ser uma lista.';
  END IF;
  IF v_quote.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = v_quote.customer_id AND c.company_id = v_quote.company_id
  ) THEN RAISE EXCEPTION 'O cliente do orçamento não pertence a esta empresa.'; END IF;

  DROP TABLE IF EXISTS pg_temp._quote_distribution;
  CREATE TEMP TABLE _quote_distribution (equipment_id uuid, service_type_id uuid) ON COMMIT DROP;
  INSERT INTO _quote_distribution (equipment_id, service_type_id)
  SELECT NULLIF(item->>'equipment_id', '')::uuid, NULLIF(service_id, '')::uuid
    FROM jsonb_array_elements(COALESCE(p_equipment_services, '[]'::jsonb)) item
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(item->'service_type_ids') = 'array'
           THEN item->'service_type_ids' ELSE '[]'::jsonb END
    ) service_id;
  DELETE FROM _quote_distribution a USING _quote_distribution b
   WHERE a.ctid > b.ctid AND a.equipment_id = b.equipment_id AND a.service_type_id = b.service_type_id;

  IF EXISTS (
    SELECT 1 FROM _quote_distribution d LEFT JOIN public.equipment e ON e.id = d.equipment_id
     WHERE e.id IS NULL OR e.company_id IS DISTINCT FROM v_quote.company_id
        OR e.customer_id IS DISTINCT FROM v_quote.customer_id
  ) THEN RAISE EXCEPTION 'Um equipamento não pertence ao cliente deste orçamento.'; END IF;
  IF EXISTS (
    SELECT 1 FROM _quote_distribution d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.quote_items qi
        WHERE qi.quote_id = v_quote.id AND qi.service_type_id = d.service_type_id
     )
  ) THEN RAISE EXCEPTION 'Um serviço distribuído não pertence a este orçamento.'; END IF;
  IF EXISTS (SELECT 1 FROM _quote_distribution) AND EXISTS (
    SELECT 1 FROM public.quote_items qi
     WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM _quote_distribution d WHERE d.service_type_id = qi.service_type_id)
  ) THEN RAISE EXCEPTION 'Distribua todos os serviços do orçamento antes de gerar a OS.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM _quote_distribution)
     AND EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL)
     AND EXISTS (
       SELECT 1 FROM public.equipment e
        WHERE e.company_id = v_quote.company_id AND e.customer_id = v_quote.customer_id
     ) THEN
    RAISE EXCEPTION 'Distribua os serviços entre os equipamentos antes de gerar a OS.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id
      AND qi.service_type_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.service_types st WHERE st.id = qi.service_type_id AND st.company_id = v_quote.company_id)
  ) THEN RAISE EXCEPTION 'Um dos serviços do orçamento não pertence a esta empresa.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id
      AND qi.inventory_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.id = qi.inventory_id AND i.company_id = v_quote.company_id)
  ) THEN RAISE EXCEPTION 'Um dos materiais do orçamento não pertence a esta empresa.'; END IF;

  SELECT qi.service_type_id INTO v_service_type_id FROM public.quote_items qi
   WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
   ORDER BY qi.position, qi.created_at LIMIT 1;
  SELECT COALESCE(SUM(total_price) FILTER (WHERE item_type IN ('servico','mao_de_obra')),0),
         COALESCE(SUM(total_price) FILTER (WHERE item_type='material'),0), COALESCE(SUM(total_price),0)
    INTO v_services, v_materials, v_items_total FROM public.quote_items WHERE quote_id = v_quote.id;
  v_final_total := COALESCE(v_quote.total_price, v_quote.total_value, v_items_total, 0);

  INSERT INTO public.service_orders
    (company_id, customer_id, equipment_id, service_type_id, status, labor_value, parts_value,
     total_value, description, notes, quote_id, created_by)
  VALUES
    (v_quote.company_id, v_quote.customer_id,
     (SELECT equipment_id FROM _quote_distribution ORDER BY equipment_id LIMIT 1),
     v_service_type_id, 'agendada', v_services, v_materials, v_final_total,
     format('Gerada do Orçamento #%s', v_quote.quote_number), v_quote.notes, v_quote.id, v_user_id)
  RETURNING * INTO v_order;

  INSERT INTO public.service_order_budget_items
    (service_order_id, company_id, position, item_type, description, details, quantity,
     unit_price, total_price, inventory_id, service_type_id, source_quote_item_id)
  SELECT v_order.id, v_quote.company_id, qi.position,
         CASE WHEN qi.item_type IN ('servico','mao_de_obra','material') THEN qi.item_type ELSE 'servico' END,
         qi.description, qi.details, qi.quantity, qi.unit_price, ROUND(qi.quantity * qi.unit_price,2),
         qi.inventory_id, qi.service_type_id, qi.id
    FROM public.quote_items qi WHERE qi.quote_id = v_quote.id ORDER BY qi.position, qi.created_at;

  INSERT INTO public.service_order_service_types (service_order_id, service_type_id, company_id, position)
  SELECT v_order.id, qi.service_type_id, v_quote.company_id,
         ROW_NUMBER() OVER (ORDER BY MIN(qi.position), qi.service_type_id)::integer - 1
    FROM public.quote_items qi WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
   GROUP BY qi.service_type_id;

  INSERT INTO public.service_order_equipment_service_types
    (service_order_id, equipment_id, service_type_id, company_id, position)
  SELECT v_order.id, d.equipment_id, d.service_type_id, v_quote.company_id,
         ROW_NUMBER() OVER (PARTITION BY d.equipment_id ORDER BY sost.position, d.service_type_id)::integer - 1
    FROM _quote_distribution d
    JOIN public.service_order_service_types sost
      ON sost.service_order_id = v_order.id AND sost.service_type_id = d.service_type_id;

  -- Um checklist ativo ligado a qualquer serviço daquele equipamento é aplicado
  -- uma única vez. Sem checklist vinculado, mantém o equipamento no escopo.
  INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
  SELECT DISTINCT v_order.id, d.equipment_id, ftst.template_id
    FROM _quote_distribution d
    JOIN public.form_template_service_types ftst ON ftst.service_type_id = d.service_type_id
    JOIN public.form_templates ft ON ft.id = ftst.template_id
   WHERE ft.company_id = v_quote.company_id AND ft.is_active = true;
  INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
  SELECT DISTINCT v_order.id, d.equipment_id, NULL
    FROM _quote_distribution d
   WHERE NOT EXISTS (
     SELECT 1 FROM public.service_order_equipment soe
      WHERE soe.service_order_id = v_order.id AND soe.equipment_id = d.equipment_id
   );

  UPDATE public.quotes SET converted_to_os_id = v_order.id, status = 'convertido' WHERE id = v_quote.id;
  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.preview_service_order_scope_removal(uuid, jsonb) IS
  'Informa quantas respostas seriam removidas por uma alteração de escopo; OS de contrato nunca apaga histórico.';
COMMENT ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) IS
  'Gera OS idempotente do orçamento, distribui serviços por equipamento e aplica checklists ativos vinculados.';

COMMIT;

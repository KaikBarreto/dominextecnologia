BEGIN;

-- Uma OS vinculada manualmente continua com a origem original. O par
-- contract_reference_date + contract_visit_customized_at e o marcador que a
-- transforma em ocorrencia protegida do cronograma.
CREATE OR REPLACE FUNCTION public.guard_contract_visit_customization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_contract_customer_id uuid;
  v_old_id uuid;
  v_is_occurrence boolean;
BEGIN
  v_old_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END;

  IF NEW.contract_id IS NULL THEN
    NEW.contract_reference_date := NULL;
    NEW.contract_visit_customized_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.contract_id IS NOT NULL
     AND OLD.origin = 'contract'
     AND NEW.origin IS DISTINCT FROM 'contract' THEN
    RAISE EXCEPTION 'contract_visit_origin_immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Chamado do portal pode carregar contract_id apenas como contexto. Ele so
  -- vira ocorrencia quando a RPC abaixo grava referencia + carimbo.
  v_is_occurrence := NEW.origin = 'contract'
    OR (NEW.contract_reference_date IS NOT NULL AND NEW.contract_visit_customized_at IS NOT NULL);
  IF NOT v_is_occurrence THEN
    RETURN NEW;
  END IF;

  SELECT c.customer_id
    INTO v_contract_customer_id
    FROM public.contracts c
   WHERE c.id = NEW.contract_id;

  IF v_contract_customer_id IS NULL OR NEW.customer_id IS DISTINCT FROM v_contract_customer_id THEN
    RAISE EXCEPTION 'contract_service_order_customer_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.origin = 'contract' THEN
    NEW.contract_reference_date := COALESCE(NEW.contract_reference_date, NEW.scheduled_date);

    IF TG_OP = 'UPDATE' AND OLD.contract_id IS NOT NULL AND NEW.contract_id = OLD.contract_id THEN
      NEW.contract_reference_date := COALESCE(OLD.contract_reference_date, OLD.scheduled_date);
      IF OLD.contract_visit_customized_at IS NOT NULL THEN
        NEW.contract_visit_customized_at := OLD.contract_visit_customized_at;
      ELSIF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
         OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
         OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
         OR NEW.schedule_plan IS DISTINCT FROM OLD.schedule_plan
         OR NEW.technician_id IS DISTINCT FROM OLD.technician_id
         OR NEW.team_id IS DISTINCT FROM OLD.team_id
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.notes IS DISTINCT FROM OLD.notes
         OR NEW.equipment_id IS DISTINCT FROM OLD.equipment_id
         OR NEW.service_type_id IS DISTINCT FROM OLD.service_type_id
         OR NEW.form_template_id IS DISTINCT FROM OLD.form_template_id
         OR NEW.require_tech_signature IS DISTINCT FROM OLD.require_tech_signature
         OR NEW.require_client_signature IS DISTINCT FROM OLD.require_client_signature THEN
        NEW.contract_visit_customized_at := COALESCE(NEW.contract_visit_customized_at, now());
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.contract_id = NEW.contract_id
        AND OLD.contract_reference_date IS NOT NULL
        AND OLD.contract_visit_customized_at IS NOT NULL THEN
    -- Depois de vinculada, a competencia e o carimbo sao monotonicos. Uma
    -- futura troca de competencia devera passar por RPC propria e auditavel.
    NEW.contract_reference_date := OLD.contract_reference_date;
    NEW.contract_visit_customized_at := OLD.contract_visit_customized_at;
  END IF;

  -- Regeneracao pode coexistir temporariamente com a visita automatica antiga,
  -- pois cria antes de apagar. O que nunca pode coexistir e uma visita manual
  -- protegida e outra ocorrencia para a mesma competencia.
  IF NEW.contract_reference_date IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.service_orders other
     WHERE other.contract_id = NEW.contract_id
       AND other.contract_reference_date = NEW.contract_reference_date
       AND other.id IS DISTINCT FROM v_old_id
       AND (
         (NEW.origin IS DISTINCT FROM 'contract' AND (
            other.origin = 'contract'
            OR other.contract_visit_customized_at IS NOT NULL
         ))
         OR (NEW.origin = 'contract'
             AND other.origin IS DISTINCT FROM 'contract'
             AND other.contract_visit_customized_at IS NOT NULL)
       )
  ) THEN
    RAISE EXCEPTION 'contract_period_occupied'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_contract_visit_customization ON public.service_orders;
CREATE TRIGGER trg_guard_contract_visit_customization
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_contract_visit_customization();

CREATE OR REPLACE FUNCTION public.link_service_order_to_contract(
  p_service_order_id uuid,
  p_contract_id uuid,
  p_reference_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_customer_id uuid;
  v_contract_status text;
  v_order public.service_orders%ROWTYPE;
  v_placeholder public.service_orders%ROWTYPE;
  v_has_execution boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'link_not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reference_date IS NULL THEN
    RAISE EXCEPTION 'contract_period_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_contract_id::text, 0));

  SELECT c.company_id, c.customer_id, c.status::text
    INTO v_company_id, v_customer_id, v_contract_status
    FROM public.contracts c
   WHERE c.id = p_contract_id
   FOR UPDATE;

  -- Mesmo retorno para contrato inexistente ou de outro tenant: evita oracle.
  IF v_company_id IS NULL OR (
       NOT public.is_super_admin(v_uid)
       AND public.get_user_company_id(v_uid) IS DISTINCT FROM v_company_id
     ) THEN
    RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.can_manage_contracts(v_uid)) THEN
    RAISE EXCEPTION 'link_not_allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_contract_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'contract_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  SELECT * INTO v_order
    FROM public.service_orders so
   WHERE so.id = p_service_order_id
   FOR UPDATE;

  IF v_order.id IS NULL OR v_order.company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_order.customer_id IS DISTINCT FROM v_customer_id THEN
    RAISE EXCEPTION 'service_order_customer_mismatch' USING ERRCODE = 'check_violation';
  END IF;
  IF v_order.origin = 'contract' THEN
    RAISE EXCEPTION 'service_order_generated_by_contract' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_order.contract_id IS NOT NULL AND v_order.contract_id IS DISTINCT FROM p_contract_id THEN
    RAISE EXCEPTION 'service_order_already_linked' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_order.contract_id = p_contract_id
     AND v_order.contract_reference_date = p_reference_date
     AND v_order.contract_visit_customized_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'service_order_id', v_order.id,
      'contract_id', p_contract_id,
      'reference_date', p_reference_date,
      'already_linked', true
    );
  END IF;

  -- Uma competencia ja ocupada por outra OS vinculada nunca e sobrescrita.
  IF EXISTS (
    SELECT 1 FROM public.service_orders so
     WHERE so.contract_id = p_contract_id
       AND so.contract_reference_date = p_reference_date
       AND so.id <> p_service_order_id
       AND so.origin IS DISTINCT FROM 'contract'
       AND so.contract_visit_customized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'contract_period_occupied' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_placeholder
    FROM public.service_orders so
   WHERE so.contract_id = p_contract_id
     AND so.contract_reference_date = p_reference_date
     AND so.origin = 'contract'
     AND so.id <> p_service_order_id
   ORDER BY so.created_at
   LIMIT 1
   FOR UPDATE;

  -- A competencia deve existir no cronograma. Isso impede inventar uma data
  -- livre que nao pertence a periodicidade contratual.
  IF v_placeholder.id IS NULL THEN
    RAISE EXCEPTION 'contract_period_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_placeholder.status::text NOT IN ('agendada', 'pendente')
     OR v_placeholder.contract_visit_customized_at IS NOT NULL
     OR v_placeholder.check_in_time IS NOT NULL
     OR v_placeholder.check_out_time IS NOT NULL
     OR v_placeholder.started_at IS NOT NULL
     OR v_placeholder.completed_at IS NOT NULL
     OR NULLIF(btrim(COALESCE(v_placeholder.diagnosis, '')), '') IS NOT NULL
     OR NULLIF(btrim(COALESCE(v_placeholder.solution, '')), '') IS NOT NULL
     OR NULLIF(btrim(COALESCE(v_placeholder.client_signature, '')), '') IS NOT NULL
     OR COALESCE(v_placeholder.parts_used, '[]'::jsonb) <> '[]'::jsonb THEN
    v_has_execution := true;
  END IF;

  IF NOT v_has_execution THEN
    SELECT EXISTS (
      SELECT 1 FROM public.form_responses fr WHERE fr.service_order_id = v_placeholder.id
      UNION ALL SELECT 1 FROM public.os_photos op WHERE op.service_order_id = v_placeholder.id
      UNION ALL SELECT 1 FROM public.service_ratings sr WHERE sr.service_order_id = v_placeholder.id
      UNION ALL SELECT 1 FROM public.service_order_materials som WHERE som.service_order_id = v_placeholder.id
    ) INTO v_has_execution;
  END IF;

  IF v_has_execution THEN
    RAISE EXCEPTION 'contract_period_has_execution' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Remove apenas o placeholder automatico vazio. Os filhos gerados sao
  -- descartados junto; nenhum dado da OS escolhida e alterado ou copiado.
  DELETE FROM public.service_order_assignees  WHERE service_order_id = v_placeholder.id;
  DELETE FROM public.service_order_equipment  WHERE service_order_id = v_placeholder.id;
  DELETE FROM public.form_responses           WHERE service_order_id = v_placeholder.id;
  DELETE FROM public.os_photos                WHERE service_order_id = v_placeholder.id;
  DELETE FROM public.service_ratings          WHERE service_order_id = v_placeholder.id;
  DELETE FROM public.service_order_activities WHERE service_order_id = v_placeholder.id;
  DELETE FROM public.service_orders           WHERE id = v_placeholder.id;

  UPDATE public.service_orders
     SET contract_id = p_contract_id,
         contract_reference_date = p_reference_date,
         contract_visit_customized_at = now()
   WHERE id = p_service_order_id;

  RETURN jsonb_build_object(
    'service_order_id', p_service_order_id,
    'contract_id', p_contract_id,
    'reference_date', p_reference_date,
    'replaced_service_order_id', v_placeholder.id,
    'already_linked', false
  );
END;
$$;

COMMENT ON FUNCTION public.link_service_order_to_contract(uuid, uuid, date) IS
  'Vincula uma OS existente a uma competencia real de contrato ativo, preservando seus dados operacionais e substituindo somente o placeholder automatico ainda vazio.';

REVOKE ALL ON FUNCTION public.guard_contract_visit_customization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_service_order_to_contract(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_service_order_to_contract(uuid, uuid, date) TO authenticated, service_role;

COMMIT;

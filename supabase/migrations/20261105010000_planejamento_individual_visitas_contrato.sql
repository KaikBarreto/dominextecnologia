BEGIN;

-- A data de referencia pertence ao cronograma do contrato; scheduled_date e
-- schedule_plan continuam sendo as datas operacionais, que podem ser movidas.
-- O carimbo de personalizacao impede que uma edicao posterior do contrato
-- apague silenciosamente o planejamento feito diretamente na OS.
ALTER TABLE public.service_orders
  ADD COLUMN contract_reference_date date,
  ADD COLUMN contract_visit_customized_at timestamptz;

UPDATE public.service_orders
   SET contract_reference_date = scheduled_date
 WHERE contract_id IS NOT NULL
   AND origin = 'contract'
   AND contract_reference_date IS NULL;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_contract_customization_requires_contract
  CHECK (contract_visit_customized_at IS NULL OR contract_id IS NOT NULL);

COMMENT ON COLUMN public.service_orders.contract_reference_date IS
  'Data imutavel da visita no cronograma do contrato; independe das datas operacionais da agenda.';
COMMENT ON COLUMN public.service_orders.contract_visit_customized_at IS
  'Carimbo da personalizacao individual da visita; visitas carimbadas nao sao substituidas pela regeneracao do contrato.';

-- Defesa server-side: reagendamentos podem passar pelas RPCs da agenda antes
-- do UPDATE feito pelo hook. O trigger carimba a visita na mesma transacao em
-- que qualquer campo central do planejamento muda e torna referencia/carimbo
-- monotonicos enquanto a OS continuar ligada ao contrato.
CREATE OR REPLACE FUNCTION public.guard_contract_visit_customization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_contract_customer_id uuid;
BEGIN
  IF NEW.contract_id IS NULL THEN
    NEW.contract_reference_date := NULL;
    NEW.contract_visit_customized_at := NULL;
    RETURN NEW;
  END IF;

  IF OLD.contract_id IS NOT NULL AND OLD.origin = 'contract' AND NEW.origin IS DISTINCT FROM 'contract' THEN
    RAISE EXCEPTION 'A origem de uma visita contratual nao pode ser alterada'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Chamados reativos do portal podem carregar contract_id apenas como
  -- contexto. Eles nao sao ocorrencias do cronograma e nao recebem as guardas
  -- de planejamento individual.
  IF NEW.origin IS DISTINCT FROM 'contract' THEN
    RETURN NEW;
  END IF;

  SELECT c.customer_id
    INTO v_contract_customer_id
    FROM public.contracts c
   WHERE c.id = NEW.contract_id;

  IF v_contract_customer_id IS NULL OR NEW.customer_id IS DISTINCT FROM v_contract_customer_id THEN
    RAISE EXCEPTION 'A OS contratual deve permanecer vinculada ao cliente do contrato'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.contract_id IS NOT NULL AND NEW.contract_id = OLD.contract_id THEN
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_contract_visit_customization ON public.service_orders;
CREATE TRIGGER trg_guard_contract_visit_customization
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_contract_visit_customization();

-- Mantem a RPC de regeneracao alinhada ao payload canonico. A funcao continua
-- forçando company_id/contract_id a partir do contrato e agora persiste a data
-- de referencia calculada pelo motor.
CREATE OR REPLACE FUNCTION public.regenerate_contract_visits(
  p_contract_id uuid,
  p_orders      jsonb,
  p_delete_ids  uuid[] DEFAULT '{}',
  p_dry_run     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company_id uuid;
  v_customer_id uuid;
  v_created    integer := 0;
  v_deleted    integer := 0;
  v_requested_delete_count integer := 0;
  v_valid_delete_count integer := 0;
  v_order      jsonb;
  v_os         jsonb;
  v_os_id      uuid;
  v_code       text;
  v_created_orders jsonb := '[]'::jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '120000', true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_contract_id::text, 0));

  SELECT c.company_id, c.customer_id
    INTO v_company_id, v_customer_id
    FROM public.contracts c
   WHERE c.id = p_contract_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Contrato % nao encontrado', p_contract_id USING ERRCODE = 'no_data_found';
  END IF;

  IF auth.uid() IS NULL OR NOT (
        public.is_super_admin(auth.uid())
     OR (
          public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id
          AND public.can_manage_contracts(auth.uid())
        )
  ) THEN
    RAISE EXCEPTION 'Sem permissao para regenerar visitas do contrato %', p_contract_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' THEN
    RAISE EXCEPTION 'A lista de visitas deve ser um array JSON'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_orders) item
    GROUP BY (item#>>'{os,scheduled_date}')
    HAVING count(*) > 1 OR (item#>>'{os,scheduled_date}') IS NULL
  ) THEN
    RAISE EXCEPTION 'A regeneracao contem datas contratuais ausentes ou duplicadas'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A lista capturada pelo cliente pode ficar obsoleta enquanto o usuario
  -- planeja uma visita em outra aba. Rejeitamos a operacao inteira se qualquer
  -- id nao pertencer a este contrato/tenant ou tiver sido personalizado.
  IF COALESCE(cardinality(p_delete_ids), 0) > 0 THEN
    SELECT count(DISTINCT requested.id)
      INTO v_requested_delete_count
      FROM unnest(p_delete_ids) AS requested(id);

    PERFORM 1
      FROM public.service_orders so
     WHERE so.id = ANY(p_delete_ids)
     FOR UPDATE;

    SELECT count(*)
      INTO v_valid_delete_count
      FROM public.service_orders so
     WHERE so.id = ANY(p_delete_ids)
       AND so.contract_id = p_contract_id
       AND so.company_id = v_company_id
       AND so.origin = 'contract'
       AND so.contract_visit_customized_at IS NULL
       AND so.status IN ('agendada'::public.os_status, 'pendente'::public.os_status);

    IF v_valid_delete_count <> v_requested_delete_count THEN
      RAISE EXCEPTION 'A lista de visitas a substituir mudou ou contem itens invalidos'
        USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;

  IF p_orders IS NOT NULL AND jsonb_typeof(p_orders) = 'array' THEN
    FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
    LOOP
      v_os := v_order->'os';

      IF v_os IS NULL OR jsonb_typeof(v_os) <> 'object' OR NULLIF(v_os->>'scheduled_date', '') IS NULL THEN
        RAISE EXCEPTION 'Visita contratual sem payload ou data valida'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

      IF NULLIF(v_os->>'equipment_id','') IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.contract_items ci
          JOIN public.equipment eq ON eq.id = ci.equipment_id
         WHERE ci.contract_id = p_contract_id
           AND ci.equipment_id = NULLIF(v_os->>'equipment_id','')::uuid
           AND eq.company_id = v_company_id
           AND eq.customer_id = v_customer_id
      ) THEN
        RAISE EXCEPTION 'Equipamento principal fora do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NULLIF(v_os->>'technician_id','') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.user_id = NULLIF(v_os->>'technician_id','')::uuid
           AND p.company_id = v_company_id
           AND p.is_active = true
      ) THEN
        RAISE EXCEPTION 'Tecnico fora da empresa do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NULLIF(v_os->>'team_id','') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.teams t
         WHERE t.id = NULLIF(v_os->>'team_id','')::uuid
           AND t.company_id = v_company_id
      ) THEN
        RAISE EXCEPTION 'Equipe fora da empresa do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NULLIF(v_os->>'service_type_id','') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.service_types st
         WHERE st.id = NULLIF(v_os->>'service_type_id','')::uuid
           AND st.company_id = v_company_id
      ) THEN
        RAISE EXCEPTION 'Tipo de servico fora da empresa do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF NULLIF(v_os->>'form_template_id','') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.form_templates ft
         WHERE ft.id = NULLIF(v_os->>'form_template_id','')::uuid
           AND ft.company_id = v_company_id
      ) THEN
        RAISE EXCEPTION 'Checklist fora da empresa do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_order->'equipment','[]'::jsonb)) e
         WHERE NOT EXISTS (
           SELECT 1
             FROM public.contract_items ci
             JOIN public.equipment eq ON eq.id = ci.equipment_id
            WHERE ci.contract_id = p_contract_id
              AND ci.equipment_id = NULLIF(e->>'equipment_id','')::uuid
              AND eq.company_id = v_company_id
              AND eq.customer_id = v_customer_id
         )
            OR (NULLIF(e->>'form_template_id','') IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM public.form_templates ft
               WHERE ft.id = NULLIF(e->>'form_template_id','')::uuid
                 AND ft.company_id = v_company_id
            ))
      ) THEN
        RAISE EXCEPTION 'Escopo de equipamento/checklist fora do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_order->'assignees','[]'::jsonb)) u
         WHERE NOT EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.user_id = (u#>>'{}')::uuid
              AND p.company_id = v_company_id
              AND p.is_active = true
         )
      ) THEN
        RAISE EXCEPTION 'Responsavel fora da empresa do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF EXISTS (
        SELECT 1
          FROM jsonb_array_elements(COALESCE(v_order->'activities','[]'::jsonb)) a
         WHERE (NULLIF(a->>'plan_activity_id','') IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM public.contract_plan_activities cpa
                   WHERE cpa.id = NULLIF(a->>'plan_activity_id','')::uuid
                     AND cpa.contract_id = p_contract_id
                     AND cpa.company_id = v_company_id
               ))
            OR (NULLIF(a->>'equipment_id','') IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM public.contract_items ci
                   WHERE ci.contract_id = p_contract_id
                     AND ci.equipment_id = NULLIF(a->>'equipment_id','')::uuid
               ))
            OR (NULLIF(a->>'form_template_id','') IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM public.form_templates ft
                   WHERE ft.id = NULLIF(a->>'form_template_id','')::uuid
                     AND ft.company_id = v_company_id
               ))
      ) THEN
        RAISE EXCEPTION 'Atividade fora do escopo do contrato'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.service_orders (
        company_id, customer_id, equipment_id, technician_id, team_id, os_type,
        service_type_id, form_template_id, scheduled_date, scheduled_time,
        contract_reference_date, description, require_tech_signature, status,
        contract_id, origin, created_by
      )
      VALUES (
        v_company_id,
        v_customer_id,
        NULLIF(v_os->>'equipment_id','')::uuid,
        NULLIF(v_os->>'technician_id','')::uuid,
        NULLIF(v_os->>'team_id','')::uuid,
        'manutencao_preventiva'::public.os_type,
        NULLIF(v_os->>'service_type_id','')::uuid,
        NULLIF(v_os->>'form_template_id','')::uuid,
        (v_os->>'scheduled_date')::date,
        COALESCE(v_os->>'scheduled_time','08:00')::time,
        COALESCE(NULLIF(v_os->>'contract_reference_date',''), v_os->>'scheduled_date')::date,
        v_os->>'description',
        COALESCE((v_os->>'require_tech_signature')::boolean, true),
        'agendada'::public.os_status,
        p_contract_id,
        'contract',
        auth.uid()
      )
      RETURNING id INTO v_os_id;

      v_created_orders := v_created_orders || jsonb_build_array(jsonb_build_object(
        'id', v_os_id,
        'preserve_code', NULLIF(v_order->>'preserve_code','')
      ));

      INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
      SELECT v_os_id, NULLIF(e->>'equipment_id','')::uuid, NULLIF(e->>'form_template_id','')::uuid
      FROM jsonb_array_elements(COALESCE(v_order->'equipment','[]'::jsonb)) AS e;

      INSERT INTO public.service_order_assignees (service_order_id, user_id)
      SELECT v_os_id, (u#>>'{}')::uuid
      FROM jsonb_array_elements(COALESCE(v_order->'assignees','[]'::jsonb)) AS u;

      INSERT INTO public.service_order_activities (
        company_id, service_order_id, plan_activity_id, equipment_id, section,
        component, description, guidance, freq_code, is_measurement, unit,
        expected_min, expected_max, form_template_id, sort_order
      )
      SELECT
        v_company_id, v_os_id,
        NULLIF(a->>'plan_activity_id','')::uuid,
        NULLIF(a->>'equipment_id','')::uuid,
        NULLIF(a->>'section',''),
        NULLIF(a->>'component',''),
        a->>'description',
        NULLIF(a->>'guidance',''),
        NULLIF(a->>'freq_code',''),
        COALESCE((a->>'is_measurement')::boolean, false),
        NULLIF(a->>'unit',''),
        NULLIF(a->>'expected_min','')::numeric,
        NULLIF(a->>'expected_max','')::numeric,
        NULLIF(a->>'form_template_id','')::uuid,
        COALESCE((a->>'sort_order')::integer, 0)
      FROM jsonb_array_elements(COALESCE(v_order->'activities','[]'::jsonb)) AS a;

      v_created := v_created + 1;
    END LOOP;
  END IF;

  IF array_length(p_delete_ids, 1) IS NOT NULL THEN
    DELETE FROM public.service_order_assignees  WHERE service_order_id = ANY(p_delete_ids);
    DELETE FROM public.service_order_equipment  WHERE service_order_id = ANY(p_delete_ids);
    DELETE FROM public.form_responses           WHERE service_order_id = ANY(p_delete_ids);
    DELETE FROM public.os_photos                WHERE service_order_id = ANY(p_delete_ids);
    DELETE FROM public.service_ratings          WHERE service_order_id = ANY(p_delete_ids);
    DELETE FROM public.service_order_activities WHERE service_order_id = ANY(p_delete_ids);
    DELETE FROM public.service_orders           WHERE id = ANY(p_delete_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  IF jsonb_array_length(v_created_orders) > 0 THEN
    FOR v_order IN SELECT value FROM jsonb_array_elements(v_created_orders)
    LOOP
      v_code := NULLIF(v_order->>'preserve_code','');
      IF v_code IS NOT NULL THEN
        UPDATE public.service_orders
        SET public_short_code = v_code
        WHERE id = (v_order->>'id')::uuid
          AND contract_id = p_contract_id
          AND public_short_code IS NULL;
      END IF;
    END LOOP;
  END IF;

  IF p_dry_run THEN
    RAISE EXCEPTION 'DRY_RUN_ROLLBACK'
      USING ERRCODE = 'raise_exception',
            DETAIL = jsonb_build_object('created_count', v_created, 'deleted_count', v_deleted)::text;
  END IF;

  RETURN jsonb_build_object('created_count', v_created, 'deleted_count', v_deleted);
END;
$$;

COMMENT ON FUNCTION public.regenerate_contract_visits(uuid, jsonb, uuid[], boolean) IS
  'Regenera atomicamente visitas nao personalizadas; persiste a data de referencia contratual e preserva as guardas de posse do tenant.';

REVOKE ALL ON FUNCTION public.guard_contract_visit_customization() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.regenerate_contract_visits(uuid, jsonb, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_contract_visits(uuid, jsonb, uuid[], boolean) TO authenticated, service_role;

COMMIT;

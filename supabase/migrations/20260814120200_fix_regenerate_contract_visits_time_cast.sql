-- =============================================================================
-- Fix: cast text→time em scheduled_time na RPC regenerate_contract_visits.
--
-- A coluna service_orders.scheduled_time é do tipo `time`. A versão anterior
-- inseria COALESCE(v_os->>'scheduled_time','08:00') como TEXT sem cast, o que
-- falhava em runtime ("column is of type time but expression is of type text").
-- O types.ts representa a coluna como string (representação da API), por isso o
-- review estático não pegou; um dry_run em prod expôs. A RPC nunca chegou a ser
-- usada (feature flag OFF), então não houve impacto. Aqui só re-cria a função
-- com o cast ::time; todo o resto é idêntico à 20260814120100.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.regenerate_contract_visits(
  p_contract_id uuid,
  p_orders      jsonb,
  p_delete_ids  uuid[] DEFAULT '{}',
  p_dry_run     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_created    integer := 0;
  v_deleted    integer := 0;
  v_order      jsonb;
  v_os         jsonb;
  v_os_id      uuid;
  v_code       text;
BEGIN
  PERFORM set_config('statement_timeout', '120000', true);  -- 120s, LOCAL à transação

  SELECT c.company_id INTO v_company_id FROM public.contracts c WHERE c.id = p_contract_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Contrato % nao encontrado', p_contract_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
        public.is_super_admin(auth.uid())
     OR public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id
  ) THEN
    RAISE EXCEPTION 'Sem permissao para regenerar visitas do contrato %', p_contract_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 1) Insere cada order (OS + filhos). Loop ~120 iterações: trivial in-transaction.
  IF p_orders IS NOT NULL AND jsonb_typeof(p_orders) = 'array' THEN
    FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
    LOOP
      v_os := v_order->'os';
      -- company_id/contract_id FORÇADOS (não confia no payload).
      INSERT INTO public.service_orders (
        company_id, customer_id, equipment_id, technician_id, team_id, os_type,
        service_type_id, form_template_id, scheduled_date, scheduled_time,
        description, require_tech_signature, status, contract_id, origin, created_by
      )
      VALUES (
        v_company_id,
        NULLIF(v_os->>'customer_id','')::uuid,
        NULLIF(v_os->>'equipment_id','')::uuid,
        NULLIF(v_os->>'technician_id','')::uuid,
        NULLIF(v_os->>'team_id','')::uuid,
        COALESCE(v_os->>'os_type','manutencao_preventiva')::public.os_type,
        NULLIF(v_os->>'service_type_id','')::uuid,
        NULLIF(v_os->>'form_template_id','')::uuid,
        (v_os->>'scheduled_date')::date,
        COALESCE(v_os->>'scheduled_time','08:00')::time,           -- FIX: cast text→time
        v_os->>'description',
        COALESCE((v_os->>'require_tech_signature')::boolean, true),
        COALESCE(v_os->>'status','agendada')::public.os_status,
        p_contract_id,
        COALESCE(v_os->>'origin','contract'),
        NULLIF(v_os->>'created_by','')::uuid
      )
      RETURNING id INTO v_os_id;

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

  -- 2) Apaga as antigas em cascata (mesma sequência do deleteRegenerableOrders TS).
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

  -- 3) preserve_code por mês (após apagar as antigas → código UNIQUE liberado).
  IF p_orders IS NOT NULL AND jsonb_typeof(p_orders) = 'array' THEN
    FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)
    LOOP
      v_code := NULLIF(v_order->>'preserve_code','');
      IF v_code IS NOT NULL THEN
        UPDATE public.service_orders
        SET public_short_code = v_code
        WHERE contract_id = p_contract_id
          AND scheduled_date = (v_order#>>'{os,scheduled_date}')::date
          AND public_short_code IS NULL;   -- só as novas (antigas já apagadas)
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

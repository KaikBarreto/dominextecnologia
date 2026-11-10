-- Editar OS em campo: movimentação de checklist sem perder respostas e ordem
-- persistente da árvore equipamento -> checklist.
--
-- `moves` é opcional em cada item do payload:
-- {
--   equipment_id: uuid|null,
--   form_template_ids: uuid[],
--   moves: [{ form_template_id: uuid, from_equipment_id: uuid|null }]
-- }
--
-- A RPC continua com a mesma assinatura. Clientes antigos, que não enviam
-- `moves`, mantêm o comportamento anterior. A operação segue atômica.

ALTER TABLE public.service_order_equipment
  ADD COLUMN IF NOT EXISTS equipment_position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checklist_position integer NOT NULL DEFAULT 0;

WITH equipment_first AS (
  SELECT
    service_order_id,
    equipment_id,
    min(created_at) AS first_created
  FROM public.service_order_equipment
  GROUP BY service_order_id, equipment_id
),
equipment_rank AS (
  SELECT
    service_order_id,
    equipment_id,
    dense_rank() OVER (
      PARTITION BY service_order_id
      ORDER BY first_created, equipment_id NULLS LAST
    ) - 1 AS position
  FROM equipment_first
)
UPDATE public.service_order_equipment soe
SET equipment_position = er.position
FROM equipment_rank er
WHERE er.service_order_id = soe.service_order_id
  AND er.equipment_id IS NOT DISTINCT FROM soe.equipment_id;

WITH checklist_rank AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY service_order_id, equipment_id
      ORDER BY created_at, id
    ) - 1 AS position
  FROM public.service_order_equipment
)
UPDATE public.service_order_equipment soe
SET checklist_position = cr.position
FROM checklist_rank cr
WHERE cr.id = soe.id;

CREATE OR REPLACE FUNCTION public.edit_service_order_scope(
  _service_order_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_company          uuid;
  v_os_company       uuid;
  v_customer_id      uuid;
  v_contract_id      uuid;
  v_is_pmoc          boolean;
  v_removed          integer := 0;
  v_inserted         integer := 0;
  v_moved            integer := 0;
  v_resp_deleted     integer := 0;
  v_resp_moved       integer := 0;
  v_result           jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT so.company_id, so.customer_id, so.contract_id
    INTO v_os_company, v_customer_id, v_contract_id
    FROM public.service_orders so
   WHERE so.id = _service_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF NOT (public.is_super_admin(v_uid) OR v_os_company = v_company) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem de serviço';
  END IF;

  IF NOT (public.is_super_admin(v_uid) OR public.can_edit_os(v_uid)) THEN
    RAISE EXCEPTION 'Sem permissão para editar o escopo desta ordem de serviço';
  END IF;

  IF v_contract_id IS NOT NULL THEN
    SELECT c.is_pmoc INTO v_is_pmoc
      FROM public.contracts c
     WHERE c.id = v_contract_id;
    IF v_is_pmoc IS TRUE THEN
      RAISE EXCEPTION 'Edição manual indisponível em OS de PMOC';
    END IF;
  END IF;

  CREATE TEMP TABLE _desired (
    equipment_id uuid,
    form_template_id uuid,
    equipment_position integer NOT NULL,
    checklist_position integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _desired (
    equipment_id,
    form_template_id,
    equipment_position,
    checklist_position
  )
  SELECT
    NULLIF(item.value->>'equipment_id', '')::uuid,
    template.value::uuid,
    (item.ordinality - 1)::integer,
    (template.ordinality - 1)::integer
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality)
  LEFT JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(item.value->'form_template_ids') = 'array'
       AND jsonb_array_length(item.value->'form_template_ids') > 0
      THEN item.value->'form_template_ids'
      ELSE '[null]'::jsonb
    END
  ) WITH ORDINALITY AS template(value, ordinality) ON true;

  DELETE FROM _desired a
   USING _desired b
   WHERE a.ctid > b.ctid
     AND a.equipment_id IS NOT DISTINCT FROM b.equipment_id
     AND a.form_template_id IS NOT DISTINCT FROM b.form_template_id;

  -- SECURITY DEFINER nunca confia em IDs do cliente: equipamento precisa ser do
  -- mesmo cliente/tenant da OS e template precisa pertencer ao tenant.
  IF EXISTS (
    SELECT 1
      FROM _desired d
     WHERE d.equipment_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.equipment e
          WHERE e.id = d.equipment_id
            AND e.company_id = v_os_company
            AND e.customer_id = v_customer_id
       )
  ) THEN
    RAISE EXCEPTION 'Equipamento inválido para esta ordem de serviço';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _desired d
     WHERE d.form_template_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.form_templates ft
          WHERE ft.id = d.form_template_id
            AND ft.company_id = v_os_company
       )
  ) THEN
    RAISE EXCEPTION 'Checklist inválido para esta ordem de serviço';
  END IF;

  CREATE TEMP TABLE _moves (
    from_equipment_id uuid,
    to_equipment_id uuid,
    form_template_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _moves (from_equipment_id, to_equipment_id, form_template_id)
  SELECT
    NULLIF(move.value->>'from_equipment_id', '')::uuid,
    NULLIF(item.value->>'equipment_id', '')::uuid,
    NULLIF(move.value->>'form_template_id', '')::uuid
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) AS item(value)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(item.value->'moves') = 'array' THEN item.value->'moves'
      ELSE '[]'::jsonb
    END
  ) AS move(value);

  IF EXISTS (
    SELECT 1
      FROM _moves
     GROUP BY from_equipment_id, form_template_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Movimento de checklist duplicado';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _moves m
     WHERE m.from_equipment_id IS NOT DISTINCT FROM m.to_equipment_id
        OR NOT EXISTS (
          SELECT 1
            FROM public.service_order_equipment soe
           WHERE soe.service_order_id = _service_order_id
             AND soe.equipment_id IS NOT DISTINCT FROM m.from_equipment_id
             AND soe.form_template_id = m.form_template_id
        )
        OR NOT EXISTS (
          SELECT 1
            FROM _desired d
           WHERE d.equipment_id IS NOT DISTINCT FROM m.to_equipment_id
             AND d.form_template_id = m.form_template_id
        )
  ) THEN
    RAISE EXCEPTION 'Movimento de checklist inválido';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM _moves m
     WHERE EXISTS (
       SELECT 1
         FROM public.service_order_equipment soe
        WHERE soe.service_order_id = _service_order_id
          AND soe.equipment_id IS NOT DISTINCT FROM m.to_equipment_id
          AND soe.form_template_id = m.form_template_id
     )
  ) THEN
    RAISE EXCEPTION 'Este checklist já existe no destino';
  END IF;

  -- Atualiza a própria linha da junction e as respostas na mesma transação.
  WITH moved_rows AS (
    UPDATE public.service_order_equipment soe
       SET equipment_id = m.to_equipment_id
      FROM _moves m
     WHERE soe.service_order_id = _service_order_id
       AND soe.equipment_id IS NOT DISTINCT FROM m.from_equipment_id
       AND soe.form_template_id = m.form_template_id
    RETURNING 1
  )
  SELECT count(*) INTO v_moved FROM moved_rows;

  WITH moved_responses AS (
    UPDATE public.form_responses fr
       SET equipment_id = m.to_equipment_id
      FROM _moves m
     WHERE fr.service_order_id = _service_order_id
       AND fr.equipment_id IS NOT DISTINCT FROM m.from_equipment_id
       AND fr.question_id IN (
         SELECT fq.id
           FROM public.form_questions fq
          WHERE fq.template_id = m.form_template_id
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_resp_moved FROM moved_responses;

  -- Respostas só são apagadas para pares realmente removidos. Pares movidos já
  -- estão no destino e, portanto, não entram em to_remove.
  WITH current_pairs AS (
    SELECT soe.equipment_id, soe.form_template_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = _service_order_id
  ),
  to_remove AS (
    SELECT cp.equipment_id, cp.form_template_id
      FROM current_pairs cp
      LEFT JOIN _desired d
        ON d.equipment_id IS NOT DISTINCT FROM cp.equipment_id
       AND d.form_template_id IS NOT DISTINCT FROM cp.form_template_id
     WHERE d.equipment_id IS NULL
       AND d.form_template_id IS NULL
       AND cp.form_template_id IS NOT NULL
  ),
  deleted_responses AS (
    DELETE FROM public.form_responses fr
     USING to_remove tr
     WHERE fr.service_order_id = _service_order_id
       AND fr.equipment_id IS NOT DISTINCT FROM tr.equipment_id
       AND fr.question_id IN (
         SELECT fq.id
           FROM public.form_questions fq
          WHERE fq.template_id = tr.form_template_id
       )
    RETURNING 1
  )
  SELECT count(*) INTO v_resp_deleted FROM deleted_responses;

  WITH to_remove AS (
    SELECT soe.id
      FROM public.service_order_equipment soe
      LEFT JOIN _desired d
        ON d.equipment_id IS NOT DISTINCT FROM soe.equipment_id
       AND d.form_template_id IS NOT DISTINCT FROM soe.form_template_id
     WHERE soe.service_order_id = _service_order_id
       AND d.equipment_id IS NULL
       AND d.form_template_id IS NULL
  ),
  deleted_rows AS (
    DELETE FROM public.service_order_equipment soe
     WHERE soe.id IN (SELECT id FROM to_remove)
    RETURNING 1
  )
  SELECT count(*) INTO v_removed FROM deleted_rows;

  WITH current_pairs AS (
    SELECT soe.equipment_id, soe.form_template_id
      FROM public.service_order_equipment soe
     WHERE soe.service_order_id = _service_order_id
  ),
  to_insert AS (
    SELECT d.equipment_id, d.form_template_id, d.equipment_position, d.checklist_position
      FROM _desired d
      LEFT JOIN current_pairs cp
        ON cp.equipment_id IS NOT DISTINCT FROM d.equipment_id
       AND cp.form_template_id IS NOT DISTINCT FROM d.form_template_id
     WHERE cp.equipment_id IS NULL
       AND cp.form_template_id IS NULL
  ),
  inserted_rows AS (
    INSERT INTO public.service_order_equipment (
      service_order_id,
      equipment_id,
      form_template_id,
      equipment_position,
      checklist_position
    )
    SELECT
      _service_order_id,
      ti.equipment_id,
      ti.form_template_id,
      ti.equipment_position,
      ti.checklist_position
    FROM to_insert ti
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM inserted_rows;

  UPDATE public.service_order_equipment soe
     SET equipment_position = d.equipment_position,
         checklist_position = d.checklist_position
    FROM _desired d
   WHERE soe.service_order_id = _service_order_id
     AND soe.equipment_id IS NOT DISTINCT FROM d.equipment_id
     AND soe.form_template_id IS NOT DISTINCT FROM d.form_template_id;

  SELECT jsonb_build_object(
    'service_order_id', _service_order_id,
    'removed', v_removed,
    'inserted', v_inserted,
    'moved', v_moved,
    'responses_deleted', v_resp_deleted,
    'responses_moved', v_resp_moved,
    'scope', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', soe.id,
          'equipment_id', soe.equipment_id,
          'form_template_id', soe.form_template_id,
          'equipment_position', soe.equipment_position,
          'checklist_position', soe.checklist_position
        )
        ORDER BY soe.equipment_position, soe.checklist_position, soe.id
      )
      FROM public.service_order_equipment soe
      WHERE soe.service_order_id = _service_order_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.edit_service_order_scope(uuid, jsonb) IS
  'Salva atomicamente o escopo de OS avulsa. Aceita moves por checklist, move as form_responses junto do vínculo, persiste a ordem e apaga respostas apenas de pares realmente removidos. Revalida autenticação, tenant, permissão, cliente dos equipamentos e tenant dos templates.';

REVOKE ALL ON FUNCTION public.edit_service_order_scope(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_service_order_scope(uuid, jsonb) TO authenticated;

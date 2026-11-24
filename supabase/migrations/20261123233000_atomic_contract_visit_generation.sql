BEGIN;

-- A geração de visitas contratuais precisa compartilhar a mesma transação da
-- autorização de conflito. A função base continua sendo a única responsável
-- por validar o payload e criar/substituir as OSs; este wrapper apenas valida a
-- política empresarial e injeta a justificativa auditável consumida pelo
-- trigger de reservas da agenda.
CREATE OR REPLACE FUNCTION public.regenerate_contract_visits_with_override(
  p_contract_id uuid,
  p_orders jsonb,
  p_delete_ids uuid[] DEFAULT '{}',
  p_override_justification text DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_justification text := NULLIF(btrim(p_override_justification), '');
BEGIN
  SELECT c.company_id
    INTO v_company_id
    FROM public.contracts c
   WHERE c.id = p_contract_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Contrato % nao encontrado', p_contract_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_justification IS NOT NULL THEN
    IF length(v_justification) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'schedule_override_justification_required'
        USING ERRCODE = '22023';
    END IF;

    IF v_user_id IS NULL
       OR auth.role() IS DISTINCT FROM 'authenticated'
       OR NOT EXISTS (
         SELECT 1
           FROM public.profiles p
           JOIN public.company_settings cs ON cs.company_id = p.company_id
          WHERE p.user_id = v_user_id
            AND p.company_id = v_company_id
            AND p.is_active
            AND cs.allow_schedule_conflicts IS TRUE
       ) THEN
      RAISE EXCEPTION 'schedule_override_permission_denied'
        USING ERRCODE = '42501';
    END IF;

    PERFORM set_config(
      'app.schedule_conflict_override_justification',
      v_justification,
      true
    );
  END IF;

  RETURN public.regenerate_contract_visits(
    p_contract_id,
    p_orders,
    p_delete_ids,
    p_dry_run
  );
END;
$function$;

COMMENT ON FUNCTION public.regenerate_contract_visits_with_override(uuid, jsonb, uuid[], text, boolean) IS
  'Gera/substitui o lote completo de visitas contratuais na mesma transacao. Override exige opt-in da empresa e justificativa auditada; service_role/API Publica nao pode autorizar conflitos.';

REVOKE ALL ON FUNCTION public.regenerate_contract_visits_with_override(uuid, jsonb, uuid[], text, boolean)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_contract_visits_with_override(uuid, jsonb, uuid[], text, boolean)
  TO authenticated;

COMMIT;

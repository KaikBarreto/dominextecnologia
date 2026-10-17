-- Amplia o reset de OS para ciclos operacionais ja iniciados.
--
-- A UI oferece a acao em A caminho, Em andamento, Pausada e Concluida. A RPC
-- repete a mesma validacao no servidor para impedir chamadas fora desse fluxo.

CREATE OR REPLACE FUNCTION public.reset_service_order(
  _service_order_id uuid,
  _clear_responses boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_user_company uuid;
  v_os_company uuid;
  v_os_status public.os_status;
  v_form_responses_deleted integer := 0;
  v_photos_deleted integer := 0;
  v_locations_deleted integer := 0;
  v_activities_cleared integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT so.company_id, so.status
    INTO v_os_company, v_os_status
    FROM public.service_orders so
   WHERE so.id = _service_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de servico nao encontrada';
  END IF;

  v_user_company := public.get_user_company_id(v_uid);

  IF NOT (public.is_super_admin(v_uid) OR v_os_company = v_user_company) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem de servico';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.is_admin_or_gestor(v_uid)
    OR public.has_full_permissions(v_uid)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = v_uid
         AND up.is_active = true
         AND (up.permissions ? '*' OR up.permissions @> '"fn:reopen_os"'::jsonb)
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM public.user_permissions up WHERE up.user_id = v_uid
      )
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid
      )
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissao para resetar esta ordem de servico';
  END IF;

  IF v_os_status NOT IN (
    'a_caminho'::public.os_status,
    'em_andamento'::public.os_status,
    'pausada'::public.os_status,
    'concluida'::public.os_status
  ) THEN
    RAISE EXCEPTION 'Esta ordem de servico nao possui um atendimento iniciado para resetar';
  END IF;

  UPDATE public.service_orders
     SET status = 'agendada'::public.os_status,
         check_in_time = NULL,
         check_in_location = NULL,
         check_in_by = NULL,
         check_out_time = NULL,
         check_out_location = NULL,
         check_out_by = NULL,
         started_at = NULL,
         paused_at = NULL,
         resumed_at = NULL,
         completed_at = NULL,
         partial_finish = false,
         diagnosis = CASE WHEN _clear_responses THEN NULL ELSE diagnosis END,
         solution = CASE WHEN _clear_responses THEN NULL ELSE solution END,
         tech_signature = CASE WHEN _clear_responses THEN NULL ELSE tech_signature END,
         tech_signature_at = CASE WHEN _clear_responses THEN NULL ELSE tech_signature_at END,
         tech_signed_by = CASE WHEN _clear_responses THEN NULL ELSE tech_signed_by END,
         tech_signed_location = CASE WHEN _clear_responses THEN NULL ELSE tech_signed_location END,
         client_signature = CASE WHEN _clear_responses THEN NULL ELSE client_signature END,
         client_signature_at = CASE WHEN _clear_responses THEN NULL ELSE client_signature_at END,
         client_signed_by = CASE WHEN _clear_responses THEN NULL ELSE client_signed_by END,
         client_signed_location = CASE WHEN _clear_responses THEN NULL ELSE client_signed_location END,
         pmoc_conformity_status = CASE WHEN _clear_responses THEN NULL ELSE pmoc_conformity_status END,
         pmoc_conformity_notes = CASE WHEN _clear_responses THEN NULL ELSE pmoc_conformity_notes END
   WHERE id = _service_order_id;

  IF _clear_responses THEN
    DELETE FROM public.form_responses
     WHERE service_order_id = _service_order_id;
    GET DIAGNOSTICS v_form_responses_deleted = ROW_COUNT;

    UPDATE public.service_order_activities
       SET conformity_status = NULL,
           measured_value = NULL,
           responded_at = NULL,
           responded_by = NULL,
           activity_photos = NULL
     WHERE service_order_id = _service_order_id
       AND (
         conformity_status IS NOT NULL
         OR measured_value IS NOT NULL
         OR responded_at IS NOT NULL
         OR responded_by IS NOT NULL
         OR activity_photos IS NOT NULL
       );
    GET DIAGNOSTICS v_activities_cleared = ROW_COUNT;

    DELETE FROM public.os_photos
     WHERE service_order_id = _service_order_id;
    GET DIAGNOSTICS v_photos_deleted = ROW_COUNT;

    DELETE FROM public.technician_locations
     WHERE service_order_id = _service_order_id;
    GET DIAGNOSTICS v_locations_deleted = ROW_COUNT;
  END IF;

  DELETE FROM public.service_ratings
   WHERE service_order_id = _service_order_id
     AND rated_at IS NULL;

  RETURN jsonb_build_object(
    'service_order_id', _service_order_id,
    'status', 'agendada',
    'responses_cleared', _clear_responses,
    'form_responses_deleted', v_form_responses_deleted,
    'activities_cleared', v_activities_cleared,
    'photos_deleted', v_photos_deleted,
    'locations_deleted', v_locations_deleted
  );
END;
$function$;

COMMENT ON FUNCTION public.reset_service_order(uuid, boolean) IS
  'Reseta uma OS com ciclo iniciado para agendada, limpa os marcos de execucao e opcionalmente apaga o preenchimento de campo. Valida tenant e permissao fn:reopen_os.';

REVOKE ALL ON FUNCTION public.reset_service_order(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_service_order(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_service_order(uuid, boolean) TO authenticated, service_role;

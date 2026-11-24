-- Identifica quem registrou a entrega. Não modifica snapshots históricos,
-- seus hashes, permissões, estoque ou pagamentos.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $patch$
DECLARE definition text; anchor text; replacement text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_capture_delivery_receipt_internal_v2(uuid,uuid,uuid)'::regprocedure)
    INTO definition;
  IF position('PDV_DELIVERY_OPERATOR_CAPTURE_V4' IN definition) = 0 THEN
    anchor := $old$'withdrawn_at',v_delivery.created_at,$old$;
    replacement := $new$'withdrawn_at',v_delivery.created_at,
    'operator_name',(SELECT NULLIF(btrim(profile.full_name),'')
      FROM public.profiles profile
      WHERE profile.user_id=v_delivery.created_by AND profile.company_id=p_company_id
      ORDER BY profile.id LIMIT 1), /* PDV_DELIVERY_OPERATOR_CAPTURE_V4 */$new$;
    IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 THEN
      RAISE EXCEPTION 'A captura do comprovante mudou; revise antes de aplicar.';
    END IF;
    EXECUTE replace(definition,anchor,replacement);
  END IF;

  SELECT pg_get_functiondef('public.pdv_get_delivery_receipt_snapshot_v2(uuid)'::regprocedure)
    INTO definition;
  IF position('PDV_DELIVERY_OPERATOR_READ_V4' IN definition) = 0 THEN
    anchor := 'RETURN v_row.snapshot;';
    replacement := $new$RETURN v_row.snapshot || jsonb_build_object('operator_name',
    COALESCE(NULLIF(btrim(v_row.snapshot->>'operator_name'),''),
      (SELECT NULLIF(btrim(profile.full_name),'')
       FROM public.pdv_deliveries delivery
       JOIN public.profiles profile ON profile.user_id=delivery.created_by
         AND profile.company_id=delivery.company_id
       WHERE delivery.id=v_row.delivery_id AND delivery.company_id=v_row.company_id
       ORDER BY profile.id LIMIT 1))); /* PDV_DELIVERY_OPERATOR_READ_V4 */$new$;
    IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 THEN
      RAISE EXCEPTION 'A leitura do comprovante mudou; revise antes de aplicar.';
    END IF;
    -- A função existente confere contexto, escopo e hash antes deste retorno.
    -- A composição do DTO não reescreve o documento salvo nem seu hash.
    EXECUTE replace(definition,anchor,replacement);
  END IF;
END
$patch$;

COMMIT;

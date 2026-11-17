-- O histórico aberto pelo QR Code do equipamento filtrava apenas o campo
-- legado service_orders.equipment_id. OS com escopo múltiplo persistem os
-- demais equipamentos em service_order_equipment e por isso apareciam vazias.

BEGIN;

ALTER FUNCTION public.get_portal_data_before_customer_documents(text, text)
  RENAME TO get_portal_data_before_equipment_order_scope;

REVOKE ALL ON FUNCTION public.get_portal_data_before_equipment_order_scope(text, text)
  FROM public, anon, authenticated;

CREATE FUNCTION public.get_portal_data_before_customer_documents(
  p_token text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $portal$
DECLARE
  v_payload jsonb;
  v_orders jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.get_portal_data_before_equipment_order_scope(
    p_token,
    p_session_token
  );

  IF v_payload IS NULL OR COALESCE(v_payload->>'access', '') <> 'granted' THEN
    RETURN v_payload;
  END IF;

  -- Só devolve IDs de equipamentos que já estão no bloco autorizado do
  -- payload. Assim a ampliação do histórico não contorna seção bloqueada,
  -- outro cliente ou outro tenant.
  SELECT COALESCE(jsonb_agg(
           item || jsonb_build_object(
             'equipment_ids', COALESCE((
               SELECT jsonb_agg(scope.equipment_id ORDER BY scope.equipment_id)
                 FROM (
                   SELECT NULLIF(item->>'equipment_id', '')::uuid AS equipment_id
                    WHERE NULLIF(item->>'equipment_id', '') IS NOT NULL

                   UNION

                   SELECT soe.equipment_id
                     FROM public.service_order_equipment soe
                    WHERE soe.service_order_id = NULLIF(item->>'id', '')::uuid
                      AND soe.equipment_id IS NOT NULL
                 ) scope
                WHERE EXISTS (
                  SELECT 1
                    FROM jsonb_array_elements(
                      COALESCE(v_payload->'equipment', '[]'::jsonb)
                    ) equipment_item
                   WHERE NULLIF(equipment_item->>'id', '')::uuid = scope.equipment_id
                )
             ), '[]'::jsonb)
           )
         ), '[]'::jsonb)
    INTO v_orders
    FROM jsonb_array_elements(
      COALESCE(v_payload->'service_orders', '[]'::jsonb)
    ) item;

  RETURN jsonb_set(v_payload, '{service_orders}', v_orders, true);
END;
$portal$;

COMMENT ON FUNCTION public.get_portal_data_before_customer_documents(text, text) IS
  'Camada interna do portal: acrescenta a cada OS somente os equipamentos já autorizados no payload do cliente.';

REVOKE ALL ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  TO service_role;

COMMIT;

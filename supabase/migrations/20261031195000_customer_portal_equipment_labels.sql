-- Publica somente etiquetas e campos de equipamento explicitamente liberados.

BEGIN;

ALTER FUNCTION public.get_portal_data_before_customer_documents(text, text)
  RENAME TO get_portal_data_before_equipment_labels;

REVOKE ALL ON FUNCTION public.get_portal_data_before_equipment_labels(text, text)
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
  v_customer_id uuid;
  v_company_id uuid;
  v_customer_labels jsonb := '[]'::jsonb;
  v_equipment jsonb := '[]'::jsonb;
  v_field_config jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.get_portal_data_before_equipment_labels(p_token, p_session_token);

  IF v_payload IS NULL OR COALESCE(v_payload->>'access', '') <> 'granted' THEN
    RETURN v_payload;
  END IF;
  IF COALESCE((v_payload->>'partial')::boolean, false) THEN
    RETURN v_payload - 'labels';
  END IF;

  v_customer_id := NULLIF(v_payload #>> '{customer,id}', '')::uuid;
  v_company_id := NULLIF(v_payload #>> '{customer,company_id}', '')::uuid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pl.id, 'name', pl.name, 'color', pl.color)
           ORDER BY cla.position, pl.name), '[]'::jsonb)
    INTO v_customer_labels
    FROM public.customer_label_assignments cla
    JOIN public.party_labels pl
      ON pl.id = cla.label_id AND pl.company_id = cla.company_id
   WHERE cla.company_id = v_company_id
     AND cla.customer_id = v_customer_id
     AND pl.show_in_portal
     AND pl.is_active;

  v_payload := jsonb_set(v_payload, '{customer,labels}', v_customer_labels, true);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'field_key', efc.field_key,
           'label', efc.label,
           'field_type', efc.field_type,
           'position', efc.position,
           'options', efc.options
         ) ORDER BY efc.position, efc.id), '[]'::jsonb)
    INTO v_field_config
    FROM public.equipment_field_config efc
   WHERE efc.company_id = v_company_id
     AND efc.is_visible
     AND efc.is_visible_in_portal;
  v_payload := jsonb_set(v_payload, '{equipment_field_config}', v_field_config, true);

  SELECT COALESCE(jsonb_agg(
           item || jsonb_build_object(
             'labels', COALESCE((
               SELECT jsonb_agg(jsonb_build_object('id', pl.id, 'name', pl.name, 'color', pl.color)
                        ORDER BY ela.position, pl.name)
                 FROM public.equipment_label_assignments ela
                 JOIN public.party_labels pl
                   ON pl.id = ela.label_id AND pl.company_id = ela.company_id
                WHERE ela.company_id = v_company_id
                  AND ela.equipment_id = NULLIF(item->>'id', '')::uuid
                  AND pl.show_in_portal
                  AND pl.is_active
             ), '[]'::jsonb),
             'custom_fields', COALESCE((
               SELECT jsonb_object_agg(efc.field_key, (item->'custom_fields')->efc.field_key)
                 FROM public.equipment_field_config efc
                WHERE efc.company_id = v_company_id
                  AND efc.is_visible
                  AND efc.is_visible_in_portal
                  AND COALESCE(item->'custom_fields', '{}'::jsonb) ? efc.field_key
             ), '{}'::jsonb)
           )
         ), '[]'::jsonb)
    INTO v_equipment
    FROM jsonb_array_elements(COALESCE(v_payload->'equipment', '[]'::jsonb)) item;
  v_payload := jsonb_set(v_payload, '{equipment}', v_equipment, true);

  RETURN v_payload;
END;
$portal$;

COMMENT ON FUNCTION public.get_portal_data_before_customer_documents(text, text) IS
  'Camada interna do portal: etiquetas e campos de equipamento somente por allowlist explicita, fora do modo parcial.';

REVOKE ALL ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  TO service_role;

COMMIT;

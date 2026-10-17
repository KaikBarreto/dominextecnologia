-- Nunca entrega o logo bruto do tenant como og:image. Logos quadrados ou
-- pequenos eram recortados/ampliados de forma imprevisivel pelo WhatsApp.
-- White Label ativo usa somente a arte social ja composta em 1200x630; sem
-- ela, o fallback seguro continua sendo a arte padrao da Dominex.

CREATE OR REPLACE FUNCTION public.get_public_os_social_meta(p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference text := btrim(COALESCE(p_reference, ''));
  v_code text;
  v_os_id uuid;
  v_result jsonb;
BEGIN
  IF v_reference = '' OR length(v_reference) > 160 THEN
    RETURN NULL;
  END IF;

  IF v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_os_id := v_reference::uuid;
  ELSE
    v_code := split_part(v_reference, '-', array_length(string_to_array(v_reference, '-'), 1));
    IF v_code !~ '^[a-hj-np-z2-9]{12}$' THEN
      RETURN NULL;
    END IF;

    SELECT so.id
      INTO v_os_id
      FROM public.service_orders so
     WHERE so.public_short_code = v_code
       AND so.entry_type IS DISTINCT FROM 'tarefa';
  END IF;

  SELECT jsonb_build_object(
    'order_number', so.order_number,
    'company_name', COALESCE(NULLIF(cs.name, ''), NULLIF(c.name, ''), 'Ordem de Serviço'),
    'social_image_url', CASE
      WHEN public.company_has_module(so.company_id, 'white_label')
       AND COALESCE(cs.white_label_enabled, false)
      THEN COALESCE(
        NULLIF(cs.os_social_image_url, ''),
        'https://www.dominex.app/images/og-social.jpg'
      )
      ELSE 'https://www.dominex.app/images/og-social.jpg'
    END,
    'social_image_is_composed',
      public.company_has_module(so.company_id, 'white_label')
      AND COALESCE(cs.white_label_enabled, false)
      AND NULLIF(cs.os_social_image_url, '') IS NOT NULL
  )
    INTO v_result
    FROM public.service_orders so
    LEFT JOIN public.company_settings cs ON cs.company_id = so.company_id
    LEFT JOIN public.companies c ON c.id = so.company_id
   WHERE so.id = v_os_id
     AND so.entry_type IS DISTINCT FROM 'tarefa';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_os_social_meta(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_os_social_meta(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_os_social_meta(text) IS
  'Allowlist minima do head social da OS. White Label ativo expoe somente arte 1200x630 composta; nunca o logo bruto do tenant.';

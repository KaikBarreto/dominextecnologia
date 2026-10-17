-- Imagem social por tenant para o link publico da Ordem de Servico.
--
-- A arte final (1200x630) e gerada/cortada no navegador e salva no bucket
-- publico company-logos. O crawler nunca le company_settings diretamente:
-- recebe somente esta allowlist minima pela RPC SECURITY DEFINER abaixo.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS os_social_image_url text,
  ADD COLUMN IF NOT EXISTS os_social_image_mode text NOT NULL DEFAULT 'logo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.company_settings'::regclass
      AND conname = 'company_settings_os_social_image_mode_check'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_os_social_image_mode_check
      CHECK (os_social_image_mode IN ('logo', 'custom'));
  END IF;
END $$;

COMMENT ON COLUMN public.company_settings.os_social_image_url IS
  'Arte publica 1200x630 usada no preview social dos links de OS.';
COMMENT ON COLUMN public.company_settings.os_social_image_mode IS
  'Origem da arte social da OS: logo (composicao automatica) ou custom.';

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
  -- Limite defensivo: a URL amigavel normal tem menos de 120 caracteres.
  IF v_reference = '' OR length(v_reference) > 160 THEN
    RETURN NULL;
  END IF;

  IF v_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_os_id := v_reference::uuid;
  ELSE
    -- public_short_code e sempre o ultimo trecho do slug e nao contem hifen.
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
    -- Se a arte 1200x630 ainda nao foi gerada, o logo do proprio tenant e o
    -- fallback. Nunca devolvemos o asset social da Dominex para uma OS valida.
    'social_image_url', COALESCE(
      NULLIF(cs.os_social_image_url, ''),
      CASE WHEN cs.white_label_enabled THEN NULLIF(cs.white_label_logo_url, '') END,
      NULLIF(cs.logo_url, ''),
      NULLIF(c.logo_url, '')
    ),
    'social_image_is_composed', NULLIF(cs.os_social_image_url, '') IS NOT NULL
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
  'Allowlist minima para o head social da OS publica: numero, empresa e imagem. Nao retorna cliente, endereco ou detalhes do atendimento.';

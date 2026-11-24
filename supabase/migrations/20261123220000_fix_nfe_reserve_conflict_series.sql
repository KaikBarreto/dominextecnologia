-- Completa a correção da reserva de numeração da NF-e. Como a função retorna
-- uma coluna chamada `series`, a lista de colunas do ON CONFLICT também era
-- interpretada pelo PL/pgSQL como referência ambígua. O conflito pode ser
-- tratado sem indicar a lista porque este INSERT só precisa ser idempotente.

CREATE OR REPLACE FUNCTION public.reserve_goods_fiscal_number(
  p_company_id uuid,
  p_model integer,
  p_series_id uuid DEFAULT NULL,
  p_direction text DEFAULT 'saida'
) RETURNS TABLE(series integer, number bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_direction text;
  v_selected uuid;
  v_legacy_series integer;
  v_legacy_next_number bigint;
BEGIN
  IF p_direction NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'Direção fiscal inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_model = 55 THEN
    INSERT INTO public.company_nfe_settings(company_id)
    VALUES (p_company_id)
    ON CONFLICT DO NOTHING;

    SELECT
      settings.series,
      settings.next_number,
      CASE
        WHEN p_direction = 'entrada' THEN settings.default_entry_series_id
        ELSE settings.default_exit_series_id
      END
    INTO v_legacy_series, v_legacy_next_number, v_selected
    FROM public.company_nfe_settings AS settings
    WHERE settings.company_id = p_company_id
    FOR UPDATE;

    IF p_series_id IS NOT NULL THEN
      v_selected := p_series_id;
    END IF;

    IF v_selected IS NULL THEN
      INSERT INTO public.nfe_series(
        company_id,
        label,
        series,
        next_number,
        direction,
        active
      )
      VALUES (
        p_company_id,
        'Série ' || v_legacy_series::text,
        v_legacy_series,
        v_legacy_next_number,
        'ambos',
        true
      )
      ON CONFLICT DO NOTHING;

      SELECT configured_series.id
      INTO v_selected
      FROM public.nfe_series AS configured_series
      WHERE configured_series.company_id = p_company_id
        AND configured_series.series = v_legacy_series
      FOR UPDATE;

      IF p_direction = 'entrada' THEN
        UPDATE public.company_nfe_settings AS settings
        SET default_entry_series_id = v_selected
        WHERE settings.company_id = p_company_id
          AND settings.default_entry_series_id IS NULL;
      ELSE
        UPDATE public.company_nfe_settings AS settings
        SET default_exit_series_id = v_selected
        WHERE settings.company_id = p_company_id
          AND settings.default_exit_series_id IS NULL;
      END IF;
    END IF;

    SELECT configured_series.direction
    INTO v_direction
    FROM public.nfe_series AS configured_series
    WHERE configured_series.id = v_selected
      AND configured_series.company_id = p_company_id
      AND configured_series.active
    FOR UPDATE;

    IF v_direction IS NULL OR
      (p_direction = 'entrada' AND v_direction NOT IN ('entrada', 'ambos')) OR
      (p_direction = 'saida' AND v_direction NOT IN ('saida', 'ambos')) THEN
      RAISE EXCEPTION 'Série de NF-e inválida para esta empresa.' USING ERRCODE = '23514';
    END IF;

    RETURN QUERY
    UPDATE public.nfe_series AS configured_series
    SET next_number = configured_series.next_number + 1
    WHERE configured_series.id = v_selected
      AND configured_series.company_id = p_company_id
    RETURNING configured_series.series, configured_series.next_number - 1;
  ELSIF p_model = 65 THEN
    INSERT INTO public.company_nfce_settings(company_id)
    VALUES (p_company_id)
    ON CONFLICT DO NOTHING;

    RETURN QUERY
    UPDATE public.company_nfce_settings AS settings
    SET next_number = settings.next_number + 1
    WHERE settings.company_id = p_company_id
    RETURNING settings.series, settings.next_number - 1;
  ELSE
    RAISE EXCEPTION 'Modelo fiscal inválido.' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer, uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer, uuid, text)
TO service_role;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.reserve_goods_fiscal_number(uuid,integer,uuid,text)'::regprocedure)
  INTO v_definition;

  IF v_definition LIKE '%ON CONFLICT (company_id, series)%' THEN
    RAISE EXCEPTION 'A reserva de NF-e continua com ON CONFLICT ambíguo.';
  END IF;
END;
$$;

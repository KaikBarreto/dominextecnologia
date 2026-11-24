-- Personal global-catalog preferences, isolated by user and current company.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.catalog_model_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 127 AND model_id = btrim(model_id)),
  is_favorite boolean NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  last_operation_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id, model_id)
);
COMMENT ON TABLE public.catalog_model_favorites IS
  'Preferências pessoais do catálogo global. Sem dados de cliente. Remoção lógica preserva revisão e impede replay/importação antiga de ressuscitar favorito.';
COMMENT ON COLUMN public.catalog_model_favorites.model_id IS
  'ID opaco global: modelos curados podem não existir em equipment_models, por isso não há FK para essa tabela. Somente ID, sem nome ou payload do equipamento.';
CREATE INDEX catalog_model_favorites_company_idx ON public.catalog_model_favorites(company_id);
ALTER TABLE public.catalog_model_favorites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_model_favorites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalog_model_favorites TO authenticated;
CREATE POLICY "Read own catalog model favorites" ON public.catalog_model_favorites
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.company_id = catalog_model_favorites.company_id
        AND p.is_active IS TRUE
    )
  );

-- No direct INSERT/UPDATE/DELETE grants: all changes use compare-and-set below.
-- expected_revision=0 only creates an unseen ID. A removal always leaves a tombstone.
CREATE FUNCTION public.set_catalog_model_favorite(
  p_company_id uuid,
  p_model_id text,
  p_is_favorite boolean,
  p_expected_revision bigint,
  p_operation_id uuid
) RETURNS TABLE (
  applied boolean, model_id text, is_favorite boolean, revision bigint,
  last_operation_id uuid, updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.catalog_model_favorites%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  -- Lock the real active membership for the duration of this write.
  PERFORM 1 FROM public.profiles p
    WHERE p.user_id = v_user_id AND p.company_id = p_company_id AND p.is_active IS TRUE
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  IF p_model_id IS NULL OR length(p_model_id) NOT BETWEEN 1 AND 127
    OR p_model_id IS DISTINCT FROM btrim(p_model_id)
    OR p_is_favorite IS NULL OR p_operation_id IS NULL
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_expected_revision > 9007199254740991 THEN
    RAISE EXCEPTION 'Preferência inválida.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'catalog-favorite:' || v_user_id::text || ':' || p_company_id::text || ':' || p_model_id, 0));
  SELECT f.* INTO v_row FROM public.catalog_model_favorites f
    WHERE f.user_id = v_user_id AND f.company_id = p_company_id AND f.model_id = p_model_id
    FOR UPDATE;
  IF FOUND THEN
    IF v_row.last_operation_id = p_operation_id THEN
      IF v_row.is_favorite IS DISTINCT FROM p_is_favorite THEN
        RAISE EXCEPTION 'Preferência inválida.' USING ERRCODE = '22023';
      END IF;
      RETURN QUERY SELECT true, v_row.model_id, v_row.is_favorite, v_row.revision,
        v_row.last_operation_id, v_row.updated_at;
      RETURN;
    END IF;
    IF v_row.revision <> p_expected_revision THEN
      RETURN QUERY SELECT false, v_row.model_id, v_row.is_favorite, v_row.revision,
        v_row.last_operation_id, v_row.updated_at;
      RETURN;
    END IF;
    UPDATE public.catalog_model_favorites f SET
      is_favorite = p_is_favorite, revision = f.revision + 1,
      last_operation_id = p_operation_id, updated_at = clock_timestamp()
      WHERE f.user_id = v_user_id AND f.company_id = p_company_id AND f.model_id = p_model_id
      RETURNING f.* INTO v_row;
  ELSE
    IF p_expected_revision <> 0 THEN
      RETURN QUERY SELECT false, p_model_id, false, 0::bigint, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
    INSERT INTO public.catalog_model_favorites(user_id, company_id, model_id, is_favorite, revision, last_operation_id)
      VALUES(v_user_id, p_company_id, p_model_id, p_is_favorite, 1, p_operation_id)
      RETURNING * INTO v_row;
  END IF;
  RETURN QUERY SELECT true, v_row.model_id, v_row.is_favorite, v_row.revision,
    v_row.last_operation_id, v_row.updated_at;
END $fn$;
REVOKE ALL ON FUNCTION public.set_catalog_model_favorite(uuid,text,boolean,bigint,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_model_favorite(uuid,text,boolean,bigint,uuid)
  TO authenticated;
COMMIT;

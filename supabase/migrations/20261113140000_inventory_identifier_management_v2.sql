-- Liga os identificadores canônicos ao cadastro e expõe uma projeção segura
-- para a tela de materiais. Mantém a tabela fechada por RLS: a UI continua
-- acessando somente RPCs com tenant, assinatura e permissões validados.
BEGIN;

CREATE OR REPLACE FUNCTION public.inventory_list_identifiers_v2(p_inventory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company uuid := public.inventory_identifier_access_company_v2(false);
  v_inventory public.inventory%ROWTYPE;
BEGIN
  SELECT inventory.*
    INTO v_inventory
    FROM public.inventory inventory
   WHERE inventory.id = p_inventory_id
     AND inventory.company_id = v_company
     AND inventory.customer_id IS NULL
     AND inventory.id IN (SELECT public.get_accessible_inventory_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=inventory_identifier_material_not_found';
  END IF;

  RETURN jsonb_build_object(
    'inventory_id', v_inventory.id,
    'material_name', v_inventory.name,
    'sku', v_inventory.sku,
    'unit', COALESCE(NULLIF(btrim(v_inventory.unit), ''), 'un'),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'identifier_id', identifier.id,
        'inventory_id', identifier.inventory_id,
        'identifier_type', identifier.identifier_type,
        'code', identifier.code,
        'unit_label', identifier.unit_label,
        'unit_factor', identifier.unit_factor,
        'is_primary', identifier.is_primary,
        'is_active', identifier.is_active
      ) ORDER BY identifier.is_active DESC, identifier.is_primary DESC,
        identifier.identifier_type, identifier.created_at, identifier.id)
        FROM public.inventory_identifiers identifier
       WHERE identifier.company_id = v_company
         AND identifier.inventory_id = v_inventory.id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.inventory_list_identifiers_v2(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_list_identifiers_v2(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.inventory_list_identifiers_v2(uuid) IS
  'Lista identificadores de um material acessível sem expor a tabela, custos ou dados de outro tenant.';

-- Os RPCs de escrita da migration-base já validavam tenant, assinatura e
-- permissão funcional. Ao ativar a gestão pela UI, fechamos também a ACL por
-- local: conhecer/adivinhar o UUID de um material presente apenas em estoque
-- restrito não autoriza gerar ou alterar seus códigos.
CREATE OR REPLACE FUNCTION public.inventory_generate_internal_identifier_v2(
  p_inventory_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company uuid := public.inventory_identifier_access_company_v2(true);
  v_inventory public.inventory%ROWTYPE;
  v_identifier public.inventory_identifiers%ROWTYPE;
  v_code text;
BEGIN
  SELECT inventory.*
    INTO v_inventory
    FROM public.inventory inventory
   WHERE inventory.id = p_inventory_id
     AND inventory.company_id = v_company
     AND inventory.customer_id IS NULL
     AND inventory.id IN (SELECT public.get_accessible_inventory_ids())
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=inventory_identifier_material_not_found';
  END IF;

  SELECT identifier.*
    INTO v_identifier
    FROM public.inventory_identifiers identifier
   WHERE identifier.company_id = v_company
     AND identifier.inventory_id = p_inventory_id
     AND identifier.identifier_type = 'internal'
     AND identifier.is_primary IS TRUE
     AND identifier.is_active IS TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    v_code := 'DX-' || upper(replace(p_inventory_id::text, '-', ''));
    BEGIN
      INSERT INTO public.inventory_identifiers(
        company_id, inventory_id, identifier_type, code, normalized_code,
        unit_label, unit_factor, is_primary, is_active
      ) VALUES (
        v_company, p_inventory_id, 'internal', v_code,
        public.inventory_normalize_identifier_v2(v_code),
        COALESCE(NULLIF(v_inventory.unit, ''), 'un'), 1, true, true
      )
      RETURNING * INTO v_identifier;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'O código interno calculado já está em uso.'
        USING ERRCODE = '23505', DETAIL = 'code=inventory_identifier_collision';
    END;
  END IF;

  RETURN jsonb_build_object(
    'identifier_id', v_identifier.id,
    'inventory_id', v_identifier.inventory_id,
    'identifier_type', v_identifier.identifier_type,
    'code', v_identifier.code,
    'unit_label', v_identifier.unit_label,
    'unit_factor', v_identifier.unit_factor,
    'is_primary', v_identifier.is_primary,
    'is_active', v_identifier.is_active
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventory_save_identifier_v2(
  p_identifier_id uuid,
  p_inventory_id uuid,
  p_identifier_type text,
  p_code text,
  p_unit_label text,
  p_unit_factor numeric DEFAULT 1,
  p_is_primary boolean DEFAULT false,
  p_is_active boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company uuid := public.inventory_identifier_access_company_v2(true);
  v_identifier public.inventory_identifiers%ROWTYPE;
BEGIN
  IF p_identifier_type NOT IN ('sku', 'barcode', 'gtin', 'qr', 'internal', 'alias') THEN
    RAISE EXCEPTION 'O tipo de código informado é inválido.'
      USING ERRCODE = '22023', DETAIL = 'code=inventory_identifier_type_invalid';
  END IF;
  IF p_unit_factor IS NULL OR p_unit_factor <= 0 THEN
    RAISE EXCEPTION 'O fator da embalagem deve ser maior que zero.'
      USING ERRCODE = '22023', DETAIL = 'code=inventory_identifier_factor_invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.inventory inventory
     WHERE inventory.id = p_inventory_id
       AND inventory.company_id = v_company
       AND inventory.customer_id IS NULL
       AND inventory.id IN (SELECT public.get_accessible_inventory_ids())
  ) THEN
    RAISE EXCEPTION 'Material não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=inventory_identifier_material_not_found';
  END IF;
  -- Edição nunca pode mover um identificador conhecido de outro material para
  -- o alvo. Além de preservar auditoria, isto fecha um desvio por UUID conhecido.
  IF p_identifier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.inventory_identifiers identifier
     WHERE identifier.id = p_identifier_id
       AND identifier.company_id = v_company
       AND identifier.inventory_id = p_inventory_id
  ) THEN
    RAISE EXCEPTION 'Identificador não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=inventory_identifier_not_found';
  END IF;
  IF p_is_primary AND p_is_active THEN
    UPDATE public.inventory_identifiers
       SET is_primary = false
     WHERE company_id = v_company
       AND inventory_id = p_inventory_id
       AND identifier_type = p_identifier_type
       AND is_primary IS TRUE
       AND is_active IS TRUE
       AND (p_identifier_id IS NULL OR id <> p_identifier_id);
  END IF;

  BEGIN
    INSERT INTO public.inventory_identifiers AS identifier(
      id, company_id, inventory_id, identifier_type, code, normalized_code,
      unit_label, unit_factor, is_primary, is_active
    ) VALUES (
      COALESCE(p_identifier_id, gen_random_uuid()), v_company, p_inventory_id,
      p_identifier_type, p_code, public.inventory_normalize_identifier_v2(p_code),
      p_unit_label, p_unit_factor, COALESCE(p_is_primary, false), COALESCE(p_is_active, true)
    )
    ON CONFLICT(id) DO UPDATE SET
      inventory_id = EXCLUDED.inventory_id,
      identifier_type = EXCLUDED.identifier_type,
      code = EXCLUDED.code,
      normalized_code = EXCLUDED.normalized_code,
      unit_label = EXCLUDED.unit_label,
      unit_factor = EXCLUDED.unit_factor,
      is_primary = EXCLUDED.is_primary,
      is_active = EXCLUDED.is_active
    WHERE identifier.company_id = v_company
      AND identifier.inventory_id = p_inventory_id
    RETURNING * INTO v_identifier;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este código já está em uso nesta empresa.'
      USING ERRCODE = '23505', DETAIL = 'code=inventory_identifier_collision';
  END;

  IF v_identifier.id IS NULL THEN
    RAISE EXCEPTION 'Identificador não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=inventory_identifier_not_found';
  END IF;

  RETURN jsonb_build_object(
    'identifier_id', v_identifier.id,
    'inventory_id', v_identifier.inventory_id,
    'identifier_type', v_identifier.identifier_type,
    'code', v_identifier.code,
    'unit_label', v_identifier.unit_label,
    'unit_factor', v_identifier.unit_factor,
    'is_primary', v_identifier.is_primary,
    'is_active', v_identifier.is_active
  );
END;
$function$;

-- SKU, GTIN e código de barras continuam disponíveis nas colunas legadas para
-- telas antigas. Esta função mantém o identificador primário correspondente
-- sincronizado em toda edição, sem apagar aliases e embalagens adicionais.
CREATE OR REPLACE FUNCTION public.inventory_sync_primary_identifiers_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_unit text := COALESCE(NULLIF(btrim(NEW.unit), ''), 'un');
  v_type text;
  v_code text;
  v_identifier_id uuid;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN RETURN NEW; END IF;

  FOREACH v_type IN ARRAY ARRAY['sku', 'gtin', 'barcode'] LOOP
    v_code := CASE v_type
      WHEN 'sku' THEN NULLIF(btrim(NEW.sku), '')
      WHEN 'gtin' THEN NULLIF(btrim(NEW.fiscal_gtin), '')
      ELSE CASE
        WHEN public.inventory_normalize_identifier_v2(NEW.barcode)
          IS NOT DISTINCT FROM public.inventory_normalize_identifier_v2(NEW.fiscal_gtin)
          THEN NULL
        ELSE NULLIF(btrim(NEW.barcode), '')
      END
    END;

    SELECT identifier.id
      INTO v_identifier_id
      FROM public.inventory_identifiers identifier
     WHERE identifier.company_id = NEW.company_id
       AND identifier.inventory_id = NEW.id
       AND identifier.identifier_type = v_type
       AND identifier.is_primary IS TRUE
     ORDER BY identifier.is_active DESC, identifier.created_at, identifier.id
     LIMIT 1
     FOR UPDATE;

    IF v_code IS NULL THEN
      IF v_identifier_id IS NOT NULL THEN
        UPDATE public.inventory_identifiers
           SET is_active = false,
               -- O índice de principal considera apenas linhas ativas. Manter
               -- esta marca permite reativar A após A -> vazio/GTIN -> A sem
               -- colidir com a própria linha inativa na UNIQUE de código.
               is_primary = true,
               unit_label = v_unit
         WHERE id = v_identifier_id;
      END IF;
    ELSIF v_identifier_id IS NULL THEN
      INSERT INTO public.inventory_identifiers(
        company_id, inventory_id, identifier_type, code, normalized_code,
        unit_label, unit_factor, is_primary, is_active
      ) VALUES (
        NEW.company_id, NEW.id, v_type, v_code,
        public.inventory_normalize_identifier_v2(v_code), v_unit, 1, true, true
      );
    ELSE
      UPDATE public.inventory_identifiers
         SET code = v_code,
             normalized_code = public.inventory_normalize_identifier_v2(v_code),
             unit_label = v_unit,
             unit_factor = 1,
             is_primary = true,
             is_active = true
       WHERE id = v_identifier_id;
    END IF;

    v_identifier_id := NULL;
  END LOOP;

  UPDATE public.inventory_identifiers
     SET unit_label = v_unit
   WHERE company_id = NEW.company_id
     AND inventory_id = NEW.id
     AND unit_factor = 1
     AND identifier_type = 'internal';

  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Um dos códigos do material já está em uso nesta empresa.'
    USING ERRCODE = '23505', DETAIL = 'code=inventory_identifier_collision';
END;
$function$;

REVOKE ALL ON FUNCTION public.inventory_sync_primary_identifiers_v2()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_inventory_sync_primary_identifiers_v2 ON public.inventory;
CREATE TRIGGER trg_inventory_sync_primary_identifiers_v2
AFTER UPDATE OF sku, barcode, fiscal_gtin, unit ON public.inventory
FOR EACH ROW
WHEN (
  OLD.sku IS DISTINCT FROM NEW.sku
  OR OLD.barcode IS DISTINCT FROM NEW.barcode
  OR OLD.fiscal_gtin IS DISTINCT FROM NEW.fiscal_gtin
  OR OLD.unit IS DISTINCT FROM NEW.unit
)
EXECUTE FUNCTION public.inventory_sync_primary_identifiers_v2();

REVOKE ALL ON FUNCTION public.inventory_generate_internal_identifier_v2(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inventory_save_identifier_v2(uuid, uuid, text, text, text, numeric, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_generate_internal_identifier_v2(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inventory_save_identifier_v2(uuid, uuid, text, text, text, numeric, boolean, boolean)
  TO authenticated, service_role;

COMMIT;

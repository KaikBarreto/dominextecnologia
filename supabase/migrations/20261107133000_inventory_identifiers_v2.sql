-- W7-01: identificadores canonicos de material, embalagem e resolucao segura.
-- Expand only: nao remove barcode/SKU/GTIN legados nem ativa UI nova.
BEGIN;

CREATE TABLE public.inventory_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  identifier_type text NOT NULL CHECK (
    identifier_type IN ('sku','barcode','gtin','qr','internal','alias')
  ),
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 160),
  normalized_code text NOT NULL CHECK (char_length(normalized_code) BETWEEN 1 AND 160),
  unit_label text NOT NULL CHECK (char_length(unit_label) BETWEEN 1 AND 40),
  unit_factor numeric(18,6) NOT NULL DEFAULT 1 CHECK (unit_factor > 0),
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_identifiers_company_type_code_key
    UNIQUE (company_id, identifier_type, normalized_code)
);

CREATE UNIQUE INDEX inventory_identifiers_one_primary_per_type
  ON public.inventory_identifiers(company_id, inventory_id, identifier_type)
  WHERE is_primary IS TRUE AND is_active IS TRUE;
CREATE INDEX inventory_identifiers_resolve_idx
  ON public.inventory_identifiers(company_id, normalized_code)
  WHERE is_active IS TRUE;
CREATE INDEX inventory_identifiers_inventory_idx
  ON public.inventory_identifiers(company_id, inventory_id, is_active);

ALTER TABLE public.inventory_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_identifiers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_identifiers FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.inventory_normalize_identifier_v2(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path=pg_catalog
AS $fn$
  SELECT upper(regexp_replace(btrim(COALESCE(p_code,'')), '[[:space:]]+', '', 'g'));
$fn$;

CREATE OR REPLACE FUNCTION public.inventory_identifiers_guard_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_inventory_company uuid;
  v_inventory_unit text;
BEGIN
  SELECT i.company_id, COALESCE(NULLIF(btrim(i.unit),''),'un')
    INTO v_inventory_company, v_inventory_unit
    FROM public.inventory i
   WHERE i.id=NEW.inventory_id;
  IF NOT FOUND OR v_inventory_company<>NEW.company_id THEN
    RAISE EXCEPTION 'O material não pertence à empresa informada.'
      USING ERRCODE='23503', DETAIL='code=inventory_identifier_material_mismatch';
  END IF;
  NEW.code:=btrim(NEW.code);
  NEW.normalized_code:=public.inventory_normalize_identifier_v2(NEW.code);
  IF NEW.normalized_code='' THEN
    RAISE EXCEPTION 'Informe um código válido.'
      USING ERRCODE='22023', DETAIL='code=inventory_identifier_code_required';
  END IF;
  NEW.unit_label:=COALESCE(NULLIF(btrim(NEW.unit_label),''),v_inventory_unit);
  NEW.updated_at:=now();
  IF TG_OP='INSERT' THEN NEW.created_by:=COALESCE(NEW.created_by,auth.uid()); END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER trg_inventory_identifiers_guard_v2
BEFORE INSERT OR UPDATE ON public.inventory_identifiers
FOR EACH ROW EXECUTE FUNCTION public.inventory_identifiers_guard_v2();

CREATE OR REPLACE FUNCTION public.inventory_seed_identifiers_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_unit text:=COALESCE(NULLIF(btrim(NEW.unit),''),'un');
  v_internal text:='DX-'||upper(replace(NEW.id::text,'-',''));
BEGIN
  -- Estoque segregado de cliente nao entra no catalogo comercial geral.
  IF NEW.customer_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.inventory_identifiers(
    company_id,inventory_id,identifier_type,code,normalized_code,
    unit_label,unit_factor,is_primary,is_active
  ) VALUES (
    NEW.company_id,NEW.id,'internal',v_internal,
    public.inventory_normalize_identifier_v2(v_internal),v_unit,1,true,true
  );
  IF NULLIF(btrim(NEW.sku),'') IS NOT NULL THEN
    INSERT INTO public.inventory_identifiers(
      company_id,inventory_id,identifier_type,code,normalized_code,
      unit_label,unit_factor,is_primary,is_active
    ) VALUES (
      NEW.company_id,NEW.id,'sku',NEW.sku,
      public.inventory_normalize_identifier_v2(NEW.sku),v_unit,1,true,true
    );
  END IF;
  IF NULLIF(btrim(NEW.fiscal_gtin),'') IS NOT NULL THEN
    INSERT INTO public.inventory_identifiers(
      company_id,inventory_id,identifier_type,code,normalized_code,
      unit_label,unit_factor,is_primary,is_active
    ) VALUES (
      NEW.company_id,NEW.id,'gtin',NEW.fiscal_gtin,
      public.inventory_normalize_identifier_v2(NEW.fiscal_gtin),v_unit,1,true,true
    );
  END IF;
  IF NULLIF(btrim(NEW.barcode),'') IS NOT NULL
     AND public.inventory_normalize_identifier_v2(NEW.barcode)
         IS DISTINCT FROM public.inventory_normalize_identifier_v2(NEW.fiscal_gtin) THEN
    INSERT INTO public.inventory_identifiers(
      company_id,inventory_id,identifier_type,code,normalized_code,
      unit_label,unit_factor,is_primary,is_active
    ) VALUES (
      NEW.company_id,NEW.id,'barcode',NEW.barcode,
      public.inventory_normalize_identifier_v2(NEW.barcode),v_unit,1,true,true
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Um dos códigos do material já está em uso nesta empresa.'
    USING ERRCODE='23505', DETAIL='code=inventory_identifier_collision';
END
$fn$;

CREATE TRIGGER trg_inventory_seed_identifiers_v2
AFTER INSERT ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.inventory_seed_identifiers_v2();

CREATE OR REPLACE FUNCTION public.inventory_identifier_has_explicit_permission_v2(
  p_user uuid,
  p_permission text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM public.user_permissions up
     WHERE up.user_id=p_user AND up.is_active IS TRUE
       AND (up.permissions ? '*' OR up.permissions ? p_permission)
  );
$fn$;

CREATE OR REPLACE FUNCTION public.inventory_identifier_access_company_v2(p_write boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_user uuid:=auth.uid();
  v_company uuid;
  v_inventory_screen boolean;
  v_pdv_screen boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501', DETAIL='code=inventory_identifier_auth_required';
  END IF;
  SELECT p.company_id INTO v_company
    FROM public.profiles p
   WHERE p.user_id=v_user AND p.is_active IS TRUE;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE='42501', DETAIL='code=inventory_identifier_company_required';
  END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O acesso da empresa está indisponível.'
      USING ERRCODE='42501', DETAIL='code=inventory_identifier_subscription_denied';
  END IF;

  v_inventory_screen:=public.company_has_module(v_company,'basic') IS TRUE AND (
    public.is_admin_or_gestor(v_user) OR public.is_super_admin(v_user)
    OR public.inventory_identifier_has_explicit_permission_v2(v_user,'screen:inventory')
  );
  v_pdv_screen:=public.company_has_module(v_company,'pdv') IS TRUE AND (
    public.is_admin_or_gestor(v_user) OR public.is_super_admin(v_user)
    OR public.inventory_identifier_has_explicit_permission_v2(v_user,'screen:pdv')
    OR public.inventory_identifier_has_explicit_permission_v2(v_user,'screen:pdv_orders')
  );
  IF NOT v_inventory_screen AND NOT v_pdv_screen THEN
    RAISE EXCEPTION 'Você não tem permissão para ler identificadores de materiais.'
      USING ERRCODE='42501', DETAIL='code=inventory_identifier_screen_denied';
  END IF;
  IF p_write AND NOT (
    public.is_admin_or_gestor(v_user) OR public.is_super_admin(v_user)
    OR (
      v_inventory_screen
      AND public.inventory_identifier_has_explicit_permission_v2(v_user,'fn:manage_inventory')
    )
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar identificadores de materiais.'
      USING ERRCODE='42501', DETAIL='code=inventory_identifier_write_denied';
  END IF;
  RETURN v_company;
END
$fn$;

CREATE OR REPLACE FUNCTION public.inventory_resolve_identifier_v2(
  p_code text,
  p_identifier_type text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_company uuid:=public.inventory_identifier_access_company_v2(false);
  v_normalized text:=public.inventory_normalize_identifier_v2(p_code);
  v_count integer;
  v_row record;
BEGIN
  IF v_normalized='' THEN
    RAISE EXCEPTION 'Informe um código para localizar o material.'
      USING ERRCODE='22023', DETAIL='code=inventory_identifier_code_required';
  END IF;
  IF p_identifier_type IS NOT NULL AND p_identifier_type NOT IN ('sku','barcode','gtin','qr','internal','alias') THEN
    RAISE EXCEPTION 'O tipo de código informado é inválido.'
      USING ERRCODE='22023', DETAIL='code=inventory_identifier_type_invalid';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.inventory_identifiers ii
    JOIN public.inventory i ON i.id=ii.inventory_id AND i.company_id=v_company
   WHERE ii.company_id=v_company AND ii.is_active IS TRUE
     AND ii.normalized_code=v_normalized
     AND (p_identifier_type IS NULL OR ii.identifier_type=p_identifier_type)
     AND i.customer_id IS NULL AND i.archived_at IS NULL
     AND i.id IN (SELECT public.get_accessible_inventory_ids());
  IF v_count=0 THEN RETURN NULL; END IF;
  IF v_count>1 THEN
    RAISE EXCEPTION 'Este código identifica mais de uma embalagem. Informe o tipo do código.'
      USING ERRCODE='21000', DETAIL='code=inventory_identifier_ambiguous';
  END IF;

  SELECT ii.id AS identifier_id,ii.identifier_type,ii.code,ii.unit_label,ii.unit_factor,
         ii.is_primary,i.id AS inventory_id,i.name,i.sku,i.unit,i.sale_price,i.archived_at
    INTO v_row
    FROM public.inventory_identifiers ii
    JOIN public.inventory i ON i.id=ii.inventory_id AND i.company_id=v_company
   WHERE ii.company_id=v_company AND ii.is_active IS TRUE
     AND ii.normalized_code=v_normalized
     AND (p_identifier_type IS NULL OR ii.identifier_type=p_identifier_type)
     AND i.customer_id IS NULL AND i.archived_at IS NULL
     AND i.id IN (SELECT public.get_accessible_inventory_ids())
   LIMIT 1;

  RETURN jsonb_build_object(
    'identifier_id',v_row.identifier_id,
    'identifier_type',v_row.identifier_type,
    'code',v_row.code,
    'unit_label',v_row.unit_label,
    'unit_factor',v_row.unit_factor,
    'is_primary',v_row.is_primary,
    'material',jsonb_build_object(
      'id',v_row.inventory_id,'name',v_row.name,'sku',v_row.sku,
      'unit',v_row.unit,'sale_price',v_row.sale_price,'archived_at',v_row.archived_at
    )
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.inventory_generate_internal_identifier_v2(
  p_inventory_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_company uuid:=public.inventory_identifier_access_company_v2(true);
  v_inventory public.inventory%ROWTYPE;
  v_identifier public.inventory_identifiers%ROWTYPE;
  v_code text;
BEGIN
  SELECT * INTO v_inventory FROM public.inventory i
   WHERE i.id=p_inventory_id AND i.company_id=v_company AND i.customer_id IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado.'
      USING ERRCODE='P0002', DETAIL='code=inventory_identifier_material_not_found';
  END IF;
  SELECT * INTO v_identifier FROM public.inventory_identifiers ii
   WHERE ii.company_id=v_company AND ii.inventory_id=p_inventory_id
     AND ii.identifier_type='internal' AND ii.is_primary IS TRUE AND ii.is_active IS TRUE
   FOR UPDATE;
  IF NOT FOUND THEN
    v_code:='DX-'||upper(replace(p_inventory_id::text,'-',''));
    BEGIN
      INSERT INTO public.inventory_identifiers(
        company_id,inventory_id,identifier_type,code,normalized_code,
        unit_label,unit_factor,is_primary,is_active
      ) VALUES (
        v_company,p_inventory_id,'internal',v_code,public.inventory_normalize_identifier_v2(v_code),
        COALESCE(NULLIF(v_inventory.unit,''),'un'),1,true,true
      ) RETURNING * INTO v_identifier;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'O código interno calculado já está em uso.'
        USING ERRCODE='23505', DETAIL='code=inventory_identifier_collision';
    END;
  END IF;
  RETURN jsonb_build_object(
    'identifier_id',v_identifier.id,'inventory_id',v_identifier.inventory_id,
    'identifier_type',v_identifier.identifier_type,'code',v_identifier.code,
    'unit_label',v_identifier.unit_label,'unit_factor',v_identifier.unit_factor,
    'is_primary',v_identifier.is_primary,'is_active',v_identifier.is_active
  );
END
$fn$;

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
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_company uuid:=public.inventory_identifier_access_company_v2(true);
  v_identifier public.inventory_identifiers%ROWTYPE;
BEGIN
  IF p_identifier_type NOT IN ('sku','barcode','gtin','qr','internal','alias') THEN
    RAISE EXCEPTION 'O tipo de código informado é inválido.'
      USING ERRCODE='22023', DETAIL='code=inventory_identifier_type_invalid';
  END IF;
  IF p_unit_factor IS NULL OR p_unit_factor<=0 THEN
    RAISE EXCEPTION 'O fator da embalagem deve ser maior que zero.'
      USING ERRCODE='22023', DETAIL='code=inventory_identifier_factor_invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory i WHERE i.id=p_inventory_id AND i.company_id=v_company AND i.customer_id IS NULL) THEN
    RAISE EXCEPTION 'Material não encontrado.'
      USING ERRCODE='P0002', DETAIL='code=inventory_identifier_material_not_found';
  END IF;
  IF p_is_primary AND p_is_active THEN
    UPDATE public.inventory_identifiers SET is_primary=false
     WHERE company_id=v_company AND inventory_id=p_inventory_id
       AND identifier_type=p_identifier_type AND is_primary IS TRUE AND is_active IS TRUE
       AND (p_identifier_id IS NULL OR id<>p_identifier_id);
  END IF;
  BEGIN
    INSERT INTO public.inventory_identifiers AS ii(
      id,company_id,inventory_id,identifier_type,code,normalized_code,
      unit_label,unit_factor,is_primary,is_active
    ) VALUES (
      COALESCE(p_identifier_id,gen_random_uuid()),v_company,p_inventory_id,p_identifier_type,
      p_code,public.inventory_normalize_identifier_v2(p_code),p_unit_label,p_unit_factor,
      COALESCE(p_is_primary,false),COALESCE(p_is_active,true)
    )
    ON CONFLICT(id) DO UPDATE SET
      inventory_id=EXCLUDED.inventory_id,identifier_type=EXCLUDED.identifier_type,
      code=EXCLUDED.code,normalized_code=EXCLUDED.normalized_code,
      unit_label=EXCLUDED.unit_label,unit_factor=EXCLUDED.unit_factor,
      is_primary=EXCLUDED.is_primary,is_active=EXCLUDED.is_active
    WHERE ii.company_id=v_company
    RETURNING * INTO v_identifier;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Este código já está em uso nesta empresa.'
      USING ERRCODE='23505', DETAIL='code=inventory_identifier_collision';
  END;
  IF v_identifier.id IS NULL THEN
    RAISE EXCEPTION 'Identificador não encontrado.'
      USING ERRCODE='P0002', DETAIL='code=inventory_identifier_not_found';
  END IF;
  RETURN jsonb_build_object(
    'identifier_id',v_identifier.id,'inventory_id',v_identifier.inventory_id,
    'identifier_type',v_identifier.identifier_type,'code',v_identifier.code,
    'unit_label',v_identifier.unit_label,'unit_factor',v_identifier.unit_factor,
    'is_primary',v_identifier.is_primary,'is_active',v_identifier.is_active
  );
END
$fn$;

-- Backfill aditivo. Todo material geral passa a ter um codigo interno estavel;
-- os identificadores legados permanecem nas colunas originais durante a convivencia.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT i.company_id,i.id,'sku'::text AS identifier_type,
               public.inventory_normalize_identifier_v2(i.sku) AS normalized_code
          FROM public.inventory i
         WHERE i.customer_id IS NULL AND NULLIF(btrim(i.sku),'') IS NOT NULL
        UNION ALL
        SELECT i.company_id,i.id,'barcode',public.inventory_normalize_identifier_v2(i.barcode)
          FROM public.inventory i
         WHERE i.customer_id IS NULL AND NULLIF(btrim(i.barcode),'') IS NOT NULL
        UNION ALL
        SELECT i.company_id,i.id,'gtin',public.inventory_normalize_identifier_v2(i.fiscal_gtin)
          FROM public.inventory i
         WHERE i.customer_id IS NULL AND NULLIF(btrim(i.fiscal_gtin),'') IS NOT NULL
      ) source
     GROUP BY source.company_id,source.identifier_type,source.normalized_code
    HAVING count(DISTINCT source.id)>1
  ) THEN
    RAISE EXCEPTION 'Existem códigos legados duplicados na mesma empresa. Corrija-os antes de ativar identificadores.'
      USING ERRCODE='23505', DETAIL='code=inventory_identifier_backfill_collision';
  END IF;
END
$preflight$;

INSERT INTO public.inventory_identifiers(
  company_id,inventory_id,identifier_type,code,normalized_code,unit_label,unit_factor,is_primary,is_active
)
SELECT i.company_id,i.id,'internal','DX-'||upper(replace(i.id::text,'-','')),
       public.inventory_normalize_identifier_v2('DX-'||upper(replace(i.id::text,'-',''))),
       COALESCE(NULLIF(btrim(i.unit),''),'un'),1,true,true
  FROM public.inventory i WHERE i.customer_id IS NULL
ON CONFLICT(company_id,identifier_type,normalized_code) DO NOTHING;

INSERT INTO public.inventory_identifiers(
  company_id,inventory_id,identifier_type,code,normalized_code,unit_label,unit_factor,is_primary,is_active
)
SELECT i.company_id,i.id,'sku',i.sku,public.inventory_normalize_identifier_v2(i.sku),
       COALESCE(NULLIF(btrim(i.unit),''),'un'),1,true,true
  FROM public.inventory i WHERE i.customer_id IS NULL AND NULLIF(btrim(i.sku),'') IS NOT NULL
ON CONFLICT(company_id,identifier_type,normalized_code) DO NOTHING;

INSERT INTO public.inventory_identifiers(
  company_id,inventory_id,identifier_type,code,normalized_code,unit_label,unit_factor,is_primary,is_active
)
SELECT i.company_id,i.id,'gtin',i.fiscal_gtin,public.inventory_normalize_identifier_v2(i.fiscal_gtin),
       COALESCE(NULLIF(btrim(i.unit),''),'un'),1,true,true
  FROM public.inventory i WHERE i.customer_id IS NULL AND NULLIF(btrim(i.fiscal_gtin),'') IS NOT NULL
ON CONFLICT(company_id,identifier_type,normalized_code) DO NOTHING;

INSERT INTO public.inventory_identifiers(
  company_id,inventory_id,identifier_type,code,normalized_code,unit_label,unit_factor,is_primary,is_active
)
SELECT i.company_id,i.id,'barcode',i.barcode,public.inventory_normalize_identifier_v2(i.barcode),
       COALESCE(NULLIF(btrim(i.unit),''),'un'),1,true,true
  FROM public.inventory i
 WHERE i.customer_id IS NULL AND NULLIF(btrim(i.barcode),'') IS NOT NULL
   AND public.inventory_normalize_identifier_v2(i.barcode)
       IS DISTINCT FROM public.inventory_normalize_identifier_v2(i.fiscal_gtin)
ON CONFLICT(company_id,identifier_type,normalized_code) DO NOTHING;

REVOKE ALL ON FUNCTION public.inventory_normalize_identifier_v2(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.inventory_identifiers_guard_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.inventory_seed_identifiers_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.inventory_identifier_has_explicit_permission_v2(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.inventory_identifier_access_company_v2(boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.inventory_resolve_identifier_v2(text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.inventory_generate_internal_identifier_v2(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.inventory_save_identifier_v2(uuid,uuid,text,text,text,numeric,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_normalize_identifier_v2(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.inventory_resolve_identifier_v2(text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.inventory_generate_internal_identifier_v2(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.inventory_save_identifier_v2(uuid,uuid,text,text,text,numeric,boolean,boolean) TO authenticated,service_role;

COMMENT ON TABLE public.inventory_identifiers IS
  'Identificadores e embalagens de materiais. A leitura autenticada ocorre somente por RPC projetada; custo e dados fiscais nao saem para o operador.';
COMMENT ON FUNCTION public.inventory_resolve_identifier_v2(text,text) IS
  'Resolve codigo dentro do tenant e ACL de estoque, retornando apenas material comercial e fator de embalagem.';

COMMIT;

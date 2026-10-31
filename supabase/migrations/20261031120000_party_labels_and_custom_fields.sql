-- Etiquetas e campos personalizados para clientes e fornecedores.
--
-- Invariantes desta migration:
--   * catalogos sempre pertencem a uma empresa e nunca atravessam tenants;
--   * cada cliente/fornecedor possui no maximo uma etiqueta;
--   * excluir uma etiqueta apenas limpa o vinculo, sem excluir a entidade;
--   * custom_fields e sempre um objeto JSON;
--   * o Portal do Cliente recebe somente chaves explicitamente liberadas por
--     is_visible + is_visible_in_portal e nunca recebe esses campos no modo
--     publico parcial (sem a autenticacao exigida pelo portal).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Catalogo compartilhado de etiquetas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.party_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  color text NOT NULL DEFAULT '#64748B' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS party_labels_company_name_unique
  ON public.party_labels (company_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS party_labels_company_active_idx
  ON public.party_labels (company_id, is_active, name);

DROP TRIGGER IF EXISTS update_party_labels_updated_at ON public.party_labels;
CREATE TRIGGER update_party_labels_updated_at
  BEFORE UPDATE ON public.party_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2) Definicoes de campos personalizados
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.party_field_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('customer', 'supplier')),
  field_key text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  field_type text NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean')),
  options jsonb CHECK (options IS NULL OR jsonb_typeof(options) = 'array'),
  is_required boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  is_visible_in_portal boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_field_config_portal_customer_only
    CHECK (entity_type = 'customer' OR NOT is_visible_in_portal)
);

CREATE UNIQUE INDEX IF NOT EXISTS party_field_config_company_entity_key_unique
  ON public.party_field_config (company_id, entity_type, field_key);

CREATE INDEX IF NOT EXISTS party_field_config_company_entity_position_idx
  ON public.party_field_config (company_id, entity_type, position, label);

DROP TRIGGER IF EXISTS update_party_field_config_updated_at ON public.party_field_config;
CREATE TRIGGER update_party_field_config_updated_at
  BEFORE UPDATE ON public.party_field_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Identidade do catalogo e imutavel: mover uma definicao entre empresas ou
-- trocar sua chave/tipo de entidade deixaria vinculos e valores existentes
-- semanticamente cruzados. Nome, cor, label, tipo visual e flags seguem
-- editaveis pelos CRUDs.
CREATE OR REPLACE FUNCTION public.guard_party_label_company_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $guard_label$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'A empresa da etiqueta nao pode ser alterada.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$guard_label$;

DROP TRIGGER IF EXISTS guard_party_label_company_immutable ON public.party_labels;
CREATE TRIGGER guard_party_label_company_immutable
  BEFORE UPDATE OF company_id ON public.party_labels
  FOR EACH ROW EXECUTE FUNCTION public.guard_party_label_company_immutable();

CREATE OR REPLACE FUNCTION public.guard_party_field_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $guard_field$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.field_key IS DISTINCT FROM OLD.field_key
  THEN
    RAISE EXCEPTION 'A chave e o tipo do campo personalizado nao podem ser alterados.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$guard_field$;

DROP TRIGGER IF EXISTS guard_party_field_identity_immutable ON public.party_field_config;
CREATE TRIGGER guard_party_field_identity_immutable
  BEFORE UPDATE OF company_id, entity_type, field_key ON public.party_field_config
  FOR EACH ROW EXECUTE FUNCTION public.guard_party_field_identity_immutable();

REVOKE ALL ON FUNCTION public.guard_party_label_company_immutable()
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_party_field_identity_immutable()
  FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Valores e vinculos nas entidades
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS label_id uuid,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS label_id uuid,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_label_id_fkey'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_label_id_fkey
      FOREIGN KEY (label_id) REFERENCES public.party_labels(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_label_id_fkey'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_label_id_fkey
      FOREIGN KEY (label_id) REFERENCES public.party_labels(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_custom_fields_object'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_custom_fields_object
      CHECK (jsonb_typeof(custom_fields) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_custom_fields_object'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_custom_fields_object
      CHECK (jsonb_typeof(custom_fields) = 'object');
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS customers_label_id_idx
  ON public.customers (label_id) WHERE label_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS suppliers_label_id_idx
  ON public.suppliers (label_id) WHERE label_id IS NOT NULL;

-- A FK simples garante existencia, mas nao garante que a etiqueta e da mesma
-- empresa. A funcao SECURITY DEFINER verifica existencia + tenant numa unica
-- condicao e devolve a mesma mensagem nos dois casos, sem funcionar como
-- oraculo de UUIDs de outro tenant.
CREATE OR REPLACE FUNCTION public.validate_party_label_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $validate$
BEGIN
  IF NEW.label_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.party_labels pl
     WHERE pl.id = NEW.label_id
       AND pl.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'A etiqueta selecionada nao esta disponivel para esta empresa.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$validate$;

DROP TRIGGER IF EXISTS validate_customer_party_label_company ON public.customers;
CREATE TRIGGER validate_customer_party_label_company
  BEFORE INSERT OR UPDATE OF label_id, company_id ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.validate_party_label_company();

DROP TRIGGER IF EXISTS validate_supplier_party_label_company ON public.suppliers;
CREATE TRIGGER validate_supplier_party_label_company
  BEFORE INSERT OR UPDATE OF label_id, company_id ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.validate_party_label_company();

REVOKE ALL ON FUNCTION public.validate_party_label_company()
  FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) RLS dos catalogos
-- ---------------------------------------------------------------------------

ALTER TABLE public.party_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_field_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users view own party labels" ON public.party_labels;
CREATE POLICY "Tenant users view own party labels"
  ON public.party_labels FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    OR public.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "System managers manage own party labels" ON public.party_labels;
CREATE POLICY "System managers manage own party labels"
  ON public.party_labels FOR ALL TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR (
      public.can_manage_system((SELECT auth.uid()))
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR (
      public.can_manage_system((SELECT auth.uid()))
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Service role manages party labels" ON public.party_labels;
CREATE POLICY "Service role manages party labels"
  ON public.party_labels FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenant users view own party field config" ON public.party_field_config;
CREATE POLICY "Tenant users view own party field config"
  ON public.party_field_config FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id((SELECT auth.uid()))
    OR public.is_super_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "System managers manage own party field config" ON public.party_field_config;
CREATE POLICY "System managers manage own party field config"
  ON public.party_field_config FOR ALL TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR (
      public.can_manage_system((SELECT auth.uid()))
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR (
      public.can_manage_system((SELECT auth.uid()))
      AND company_id = public.get_user_company_id((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Service role manages party field config" ON public.party_field_config;
CREATE POLICY "Service role manages party field config"
  ON public.party_field_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.party_labels, public.party_field_config FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.party_labels, public.party_field_config TO authenticated;
GRANT ALL ON TABLE public.party_labels, public.party_field_config TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Portal: envolve a funcao base vigente sem duplicar toda a RPC
-- ---------------------------------------------------------------------------

-- A funcao base ja aplica token, modulo, senha/sessao, secoes publicas e
-- isolamento do cliente. Renomeamos essa implementacao e recolocamos o nome
-- esperado pelo wrapper de documentos/faturas com uma camada allowlist para
-- os campos personalizados do cliente.
ALTER FUNCTION public.get_portal_data_before_customer_documents(text, text)
  RENAME TO get_portal_data_before_party_fields;

REVOKE ALL ON FUNCTION public.get_portal_data_before_party_fields(text, text)
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
  v_field_config jsonb := '[]'::jsonb;
  v_custom_fields jsonb := '{}'::jsonb;
BEGIN
  v_payload := public.get_portal_data_before_party_fields(p_token, p_session_token);

  IF v_payload IS NULL OR COALESCE(v_payload->>'access', '') <> 'granted' THEN
    RETURN v_payload;
  END IF;

  -- O wrapper publico externo ainda sanitiza `customer`, mas esta camada nao
  -- adiciona sequer o catalogo no modo partial. Assim uma futura alteracao no
  -- wrapper nao transforma metadados internos em vazamento acidental.
  IF COALESCE((v_payload->>'partial')::boolean, false) THEN
    RETURN v_payload - 'customer_field_config';
  END IF;

  v_customer_id := NULLIF(v_payload #>> '{customer,id}', '')::uuid;
  v_company_id := NULLIF(v_payload #>> '{customer,company_id}', '')::uuid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'field_key', pfc.field_key,
           'label', pfc.label,
           'field_type', pfc.field_type,
           'position', pfc.position,
           'options', pfc.options
         ) ORDER BY pfc.position, pfc.label, pfc.id), '[]'::jsonb)
    INTO v_field_config
    FROM public.party_field_config pfc
   WHERE pfc.company_id = v_company_id
     AND pfc.entity_type = 'customer'
     AND pfc.is_visible
     AND pfc.is_visible_in_portal;

  SELECT COALESCE(jsonb_object_agg(pfc.field_key, c.custom_fields->pfc.field_key), '{}'::jsonb)
    INTO v_custom_fields
    FROM public.customers c
    JOIN public.party_field_config pfc
      ON pfc.company_id = c.company_id
     AND pfc.entity_type = 'customer'
     AND pfc.is_visible
     AND pfc.is_visible_in_portal
   WHERE c.id = v_customer_id
     AND c.company_id = v_company_id
     AND c.custom_fields ? pfc.field_key;

  v_payload := jsonb_set(v_payload, '{customer_field_config}', v_field_config, true);
  v_payload := jsonb_set(v_payload, '{customer,custom_fields}', v_custom_fields, true);

  RETURN v_payload;
END;
$portal$;

COMMENT ON FUNCTION public.get_portal_data_before_customer_documents(text, text) IS
  'Camada interna do Portal do Cliente: acrescenta somente campos personalizados allowlisted para portal ao payload ja autenticado/isolado pela funcao base.';

REVOKE ALL ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Guardas de instalacao
-- ---------------------------------------------------------------------------

DO $audit$
DECLARE
  v_table text;
  v_policy_ok boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['party_labels', 'party_field_config'] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = v_table
         AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS ausente em public.%', v_table;
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = v_table
         AND cmd = 'ALL'
         AND COALESCE(qual, '') LIKE '%company_id%'
         AND COALESCE(with_check, '') LIKE '%company_id%'
    ) INTO v_policy_ok;

    IF NOT v_policy_ok THEN
      RAISE EXCEPTION 'Policy de gestao sem escopo de empresa em public.%', v_table;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.party_labels', 'SELECT')
     OR has_table_privilege('anon', 'public.party_field_config', 'SELECT')
  THEN
    RAISE EXCEPTION 'Catalogo de etiquetas/campos exposto diretamente a anon';
  END IF;

  IF has_function_privilege('anon', 'public.get_portal_data_before_party_fields(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_portal_data_before_party_fields(text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Funcao base interna do portal exposta a client role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'validate_customer_party_label_company' AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'validate_supplier_party_label_company' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Triggers de isolamento das etiquetas nao foram instalados';
  END IF;
END
$audit$;

COMMIT;

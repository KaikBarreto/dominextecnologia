-- ============================================================================
-- Grupos configuraveis do DRE por empresa
-- ============================================================================
--
-- Rollout aditivo:
--   * preserva financial_categories.dre_group para callers legados;
--   * adiciona dre_group_id nullable e faz backfill por empresa;
--   * trava o vinculo categoria/grupo no mesmo tenant no banco;
--   * mantem as duas classificacoes sincronizadas durante a transicao.
--
-- As seis `nature` abaixo sao semanticas contabeis fixas. Nome, ordem e estado
-- ativo sao configuracao da empresa; a natureza diz como o motor calcula cada
-- linha, portanto nao pode receber texto livre.


-- ----------------------------------------------------------------------------
-- 1) Catalogo por tenant
-- ----------------------------------------------------------------------------
CREATE TABLE public.dre_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  nature      text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_system   boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dre_groups_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT dre_groups_nature_check CHECK (
    nature IN (
      'revenue',
      'deduction',
      'cost',
      'operating_expense',
      'non_operating',
      'excluded'
    )
  )
);

COMMENT ON TABLE public.dre_groups IS
  'Grupos configuraveis do DRE por empresa. nature tem semantica contabil fixa; nome, ordem e ativacao sao configuraveis.';

CREATE UNIQUE INDEX dre_groups_company_name_uidx
  ON public.dre_groups (company_id, lower(btrim(name)));

-- Ha exatamente um grupo canonico de sistema por natureza/empresa. Grupos
-- adicionais podem compartilhar a natureza para detalhar a apresentacao.
CREATE UNIQUE INDEX dre_groups_company_system_nature_uidx
  ON public.dre_groups (company_id, nature)
  WHERE is_system;

CREATE INDEX dre_groups_company_order_idx
  ON public.dre_groups (company_id, sort_order, name);

CREATE TRIGGER update_dre_groups_updated_at
  BEFORE UPDATE ON public.dre_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 2) Grupos canonicos: empresas existentes e empresas futuras
-- ----------------------------------------------------------------------------
INSERT INTO public.dre_groups (company_id, name, nature, sort_order, is_system, is_active)
SELECT
  c.id,
  seed.name,
  seed.nature,
  seed.sort_order,
  true,
  true
FROM public.companies c
CROSS JOIN (VALUES
  ('Receita Bruta',              'revenue',            10),
  ('Deduções da Receita',        'deduction',          20),
  ('Custos',                     'cost',               30),
  ('Despesas Operacionais',      'operating_expense', 40),
  ('Resultado Não Operacional',  'non_operating',     50),
  ('Excluídos do DRE',           'excluded',          60)
) AS seed(name, nature, sort_order)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_system_dre_groups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.dre_groups (company_id, name, nature, sort_order, is_system, is_active)
  VALUES
    (NEW.id, 'Receita Bruta',             'revenue',            10, true, true),
    (NEW.id, 'Deduções da Receita',       'deduction',          20, true, true),
    (NEW.id, 'Custos',                    'cost',               30, true, true),
    (NEW.id, 'Despesas Operacionais',     'operating_expense', 40, true, true),
    (NEW.id, 'Resultado Não Operacional', 'non_operating',     50, true, true),
    (NEW.id, 'Excluídos do DRE',          'excluded',          60, true, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.seed_system_dre_groups() IS
  'Semeia os seis grupos DRE canonicos da empresa. Trigger separado preserva a funcao legada de categorias financeiras.';

-- Prefixo 00 faz este trigger rodar antes de
-- trg_seed_system_financial_categories (triggers do mesmo evento sao ordenados
-- pelo nome no PostgreSQL). Assim categorias de empresa nova ja encontram os
-- grupos quando o trigger de compatibilidade preencher dre_group_id.
DROP TRIGGER IF EXISTS trg_00_seed_system_dre_groups ON public.companies;
CREATE TRIGGER trg_00_seed_system_dre_groups
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_system_dre_groups();


-- ----------------------------------------------------------------------------
-- 3) Vínculo aditivo na categoria + backfill exato da regra legada
-- ----------------------------------------------------------------------------
ALTER TABLE public.financial_categories
  ADD COLUMN dre_group_id uuid;

UPDATE public.financial_categories AS fc
SET dre_group_id = dg.id
FROM public.dre_groups AS dg
WHERE dg.company_id = fc.company_id
  AND dg.is_system
  AND dg.nature = CASE
    WHEN fc.dre_group = 'opex' AND fc.type = 'entrada' THEN 'revenue'
    WHEN fc.dre_group = 'impostos'                    THEN 'deduction'
    WHEN fc.dre_group = 'cmv'                         THEN 'cost'
    WHEN fc.dre_group = 'opex' OR fc.dre_group IS NULL THEN 'operating_expense'
    WHEN fc.dre_group = 'nao_operacional'             THEN 'non_operating'
    WHEN fc.dre_group = 'outros'                      THEN 'excluded'
    ELSE 'excluded'
  END;

ALTER TABLE public.financial_categories
  ADD CONSTRAINT financial_categories_dre_group_id_fkey
  FOREIGN KEY (dre_group_id)
  REFERENCES public.dre_groups(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.financial_categories.dre_group_id IS
  'Grupo configuravel do DRE. O trigger valida que grupo e categoria pertencem a mesma empresa e preserva dre_group durante o rollout.';

CREATE INDEX financial_categories_dre_group_id_idx
  ON public.financial_categories (dre_group_id);


-- ----------------------------------------------------------------------------
-- 4) Compatibilidade bidirecional com financial_categories.dre_group
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_financial_category_dre_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nature text;
BEGIN
  -- Um grupo informado sempre e validado contra a empresa da categoria. A FK
  -- simples garante existencia; este guarda adicional impede vinculo entre
  -- tenants, inclusive em chamadas service-role.
  IF NEW.dre_group_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR NEW.dre_group_id IS DISTINCT FROM OLD.dre_group_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
       OR current_setting('app.syncing_dre_group_nature', true) = 'on'
     )
  THEN
    SELECT dg.nature
      INTO v_nature
      FROM public.dre_groups dg
     WHERE dg.id = NEW.dre_group_id
       AND dg.company_id = NEW.company_id;

    IF v_nature IS NULL THEN
      RAISE EXCEPTION 'O grupo DRE precisa pertencer a mesma empresa da categoria.'
        USING ERRCODE = '23503';
    END IF;

    NEW.dre_group := CASE v_nature
      WHEN 'revenue'           THEN 'opex'
      WHEN 'deduction'         THEN 'impostos'
      WHEN 'cost'              THEN 'cmv'
      WHEN 'operating_expense' THEN 'opex'
      WHEN 'non_operating'     THEN 'nao_operacional'
      WHEN 'excluded'          THEN 'outros'
    END;

    RETURN NEW;
  END IF;

  -- Caller legado alterou `dre_group`: aponta para o grupo canonico equivalente
  -- sem depender de filtro client-side. `opex` de entrada continua receita;
  -- `opex` de saida e NULL continuam despesa operacional.
  IF (TG_OP = 'INSERT' AND NEW.dre_group_id IS NULL)
     OR (TG_OP = 'UPDATE' AND NEW.dre_group IS DISTINCT FROM OLD.dre_group)
  THEN
    v_nature := CASE
      WHEN NEW.dre_group = 'opex' AND NEW.type = 'entrada' THEN 'revenue'
      WHEN NEW.dre_group = 'impostos'                     THEN 'deduction'
      WHEN NEW.dre_group = 'cmv'                          THEN 'cost'
      WHEN NEW.dre_group = 'opex' OR NEW.dre_group IS NULL THEN 'operating_expense'
      WHEN NEW.dre_group = 'nao_operacional'              THEN 'non_operating'
      WHEN NEW.dre_group = 'outros'                       THEN 'excluded'
      ELSE 'excluded'
    END;

    SELECT dg.id
      INTO NEW.dre_group_id
      FROM public.dre_groups dg
     WHERE dg.company_id = NEW.company_id
       AND dg.nature = v_nature
       AND dg.is_system;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_financial_category_dre_group ON public.financial_categories;
CREATE TRIGGER trg_sync_financial_category_dre_group
  BEFORE INSERT OR UPDATE OF dre_group_id, dre_group, type, company_id
  ON public.financial_categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_financial_category_dre_group();

-- Se a natureza de um grupo customizado mudar, o texto legado acompanha sem
-- trocar a categoria de grupo. A flag transaction-local diferencia esta
-- sincronizacao de uma edicao feita por um caller legado.
CREATE OR REPLACE FUNCTION public.sync_dre_group_nature_to_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.syncing_dre_group_nature', 'on', true);

  UPDATE public.financial_categories
     SET dre_group = CASE NEW.nature
       WHEN 'revenue'           THEN 'opex'
       WHEN 'deduction'         THEN 'impostos'
       WHEN 'cost'              THEN 'cmv'
       WHEN 'operating_expense' THEN 'opex'
       WHEN 'non_operating'     THEN 'nao_operacional'
       WHEN 'excluded'          THEN 'outros'
     END
   WHERE dre_group_id = NEW.id;

  PERFORM set_config('app.syncing_dre_group_nature', 'off', true);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_dre_group_nature_to_categories ON public.dre_groups;
CREATE TRIGGER trg_sync_dre_group_nature_to_categories
  AFTER UPDATE OF nature ON public.dre_groups
  FOR EACH ROW
  WHEN (OLD.nature IS DISTINCT FROM NEW.nature)
  EXECUTE FUNCTION public.sync_dre_group_nature_to_categories();

-- O marcador de sistema define o grupo canonico usado pela compatibilidade.
-- Usuarios podem renomear/reordenar esse grupo, mas nao podem desativa-lo,
-- trocar sua identidade nem promover um grupo customizado a canonico.
CREATE OR REPLACE FUNCTION public.protect_system_dre_group_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_system AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.nature IS DISTINCT FROM OLD.nature
    OR NEW.is_system IS DISTINCT FROM OLD.is_system
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
  ) THEN
    RAISE EXCEPTION 'Empresa, natureza, ativacao e marcador de um grupo DRE do sistema nao podem ser alterados.';
  END IF;

  IF NOT OLD.is_system AND NEW.is_system THEN
    RAISE EXCEPTION 'Um grupo DRE personalizado nao pode ser promovido a grupo do sistema.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_system_dre_group_identity ON public.dre_groups;
CREATE TRIGGER trg_protect_system_dre_group_identity
  BEFORE UPDATE ON public.dre_groups
  FOR EACH ROW EXECUTE FUNCTION public.protect_system_dre_group_identity();

-- Grupo com categoria vinculada deve ser desativado ou ter as categorias
-- realocadas antes da exclusao. A UI aplica o mesmo gate para dar feedback
-- imediato, mas a integridade nao depende dela. Durante DELETE CASCADE da
-- empresa, a linha pai ja nao existe e o guarda deixa a limpeza prosseguir.
CREATE OR REPLACE FUNCTION public.prevent_delete_dre_group_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
    RETURN OLD;
  END IF;

  IF OLD.is_system THEN
    RAISE EXCEPTION 'Um grupo DRE essencial não pode ser excluído.'
      USING ERRCODE = '23001';
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.financial_categories
   WHERE dre_group_id = OLD.id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Este grupo DRE está em uso por % categoria% e não pode ser excluído. Realoque as categorias ou desative o grupo.',
      v_count,
      CASE WHEN v_count = 1 THEN '' ELSE 's' END
      USING ERRCODE = '23001';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_delete_dre_group_in_use ON public.dre_groups;
CREATE TRIGGER trg_prevent_delete_dre_group_in_use
  BEFORE DELETE ON public.dre_groups
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_dre_group_in_use();


-- ----------------------------------------------------------------------------
-- 5) RLS: leitura do proprio tenant; escrita conforme configuracao financeira
-- ----------------------------------------------------------------------------
ALTER TABLE public.dre_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company DRE groups"
  ON public.dre_groups FOR SELECT TO authenticated
  USING (company_id = (SELECT public.get_user_company_id(auth.uid())));

CREATE POLICY "Managers can insert own company DRE groups"
  ON public.dre_groups FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND is_system = false
    AND (SELECT public.can_manage_system(auth.uid()))
  );

CREATE POLICY "Managers can update own company DRE groups"
  ON public.dre_groups FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND (SELECT public.can_manage_system(auth.uid()))
  );

CREATE POLICY "Managers can delete custom own company DRE groups"
  ON public.dre_groups FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND is_system = false
    AND (SELECT public.can_manage_system(auth.uid()))
  );

REVOKE ALL ON public.dre_groups FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_groups TO authenticated;

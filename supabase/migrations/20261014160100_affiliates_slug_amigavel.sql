-- ============================================================================
-- Programa de Afiliados — slug amigável (Fase 2, parte 1)
-- ============================================================================
-- Port de 20260902230000_affiliates_slug_amigavel.sql do EcoSistema.
--
-- Contexto: o link de cadastro gerado no painel vai usar ?afiliado=<slug>.
-- Com UUID o link sai gigante e feio. O slug é derivado do name
-- (ex: "joao-silva"). O UUID continua aceito no consumo (fallback), então esta
-- migration só ADICIONA — não remove nem invalida nada.
--
-- Regra do slug: unaccent(lower(name)) -> troca [^a-z0-9] por '-' -> colapsa
-- '-' repetidos -> remove '-' das pontas. Colisão => sufixo numérico
-- determinístico (joao-silva, joao-silva-2, ...). name vazio/sem caractere
-- aproveitável => fallback "afiliado-<8 primeiros chars do id>".
--
-- SLUG É ESTÁVEL: se a linha já tem slug, editar o name NÃO reescreve o slug.
-- O link já pode estar na rua (impresso, em bio de Instagram, em WhatsApp) e
-- trocar o slug mataria a atribuição da indicação.
--
-- ----------------------------------------------------------------------------
-- DIVERGÊNCIA vs EcoSistema (1): no Eco o `unaccent` está no schema public e a
-- migration chama public.unaccent(). No Dominex a extensão está em
-- `extensions` (CREATE EXTENSION ... WITH SCHEMA extensions, migration
-- 20260905210000) — `public.unaccent` NÃO EXISTE aqui e o port literal
-- quebraria. Usamos public.immutable_unaccent(text), o wrapper canônico do
-- projeto, que além de existir é de fato IMMUTABLE (dicionário fixado) — o
-- unaccent(text) cru é só STABLE e não poderia ser chamado de dentro de uma
-- função declarada IMMUTABLE como a _affiliates_slugify.
--
-- DIVERGÊNCIA vs EcoSistema (2): _affiliates_resolve_slug é SECURITY DEFINER
-- aqui. Ela precisa VER TODAS as linhas de affiliates pra detectar colisão; se
-- rodar sob a RLS do chamador e esse chamador tiver visão parcial da tabela, a
-- checagem fica cega e o INSERT morre no índice único em vez de ganhar sufixo.
-- Ela não devolve dado nenhum — só um slug — então não há exposição.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Coluna (já criada em 20261014160000; IF NOT EXISTS mantém o port fiel e
--    idempotente caso esta migration rode isolada)
-- ---------------------------------------------------------------------------
ALTER TABLE public.affiliates
  ADD COLUMN IF NOT EXISTS slug text;

-- ---------------------------------------------------------------------------
-- 2. Função pura de slugify (só normalização, sem resolver colisão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._affiliates_slugify(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(
      both '-' from
      regexp_replace(
        regexp_replace(
          lower(public.immutable_unaccent(coalesce(p_name, ''))),
          '[^a-z0-9]+', '-', 'g'   -- tudo que não é [a-z0-9] vira '-'
        ),
        '-+', '-', 'g'             -- colapsa '-' repetidos
      )
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public._affiliates_slugify(text) IS
  'Normalização pura de name -> slug (sem resolver colisão). NULL quando o name não produz nenhum caractere aproveitável.';

REVOKE ALL ON FUNCTION public._affiliates_slugify(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._affiliates_slugify(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Resolve um slug livre a partir de um name
-- ---------------------------------------------------------------------------
-- Deriva o base slug (com fallback afiliado-<8 chars> se vazio) e adiciona
-- sufixo numérico até achar um slug não usado por OUTRA linha (p_self_id é
-- excluído pra UPDATE não colidir consigo mesmo). Case-insensitive, igual ao
-- índice único.
CREATE OR REPLACE FUNCTION public._affiliates_resolve_slug(
  p_name    text,
  p_id      uuid,
  p_self_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_n         int := 1;
BEGIN
  v_base := public._affiliates_slugify(p_name);

  -- fallback quando o name não produz nada aproveitável
  IF v_base IS NULL THEN
    v_base := 'afiliado-' || left(replace(coalesce(p_id::text, gen_random_uuid()::text), '-', ''), 8);
  END IF;

  v_candidate := v_base;

  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE lower(a.slug) = lower(v_candidate)
        AND (p_self_id IS NULL OR a.id <> p_self_id)
    ) THEN
      RETURN v_candidate;
    END IF;
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public._affiliates_resolve_slug(text, uuid, uuid) IS
  'Devolve um slug livre pra um name. SECURITY DEFINER porque a detecção de colisão precisa ver TODAS as linhas de affiliates — sob a RLS do chamador a checagem poderia ficar cega e o INSERT morreria no índice único em vez de ganhar sufixo. Não expõe dado: retorna apenas o slug.';

REVOKE ALL ON FUNCTION public._affiliates_resolve_slug(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._affiliates_resolve_slug(text, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Backfill determinístico
-- ---------------------------------------------------------------------------
-- row_number() por base slug, ordenado por created_at, id (estável/reproduzível):
-- o 1º de cada grupo fica sem sufixo, os seguintes ganham -2, -3, ...
-- Hoje a tabela nasce vazia (migration anterior é desta mesma data), então o
-- esperado é "0 afiliados atualizados" — o bloco existe pro caso de replay em
-- base que já tenha linhas.
--
-- As DUAS guardas são obrigatórias e ficam no MESMO bloco do UPDATE (GET
-- DIAGNOSTICS ROW_COUNT só enxerga statement do próprio bloco PL/pgSQL).
DO $$
DECLARE
  v_updated int;
BEGIN
  WITH derived AS (
    SELECT
      a.id,
      COALESCE(
        public._affiliates_slugify(a.name),
        'afiliado-' || left(replace(a.id::text, '-', ''), 8)
      ) AS base_slug,
      a.created_at,
      a.id AS ord_id
    FROM public.affiliates a
    WHERE a.slug IS NULL
  ),
  ranked AS (
    SELECT
      id,
      base_slug,
      row_number() OVER (
        PARTITION BY lower(base_slug)
        ORDER BY created_at NULLS FIRST, ord_id
      ) AS rn
    FROM derived
  )
  UPDATE public.affiliates a
  SET slug = CASE WHEN r.rn = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.rn END
  FROM ranked r
  WHERE a.id = r.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Backfill de slug de afiliado: % linha(s) atualizada(s)', v_updated;

  IF EXISTS (SELECT 1 FROM public.affiliates WHERE slug IS NULL) THEN
    RAISE EXCEPTION 'Backfill deixou afiliado com slug NULL — abortando';
  END IF;

  IF EXISTS (
    SELECT lower(slug) FROM public.affiliates
    WHERE slug IS NOT NULL
    GROUP BY lower(slug) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Backfill gerou slugs colidentes — abortando';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Índice UNIQUE parcial, case-insensitive
-- ---------------------------------------------------------------------------
-- Unicidade real mesmo com diferença de caixa (o resolver já é ci). É esta a
-- garantia final: o resolver pode ficar desatualizado sob concorrência, o
-- índice não.
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_slug_unique_idx
  ON public.affiliates (lower(slug))
  WHERE slug IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Trigger BEFORE INSERT OR UPDATE
-- ---------------------------------------------------------------------------
-- Preenche o slug quando vier NULL (cobre QUALQUER caminho de criação: painel,
-- RPC, seed, edge). E mantém o slug ESTÁVEL: se a linha já tinha slug, o valor
-- antigo é restaurado mesmo que o name mude ou que o client mande slug novo.
CREATE OR REPLACE FUNCTION public._affiliates_fill_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- slug estável: preserva o existente; só gera se ficou/estava NULL
    IF OLD.slug IS NOT NULL THEN
      NEW.slug := OLD.slug;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.slug IS NULL THEN
    NEW.slug := public._affiliates_resolve_slug(NEW.name, NEW.id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._affiliates_fill_slug() IS
  'Trigger BEFORE INSERT OR UPDATE em affiliates: gera o slug quando ausente e o mantém IMUTÁVEL depois de criado (o link de indicação já pode estar na rua).';

-- Função de trigger também fecha pra anon/PUBLIC. Na prática ela não é
-- invocável direto (o Postgres recusa chamada de função que retorna trigger),
-- mas a auditoria de ACL conta grants e a régua do projeto é "nenhuma função
-- nova nasce executável por anon". GRANT pra authenticated/service_role porque
-- são esses os papéis que disparam INSERT/UPDATE na tabela.
REVOKE ALL ON FUNCTION public._affiliates_fill_slug() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._affiliates_fill_slug() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_affiliates_fill_slug ON public.affiliates;
CREATE TRIGGER trg_affiliates_fill_slug
  BEFORE INSERT OR UPDATE ON public.affiliates
  FOR EACH ROW
  EXECUTE FUNCTION public._affiliates_fill_slug();

COMMENT ON COLUMN public.affiliates.slug IS
  'Slug legível derivado do name para o link de cadastro amigável (?afiliado=<slug>). ESTÁVEL — não muda quando o name é editado. UUID continua aceito no consumo como fallback.';

COMMIT;

-- ============================================================================
-- ROLLBACK (comentado — aditiva/reversível):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_affiliates_fill_slug ON public.affiliates;
-- DROP FUNCTION IF EXISTS public._affiliates_fill_slug();
-- DROP FUNCTION IF EXISTS public._affiliates_resolve_slug(text, uuid, uuid);
-- DROP FUNCTION IF EXISTS public._affiliates_slugify(text);
-- DROP INDEX IF EXISTS public.affiliates_slug_unique_idx;
-- ALTER TABLE public.affiliates DROP COLUMN IF EXISTS slug;
-- COMMIT;
-- ============================================================================

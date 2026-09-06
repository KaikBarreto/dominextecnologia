-- Camada de INDEXAÇÃO E BUSCA do Guia Técnico da Dominex.
--
-- Por que existe: o Guia Técnico é um manual longo (dezenas de milhares de
-- palavras). Nenhuma LLM (o agente de WhatsApp do suporte hoje, o assistente
-- dentro do produto amanhã) recebe isso no prompt. O guia é quebrado em chunks
-- auto-contidos por script e carregado aqui, pra ser consultado sob demanda por
-- busca textual nativa do Postgres.
--
-- Escopo: é documentação de PRODUTO, igual pra toda empresa. Por isso NÃO tem
-- company_id. E, diferente do EcoSistema (de onde esta camada foi portada), a
-- página /guia-tecnico da Dominex é PÚBLICA — então a leitura é liberada
-- também pra `anon`, de propósito. A ESCRITA continua só service_role, barrada
-- em dois níveis: RLS e GRANT (o default privilege do schema public concede
-- demais em tabela nova; aqui é revogado na unha).
--
-- Sem pgvector neste projeto: busca é tsvector/tsquery com a configuração
-- `portuguese` + `unaccent` (o cliente digita sem acento).

-- ---------------------------------------------------------------------------
-- 0. Extensão unaccent
-- ---------------------------------------------------------------------------
-- DIVERGÊNCIA vs EcoSistema: lá o `unaccent` já estava instalado no schema
-- `public`. Aqui ele não existia (migrations antigas contornavam com
-- `translate`, ver public.fiscal_texto_busca). Instalado em `extensions`, que é
-- a convenção deste repositório (pg_trgm, pgcrypto, uuid-ossp moram lá).
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Wrappers IMMUTABLE
-- ---------------------------------------------------------------------------
-- ARMADILHA: `unaccent(text)` é STABLE (depende do search_path pra achar o
-- dicionário), e coluna GERADA exige expressão IMMUTABLE. A forma de duas vias
-- `unaccent(regdictionary, text)` é IMMUTABLE — este wrapper fixa o dicionário
-- e pode ser usado em coluna gerada e em índice.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $fn$
  SELECT extensions.unaccent('extensions.unaccent'::regdictionary, p_texto)
$fn$;

COMMENT ON FUNCTION public.immutable_unaccent(text) IS
  'unaccent() em versão IMMUTABLE (dicionário fixado), pra uso em coluna gerada e índice.';

-- ARMADILHA (a segunda, e é fácil de esquecer): `array_to_string` também é
-- STABLE. Um único wrapper não resolve — as colunas `chaves` e `rotas` são
-- text[] e precisam de sobrecarga própria, que junta o array SEM array_to_string.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(p_itens text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT coalesce(
    extensions.unaccent(
      'extensions.unaccent'::regdictionary,
      (SELECT string_agg(x, ' ') FROM unnest(coalesce(p_itens, '{}'::text[])) AS x)
    ),
    ''
  )
$fn$;

COMMENT ON FUNCTION public.immutable_unaccent(text[]) IS
  'Junta um text[] num texto único sem acento, IMMUTABLE (array_to_string é STABLE).';

GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text)   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text[]) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tabela
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guia_chunks (
  id            text PRIMARY KEY,                       -- ex: t7-prob-03 (estável entre regerações)
  secao         text NOT NULL,                          -- T0..T25
  secao_titulo  text,
  fase          text,                                   -- 01..07 (a Dominex tem 7 fases; ver docs/domiflix/trilha-de-tutoriais.md)
  fase_titulo   text,
  tipo          text NOT NULL,                          -- visao_geral|capitulo|problema|faq|glossario
  titulo        text NOT NULL,
  capitulo      text,
  rotas         text[] NOT NULL DEFAULT '{}',           -- rotas do app citadas na seção
  sinonimos     text,                                   -- como o cliente chama a coisa
  prints        text[] NOT NULL DEFAULT '{}',
  texto         text NOT NULL,                          -- o chunk auto-contido
  palavras      integer,
  chaves        text[] NOT NULL DEFAULT '{}',           -- termos já normalizados pelo gerador
  fonte         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- tag nomeada: comentário que cite dollar-quote dentro de DO $$ fecha o bloco
DO $guia$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guia_chunks_tipo_check'
  ) THEN
    ALTER TABLE public.guia_chunks
      ADD CONSTRAINT guia_chunks_tipo_check
      CHECK (tipo IN ('visao_geral', 'capitulo', 'problema', 'faq', 'glossario'));
  END IF;
END
$guia$;

-- ---------------------------------------------------------------------------
-- 3. Coluna gerada `busca`
-- ---------------------------------------------------------------------------
-- Pesos: A = título (o que a pergunta costuma repetir), B = sinônimos +
-- contexto de seção/capítulo (o vocabulário do cliente), C = chaves,
-- D = texto corrido. ts_rank_cd usa {D,C,B,A} = {0.1, 0.2, 0.4, 1.0}.
ALTER TABLE public.guia_chunks
  ADD COLUMN IF NOT EXISTS busca tsvector
  GENERATED ALWAYS AS (
      setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(titulo, ''))), 'A')
   || setweight(to_tsvector('portuguese', public.immutable_unaccent(
        coalesce(sinonimos, '') || ' ' || coalesce(secao_titulo, '') || ' ' || coalesce(capitulo, '')
      )), 'B')
   || setweight(to_tsvector('portuguese', public.immutable_unaccent(chaves)), 'C')
   || setweight(to_tsvector('portuguese', public.immutable_unaccent(coalesce(texto, ''))), 'D')
  ) STORED;

-- ---------------------------------------------------------------------------
-- 4. Índices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_guia_chunks_busca ON public.guia_chunks USING GIN (busca);
CREATE INDEX IF NOT EXISTS idx_guia_chunks_secao ON public.guia_chunks (secao);
CREATE INDEX IF NOT EXISTS idx_guia_chunks_tipo  ON public.guia_chunks (tipo);

-- ---------------------------------------------------------------------------
-- 5. updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_guia_chunks_updated_at ON public.guia_chunks;
CREATE TRIGGER trg_guia_chunks_updated_at
  BEFORE UPDATE ON public.guia_chunks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. RLS — leitura pública (o guia é público), escrita só service_role
-- ---------------------------------------------------------------------------
-- As policies são `USING (true)` porque o conteúdo é o mesmo pra todo mundo:
-- não há chamada de função de auth pra embrulhar em (SELECT ...), então a regra
-- de InitPlan do repositório não se aplica aqui.
ALTER TABLE public.guia_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_guia_chunks" ON public.guia_chunks;
CREATE POLICY "service_role_full_access_guia_chunks"
  ON public.guia_chunks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- DIVERGÊNCIA vs EcoSistema: lá a leitura é só `authenticated`. Aqui a página
-- /guia-tecnico é aberta (visitante sem login lê o manual), então `anon` entra
-- de propósito. Nenhum dado de cliente trafega nesta tabela.
DROP POLICY IF EXISTS "Authenticated users can read guia_chunks" ON public.guia_chunks;
DROP POLICY IF EXISTS "Anyone can read guia_chunks" ON public.guia_chunks;
CREATE POLICY "Anyone can read guia_chunks"
  ON public.guia_chunks FOR SELECT TO anon, authenticated
  USING (true);

-- o Supabase concede ALL em tabela nova pra anon e authenticated por default
-- privilege; aqui a ESCRITA é revogada na unha, e não só barrada pela RLS.
-- Sem isto, `anon` teria INSERT/UPDATE/DELETE concedidos e dependeria só da
-- ausência de policy permissiva pra não escrever — cinto e suspensório.
REVOKE ALL ON public.guia_chunks FROM anon, authenticated;
GRANT SELECT ON public.guia_chunks TO anon, authenticated;
GRANT ALL    ON public.guia_chunks TO service_role;

COMMENT ON TABLE public.guia_chunks IS
  'Guia Técnico da Dominex quebrado em chunks pesquisáveis (RAG). Documentação de produto: sem company_id. Leitura liberada a anon e authenticated (a página /guia-tecnico é pública); escrita só por service_role, revogada por GRANT além da RLS.';

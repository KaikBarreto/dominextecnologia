-- =============================================================================
-- NFS-e — autoria da nota + detalhes completos na lista paginada
-- =============================================================================
-- POR QUÊ:
--   1) A tela de Notas Fiscais vai expandir a linha da tabela mostrando o
--      detalhe completo da nota (descrição, códigos de tributação, alíquota,
--      retenção, PIS/COFINS/CSLL, % do Simples, NBS, município, documento do
--      tomador). A RPC de listagem devolvia só 16 campos, obrigando um segundo
--      round-trip por linha.
--   2) A tabela vai ter coluna com o avatar de QUEM emitiu — e `nfse_emissions`
--      não guardava o autor. Coluna `created_by` (aditiva, nullable): as notas
--      já existentes ficam NULL PARA SEMPRE (não há de onde inferir autoria),
--      então RPC e interface têm que aguentar NULL. Daí o LEFT JOIN.
--
-- Sem FK para auth.users de propósito: nota fiscal é documento e a autoria não
-- deve ser apagada nem bloquear a remoção de um usuário.
-- =============================================================================

-- ---- 1. Coluna de autoria (aditiva, idempotente) --------------------------
ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS created_by uuid;

COMMENT ON COLUMN public.nfse_emissions.created_by IS
  'auth.users.id de quem criou o rascunho / emitiu a nota. NULL em notas '
  'anteriores a 2026-09-03 (sem backfill possível). Casar com profiles.user_id, '
  'NUNCA com profiles.id.';

-- Avatar/nome do autor é resolvido por join; o índice serve pra listagem/filtro.
CREATE INDEX IF NOT EXISTS idx_nfse_emissions_created_by
  ON public.nfse_emissions (created_by)
  WHERE created_by IS NOT NULL;

-- ---- 2. RPC de listagem paginada ------------------------------------------
-- Recriada A PARTIR DA DEFINIÇÃO VIVA (pg_get_functiondef), não de migration
-- antiga: já perdemos payload neste repo por recriar RPC de arquivo velho.
-- As 16 colunas originais permanecem na MESMA ORDEM; as novas vão ao FIM.
-- Isolamento inalterado: SECURITY DEFINER + guard de company_id no corpo.
DROP FUNCTION IF EXISTS public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_nfse_emissions_paged(
  p_statuses  text[]  DEFAULT NULL::text[],
  p_date_start date    DEFAULT NULL::date,
  p_date_end   date    DEFAULT NULL::date,
  p_search    text    DEFAULT NULL::text,
  p_sort_key  text    DEFAULT 'created_at'::text,
  p_sort_dir  text    DEFAULT 'desc'::text,
  p_page      integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE(
  id uuid,
  status text,
  numero_nfse text,
  customer_id uuid,
  customer_name text,
  valor_servico numeric,
  valor_iss numeric,
  data_competencia date,
  created_at timestamp with time zone,
  emitida_em timestamp with time zone,
  pdf_url text,
  xml_url text,
  chave_acesso text,
  protocolo text,
  error_message text,
  total_count bigint,
  -- ---- novas (detalhe expandido + autoria) ----
  descricao_servico text,
  codigo_servico text,
  codigo_tributacao_municipal text,
  codigo_nbs text,
  aliquota_issqn numeric,
  trib_issqn text,
  tp_ret_issqn text,
  percentual_trib_sn numeric,
  valor_pis numeric,
  valor_cofins numeric,
  valor_csll numeric,
  municipio_incidencia_ibge text,
  service_type_id uuid,
  customer_document text,
  created_by uuid,
  created_by_name text,
  created_by_avatar_url text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company    uuid;
  v_statuses   text[];
  v_search     text;
  v_sort_key   text;
  v_sort_dir   text;
  v_page       integer;
  v_page_size  integer;
  v_offset     integer;
BEGIN
  -- Guard de tenant reaplicado no corpo (SECURITY DEFINER ignora RLS da tabela).
  v_company := public.get_user_company_id(auth.uid());
  IF v_company IS NULL THEN
    RETURN; -- sem empresa => nada
  END IF;

  IF p_statuses IS NOT NULL AND array_length(p_statuses, 1) > 0 THEN
    v_statuses := p_statuses;
  ELSE
    v_statuses := NULL; -- todos
  END IF;

  v_search := NULLIF(btrim(COALESCE(p_search, '')), '');

  -- Whitelist de ordenação (evita injeção via ORDER BY dinâmico).
  v_sort_key := CASE lower(COALESCE(p_sort_key, 'created_at'))
                  WHEN 'numero_nfse'   THEN 'numero_nfse'
                  WHEN 'valor_servico' THEN 'valor_servico'
                  WHEN 'status'        THEN 'status'
                  ELSE 'created_at'
                END;
  v_sort_dir := CASE lower(COALESCE(p_sort_dir, 'desc'))
                  WHEN 'asc' THEN 'asc'
                  ELSE 'desc'
                END;

  v_page      := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 200); -- clamp 1..200
  v_offset    := (v_page - 1) * v_page_size;

  RETURN QUERY
  WITH base AS (
    SELECT
      n.id, n.status, n.numero_nfse, n.customer_id,
      c.name AS customer_name,
      n.valor_servico, n.valor_iss, n.data_competencia,
      n.created_at, n.emitida_em, n.pdf_url, n.xml_url,
      n.chave_acesso, n.protocolo, n.error_message,
      count(*) OVER() AS total_count,
      n.descricao_servico,
      n.codigo_servico,
      n.codigo_tributacao_municipal,
      n.codigo_nbs,
      n.aliquota_issqn,
      n.trib_issqn,
      n.tp_ret_issqn,
      n.percentual_trib_sn,
      n.valor_pis,
      n.valor_cofins,
      n.valor_csll,
      n.municipio_incidencia_ibge,
      n.service_type_id,
      c.document      AS customer_document,
      n.created_by,
      -- LEFT JOIN obrigatório: created_by é NULL nas notas antigas e a nota
      -- NÃO pode desaparecer da lista por isso.
      -- profiles tem PK própria `id` + FK `user_id` → auth.users: casar por
      -- `id` devolveria zero linhas CALADAMENTE.
      pr.full_name    AS created_by_name,
      pr.avatar_url   AS created_by_avatar_url
    FROM public.nfse_emissions n
    LEFT JOIN public.customers c  ON c.id = n.customer_id
    LEFT JOIN public.profiles  pr ON pr.user_id = n.created_by
    WHERE n.company_id = v_company
      AND (v_statuses IS NULL OR n.status = ANY(v_statuses))
      AND (p_date_start IS NULL OR n.created_at >= p_date_start::timestamptz)
      AND (p_date_end   IS NULL OR n.created_at < (p_date_end + 1)::timestamptz) -- inclui o dia inteiro
      AND (
        v_search IS NULL
        OR lower(COALESCE(n.numero_nfse, ''))      LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(n.descricao_servico, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(n.chave_acesso, ''))     LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(n.protocolo, ''))        LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(c.name, ''))             LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(c.company_name, ''))     LIKE '%' || lower(v_search) || '%'
      )
  )
  SELECT
    b.id, b.status, b.numero_nfse, b.customer_id, b.customer_name,
    b.valor_servico, b.valor_iss, b.data_competencia,
    b.created_at, b.emitida_em, b.pdf_url, b.xml_url,
    b.chave_acesso, b.protocolo, b.error_message, b.total_count,
    b.descricao_servico, b.codigo_servico, b.codigo_tributacao_municipal,
    b.codigo_nbs, b.aliquota_issqn, b.trib_issqn, b.tp_ret_issqn,
    b.percentual_trib_sn, b.valor_pis, b.valor_cofins, b.valor_csll,
    b.municipio_incidencia_ibge, b.service_type_id, b.customer_document,
    b.created_by, b.created_by_name, b.created_by_avatar_url
  FROM base b
  ORDER BY
    CASE WHEN v_sort_key = 'created_at'    AND v_sort_dir = 'asc'  THEN b.created_at    END ASC,
    CASE WHEN v_sort_key = 'created_at'    AND v_sort_dir = 'desc' THEN b.created_at    END DESC,
    CASE WHEN v_sort_key = 'numero_nfse'   AND v_sort_dir = 'asc'  THEN b.numero_nfse   END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'numero_nfse'   AND v_sort_dir = 'desc' THEN b.numero_nfse   END DESC NULLS LAST,
    CASE WHEN v_sort_key = 'valor_servico' AND v_sort_dir = 'asc'  THEN b.valor_servico END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'valor_servico' AND v_sort_dir = 'desc' THEN b.valor_servico END DESC NULLS LAST,
    CASE WHEN v_sort_key = 'status'        AND v_sort_dir = 'asc'  THEN b.status        END ASC,
    CASE WHEN v_sort_key = 'status'        AND v_sort_dir = 'desc' THEN b.status        END DESC,
    b.id DESC
  LIMIT v_page_size
  OFFSET v_offset;
END;
$function$;

-- Grants IDÊNTICOS ao estado anterior (authenticated + service_role). O DROP
-- zerou as ACLs, então elas são reaplicadas aqui — sem alargar para anon.
REVOKE ALL ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) IS
  'Listagem paginada de NFS-e do tenant do chamador (guard de company_id no '
  'corpo). RETURNS TABLE: devolve ARRAY de linhas com total_count repetido em '
  'cada uma (count(*) OVER()) — NÃO é {rows,total_count}.';

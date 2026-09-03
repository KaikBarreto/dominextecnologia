-- =============================================================================
-- NFS-e — ordenação server-side por Tomador e por Data
-- =============================================================================
-- POR QUÊ:
--   A tela de Notas Fiscais ganhou cabeçalho ordenável em 5 colunas, mas a
--   whitelist da RPC só aceitava numero_nfse / valor_servico / status /
--   created_at. Para "Tomador" e "Data" o front ordenava NO CLIENTE — o que,
--   com mais de uma página, devolve resultado ERRADO: a página já vem escolhida
--   pelo banco por OUTRA ordem, e reordenar só a fatia visível não conserta.
--
--   `sort_date` = COALESCE(data_competencia, created_at::date) — exatamente a
--   mesma regra do `nfseDisplayDate` (src/components/fiscal/nfseRow.ts). Se
--   divergir, a coluna ordena por um critério e exibe outro.
--
-- SEGURANÇA DA ORDENAÇÃO (inalterada): NÃO há SQL dinâmico aqui. `p_sort_key`
-- nunca é interpolado como identificador — passa por um CASE que o mapeia para
-- uma constante da whitelist, e qualquer valor desconhecido cai no
-- ELSE 'created_at'. O ORDER BY é uma lista fixa de CASE WHEN. Não existe
-- superfície de injeção; nenhum format()/EXECUTE foi introduzido.
--
-- Recriada A PARTIR DA DEFINIÇÃO VIVA (pg_get_functiondef). O RETURNS TABLE não
-- muda (sort_date é coluna INTERNA do CTE), então CREATE OR REPLACE sem DROP —
-- e por isso as ACLs atuais (authenticated + service_role, sem anon) são
-- preservadas automaticamente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_nfse_emissions_paged(p_statuses text[] DEFAULT NULL::text[], p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_sort_key text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25)
 RETURNS TABLE(id uuid, status text, numero_nfse text, customer_id uuid, customer_name text, valor_servico numeric, valor_iss numeric, data_competencia date, created_at timestamp with time zone, emitida_em timestamp with time zone, pdf_url text, xml_url text, chave_acesso text, protocolo text, error_message text, total_count bigint, descricao_servico text, codigo_servico text, codigo_tributacao_municipal text, codigo_nbs text, aliquota_issqn numeric, trib_issqn text, tp_ret_issqn text, percentual_trib_sn numeric, valor_pis numeric, valor_cofins numeric, valor_csll numeric, municipio_incidencia_ibge text, service_type_id uuid, customer_document text, created_by uuid, created_by_name text, created_by_avatar_url text)
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
                  WHEN 'customer_name' THEN 'customer_name'
                  WHEN 'sort_date'     THEN 'sort_date'
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
      pr.avatar_url   AS created_by_avatar_url,
      -- Coluna INTERNA (não sai no RETURNS TABLE): chave de ordenação da coluna
      -- "Data" da tela. Tem que ser IDÊNTICA ao `nfseDisplayDate` de
      -- src/components/fiscal/nfseRow.ts (`data_competencia || created_at`),
      -- senão a coluna ordena por um critério e exibe outro.
      COALESCE(n.data_competencia, n.created_at::date) AS sort_date
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
    -- Tomador: `customer_name` é NULL quando a nota não tem cliente vinculado
    -- (LEFT JOIN), por isso NULLS LAST nas duas direções.
    CASE WHEN v_sort_key = 'customer_name' AND v_sort_dir = 'asc'  THEN b.customer_name END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'customer_name' AND v_sort_dir = 'desc' THEN b.customer_name END DESC NULLS LAST,
    -- Data: `created_at` é nullable no schema, então o COALESCE pode dar NULL.
    CASE WHEN v_sort_key = 'sort_date'     AND v_sort_dir = 'asc'  THEN b.sort_date     END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'sort_date'     AND v_sort_dir = 'desc' THEN b.sort_date     END DESC NULLS LAST,
    b.id DESC
  LIMIT v_page_size
  OFFSET v_offset;
END;
$function$

;

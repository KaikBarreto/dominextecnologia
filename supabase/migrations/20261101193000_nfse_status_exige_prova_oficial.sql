-- Verdade fiscal da NFS-e: o rótulo exibido ao cliente não pode encerrar uma
-- situação sem evidência devolvida pelo fisco/provedor em consulta do documento.
-- Estados locais (timeout, fila, webhook e erro interno) permanecem em
-- `confirmacao_pendente` até a reconciliação provar o desfecho.

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS status_fiscal_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_fiscal_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS status_fiscal_fonte text,
  ADD COLUMN IF NOT EXISTS status_fiscal_evidencia jsonb;

COMMENT ON COLUMN public.nfse_emissions.status_fiscal_confirmado IS
  'true somente quando consulta/documento oficial confirmou o status terminal exibido';
COMMENT ON COLUMN public.nfse_emissions.status_fiscal_fonte IS
  'Origem da prova: sefin_nacional ou consulta_provedor';
COMMENT ON COLUMN public.nfse_emissions.status_fiscal_evidencia IS
  'Resumo sem segredo da evidência que permitiu encerrar o status fiscal';

-- Backfill conservador. Autorização exige número e chave; cancelamento exige
-- chave e evento de cancelamento guardado. Rejeição só é preservada quando há
-- evento fiscal registrado. Todo o restante fica aguardando confirmação.
UPDATE public.nfse_emissions e
SET status_fiscal_confirmado = true,
    status_fiscal_confirmado_em = coalesce(e.updated_at, now()),
    status_fiscal_fonte = 'historico_documento',
    status_fiscal_evidencia = jsonb_build_object('numero', e.numero_nfse, 'chave', e.chave_acesso)
WHERE e.status = 'autorizada'
  AND nullif(trim(e.numero_nfse), '') IS NOT NULL
  AND nullif(trim(e.chave_acesso), '') IS NOT NULL;

UPDATE public.nfse_emissions e
SET status_fiscal_confirmado = true,
    status_fiscal_confirmado_em = coalesce(e.updated_at, now()),
    status_fiscal_fonte = 'historico_evento',
    status_fiscal_evidencia = jsonb_build_object('chave', e.chave_acesso, 'evento', 'cancelamento')
WHERE e.status = 'cancelada'
  AND nullif(trim(e.chave_acesso), '') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.nfse_events ev
    WHERE ev.nfse_emission_id = e.id
      AND ev.company_id = e.company_id
      AND ev.event_type ILIKE '%cancel%'
  );

UPDATE public.nfse_emissions e
SET status_fiscal_confirmado = true,
    status_fiscal_confirmado_em = coalesce(e.updated_at, now()),
    status_fiscal_fonte = 'historico_evento',
    status_fiscal_evidencia = jsonb_build_object('evento', 'rejeicao')
WHERE e.status = 'rejeitada'
  AND EXISTS (
    SELECT 1 FROM public.nfse_events ev
    WHERE ev.nfse_emission_id = e.id
      AND ev.company_id = e.company_id
      AND (ev.status = 'rejeitada' OR ev.event_type ILIKE '%rejeit%')
  );

UPDATE public.nfse_emissions
SET status = 'confirmacao_pendente',
    error_message = coalesce(
      nullif(error_message, ''),
      'A situação fiscal ainda precisa ser confirmada no portal antes de concluir esta nota.'
    ),
    updated_at = now()
WHERE status IN ('autorizada', 'rejeitada', 'cancelada', 'falhou')
  AND status_fiscal_confirmado = false;

CREATE INDEX IF NOT EXISTS idx_nfse_emissions_confirmacao_fiscal
  ON public.nfse_emissions (company_id, status, updated_at DESC)
  WHERE status IN ('confirmacao_pendente', 'pendente', 'processando', 'cancelamento_pendente');

-- A lista paginada precisa carregar a prova; sem estas colunas o navegador
-- voltaria a tratar o texto local de status como se fosse confirmação fiscal.
DROP FUNCTION IF EXISTS public.get_nfse_emissions_paged(
  text[], date, date, text, text, text, integer, integer
);

CREATE FUNCTION public.get_nfse_emissions_paged(
  p_statuses text[] DEFAULT NULL,
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_key text DEFAULT 'created_at',
  p_sort_dir text DEFAULT 'desc',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE(
  id uuid, status text,
  status_fiscal_confirmado boolean, status_fiscal_confirmado_em timestamptz,
  status_fiscal_fonte text, status_fiscal_evidencia jsonb,
  numero_nfse text, customer_id uuid, customer_name text,
  valor_servico numeric, valor_iss numeric, data_competencia date,
  created_at timestamptz, emitida_em timestamptz, pdf_url text, xml_url text,
  chave_acesso text, protocolo text, error_message text, total_count bigint,
  descricao_servico text, codigo_servico text, codigo_tributacao_municipal text,
  codigo_nbs text, aliquota_issqn numeric, trib_issqn text, tp_ret_issqn text,
  percentual_trib_sn numeric, valor_pis numeric, valor_cofins numeric,
  valor_csll numeric, municipio_incidencia_ibge text, service_type_id uuid,
  customer_document text, created_by uuid, created_by_name text,
  created_by_avatar_url text, tomador_avulso jsonb, intermediario_avulso jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_statuses text[];
  v_search text;
  v_sort_key text;
  v_sort_dir text;
  v_page integer;
  v_page_size integer;
  v_offset integer;
BEGIN
  v_company := public.get_user_company_id(auth.uid());
  IF v_company IS NULL THEN RETURN; END IF;

  v_statuses := CASE
    WHEN p_statuses IS NOT NULL AND array_length(p_statuses, 1) > 0 THEN p_statuses
    ELSE NULL
  END;
  v_search := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_sort_key := CASE lower(COALESCE(p_sort_key, 'created_at'))
    WHEN 'numero_nfse' THEN 'numero_nfse'
    WHEN 'valor_servico' THEN 'valor_servico'
    WHEN 'status' THEN 'status'
    WHEN 'customer_name' THEN 'customer_name'
    WHEN 'sort_date' THEN 'sort_date'
    ELSE 'created_at'
  END;
  v_sort_dir := CASE lower(COALESCE(p_sort_dir, 'desc'))
    WHEN 'asc' THEN 'asc' ELSE 'desc'
  END;
  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 200);
  v_offset := (v_page - 1) * v_page_size;

  RETURN QUERY
  WITH base AS (
    SELECT
      n.id, n.status,
      n.status_fiscal_confirmado, n.status_fiscal_confirmado_em,
      n.status_fiscal_fonte, n.status_fiscal_evidencia,
      n.numero_nfse, n.customer_id,
      COALESCE(c.name, NULLIF(btrim(COALESCE(n.tomador_avulso->>'nome', '')), ''))
        AS customer_name,
      n.valor_servico, n.valor_iss, n.data_competencia,
      n.created_at, n.emitida_em, n.pdf_url, n.xml_url,
      n.chave_acesso, n.protocolo, n.error_message,
      count(*) OVER() AS total_count,
      n.descricao_servico, n.codigo_servico, n.codigo_tributacao_municipal,
      n.codigo_nbs, n.aliquota_issqn, n.trib_issqn, n.tp_ret_issqn,
      n.percentual_trib_sn, n.valor_pis, n.valor_cofins, n.valor_csll,
      n.municipio_incidencia_ibge, n.service_type_id,
      COALESCE(c.document, NULLIF(btrim(COALESCE(n.tomador_avulso->>'documento', '')), ''))
        AS customer_document,
      n.created_by, pr.full_name AS created_by_name,
      pr.avatar_url AS created_by_avatar_url,
      n.tomador_avulso, n.intermediario_avulso,
      COALESCE(n.data_competencia, n.created_at::date) AS sort_date
    FROM public.nfse_emissions n
    LEFT JOIN public.customers c ON c.id = n.customer_id
    LEFT JOIN public.profiles pr ON pr.user_id = n.created_by
    WHERE n.company_id = v_company
      AND (v_statuses IS NULL OR n.status = ANY(v_statuses))
      AND (p_date_start IS NULL OR n.created_at >= p_date_start::timestamptz)
      AND (p_date_end IS NULL OR n.created_at < (p_date_end + 1)::timestamptz)
      AND (
        v_search IS NULL
        OR lower(COALESCE(n.numero_nfse, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(n.descricao_servico, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(n.chave_acesso, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(n.protocolo, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(c.name, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(c.company_name, '')) LIKE '%' || lower(v_search) || '%'
        OR lower(COALESCE(n.tomador_avulso->>'nome', '')) LIKE '%' || lower(v_search) || '%'
      )
  )
  SELECT
    b.id, b.status,
    b.status_fiscal_confirmado, b.status_fiscal_confirmado_em,
    b.status_fiscal_fonte, b.status_fiscal_evidencia,
    b.numero_nfse, b.customer_id, b.customer_name,
    b.valor_servico, b.valor_iss, b.data_competencia,
    b.created_at, b.emitida_em, b.pdf_url, b.xml_url,
    b.chave_acesso, b.protocolo, b.error_message, b.total_count,
    b.descricao_servico, b.codigo_servico, b.codigo_tributacao_municipal,
    b.codigo_nbs, b.aliquota_issqn, b.trib_issqn, b.tp_ret_issqn,
    b.percentual_trib_sn, b.valor_pis, b.valor_cofins, b.valor_csll,
    b.municipio_incidencia_ibge, b.service_type_id, b.customer_document,
    b.created_by, b.created_by_name, b.created_by_avatar_url,
    b.tomador_avulso, b.intermediario_avulso
  FROM base b
  ORDER BY
    CASE WHEN v_sort_key = 'created_at' AND v_sort_dir = 'asc' THEN b.created_at END ASC,
    CASE WHEN v_sort_key = 'created_at' AND v_sort_dir = 'desc' THEN b.created_at END DESC,
    CASE WHEN v_sort_key = 'numero_nfse' AND v_sort_dir = 'asc' THEN b.numero_nfse END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'numero_nfse' AND v_sort_dir = 'desc' THEN b.numero_nfse END DESC NULLS LAST,
    CASE WHEN v_sort_key = 'valor_servico' AND v_sort_dir = 'asc' THEN b.valor_servico END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'valor_servico' AND v_sort_dir = 'desc' THEN b.valor_servico END DESC NULLS LAST,
    CASE WHEN v_sort_key = 'status' AND v_sort_dir = 'asc' THEN b.status END ASC,
    CASE WHEN v_sort_key = 'status' AND v_sort_dir = 'desc' THEN b.status END DESC,
    CASE WHEN v_sort_key = 'customer_name' AND v_sort_dir = 'asc' THEN b.customer_name END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'customer_name' AND v_sort_dir = 'desc' THEN b.customer_name END DESC NULLS LAST,
    CASE WHEN v_sort_key = 'sort_date' AND v_sort_dir = 'asc' THEN b.sort_date END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'sort_date' AND v_sort_dir = 'desc' THEN b.sort_date END DESC NULLS LAST,
    b.id DESC
  LIMIT v_page_size OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_nfse_emissions_paged(
  text[], date, date, text, text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nfse_emissions_paged(
  text[], date, date, text, text, text, integer, integer
) TO authenticated, service_role;

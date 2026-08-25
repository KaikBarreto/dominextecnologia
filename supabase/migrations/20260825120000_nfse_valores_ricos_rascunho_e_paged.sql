-- NFS-e Onda 1 (espelho EcoSistema): valores ricos + metadados de rascunho + RPC de listagem paginada.
-- Estende public.nfse_emissions (NÃO cria tabela nova; 1 item de serviço por nota — MVP).
-- Regra de RLS já definida por Plataforma na migration de core; aqui só a implementação SQL.
-- Funções canônicas: get_user_company_id(auth.uid()). Sem ramo is_super_admin nem company_id IS NULL.
-- Escrita de nfse_emissions continua SÓ via edge service_role (invariante deliberado — PRESERVADO).

-- ============================================================
-- Tarefa 1: colunas de valores ricos + serviço + metadados de rascunho.
-- Todas NULLABLE (rascunho é parcial). Status permanece texto livre (sem CHECK hoje);
-- o valor 'rascunho' passa a ser usado sem constraint nova.
-- ============================================================
ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS data_competencia          date,
  ADD COLUMN IF NOT EXISTS regime_apuracao           text,        -- regime de apuração no Simples ('1'|'2'|'3'); opcional
  ADD COLUMN IF NOT EXISTS trib_issqn                text,        -- situação ISSQN Fisqal (enum '1'..'4')
  ADD COLUMN IF NOT EXISTS tp_ret_issqn              text,        -- tipo retenção ISSQN / ISS retido (enum '1'..'3')
  ADD COLUMN IF NOT EXISTS aliquota_issqn            numeric(7,4),
  ADD COLUMN IF NOT EXISTS valor_pis                 numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_cofins              numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_csll                numeric(12,2),
  ADD COLUMN IF NOT EXISTS percentual_trib_sn        numeric(7,4),-- percentual total tributos Simples Nacional
  ADD COLUMN IF NOT EXISTS codigo_servico            text,
  ADD COLUMN IF NOT EXISTS codigo_nbs                text,
  ADD COLUMN IF NOT EXISTS municipio_incidencia_ibge text,
  ADD COLUMN IF NOT EXISTS intermediario_customer_id uuid;

-- FK do intermediário (idempotente; ON DELETE SET NULL — apagar cliente não apaga a nota).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nfse_emissions_intermediario_customer_id_fkey'
      AND conrelid = 'public.nfse_emissions'::regclass
  ) THEN
    ALTER TABLE public.nfse_emissions
      ADD CONSTRAINT nfse_emissions_intermediario_customer_id_fkey
      FOREIGN KEY (intermediario_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.nfse_emissions.data_competencia          IS 'Data de competência (fato gerador) do serviço.';
COMMENT ON COLUMN public.nfse_emissions.regime_apuracao           IS 'Regime de apuração no Simples Nacional (1|2|3); opcional.';
COMMENT ON COLUMN public.nfse_emissions.trib_issqn                IS 'Situação ISSQN Fisqal (enum 1..4).';
COMMENT ON COLUMN public.nfse_emissions.tp_ret_issqn              IS 'Tipo de retenção ISSQN / ISS retido (enum 1..3).';
COMMENT ON COLUMN public.nfse_emissions.percentual_trib_sn        IS 'Percentual total de tributos do Simples Nacional.';
COMMENT ON COLUMN public.nfse_emissions.municipio_incidencia_ibge IS 'Código IBGE do município de incidência do ISSQN.';
COMMENT ON COLUMN public.nfse_emissions.intermediario_customer_id IS 'Intermediário do serviço (opcional; paridade EcoSistema). ON DELETE SET NULL.';

-- Índice composto para listagem paginada (company_id + created_at DESC).
CREATE INDEX IF NOT EXISTS idx_nfse_emissions_company_created
  ON public.nfse_emissions (company_id, created_at DESC);

-- ============================================================
-- Tarefa 2: RPC de listagem paginada (SECURITY DEFINER).
-- SEGURANÇA CRÍTICA: NÃO recebe company_id; deriva de auth.uid() e reaplica o predicado
-- no corpo (guard por RLS NÃO cobre SECURITY DEFINER). company nulo => vazio.
-- Busca acento-insensível quando possível; usa lower() (garantido) para não depender de unaccent.
-- Sort por whitelist (sem SQL dinâmico injetável). Paginação LIMIT/OFFSET, page_size clamp a 200.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_nfse_emissions_paged(
  p_statuses  text[]  DEFAULT NULL,
  p_date_start date   DEFAULT NULL,
  p_date_end   date   DEFAULT NULL,
  p_search    text    DEFAULT NULL,
  p_sort_key  text    DEFAULT 'created_at',
  p_sort_dir  text    DEFAULT 'desc',
  p_page      integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE (
  id               uuid,
  status           text,
  numero_nfse      text,
  customer_id      uuid,
  customer_name    text,
  valor_servico    numeric,
  valor_iss        numeric,
  data_competencia date,
  created_at       timestamptz,
  emitida_em       timestamptz,
  pdf_url          text,
  xml_url          text,
  chave_acesso     text,
  protocolo        text,
  error_message    text,
  total_count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
      count(*) OVER() AS total_count
    FROM public.nfse_emissions n
    LEFT JOIN public.customers c ON c.id = n.customer_id
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
    b.chave_acesso, b.protocolo, b.error_message, b.total_count
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

COMMENT ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) IS
  'Listagem paginada de nfse_emissions do tenant do chamador (company derivada de auth.uid(), NUNCA por parâmetro). total_count via count(*) OVER(). Sort/busca por whitelist. SECURITY DEFINER com guard de tenant reaplicado no corpo.';

-- Grants: revogar de PUBLIC e anon explicitamente; conceder só a authenticated.
REVOKE EXECUTE ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nfse_emissions_paged(text[], date, date, text, text, text, integer, integer) TO authenticated;

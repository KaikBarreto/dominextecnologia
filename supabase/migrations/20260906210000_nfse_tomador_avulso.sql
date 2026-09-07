-- =============================================================================
-- NFS-e: TOMADOR (e intermediário) AVULSO — digitado na hora, sem virar cadastro
-- =============================================================================
-- POR QUÊ
-- Decisão do CEO (2026-09-06): na Nova NFS-e o usuário precisa poder digitar o
-- tomador manualmente — nota pra cliente eventual, que não deve poluir o
-- cadastro de clientes. Até aqui `nfse_emissions` só sabia apontar pra
-- `customers` (customer_id / intermediario_customer_id), e a edge `nfse-emit`
-- devolvia `customer_not_found` (404) quando não achava a linha. A UI já existe
-- e está BLOQUEADA esperando este contrato.
--
-- POR QUE JSONB (e não colunas espelhadas)
--   1. É SNAPSHOT, não entidade: os dados valem SÓ naquela nota. Não há busca,
--      não há FK, não há join. Espalhar 8 campos × 2 partes = 16 colunas novas
--      numa tabela que já tem 38, todas NULL em 100% das notas com cadastro.
--   2. O documento fiscal é imutável: o que foi à prefeitura tem que ficar
--      congelado. Um blob é congelamento por construção (mesmo espírito do
--      `snapshot_data` que o repo já usa em outras superfícies).
--   3. Evolução sem migration: se o layout nacional passar a aceitar mais um
--      campo do tomador, é código de edge, não DDL numa tabela fiscal.
--   Custo aceito: leitura por `->>`. Resolvido de vez na RPC abaixo — a
--   listagem continua lendo `customer_name`/`customer_document` como sempre.
--
-- FORMA DO OBJETO (contrato com as edges nfse-save-draft / nfse-emit):
--   {
--     "nome": "...", "documento": "<só dígitos>", "email": "...",
--     "endereco": { "logradouro","numero","complemento","bairro",
--                   "cidade","uf","cep","ibge" }
--   }
-- Rascunho pode gravar o objeto PARCIAL (é "salvar e continuar"). Quem exige
-- campo é a emissão, em PT-BR, antes de falar com o governo.
--
-- RLS: nenhuma política nova. `nfse_emissions` é isolada por linha
-- (company_id = get_user_company_id(auth.uid()) em SELECT p/ authenticated +
-- acesso total p/ service_role). Coluna nova herda o GRANT da tabela e fica
-- coberta pela política existente — não há policy por coluna aqui.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Colunas
-- ---------------------------------------------------------------------------
ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS tomador_avulso jsonb,
  ADD COLUMN IF NOT EXISTS intermediario_avulso jsonb;

COMMENT ON COLUMN public.nfse_emissions.tomador_avulso IS
  'Tomador digitado na hora (sem cadastro em customers). Snapshot exclusivo desta nota: {nome, documento, email, endereco:{logradouro,numero,complemento,bairro,cidade,uf,cep,ibge}}. Mutuamente exclusivo com customer_id.';

COMMENT ON COLUMN public.nfse_emissions.intermediario_avulso IS
  'Intermediário digitado na hora (mesmo formato de tomador_avulso). Mutuamente exclusivo com intermediario_customer_id. ATENÇÃO: o grupo `interm` ainda NÃO é montado na DPS — ver relatório de 2026-09-06.';

-- ---------------------------------------------------------------------------
-- 2) Invariante: cadastrado XOR avulso (nenhum dos dois também é válido —
--    rascunho parcial). Sem isto, um bug de front gravaria as duas fontes e
--    ninguém saberia qual foi pro XML.
-- ---------------------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.nfse_emissions'::regclass
      AND conname = 'nfse_emissions_tomador_exclusivo'
  ) THEN
    ALTER TABLE public.nfse_emissions
      ADD CONSTRAINT nfse_emissions_tomador_exclusivo CHECK (
        (tomador_avulso IS NULL OR jsonb_typeof(tomador_avulso) = 'object')
        AND NOT (customer_id IS NOT NULL AND tomador_avulso IS NOT NULL)
      );
    RAISE NOTICE 'constraint nfse_emissions_tomador_exclusivo criada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.nfse_emissions'::regclass
      AND conname = 'nfse_emissions_intermediario_exclusivo'
  ) THEN
    ALTER TABLE public.nfse_emissions
      ADD CONSTRAINT nfse_emissions_intermediario_exclusivo CHECK (
        (intermediario_avulso IS NULL OR jsonb_typeof(intermediario_avulso) = 'object')
        AND NOT (intermediario_customer_id IS NOT NULL AND intermediario_avulso IS NOT NULL)
      );
    RAISE NOTICE 'constraint nfse_emissions_intermediario_exclusivo criada';
  END IF;
END
$guardas$;

-- ---------------------------------------------------------------------------
-- 3) Listagem: o nome do tomador NÃO pode sumir quando a nota é avulsa.
--
-- Partindo da definição VIVA (pg_get_functiondef em 2026-09-06), não de
-- migration antiga — recriar de base velha já derrubou payload de RPC neste
-- repo antes. As ÚNICAS mudanças em relação à def viva estão marcadas com
-- «AVULSO» abaixo:
--   a) customer_name / customer_document caem no avulso quando não há cadastro;
--   b) a busca por tomador também varre o nome avulso;
--   c) duas colunas novas no RETURNS TABLE (o detalhe da nota precisa dos dados
--      completos do tomador avulso — não há de onde buscar depois).
--
-- (c) muda o tipo de retorno ⇒ DROP + CREATE (CREATE OR REPLACE não basta).
-- O DROP leva os GRANTs junto: eles são refeitos no fim, iguais aos de antes
-- (authenticated, service_role — anon NUNCA).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_nfse_emissions_paged(
  text[], date, date, text, text, text, integer, integer
);

CREATE FUNCTION public.get_nfse_emissions_paged(
  p_statuses  text[]  DEFAULT NULL,
  p_date_start date   DEFAULT NULL,
  p_date_end  date    DEFAULT NULL,
  p_search    text    DEFAULT NULL,
  p_sort_key  text    DEFAULT 'created_at',
  p_sort_dir  text    DEFAULT 'desc',
  p_page      integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE(
  id uuid, status text, numero_nfse text, customer_id uuid, customer_name text,
  valor_servico numeric, valor_iss numeric, data_competencia date,
  created_at timestamptz, emitida_em timestamptz, pdf_url text, xml_url text,
  chave_acesso text, protocolo text, error_message text, total_count bigint,
  descricao_servico text, codigo_servico text, codigo_tributacao_municipal text,
  codigo_nbs text, aliquota_issqn numeric, trib_issqn text, tp_ret_issqn text,
  percentual_trib_sn numeric, valor_pis numeric, valor_cofins numeric,
  valor_csll numeric, municipio_incidencia_ibge text, service_type_id uuid,
  customer_document text, created_by uuid, created_by_name text,
  created_by_avatar_url text,
  -- «AVULSO» (c)
  tomador_avulso jsonb, intermediario_avulso jsonb
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
      -- «AVULSO» (a): sem cadastro, o nome vem do snapshot da própria nota.
      -- NULLIF pra que objeto avulso sem `nome` não vire string vazia (a tela
      -- já tem fallback pra NULL: "Sem tomador").
      COALESCE(c.name, NULLIF(btrim(COALESCE(n.tomador_avulso->>'nome', '')), ''))
        AS customer_name,
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
      -- «AVULSO» (a)
      COALESCE(c.document, NULLIF(btrim(COALESCE(n.tomador_avulso->>'documento', '')), ''))
        AS customer_document,
      n.created_by,
      -- LEFT JOIN obrigatório: created_by é NULL nas notas antigas e a nota
      -- NÃO pode desaparecer da lista por isso.
      -- profiles tem PK própria `id` + FK `user_id` → auth.users: casar por
      -- `id` devolveria zero linhas CALADAMENTE.
      pr.full_name    AS created_by_name,
      pr.avatar_url   AS created_by_avatar_url,
      -- «AVULSO» (c)
      n.tomador_avulso,
      n.intermediario_avulso,
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
        -- «AVULSO» (b): buscar pelo nome do tomador tem que achar a nota avulsa
        -- também, senão ela vira invisível pra quem filtra por cliente.
        OR lower(COALESCE(n.tomador_avulso->>'nome', '')) LIKE '%' || lower(v_search) || '%'
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
    b.created_by, b.created_by_name, b.created_by_avatar_url,
    b.tomador_avulso, b.intermediario_avulso
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
    -- (LEFT JOIN) NEM tomador avulso, por isso NULLS LAST nas duas direções.
    CASE WHEN v_sort_key = 'customer_name' AND v_sort_dir = 'asc'  THEN b.customer_name END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'customer_name' AND v_sort_dir = 'desc' THEN b.customer_name END DESC NULLS LAST,
    -- Data: `created_at` é nullable no schema, então o COALESCE pode dar NULL.
    CASE WHEN v_sort_key = 'sort_date'     AND v_sort_dir = 'asc'  THEN b.sort_date     END ASC NULLS LAST,
    CASE WHEN v_sort_key = 'sort_date'     AND v_sort_dir = 'desc' THEN b.sort_date     END DESC NULLS LAST,
    b.id DESC
  LIMIT v_page_size
  OFFSET v_offset;
END;
$function$;

-- GRANTs iguais aos de antes do DROP (proacl lido em 2026-09-06:
-- postgres, authenticated, service_role). `anon` NUNCA — a lista de notas
-- fiscais é de usuário logado.
REVOKE ALL ON FUNCTION public.get_nfse_emissions_paged(
  text[], date, date, text, text, text, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_nfse_emissions_paged(
  text[], date, date, text, text, text, integer, integer
) TO authenticated, service_role;

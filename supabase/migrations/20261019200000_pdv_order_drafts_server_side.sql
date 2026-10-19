-- =============================================================================
-- Rascunhos server-side do PDV (venda e compra)
-- =============================================================================
-- Contrato de concorrencia:
--   * revision comeca em 1; criacao exige p_expected_revision = 0.
--   * update/delete/restore exigem a revision observada pelo cliente.
--   * conflito usa SQLSTATE 40001, nunca sobrescreve silenciosamente.
--   * p_client_request_id identifica UMA mutacao de UM rascunho. Repetir a
--     mesma mutacao devolve o resultado ja persistido; reutilizar a chave com
--     outro conteudo/operacao e recusado.
--
-- A tabela nao aceita escrita direta de authenticated. Toda mutacao passa
-- pelas RPCs SECURITY DEFINER, que derivam company_id e created_by da sessao,
-- cobram vigencia da assinatura e modulo pdv, validam o payload e aplicam o
-- limite atomico de 20 ativos por usuario/tipo.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.pdv_order_drafts (
  id                     uuid        PRIMARY KEY,
  company_id             uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_type             text        NOT NULL,
  payload                jsonb       NOT NULL,
  revision               bigint      NOT NULL DEFAULT 1,
  last_client_request_id uuid        NOT NULL,
  last_request_kind      text        NOT NULL DEFAULT 'save',
  deleted_at             timestamptz,
  deleted_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pdv_order_drafts_type_check
    CHECK (draft_type IN ('sale', 'purchase')),
  CONSTRAINT pdv_order_drafts_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT pdv_order_drafts_payload_size_check
    CHECK (octet_length(payload::text) <= 131072),
  CONSTRAINT pdv_order_drafts_revision_check
    CHECK (revision >= 1),
  CONSTRAINT pdv_order_drafts_request_kind_check
    CHECK (last_request_kind IN ('save', 'delete', 'restore'))
);

COMMENT ON TABLE public.pdv_order_drafts IS
  'Rascunhos recuperaveis de venda/compra do PDV. Isolamento por company_id + created_by; mutacoes somente pelas RPCs com CAS em revision.';
COMMENT ON COLUMN public.pdv_order_drafts.payload IS
  'Snapshot JSONB do rascunho, obrigatoriamente objeto e limitado a 128 KiB; a RPC tambem valida a forma minima por sale/purchase e limita itens a 200.';
COMMENT ON COLUMN public.pdv_order_drafts.revision IS
  'Versao monotona para compare-and-swap. Cliente envia a revisao observada; divergencia retorna SQLSTATE 40001.';
COMMENT ON COLUMN public.pdv_order_drafts.last_client_request_id IS
  'Id UUID da ultima mutacao. Retry com a mesma chave e mesmo efeito e idempotente por draft.';
COMMENT ON COLUMN public.pdv_order_drafts.deleted_at IS
  'Soft-delete recuperavel por pdv_restore_order_draft; linhas apagadas nao contam no limite de 20 ativos.';

CREATE INDEX idx_pdv_order_drafts_owner_active
  ON public.pdv_order_drafts
    (company_id, created_by, draft_type, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_pdv_order_drafts_owner_deleted
  ON public.pdv_order_drafts
    (company_id, created_by, draft_type, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

ALTER TABLE public.pdv_order_drafts ENABLE ROW LEVEL SECURITY;

-- Leitura REST direta fica limitada a rascunhos ativos do proprio usuario.
-- Excluidos so aparecem pela RPC quando p_include_deleted=true. Nao ha policy
-- de INSERT/UPDATE/DELETE: mesmo um grant acidental futuro continua fail-closed.
CREATE POLICY "Users read own active entitled pdv drafts"
  ON public.pdv_order_drafts
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND created_by = (SELECT auth.uid())
    AND public.tenant_subscription_allows_access(company_id)
    AND public.company_has_module(company_id, 'pdv')
  );

REVOKE ALL ON TABLE public.pdv_order_drafts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.pdv_order_drafts TO authenticated;

-- Gate unico das quatro RPCs. Nao concede bypass a super_admin nem service_role:
-- o contrato e pessoal e as RPCs sao expostas somente a authenticated.
CREATE FUNCTION public.pdv_assert_draft_access()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT p.company_id
    INTO v_company
    FROM public.profiles p
   WHERE p.user_id = v_uid
     AND p.is_active IS TRUE;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Usuario sem empresa ativa.' USING ERRCODE = '42501';
  END IF;

  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Assinatura inativa ou vencida: os rascunhos do PDV estao bloqueados.'
      USING ERRCODE = '42501';
  END IF;

  IF public.company_has_module(v_company, 'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O modulo PDV nao esta ativo para esta empresa.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_company;
END
$fn$;

COMMENT ON FUNCTION public.pdv_assert_draft_access() IS
  'Gate interno dos rascunhos PDV: auth.uid, profile ativo, tenant, assinatura vigente e modulo pdv. Sem EXECUTE para roles de API.';

REVOKE ALL ON FUNCTION public.pdv_assert_draft_access() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.pdv_validate_draft_payload(
  p_draft_id uuid,
  p_draft_type text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_sequence numeric;
BEGIN
  IF p_draft_id IS NULL THEN
    RAISE EXCEPTION 'draft_id e obrigatorio.' USING ERRCODE = '22023';
  END IF;

  IF p_draft_type IS NULL OR p_draft_type NOT IN ('sale', 'purchase') THEN
    RAISE EXCEPTION 'draft_type deve ser sale ou purchase.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'payload deve ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;

  IF octet_length(p_payload::text) > 131072 THEN
    RAISE EXCEPTION 'payload excede o limite de 128 KiB.' USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'id' AND p_payload->>'id' IS DISTINCT FROM p_draft_id::text THEN
    RAISE EXCEPTION 'payload.id nao corresponde ao draft_id.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload->'sequence') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'payload.sequence deve ser numerico.' USING ERRCODE = '22023';
  END IF;

  v_sequence := (p_payload->>'sequence')::numeric;
  IF v_sequence < 1 OR v_sequence > 1000000 OR trunc(v_sequence) <> v_sequence THEN
    RAISE EXCEPTION 'payload.sequence deve ser inteiro entre 1 e 1000000.'
      USING ERRCODE = '22023';
  END IF;

  IF p_draft_type = 'sale' THEN
    IF jsonb_typeof(p_payload->'cart') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_payload->'cart'->'lines') IS DISTINCT FROM 'array'
    THEN
      RAISE EXCEPTION 'Rascunho de venda exige cart.lines como array.'
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_payload->'cart'->'lines') > 200 THEN
      RAISE EXCEPTION 'Rascunho de venda excede 200 itens.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_payload->'transactionDate') IS DISTINCT FROM 'string'
       OR length(p_payload->>'transactionDate') NOT BETWEEN 1 AND 32
    THEN
      RAISE EXCEPTION 'Rascunho de venda exige transactionDate valido.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Rascunho de compra exige items como array.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_payload->'items') > 200 THEN
      RAISE EXCEPTION 'Rascunho de compra excede 200 itens.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_payload->'purchaseDate') IS DISTINCT FROM 'string'
       OR length(p_payload->>'purchaseDate') NOT BETWEEN 1 AND 32
    THEN
      RAISE EXCEPTION 'Rascunho de compra exige purchaseDate valido.'
        USING ERRCODE = '22023';
    END IF;
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.pdv_validate_draft_payload(uuid, text, jsonb) IS
  'Validador interno: objeto ate 128 KiB, id coerente, sequence e forma minima de sale/purchase, com no maximo 200 itens.';

REVOKE ALL ON FUNCTION public.pdv_validate_draft_payload(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.pdv_list_order_drafts(
  p_draft_type text DEFAULT NULL,
  p_include_deleted boolean DEFAULT false
)
RETURNS SETOF public.pdv_order_drafts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
BEGIN
  v_company := public.pdv_assert_draft_access();

  IF p_draft_type IS NOT NULL AND p_draft_type NOT IN ('sale', 'purchase') THEN
    RAISE EXCEPTION 'draft_type deve ser sale ou purchase.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT d.*
    FROM public.pdv_order_drafts d
   WHERE d.company_id = v_company
     AND d.created_by = v_uid
     AND (p_draft_type IS NULL OR d.draft_type = p_draft_type)
     AND (COALESCE(p_include_deleted, false) OR d.deleted_at IS NULL)
   ORDER BY d.updated_at DESC, d.id;
END
$fn$;

COMMENT ON FUNCTION public.pdv_list_order_drafts(text, boolean) IS
  'Lista somente rascunhos do usuario/tenant autenticado. Padrao: ambos os tipos e somente ativos; p_include_deleted=true inclui recuperaveis.';

CREATE FUNCTION public.pdv_save_order_draft(
  p_draft_id uuid,
  p_draft_type text,
  p_payload jsonb,
  p_expected_revision bigint,
  p_client_request_id uuid
)
RETURNS public.pdv_order_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_draft   public.pdv_order_drafts%ROWTYPE;
  v_count   integer;
BEGIN
  v_company := public.pdv_assert_draft_access();
  PERFORM public.pdv_validate_draft_payload(p_draft_id, p_draft_type, p_payload);

  IF p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'client_request_id e obrigatorio.' USING ERRCODE = '22023';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'expected_revision deve ser maior ou igual a zero.'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa create/restore/limite dentro do mesmo owner+tipo e tambem fecha
  -- a corrida entre dois creates simultaneos do mesmo draft_id.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pdv_order_drafts:' || v_company::text || ':' || v_uid::text || ':' || p_draft_type,
      0
    )
  );

  SELECT d.*
    INTO v_draft
    FROM public.pdv_order_drafts d
   WHERE d.id = p_draft_id
   FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION 'Conflito de revisao do rascunho.'
        USING ERRCODE = '40001',
              DETAIL = 'expected_revision=' || p_expected_revision || ',current_revision=missing';
    END IF;

    SELECT count(*)
      INTO v_count
      FROM public.pdv_order_drafts d
     WHERE d.company_id = v_company
       AND d.created_by = v_uid
       AND d.draft_type = p_draft_type
       AND d.deleted_at IS NULL;

    IF v_count >= 20 THEN
      RAISE EXCEPTION 'Limite de 20 rascunhos ativos por tipo atingido.'
        USING ERRCODE = '54000';
    END IF;

    BEGIN
      INSERT INTO public.pdv_order_drafts (
        id, company_id, created_by, draft_type, payload, revision,
        last_client_request_id, last_request_kind
      ) VALUES (
        p_draft_id, v_company, v_uid, p_draft_type, p_payload, 1,
        p_client_request_id, 'save'
      )
      RETURNING * INTO v_draft;
    EXCEPTION WHEN unique_violation THEN
      -- Nao revela se o UUID pertence a outro tenant/usuario.
      RAISE EXCEPTION 'Rascunho indisponivel.' USING ERRCODE = '42501';
    END;

    RETURN v_draft;
  END IF;

  IF v_draft.company_id <> v_company OR v_draft.created_by <> v_uid THEN
    RAISE EXCEPTION 'Rascunho indisponivel.' USING ERRCODE = '42501';
  END IF;
  IF v_draft.draft_type <> p_draft_type THEN
    RAISE EXCEPTION 'O tipo do rascunho e imutavel.' USING ERRCODE = '22023';
  END IF;

  IF v_draft.last_client_request_id = p_client_request_id THEN
    IF v_draft.last_request_kind = 'save' AND v_draft.payload = p_payload THEN
      RETURN v_draft;
    END IF;
    RAISE EXCEPTION 'client_request_id ja usado com outra mutacao.'
      USING ERRCODE = '22023';
  END IF;

  IF v_draft.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Rascunho excluido; restaure antes de editar.'
      USING ERRCODE = '55000';
  END IF;

  IF v_draft.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Conflito de revisao do rascunho.'
      USING ERRCODE = '40001',
            DETAIL = 'expected_revision=' || p_expected_revision
                     || ',current_revision=' || v_draft.revision;
  END IF;

  -- Snapshot igual nao cria revisao artificial, mas registra a chave para que
  -- o retry desta mutacao continue deterministico.
  UPDATE public.pdv_order_drafts d
     SET payload = p_payload,
         revision = CASE WHEN d.payload = p_payload THEN d.revision ELSE d.revision + 1 END,
         last_client_request_id = p_client_request_id,
         last_request_kind = 'save',
         updated_at = CASE WHEN d.payload = p_payload THEN d.updated_at ELSE now() END
   WHERE d.id = p_draft_id
  RETURNING d.* INTO v_draft;

  RETURN v_draft;
END
$fn$;

COMMENT ON FUNCTION public.pdv_save_order_draft(uuid, text, jsonb, bigint, uuid) IS
  'Cria (expected_revision=0) ou salva via CAS. Retorna a linha atual; retry do mesmo client_request_id+payload e idempotente; conflito usa SQLSTATE 40001.';

CREATE FUNCTION public.pdv_delete_order_draft(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_client_request_id uuid
)
RETURNS public.pdv_order_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_draft   public.pdv_order_drafts%ROWTYPE;
BEGIN
  v_company := public.pdv_assert_draft_access();
  IF p_draft_id IS NULL OR p_client_request_id IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision < 1
  THEN
    RAISE EXCEPTION 'draft_id, client_request_id e expected_revision valida sao obrigatorios.'
      USING ERRCODE = '22023';
  END IF;

  SELECT d.* INTO v_draft
    FROM public.pdv_order_drafts d
   WHERE d.id = p_draft_id
   FOR UPDATE;

  IF NOT FOUND OR v_draft.company_id <> v_company OR v_draft.created_by <> v_uid THEN
    RAISE EXCEPTION 'Rascunho indisponivel.' USING ERRCODE = '42501';
  END IF;

  IF v_draft.last_client_request_id = p_client_request_id THEN
    IF v_draft.last_request_kind = 'delete' AND v_draft.deleted_at IS NOT NULL THEN
      RETURN v_draft;
    END IF;
    RAISE EXCEPTION 'client_request_id ja usado com outra mutacao.'
      USING ERRCODE = '22023';
  END IF;

  IF v_draft.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Conflito de revisao do rascunho.'
      USING ERRCODE = '40001',
            DETAIL = 'expected_revision=' || p_expected_revision
                     || ',current_revision=' || v_draft.revision;
  END IF;

  IF v_draft.deleted_at IS NOT NULL THEN
    RETURN v_draft;
  END IF;

  UPDATE public.pdv_order_drafts d
     SET deleted_at = now(),
         deleted_by = v_uid,
         revision = d.revision + 1,
         last_client_request_id = p_client_request_id,
         last_request_kind = 'delete',
         updated_at = now()
   WHERE d.id = p_draft_id
  RETURNING d.* INTO v_draft;

  RETURN v_draft;
END
$fn$;

COMMENT ON FUNCTION public.pdv_delete_order_draft(uuid, bigint, uuid) IS
  'Soft-delete via CAS. Retry com o mesmo client_request_id e idempotente; payload permanece recuperavel.';

CREATE FUNCTION public.pdv_restore_order_draft(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_client_request_id uuid
)
RETURNS public.pdv_order_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_draft   public.pdv_order_drafts%ROWTYPE;
  v_count   integer;
BEGIN
  v_company := public.pdv_assert_draft_access();
  IF p_draft_id IS NULL OR p_client_request_id IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision < 1
  THEN
    RAISE EXCEPTION 'draft_id, client_request_id e expected_revision valida sao obrigatorios.'
      USING ERRCODE = '22023';
  END IF;

  -- Primeiro descobre o tipo sem segurar row lock; depois adquire o mesmo
  -- advisory lock usado por save/create e so entao trava a linha. Essa ordem
  -- evita deadlock save(advisory->row) x restore(row->advisory).
  SELECT d.* INTO v_draft
    FROM public.pdv_order_drafts d
   WHERE d.id = p_draft_id;

  IF NOT FOUND OR v_draft.company_id <> v_company OR v_draft.created_by <> v_uid THEN
    RAISE EXCEPTION 'Rascunho indisponivel.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pdv_order_drafts:' || v_company::text || ':' || v_uid::text || ':' || v_draft.draft_type,
      0
    )
  );

  SELECT d.* INTO v_draft
    FROM public.pdv_order_drafts d
   WHERE d.id = p_draft_id
   FOR UPDATE;

  IF NOT FOUND OR v_draft.company_id <> v_company OR v_draft.created_by <> v_uid THEN
    RAISE EXCEPTION 'Rascunho indisponivel.' USING ERRCODE = '42501';
  END IF;

  IF v_draft.last_client_request_id = p_client_request_id THEN
    IF v_draft.last_request_kind = 'restore' AND v_draft.deleted_at IS NULL THEN
      RETURN v_draft;
    END IF;
    RAISE EXCEPTION 'client_request_id ja usado com outra mutacao.'
      USING ERRCODE = '22023';
  END IF;

  IF v_draft.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Conflito de revisao do rascunho.'
      USING ERRCODE = '40001',
            DETAIL = 'expected_revision=' || p_expected_revision
                     || ',current_revision=' || v_draft.revision;
  END IF;

  IF v_draft.deleted_at IS NULL THEN
    RETURN v_draft;
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.pdv_order_drafts d
   WHERE d.company_id = v_company
     AND d.created_by = v_uid
     AND d.draft_type = v_draft.draft_type
     AND d.deleted_at IS NULL;

  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Limite de 20 rascunhos ativos por tipo atingido.'
      USING ERRCODE = '54000';
  END IF;

  UPDATE public.pdv_order_drafts d
     SET deleted_at = NULL,
         deleted_by = NULL,
         revision = d.revision + 1,
         last_client_request_id = p_client_request_id,
         last_request_kind = 'restore',
         updated_at = now()
   WHERE d.id = p_draft_id
  RETURNING d.* INTO v_draft;

  RETURN v_draft;
END
$fn$;

COMMENT ON FUNCTION public.pdv_restore_order_draft(uuid, bigint, uuid) IS
  'Restaura soft-delete via CAS, respeitando atomicamente o limite de 20 ativos por usuario/tipo.';

-- Superficie publica minima: somente authenticated executa as quatro RPCs.
REVOKE ALL ON FUNCTION public.pdv_list_order_drafts(text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_save_order_draft(uuid, text, jsonb, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_delete_order_draft(uuid, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_restore_order_draft(uuid, bigint, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.pdv_list_order_drafts(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_save_order_draft(uuid, text, jsonb, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_delete_order_draft(uuid, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_restore_order_draft(uuid, bigint, uuid) TO authenticated;

-- Falha a migration se o contrato de menor privilegio/RLS derivar do esperado.
DO $audit$
DECLARE
  v_policy text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'pdv_order_drafts'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS ausente em public.pdv_order_drafts';
  END IF;

  SELECT qual INTO v_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'pdv_order_drafts'
     AND policyname = 'Users read own active entitled pdv drafts'
     AND cmd = 'SELECT';

  IF v_policy IS NULL
     OR v_policy NOT LIKE '%company_id%get_user_company_id%'
     OR v_policy NOT LIKE '%created_by%uid%'
     OR v_policy NOT LIKE '%tenant_subscription_allows_access%'
     OR v_policy NOT LIKE '%company_has_module%'
  THEN
    RAISE EXCEPTION 'Policy de rascunhos sem isolamento/gates esperados';
  END IF;

  IF has_table_privilege('anon', 'public.pdv_order_drafts', 'SELECT')
     OR has_table_privilege('anon', 'public.pdv_order_drafts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'DELETE')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.pdv_order_drafts', 'SELECT')
     OR has_table_privilege('service_role', 'public.pdv_order_drafts', 'INSERT')
  THEN
    RAISE EXCEPTION 'Grant direto indevido em public.pdv_order_drafts';
  END IF;

  IF has_function_privilege('anon', 'public.pdv_list_order_drafts(text,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pdv_save_order_draft(uuid,text,jsonb,bigint,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pdv_delete_order_draft(uuid,bigint,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pdv_restore_order_draft(uuid,bigint,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pdv_assert_draft_access()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pdv_validate_draft_payload(uuid,text,jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Superficie de EXECUTE dos rascunhos esta ampla demais';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.pdv_list_order_drafts(text,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_save_order_draft(uuid,text,jsonb,bigint,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_delete_order_draft(uuid,bigint,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_restore_order_draft(uuid,bigint,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'RPC autenticada de rascunhos sem EXECUTE';
  END IF;
END
$audit$;

COMMIT;

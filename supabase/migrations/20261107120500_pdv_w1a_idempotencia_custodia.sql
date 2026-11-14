-- W1A-01: fundacao aditiva de idempotencia, reconciliacao e custodia do PDV.
--
-- Esta migration NAO ativa o contrato v2, NAO faz backfill e NAO substitui as
-- RPCs v1. Registros legados continuam com os campos v2 nulos. Os novos livros
-- nao possuem acesso direto de client: futuras RPCs SECURITY DEFINER derivam a
-- empresa do usuario, validam entitlement/permissao e usam os helpers internos.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Requests idempotentes: uma chave so pode representar um payload.
-- ---------------------------------------------------------------------------

CREATE TABLE public.pdv_operation_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operation_type     text        NOT NULL,
  idempotency_key    text        NOT NULL,
  payload_hash       text        NOT NULL,
  status             text        NOT NULL DEFAULT 'pending',
  resource_type      text,
  resource_id        uuid,
  result             jsonb,
  error_code         text,
  created_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pdv_operation_requests_operation_type_check CHECK (
    operation_type = btrim(operation_type)
    AND operation_type ~ '^[a-z][a-z0-9_.:-]{1,79}$'
  ),
  CONSTRAINT pdv_operation_requests_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND char_length(idempotency_key) BETWEEN 8 AND 200
  ),
  CONSTRAINT pdv_operation_requests_hash_check CHECK (
    payload_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT pdv_operation_requests_status_check CHECK (
    status IN ('pending', 'completed', 'failed')
  ),
  CONSTRAINT pdv_operation_requests_result_size_check CHECK (
    result IS NULL OR octet_length(result::text) <= 1048576
  ),
  CONSTRAINT pdv_operation_requests_completion_check CHECK (
    (
      status = 'pending'
      AND completed_at IS NULL
      AND result IS NULL
      AND error_code IS NULL
    )
    OR (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND result IS NOT NULL
      AND error_code IS NULL
    )
    OR (
      status = 'failed'
      AND completed_at IS NOT NULL
      AND error_code IS NOT NULL
    )
  ),
  CONSTRAINT pdv_operation_requests_company_operation_key_unique
    UNIQUE (company_id, operation_type, idempotency_key)
);

CREATE INDEX idx_pdv_operation_requests_company_created
  ON public.pdv_operation_requests (company_id, created_at DESC);
CREATE INDEX idx_pdv_operation_requests_pending
  ON public.pdv_operation_requests (company_id, operation_type, created_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.pdv_operation_requests IS
  'Requests idempotentes internos do PDV v2. A mesma empresa+operacao+chave so aceita o mesmo hash de payload e devolve o resultado persistido. Sem backfill: idempotencia passada nao pode ser inventada.';

-- ---------------------------------------------------------------------------
-- 2. Fila auditavel para ambiguidades de migracao e conciliacao.
-- ---------------------------------------------------------------------------

CREATE TABLE public.pdv_reconciliation_issues (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  issue_domain       text        NOT NULL,
  issue_code         text        NOT NULL,
  resource_type      text        NOT NULL,
  resource_id        uuid,
  evidence           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status             text        NOT NULL DEFAULT 'open',
  resolution         jsonb,
  detected_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  resolved_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pdv_reconciliation_issues_domain_check CHECK (
    issue_domain = btrim(issue_domain)
    AND issue_domain ~ '^[a-z][a-z0-9_.:-]{1,79}$'
  ),
  CONSTRAINT pdv_reconciliation_issues_code_check CHECK (
    issue_code = btrim(issue_code)
    AND issue_code ~ '^[a-z][a-z0-9_.:-]{1,119}$'
  ),
  CONSTRAINT pdv_reconciliation_issues_resource_type_check CHECK (
    resource_type = btrim(resource_type)
    AND resource_type ~ '^[a-z][a-z0-9_.:-]{1,79}$'
  ),
  CONSTRAINT pdv_reconciliation_issues_status_check CHECK (
    status IN ('open', 'in_review', 'resolved', 'ignored')
  ),
  CONSTRAINT pdv_reconciliation_issues_resolution_check CHECK (
    (
      status IN ('open', 'in_review')
      AND resolved_at IS NULL
      AND resolved_by IS NULL
      AND resolution IS NULL
    )
    OR (
      status IN ('resolved', 'ignored')
      AND resolved_at IS NOT NULL
      AND resolution IS NOT NULL
    )
  )
);

CREATE INDEX idx_pdv_reconciliation_issues_queue
  ON public.pdv_reconciliation_issues (company_id, status, detected_at, id);
CREATE INDEX idx_pdv_reconciliation_issues_resource
  ON public.pdv_reconciliation_issues (company_id, resource_type, resource_id)
  WHERE resource_id IS NOT NULL;

COMMENT ON TABLE public.pdv_reconciliation_issues IS
  'Pendencias auditaveis de migracao/conciliacao do PDV. Ausencia de evidencia nunca e transformada em custo, conta, entrega, liquidacao ou reserva historica.';

-- ---------------------------------------------------------------------------
-- 3. Campos v2 compativeis na sessao. Nulos significam sessao v1 nao classificada.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pdv_cash_sessions
  ADD COLUMN IF NOT EXISTS cash_account_id uuid
    REFERENCES public.financial_accounts(id),
  ADD COLUMN IF NOT EXISTS cash_account_name_snapshot text,
  ADD COLUMN IF NOT EXISTS cash_policy_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS contract_version smallint;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_cash_sessions'::regclass
       AND conname = 'pdv_cash_sessions_contract_version_check'
  ) THEN
    ALTER TABLE public.pdv_cash_sessions
      ADD CONSTRAINT pdv_cash_sessions_contract_version_check
      CHECK (contract_version IS NULL OR contract_version IN (1, 2));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_cash_sessions'::regclass
       AND conname = 'pdv_cash_sessions_v2_snapshot_check'
  ) THEN
    ALTER TABLE public.pdv_cash_sessions
      ADD CONSTRAINT pdv_cash_sessions_v2_snapshot_check
      CHECK (
        contract_version IS DISTINCT FROM 2
        OR (
          cash_account_id IS NOT NULL
          AND cash_account_name_snapshot IS NOT NULL
          AND btrim(cash_account_name_snapshot) <> ''
          AND cash_policy_snapshot IS NOT NULL
        )
      );
  END IF;
END
$constraints$;

COMMENT ON COLUMN public.pdv_cash_sessions.cash_account_id IS
  'Conta de tesouraria congelada pela abertura v2. NULL somente em sessao legada/v1; sessao contract_version=2 exige a conta presente e impede sua exclusao enquanto houver historico.';
COMMENT ON COLUMN public.pdv_cash_sessions.cash_account_name_snapshot IS
  'Nome da conta no instante da abertura v2; nao muda quando o cadastro da conta muda.';
COMMENT ON COLUMN public.pdv_cash_sessions.cash_policy_snapshot IS
  'Politica de caixa congelada pela abertura v2. A migration nao preenche sessoes antigas com a configuracao atual.';
COMMENT ON COLUMN public.pdv_cash_sessions.contract_version IS
  'NULL = legado ainda nao classificado; 1 = legado classificado; 2 = novo contrato de custodia. Esta migration nao ativa writer v2.';

-- ---------------------------------------------------------------------------
-- 4. Livro append-only da custodia fisica por sessao e conta congelada.
-- ---------------------------------------------------------------------------

CREATE TABLE public.pdv_cash_custody_entries (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id               uuid          NOT NULL REFERENCES public.pdv_cash_sessions(id),
  cash_account_id          uuid          REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  operation_request_id     uuid          REFERENCES public.pdv_operation_requests(id),
  entry_kind               text          NOT NULL,
  amount                   numeric(14,2) NOT NULL,
  source_type              text,
  source_id                uuid,
  financial_transaction_id uuid          REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  reversal_of_id           uuid          REFERENCES public.pdv_cash_custody_entries(id),
  metadata                 jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_by               uuid          REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at               timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT pdv_cash_custody_entries_kind_check CHECK (
    entry_kind IN (
      'opening', 'cash_receipt', 'cash_payment', 'supply', 'withdrawal',
      'refund', 'closing_return', 'shortage', 'surplus', 'reversal'
    )
  ),
  CONSTRAINT pdv_cash_custody_entries_amount_sign_check CHECK (
    (entry_kind = 'opening' AND amount >= 0)
    OR (entry_kind IN ('cash_receipt', 'supply', 'surplus') AND amount > 0)
    OR (entry_kind IN (
      'cash_payment', 'withdrawal', 'refund', 'closing_return', 'shortage'
    ) AND amount < 0)
    OR (entry_kind = 'reversal' AND amount <> 0)
  ),
  CONSTRAINT pdv_cash_custody_entries_source_check CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (
      source_type IS NOT NULL
      AND source_id IS NOT NULL
      AND source_type = btrim(source_type)
      AND source_type ~ '^[a-z][a-z0-9_.:-]{1,79}$'
    )
  ),
  CONSTRAINT pdv_cash_custody_entries_reversal_check CHECK (
    (entry_kind = 'reversal' AND reversal_of_id IS NOT NULL)
    OR (entry_kind <> 'reversal' AND reversal_of_id IS NULL)
  ),
  CONSTRAINT pdv_cash_custody_entries_request_kind_unique
    UNIQUE (operation_request_id, entry_kind),
  CONSTRAINT pdv_cash_custody_entries_reversal_unique
    UNIQUE (reversal_of_id)
);

CREATE INDEX idx_pdv_cash_custody_entries_session
  ON public.pdv_cash_custody_entries (session_id, created_at, id);
CREATE INDEX idx_pdv_cash_custody_entries_company_account
  ON public.pdv_cash_custody_entries (company_id, cash_account_id, created_at, id);
CREATE UNIQUE INDEX uniq_pdv_cash_custody_financial_transaction
  ON public.pdv_cash_custody_entries (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

COMMENT ON TABLE public.pdv_cash_custody_entries IS
  'Livro append-only da custodia fisica do PDV v2. amount e delta assinado da gaveta: abertura/entrada positivos; saida/retorno/falta negativos. Transferencia de custodia nao e DRE/DFC por si so.';
COMMENT ON COLUMN public.pdv_cash_custody_entries.operation_request_id IS
  'Vinculo idempotente. Uma mesma operacao pode gerar kinds distintos (ex.: closing_return e shortage), mas nunca repetir o mesmo kind.';

-- ---------------------------------------------------------------------------
-- 5. RLS fail-closed e ACL: somente helpers/RPCs privilegiadas escrevem.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pdv_operation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_operation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_operation_requests FROM PUBLIC;
REVOKE ALL ON public.pdv_operation_requests FROM anon;
REVOKE ALL ON public.pdv_operation_requests FROM authenticated;
GRANT ALL ON public.pdv_operation_requests TO service_role;

ALTER TABLE public.pdv_reconciliation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_reconciliation_issues FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_reconciliation_issues FROM PUBLIC;
REVOKE ALL ON public.pdv_reconciliation_issues FROM anon;
REVOKE ALL ON public.pdv_reconciliation_issues FROM authenticated;
GRANT ALL ON public.pdv_reconciliation_issues TO service_role;

ALTER TABLE public.pdv_cash_custody_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_cash_custody_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_cash_custody_entries FROM PUBLIC;
REVOKE ALL ON public.pdv_cash_custody_entries FROM anon;
REVOKE ALL ON public.pdv_cash_custody_entries FROM authenticated;
GRANT ALL ON public.pdv_cash_custody_entries TO service_role;

DROP TRIGGER IF EXISTS set_pdv_operation_requests_updated_at
  ON public.pdv_operation_requests;
CREATE TRIGGER set_pdv_operation_requests_updated_at
  BEFORE UPDATE ON public.pdv_operation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_pdv_reconciliation_issues_updated_at
  ON public.pdv_reconciliation_issues;
CREATE TRIGGER set_pdv_reconciliation_issues_updated_at
  BEFORE UPDATE ON public.pdv_reconciliation_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. Helpers internos de idempotencia.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_operation_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, extensions
AS $fn$
  SELECT encode(
    extensions.digest(
      convert_to(COALESCE(p_payload, 'null'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_claim_operation_request(
  p_company_id      uuid,
  p_operation_type  text,
  p_idempotency_key text,
  p_payload         jsonb
)
RETURNS TABLE (
  request_id     uuid,
  request_status text,
  is_replay      boolean,
  stored_result  jsonb,
  resource_type  text,
  resource_id    uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_hash     text;
  v_inserted uuid;
  v_request  public.pdv_operation_requests%ROWTYPE;
BEGIN
  IF p_company_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id)
  THEN
    RAISE EXCEPTION 'Empresa da operacao nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF p_operation_type IS NULL
     OR p_operation_type <> btrim(p_operation_type)
     OR p_operation_type !~ '^[a-z][a-z0-9_.:-]{1,79}$'
  THEN
    RAISE EXCEPTION 'Tipo interno da operacao invalido.' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_idempotency_key <> btrim(p_idempotency_key)
     OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 200
  THEN
    RAISE EXCEPTION 'Chave idempotente invalida.' USING ERRCODE = '22023';
  END IF;

  v_hash := public.pdv_operation_payload_hash(p_payload);

  INSERT INTO public.pdv_operation_requests (
    company_id, operation_type, idempotency_key, payload_hash
  ) VALUES (
    p_company_id, p_operation_type, p_idempotency_key, v_hash
  )
  ON CONFLICT (company_id, operation_type, idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted;

  SELECT r.* INTO v_request
    FROM public.pdv_operation_requests r
   WHERE r.company_id = p_company_id
     AND r.operation_type = p_operation_type
     AND r.idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF v_request.payload_hash <> v_hash THEN
    RAISE EXCEPTION 'A chave idempotente ja foi usada com outro conteudo.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_request.status,
    v_inserted IS NULL,
    v_request.result,
    v_request.resource_type,
    v_request.resource_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_complete_operation_request(
  p_request_id    uuid,
  p_resource_type text,
  p_resource_id   uuid,
  p_result        jsonb
)
RETURNS public.pdv_operation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_request public.pdv_operation_requests;
BEGIN
  IF p_result IS NULL THEN
    RAISE EXCEPTION 'Resultado idempotente ausente.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pdv_operation_requests r
     SET status = 'completed',
         resource_type = NULLIF(btrim(p_resource_type), ''),
         resource_id = p_resource_id,
         result = p_result,
         error_code = NULL,
         completed_at = now()
   WHERE r.id = p_request_id
     AND r.status = 'pending'
  RETURNING r.* INTO v_request;

  IF NOT FOUND THEN
    SELECT r.* INTO v_request
      FROM public.pdv_operation_requests r
     WHERE r.id = p_request_id;

    IF NOT FOUND OR v_request.status <> 'completed' THEN
      RAISE EXCEPTION 'Request idempotente nao esta pendente.' USING ERRCODE = '55000';
    END IF;

    IF v_request.result IS DISTINCT FROM p_result
       OR v_request.resource_type IS DISTINCT FROM NULLIF(btrim(p_resource_type), '')
       OR v_request.resource_id IS DISTINCT FROM p_resource_id
    THEN
      RAISE EXCEPTION 'Request idempotente ja foi concluido com outro resultado.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN v_request;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_fail_operation_request(
  p_request_id uuid,
  p_error_code text,
  p_result     jsonb DEFAULT NULL
)
RETURNS public.pdv_operation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_request public.pdv_operation_requests;
BEGIN
  IF p_error_code IS NULL OR btrim(p_error_code) = '' THEN
    RAISE EXCEPTION 'Codigo interno da falha ausente.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pdv_operation_requests r
     SET status = 'failed',
         result = p_result,
         error_code = left(btrim(p_error_code), 120),
         completed_at = now()
   WHERE r.id = p_request_id
     AND r.status = 'pending'
  RETURNING r.* INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request idempotente nao esta pendente.' USING ERRCODE = '55000';
  END IF;

  RETURN v_request;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Lock compartilhado da tesouraria. Sempre empresa antes das contas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_lock_treasury_accounts(
  p_company_id uuid,
  p_account_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_account_id uuid;
  v_count integer;
BEGIN
  IF p_company_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id)
  THEN
    RAISE EXCEPTION 'Empresa da tesouraria nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  -- O lock compartilhado da empresa vem antes de QUALQUER leitura das contas.
  -- Assim configuracao, custodia e movimentos externos que aderirem ao helper
  -- nao validam disponibilidade em snapshots concorrentes.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pdv-treasury-company:' || p_company_id::text, 0)
  );

  IF p_account_ids IS NULL OR cardinality(p_account_ids) = 0 THEN
    RAISE EXCEPTION 'Conta da tesouraria nao informada.' USING ERRCODE = '22023';
  END IF;

  IF array_position(p_account_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Conta da tesouraria invalida.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
    FROM (
      SELECT DISTINCT account_id
        FROM unnest(p_account_ids) AS requested(account_id)
    ) requested
    JOIN public.financial_accounts account
      ON account.id = requested.account_id
     AND account.company_id = p_company_id;

  IF v_count <> (SELECT count(DISTINCT value) FROM unnest(p_account_ids) AS ids(value)) THEN
    RAISE EXCEPTION 'Conta da tesouraria nao encontrada.' USING ERRCODE = 'P0002';
  END IF;

  -- Contas deduplicadas e ordenadas eliminam inversao A->B versus B->A.
  FOR v_account_id IN
    SELECT DISTINCT value
      FROM unnest(p_account_ids) AS ids(value)
     ORDER BY value
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'pdv-treasury-account:' || p_company_id::text || ':' || v_account_id::text,
        0
      )
    );
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_lock_treasury_account(
  p_company_id uuid,
  p_account_id uuid
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT public.pdv_lock_treasury_accounts(p_company_id, ARRAY[p_account_id]);
$fn$;

-- ---------------------------------------------------------------------------
-- 8. Integridade tenant e imutabilidade do livro de custodia.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_assert_cash_session_account_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM public.pdv_assert_ref_company(
    'public.financial_accounts', NEW.cash_account_id, NEW.company_id,
    'A conta congelada da sessao'
  );
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_zz_pdv_cash_session_account_company
  ON public.pdv_cash_sessions;
CREATE TRIGGER tg_zz_pdv_cash_session_account_company
  BEFORE INSERT OR UPDATE OF company_id, cash_account_id
  ON public.pdv_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_cash_session_account_company();

CREATE OR REPLACE FUNCTION public.pdv_assert_custody_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_session_account uuid;
  v_original public.pdv_cash_custody_entries%ROWTYPE;
BEGIN
  IF NEW.cash_account_id IS NULL THEN
    RAISE EXCEPTION 'A conta da custodia e obrigatoria no registro v2.'
      USING ERRCODE = '23502';
  END IF;

  PERFORM public.pdv_assert_ref_company(
    'public.pdv_cash_sessions', NEW.session_id, NEW.company_id, 'A sessao de caixa'
  );
  PERFORM public.pdv_assert_ref_company(
    'public.financial_accounts', NEW.cash_account_id, NEW.company_id, 'A conta de caixa'
  );
  PERFORM public.pdv_assert_ref_company(
    'public.pdv_operation_requests', NEW.operation_request_id, NEW.company_id,
    'O request idempotente'
  );
  PERFORM public.pdv_assert_ref_company(
    'public.financial_transactions', NEW.financial_transaction_id, NEW.company_id,
    'O lancamento financeiro'
  );

  SELECT s.cash_account_id INTO v_session_account
    FROM public.pdv_cash_sessions s
   WHERE s.id = NEW.session_id
     AND s.company_id = NEW.company_id;

  IF v_session_account IS NULL THEN
    RAISE EXCEPTION 'A sessao nao possui conta de custodia v2 congelada.'
      USING ERRCODE = '23502';
  END IF;
  IF v_session_account <> NEW.cash_account_id THEN
    RAISE EXCEPTION 'A conta da custodia difere da conta congelada na sessao.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.reversal_of_id IS NOT NULL THEN
    SELECT e.* INTO v_original
      FROM public.pdv_cash_custody_entries e
     WHERE e.id = NEW.reversal_of_id
     FOR UPDATE;

    IF NOT FOUND
       OR v_original.company_id <> NEW.company_id
       OR v_original.session_id <> NEW.session_id
       OR v_original.cash_account_id <> NEW.cash_account_id
    THEN
      RAISE EXCEPTION 'Lancamento original da reversao nao encontrado nesta custodia.'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.amount <> -v_original.amount THEN
      RAISE EXCEPTION 'A reversao deve compensar integralmente o valor original.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_zz_pdv_cash_custody_entry
  ON public.pdv_cash_custody_entries;
CREATE TRIGGER tg_zz_pdv_cash_custody_entry
  BEFORE INSERT ON public.pdv_cash_custody_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_custody_entry();

CREATE OR REPLACE FUNCTION public.pdv_block_custody_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id)
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Lancamento de custodia e imutavel; registre uma reversao.'
    USING ERRCODE = '55000';
END
$fn$;

DROP TRIGGER IF EXISTS tg_pdv_cash_custody_append_only
  ON public.pdv_cash_custody_entries;
CREATE TRIGGER tg_pdv_cash_custody_append_only
  BEFORE UPDATE OR DELETE ON public.pdv_cash_custody_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_block_custody_entry_mutation();

-- ---------------------------------------------------------------------------
-- 9. Projecao interna da posicao fisica v2. Nao mistura opening_amount v1.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_cash_custody_position(
  p_company_id uuid,
  p_session_id uuid DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  cash_account_id uuid,
  custody_amount numeric,
  entry_count bigint,
  last_entry_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT
    entry.session_id,
    entry.cash_account_id,
    COALESCE(sum(entry.amount), 0)::numeric AS custody_amount,
    count(*) AS entry_count,
    max(entry.created_at) AS last_entry_at
  FROM public.pdv_cash_custody_entries entry
  WHERE entry.company_id = p_company_id
    AND (p_session_id IS NULL OR entry.session_id = p_session_id)
  GROUP BY entry.session_id, entry.cash_account_id
  ORDER BY entry.session_id;
$fn$;

-- ---------------------------------------------------------------------------
-- 10. ACL dos helpers: nenhum recebe company_id arbitrario do client.
-- ---------------------------------------------------------------------------

DO $acl$
DECLARE
  v_function text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_operation_payload_hash(jsonb)',
    'public.pdv_claim_operation_request(uuid,text,text,jsonb)',
    'public.pdv_complete_operation_request(uuid,text,uuid,jsonb)',
    'public.pdv_fail_operation_request(uuid,text,jsonb)',
    'public.pdv_lock_treasury_accounts(uuid,uuid[])',
    'public.pdv_lock_treasury_account(uuid,uuid)',
    'public.pdv_assert_cash_session_account_company()',
    'public.pdv_assert_custody_entry()',
    'public.pdv_block_custody_entry_mutation()',
    'public.pdv_cash_custody_position(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_function);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_function);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
  END LOOP;
END
$acl$;

COMMIT;

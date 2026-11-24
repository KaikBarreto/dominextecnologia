-- Contas de caixa do administrador. Estas tabelas não reutilizam as contas dos
-- tenants: nunca existe company_id artificial nem extrato OFX bruto armazenado.
BEGIN;

CREATE TABLE public.admin_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  provider text NOT NULL DEFAULT 'Banco externo' CHECK (length(btrim(provider)) BETWEEN 2 AND 120),
  account_kind text NOT NULL CHECK (account_kind IN ('asaas','external')),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  opening_balance numeric(18,2) NOT NULL DEFAULT 0 CHECK (opening_balance::text NOT IN ('NaN','Infinity','-Infinity')),
  opening_balance_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admin_bank_accounts_one_asaas ON public.admin_bank_accounts(account_kind) WHERE account_kind='asaas';
-- Conta de sistema, não é importação nem movimentação histórica. O saldo Asaas
-- continua vindo exclusivamente do ledger já conciliado.
INSERT INTO public.admin_bank_accounts(name,provider,account_kind)
VALUES ('Conta Asaas','Asaas','asaas')
ON CONFLICT DO NOTHING;

-- Registro técnico, sem conteúdo do arquivo: impede reimportação do mesmo OFX.
CREATE TABLE public.admin_bank_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.admin_bank_accounts(id) ON DELETE RESTRICT,
  file_hash text NOT NULL CHECK (file_hash ~ '^[a-f0-9]{64}$'),
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  imported_count integer NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  duplicate_count integer NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bank_account_id, file_hash)
);

CREATE TABLE public.admin_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.admin_bank_accounts(id) ON DELETE RESTRICT,
  import_id uuid REFERENCES public.admin_bank_imports(id) ON DELETE SET NULL,
  fitid text,
  fallback_hash text,
  occurred_at timestamptz NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount <> 0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
  transaction_type text,
  description text,
  counterparty text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((fitid IS NOT NULL AND fallback_hash IS NULL) OR (fitid IS NULL AND fallback_hash IS NOT NULL))
);
CREATE UNIQUE INDEX admin_bank_transactions_fitid_unique ON public.admin_bank_transactions(bank_account_id, fitid) WHERE fitid IS NOT NULL;
CREATE UNIQUE INDEX admin_bank_transactions_fallback_unique ON public.admin_bank_transactions(bank_account_id, fallback_hash) WHERE fallback_hash IS NOT NULL;
CREATE INDEX admin_bank_transactions_account_occurred ON public.admin_bank_transactions(bank_account_id, occurred_at DESC);

ALTER TABLE public.admin_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin financial reads bank accounts" ON public.admin_bank_accounts FOR SELECT TO authenticated USING ((SELECT public.can_read_admin_financial(auth.uid())));
CREATE POLICY "Admin financial creates external bank accounts" ON public.admin_bank_accounts FOR INSERT TO authenticated WITH CHECK ((SELECT public.can_manage_admin_financial(auth.uid())) AND account_kind='external');
CREATE POLICY "Admin financial updates external bank accounts" ON public.admin_bank_accounts FOR UPDATE TO authenticated USING ((SELECT public.can_manage_admin_financial(auth.uid())) AND account_kind='external') WITH CHECK ((SELECT public.can_manage_admin_financial(auth.uid())) AND account_kind='external');
CREATE POLICY "Admin financial deletes external bank accounts" ON public.admin_bank_accounts FOR DELETE TO authenticated USING ((SELECT public.can_manage_admin_financial(auth.uid())) AND account_kind='external');
CREATE POLICY "Admin financial reads bank imports" ON public.admin_bank_imports FOR SELECT TO authenticated USING ((SELECT public.can_read_admin_financial(auth.uid())));
CREATE POLICY "Admin financial reads bank transactions" ON public.admin_bank_transactions FOR SELECT TO authenticated USING ((SELECT public.can_read_admin_financial(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_bank_accounts TO authenticated;
GRANT SELECT ON public.admin_bank_imports, public.admin_bank_transactions TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_external_bank_account(
  p_name text, p_provider text, p_opening_balance numeric DEFAULT 0, p_opening_balance_date date DEFAULT NULL
) RETURNS public.admin_bank_accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_account public.admin_bank_accounts;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  INSERT INTO public.admin_bank_accounts(name,provider,account_kind,opening_balance,opening_balance_date,created_by)
  VALUES (btrim(p_name), btrim(p_provider), 'external', coalesce(p_opening_balance,0), p_opening_balance_date, auth.uid())
  RETURNING * INTO v_account;
  RETURN v_account;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_create_external_bank_account(text,text,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_external_bank_account(text,text,numeric,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_import_ofx(
  p_account_id uuid, p_file_hash text, p_file_name text, p_entries jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_import_id uuid; v_inserted integer := 0; v_total integer := 0; v_account_kind text; v_opening_date date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_account_id IS NULL OR p_file_hash !~ '^[a-f0-9]{64}$' OR p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries)>10000 THEN RAISE EXCEPTION 'invalid_ofx_import'; END IF;
  SELECT account_kind,opening_balance_date INTO v_account_kind,v_opening_date FROM public.admin_bank_accounts WHERE id=p_account_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_account_not_found'; END IF;
  IF v_account_kind <> 'external' THEN RAISE EXCEPTION 'asaas_import_not_allowed'; END IF;
  IF v_opening_date IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_entries) e WHERE (e->>'posted_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' AND ((e->>'posted_at')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date < v_opening_date) THEN RAISE EXCEPTION 'ofx_before_opening_balance'; END IF;
  SELECT id INTO v_import_id FROM public.admin_bank_imports WHERE bank_account_id=p_account_id AND file_hash=p_file_hash;
  IF v_import_id IS NOT NULL THEN RETURN jsonb_build_object('import_id',v_import_id,'inserted',0,'duplicates',0,'already_imported',true); END IF;
  INSERT INTO public.admin_bank_imports(bank_account_id,file_hash,file_name,created_by)
  VALUES (p_account_id,p_file_hash,btrim(p_file_name),auth.uid()) RETURNING id INTO v_import_id;
  WITH raw AS (
    SELECT nullif(btrim(e->>'fitid'),'') fitid, nullif(btrim(e->>'posted_at'),'') posted_at,
      nullif(btrim(e->>'amount'),'') amount, nullif(btrim(e->>'trn_type'),'') trn_type,
      nullif(btrim(e->>'memo'),'') memo, nullif(btrim(e->>'name'),'') name
    FROM jsonb_array_elements(p_entries) e
  ), valid AS (
    SELECT fitid, posted_at::timestamptz occurred_at, amount::numeric(18,2) amount, left(trn_type,80) transaction_type,
      left(memo,500) description, left(name,300) counterparty
    FROM raw WHERE posted_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' AND amount ~ '^-?[0-9]+([.][0-9]+)?$' AND amount::numeric <> 0 AND amount::numeric=round(amount::numeric,2)
  ), prepared AS (
    SELECT *, CASE WHEN fitid IS NULL THEN encode(extensions.digest(p_account_id::text || '|' || occurred_at::text || '|' || amount::text || '|' || coalesce(transaction_type,'') || '|' || coalesce(description,'') || '|' || coalesce(counterparty,''),'sha256'),'hex') END fallback_hash FROM valid
  ), inserted AS (
    INSERT INTO public.admin_bank_transactions(bank_account_id,import_id,fitid,fallback_hash,occurred_at,amount,transaction_type,description,counterparty)
    SELECT p_account_id,v_import_id,fitid,fallback_hash,occurred_at,amount,transaction_type,description,counterparty FROM prepared
    ON CONFLICT DO NOTHING RETURNING id
  ) SELECT (SELECT count(*) FROM valid), (SELECT count(*) FROM inserted) INTO v_total,v_inserted;
  IF v_total <> jsonb_array_length(p_entries) THEN RAISE EXCEPTION 'invalid_ofx_entry'; END IF;
  -- FITID é a identidade primária. Um mesmo identificador com dados diferentes
  -- nunca pode ser aceito como "duplicado": exige revisão do extrato.
  IF EXISTS (WITH raw AS (SELECT nullif(btrim(e->>'fitid'),'') fitid,nullif(btrim(e->>'posted_at'),'') posted_at,nullif(btrim(e->>'amount'),'') amount,nullif(btrim(e->>'trn_type'),'') trn_type,nullif(btrim(e->>'memo'),'') memo,nullif(btrim(e->>'name'),'') name FROM jsonb_array_elements(p_entries)e), valid AS (SELECT fitid,posted_at::timestamptz occurred_at,amount::numeric(18,2) amount,left(trn_type,80) transaction_type,left(memo,500) description,left(name,300) counterparty FROM raw WHERE posted_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' AND amount ~ '^-?[0-9]+([.][0-9]+)?$' AND amount::numeric<>0 AND amount::numeric=round(amount::numeric,2)) SELECT 1 FROM valid v JOIN public.admin_bank_transactions b ON b.bank_account_id=p_account_id AND b.fitid=v.fitid WHERE v.fitid IS NOT NULL AND (b.occurred_at,b.amount,b.transaction_type,b.description,b.counterparty) IS DISTINCT FROM (v.occurred_at,v.amount,v.transaction_type,v.description,v.counterparty)) THEN RAISE EXCEPTION 'ofx_identity_conflict'; END IF;
  -- Sem FITID, duas linhas com a mesma chave de fallback no próprio arquivo são
  -- ambíguas (podem ser dois pagamentos legítimos); não as colapsamos.
  IF EXISTS (WITH raw AS (SELECT nullif(btrim(e->>'fitid'),'') fitid,nullif(btrim(e->>'posted_at'),'') posted_at,nullif(btrim(e->>'amount'),'') amount,nullif(btrim(e->>'trn_type'),'') trn_type,nullif(btrim(e->>'memo'),'') memo,nullif(btrim(e->>'name'),'') name FROM jsonb_array_elements(p_entries)e), valid AS (SELECT fitid,posted_at::timestamptz occurred_at,amount::numeric(18,2) amount,left(trn_type,80) transaction_type,left(memo,500) description,left(name,300) counterparty FROM raw WHERE posted_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' AND amount ~ '^-?[0-9]+([.][0-9]+)?$' AND amount::numeric<>0 AND amount::numeric=round(amount::numeric,2)), prepared AS (SELECT fitid,encode(extensions.digest(p_account_id::text||'|'||occurred_at::text||'|'||amount::text||'|'||coalesce(transaction_type,'')||'|'||coalesce(description,'')||'|'||coalesce(counterparty,''),'sha256'),'hex') fallback_hash FROM valid WHERE fitid IS NULL) SELECT 1 FROM prepared GROUP BY fallback_hash HAVING count(*)>1) THEN RAISE EXCEPTION 'ofx_ambiguous_fallback_identity'; END IF;
  UPDATE public.admin_bank_imports SET imported_count=v_inserted,duplicate_count=v_total-v_inserted WHERE id=v_import_id;
  RETURN jsonb_build_object('import_id',v_import_id,'inserted',v_inserted,'duplicates',v_total-v_inserted,'already_imported',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_import_ofx(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_ofx(uuid,text,text,jsonb) TO authenticated;

COMMIT;

BEGIN;
ALTER TABLE public.admin_bank_accounts ADD COLUMN ofx_account_fingerprint text;
ALTER TABLE public.admin_bank_imports ADD COLUMN bank_identifier text, ADD COLUMN ledger_balance numeric(18,2), ADD COLUMN ledger_balance_date date;
ALTER FUNCTION public.admin_import_ofx(uuid,text,text,jsonb) RENAME TO admin_import_ofx_entries_internal;
REVOKE ALL ON FUNCTION public.admin_import_ofx_entries_internal(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_import_ofx(p_account_id uuid,p_file_hash text,p_file_name text,p_entries jsonb,p_bank_id text DEFAULT NULL,p_account_identifier text DEFAULT NULL,p_ledger_balance numeric DEFAULT NULL,p_ledger_balance_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE fingerprint text; saved_fingerprint text; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF (p_ledger_balance IS NULL)<>(p_ledger_balance_date IS NULL) OR (p_ledger_balance IS NOT NULL AND (p_ledger_balance::text IN ('NaN','Infinity','-Infinity') OR round(p_ledger_balance,2)<>p_ledger_balance)) THEN RAISE EXCEPTION 'invalid_statement_balance'; END IF;
 SELECT ofx_account_fingerprint INTO saved_fingerprint FROM public.admin_bank_accounts WHERE id=p_account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'bank_account_not_found'; END IF;
 IF nullif(btrim(p_account_identifier),'') IS NOT NULL THEN
  fingerprint:=encode(extensions.digest(coalesce(btrim(p_bank_id),'')||'|'||btrim(p_account_identifier),'sha256'),'hex');
  IF saved_fingerprint IS NOT NULL AND saved_fingerprint<>fingerprint THEN RAISE EXCEPTION 'ofx_account_mismatch'; END IF;
 END IF;
 result:=public.admin_import_ofx_entries_internal(p_account_id,p_file_hash,p_file_name,p_entries);
 IF fingerprint IS NOT NULL AND saved_fingerprint IS NULL THEN UPDATE public.admin_bank_accounts SET ofx_account_fingerprint=fingerprint WHERE id=p_account_id; END IF;
 IF NOT (result->>'already_imported')::boolean THEN
  UPDATE public.admin_bank_imports SET bank_identifier=nullif(left(btrim(p_bank_id),80),''),ledger_balance=p_ledger_balance,ledger_balance_date=p_ledger_balance_date WHERE id=(result->>'import_id')::uuid;
 END IF;
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_import_ofx(uuid,text,text,jsonb,text,text,numeric,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_import_ofx(uuid,text,text,jsonb,text,text,numeric,date) TO authenticated;
CREATE FUNCTION public.admin_bank_statement_summary(p_account_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE a public.admin_bank_accounts%ROWTYPE; latest public.admin_bank_imports%ROWTYPE; system_balance numeric; pending bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_read_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 SELECT * INTO a FROM public.admin_bank_accounts WHERE id=p_account_id AND account_kind='external';
 IF NOT FOUND THEN RAISE EXCEPTION 'bank_account_not_found'; END IF;
 SELECT * INTO latest FROM public.admin_bank_imports WHERE bank_account_id=a.id AND ledger_balance IS NOT NULL ORDER BY ledger_balance_date DESC,created_at DESC,id DESC LIMIT 1;
 SELECT a.opening_balance+coalesce(sum(amount),0) INTO system_balance FROM public.admin_bank_transactions WHERE bank_account_id=a.id AND (latest.id IS NULL OR (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date<=latest.ledger_balance_date);
 SELECT count(*) INTO pending FROM public.admin_bank_reconciliation_movements WHERE bank_account_id=a.id AND reconciliation_status IN ('pending','partial');
 RETURN jsonb_build_object('opening_balance',a.opening_balance,'opening_balance_date',a.opening_balance_date,'system_balance',system_balance,'statement_balance',latest.ledger_balance,'statement_date',latest.ledger_balance_date,'difference',CASE WHEN latest.id IS NOT NULL THEN system_balance-latest.ledger_balance END,'last_imported_at',(SELECT max(created_at) FROM public.admin_bank_imports WHERE bank_account_id=a.id),'pending_count',pending);
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_bank_statement_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_bank_statement_summary(uuid) TO authenticated;
COMMIT;

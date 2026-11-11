BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- A policy nunca recebe user_id do cliente. Este wrapper pequeno e grantavel
-- fixa auth.uid() antes de chamar o helper interno da custodia criado em
-- 015000. Assim o PostgREST nao vira um oraculo de acesso de outros usuarios.
CREATE OR REPLACE FUNCTION public.pdv_current_actor_can_access_order_v3(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT auth.uid() IS NOT NULL
    AND public.pdv_order_actor_can_access_v2(p_order_id,auth.uid());
$fn$;
REVOKE ALL ON FUNCTION public.pdv_current_actor_can_access_order_v3(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_current_actor_can_access_order_v3(uuid)
  TO authenticated,service_role;

-- Retorna NULL para caminho que nao possui UUID canonico. Policies de Storage
-- precisam negar payload adulterado, nao abortar toda a consulta com cast.
CREATE OR REPLACE FUNCTION public.pdv_storage_order_id_v3(p_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,storage
AS $fn$
DECLARE v_folder text;
BEGIN
  v_folder:=(storage.foldername(p_name))[3];
  IF v_folder IS NULL OR v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_folder::uuid;
END
$fn$;
REVOKE ALL ON FUNCTION public.pdv_storage_order_id_v3(text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_storage_order_id_v3(text)
  TO authenticated,service_role;

-- Permissao financeira explicitamente atribuida. Admin/gestor nao ganha esta
-- capacidade por cargo; super_admin e o curinga nominal continuam excecoes.
CREATE OR REPLACE FUNCTION public.pdv_current_actor_has_explicit_permission_v3(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT public.is_super_admin(auth.uid())
    OR EXISTS(
      SELECT 1
        FROM public.user_permissions permission
       WHERE permission.user_id=auth.uid()
         AND permission.is_active
         AND (permission.permissions ? '*' OR permission.permissions ? p_permission)
    );
$fn$;
REVOKE ALL ON FUNCTION public.pdv_current_actor_has_explicit_permission_v3(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_current_actor_has_explicit_permission_v3(text)
  TO service_role;

-- Anexo de pedido herda a custodia do pedido. Nao existe fallback por cargo,
-- empresa ou estoque. Escrita continua append-only e o path precisa apontar
-- exatamente para o order_id autorizado.
DO $drop_attachment_policies$
DECLARE v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_policies
     WHERE schemaname='public' AND tablename='pdv_order_attachments'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.pdv_order_attachments',
      v_policy.policyname
    );
  END LOOP;
END
$drop_attachment_policies$;
CREATE POLICY pdv_order_attachments_select_cash_v3
  ON public.pdv_order_attachments FOR SELECT TO authenticated
  USING(
    company_id=public.get_user_company_id(auth.uid())
    AND public.pdv_current_actor_can_access_order_v3(order_id)
  );
CREATE POLICY pdv_order_attachments_insert_cash_v3
  ON public.pdv_order_attachments FOR INSERT TO authenticated
  WITH CHECK(
    company_id=public.get_user_company_id(auth.uid())
    AND public.pdv_current_actor_can_access_order_v3(order_id)
    AND storage_path LIKE company_id::text||'/pdv-orders/'||order_id::text||'/%'
    AND cardinality(string_to_array(storage_path,'/'))=4
    AND NULLIF(split_part(storage_path,'/',4),'') IS NOT NULL
  );
CREATE POLICY pdv_order_attachments_delete_cash_v3
  ON public.pdv_order_attachments FOR DELETE TO authenticated
  USING(
    company_id=public.get_user_company_id(auth.uid())
    AND public.pdv_current_actor_can_access_order_v3(order_id)
  );

-- As policies permissivas gerais do bucket continuam atendendo recibos do
-- Financeiro. Para a subpasta pdv-orders, estas RESTRICTIVE exigem o pedido do
-- Caixa atual. Caminho incompleto/invalido resulta em FALSE.
DROP POLICY IF EXISTS pdv_financial_receipts_select_custody_v2 ON storage.objects;
DROP POLICY IF EXISTS pdv_financial_receipts_insert_custody_v2 ON storage.objects;
DROP POLICY IF EXISTS pdv_financial_receipts_update_custody_v2 ON storage.objects;
DROP POLICY IF EXISTS pdv_financial_receipts_delete_custody_v2 ON storage.objects;
DROP POLICY IF EXISTS pdv_financial_receipts_select_cash_v3 ON storage.objects;
DROP POLICY IF EXISTS pdv_financial_receipts_insert_cash_v3 ON storage.objects;
DROP POLICY IF EXISTS pdv_financial_receipts_update_cash_v3 ON storage.objects;
DROP POLICY IF EXISTS pdv_financial_receipts_delete_cash_v3 ON storage.objects;
CREATE POLICY pdv_financial_receipts_select_cash_v3
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING(
    bucket_id<>'financial-receipts'
    OR (storage.foldername(name))[2] IS DISTINCT FROM 'pdv-orders'
    OR (
      cardinality(storage.foldername(name))=3
      AND (storage.foldername(name))[1]=public.get_user_company_id(auth.uid())::text
      AND public.pdv_storage_order_id_v3(name) IS NOT NULL
      AND public.pdv_current_actor_can_access_order_v3(public.pdv_storage_order_id_v3(name))
    )
  );
CREATE POLICY pdv_financial_receipts_insert_cash_v3
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(
    bucket_id<>'financial-receipts'
    OR (storage.foldername(name))[2] IS DISTINCT FROM 'pdv-orders'
    OR (
      cardinality(storage.foldername(name))=3
      AND (storage.foldername(name))[1]=public.get_user_company_id(auth.uid())::text
      AND public.pdv_storage_order_id_v3(name) IS NOT NULL
      AND public.pdv_current_actor_can_access_order_v3(public.pdv_storage_order_id_v3(name))
    )
  );
CREATE POLICY pdv_financial_receipts_update_cash_v3
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(
    bucket_id<>'financial-receipts'
    OR (storage.foldername(name))[2] IS DISTINCT FROM 'pdv-orders'
  )
  WITH CHECK(
    bucket_id<>'financial-receipts'
    OR (storage.foldername(name))[2] IS DISTINCT FROM 'pdv-orders'
  );
CREATE POLICY pdv_financial_receipts_delete_cash_v3
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING(
    bucket_id<>'financial-receipts'
    OR (storage.foldername(name))[2] IS DISTINCT FROM 'pdv-orders'
    OR (
      cardinality(storage.foldername(name))=3
      AND (storage.foldername(name))[1]=public.get_user_company_id(auth.uid())::text
      AND public.pdv_storage_order_id_v3(name) IS NOT NULL
      AND public.pdv_current_actor_can_access_order_v3(public.pdv_storage_order_id_v3(name))
    )
  );

-- O comprovante comercial possui totais e pagamentos. Expedir um pedido nao
-- concede acesso a este documento financeiro; ele segue exclusivamente a
-- custodia do Caixa ou a permissao nominal entre caixas.
CREATE OR REPLACE FUNCTION public.pdv_get_order_receipt_snapshot_v3(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
BEGIN
  IF public.pdv_order_actor_can_access_v2(p_order_id,auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Este pedido pertence a outro caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_receipt_cash_denied';
  END IF;
  RETURN public.pdv_get_order_receipt_snapshot_v2(p_order_id);
END
$fn$;

-- Relatorios existentes sao company-wide e devolvem IDs/deep links. A API v3
-- explicita esse alcance e exige a capacidade nominal; screen:pdv_reports e
-- assinatura continuam validadas dentro das funcoes v2. Nao tratamos
-- admin/gestor como permissao implícita.
CREATE OR REPLACE FUNCTION public.pdv_partial_projection_report_v3(
  p_projection text,p_from date,p_to date,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_result jsonb; v_entries jsonb;
BEGIN
  IF public.pdv_can_operate_other_cash_v2(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar dados de outros caixas.'
      USING ERRCODE='42501',DETAIL='code=pdv_cross_cash_report_denied';
  END IF;
  IF public.pdv_current_actor_has_explicit_permission_v3('fn:view_finance_totals') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar totais financeiros.'
      USING ERRCODE='42501',DETAIL='code=pdv_finance_report_denied';
  END IF;
  v_result:=public.pdv_partial_projection_report_v2(
    p_projection,p_from,p_to,p_limit,p_offset
  );
  SELECT COALESCE(jsonb_agg(
    (entry.value - ARRAY['event_id','source_record_id','cash_session_id','order_id','transaction_id','deep_link'])
      || jsonb_build_object('event_id','entry-'||entry.ordinality::text)
    ORDER BY entry.ordinality
  ),'[]'::jsonb)
    INTO v_entries
    FROM jsonb_array_elements(COALESCE(v_result->'entries','[]'::jsonb))
      WITH ORDINALITY AS entry(value,ordinality);
  RETURN jsonb_set(v_result,'{entries}',v_entries,false);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_global_event_history_v3(
  p_from date,p_to date,p_cash_session_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF public.pdv_can_operate_other_cash_v2(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar dados de outros caixas.'
      USING ERRCODE='42501',DETAIL='code=pdv_cross_cash_report_denied';
  END IF;
  IF public.pdv_current_actor_has_explicit_permission_v3('fn:view_finance_totals') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar totais financeiros.'
      USING ERRCODE='42501',DETAIL='code=pdv_finance_report_denied';
  END IF;
  IF p_cash_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.pdv_cash_sessions session
     WHERE session.id=p_cash_session_id
       AND session.company_id=public.get_user_company_id(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Caixa não encontrado.'
      USING ERRCODE='P0002',DETAIL='code=pdv_cash_session_not_found';
  END IF;
  RETURN public.pdv_global_event_history_v2(
    p_from,p_to,p_cash_session_id,p_limit,p_offset
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_document_index_v3(
  p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF public.pdv_can_operate_other_cash_v2(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar documentos de outros caixas.'
      USING ERRCODE='42501',DETAIL='code=pdv_cross_cash_report_denied';
  END IF;
  RETURN public.pdv_document_index_v2(p_limit,p_offset);
END
$fn$;

-- v2 permanece apenas como core interno/service role. Todo cliente autenticado
-- entra por uma assinatura que declara o alcance company-wide.
REVOKE ALL ON FUNCTION public.pdv_get_order_receipt_snapshot_v2(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_partial_projection_report_v2(text,date,date,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_global_event_history_v2(date,date,uuid,integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_document_index_v2(integer,integer)
  FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.pdv_get_order_receipt_snapshot_v3(uuid)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_partial_projection_report_v3(text,date,date,integer,integer)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_global_event_history_v3(date,date,uuid,integer,integer)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_document_index_v3(integer,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_order_receipt_snapshot_v3(uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_partial_projection_report_v3(text,date,date,integer,integer)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_global_event_history_v3(date,date,uuid,integer,integer)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_document_index_v3(integer,integer)
  TO authenticated,service_role;

COMMIT;

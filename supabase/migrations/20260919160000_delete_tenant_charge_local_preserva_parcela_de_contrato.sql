-- Por quê: vamos habilitar cobrança online por parcela de contrato
-- (tenant_charges.source_type = 'contract_installment'). Hoje a RPC
-- delete_tenant_charge_local só preserva o espelho no Financeiro quando ele tem
-- baixa (is_paid / amount_received), NFS-e ou orçamento vinculado. Uma parcela de
-- contrato SEM baixa cairia no ramo DELETE: cancelar a cobrança apagaria a parcela
-- do contrato do cliente. Isso precisa ser impossível ANTES de qualquer tela
-- habilitar o recurso.
--
-- O que muda: novo flag r_contract (ft.contract_id IS NOT NULL) na CTE `mirror`,
-- incluído no keep_it e propagado em mirror_reasons como 'contract'. A assinatura
-- (uuid, uuid) -> jsonb NÃO muda; mirror_reasons já é um array aberto, então o
-- valor novo é aditivo e não quebra chamador nenhum.
--
-- CREATE OR REPLACE (nunca DROP+CREATE): DROP levaria os GRANTs junto.
-- ACL preservada: {postgres=X/postgres, service_role=X/postgres}.
-- Corpo copiado da definição VIVA em produção (pg_get_functiondef), não do arquivo
-- 20260912190000 — só o necessário foi alterado.

CREATE OR REPLACE FUNCTION public.delete_tenant_charge_local(p_company_id uuid, p_charge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge         public.tenant_charges%ROWTYPE;
  v_mirror_total   integer := 0;
  v_mirror_deleted integer := 0;
  v_mirror_kept    integer := 0;
  v_reasons        text[]  := ARRAY[]::text[];
  v_note           text;
  v_has_paid       boolean := false;
  v_has_partial    boolean := false;
  v_has_nfse       boolean := false;
  v_has_quote      boolean := false;
  v_has_contract   boolean := false;
BEGIN
  IF p_company_id IS NULL OR p_charge_id IS NULL THEN
    RAISE EXCEPTION '[delete_tenant_charge_local] company_id e charge_id são obrigatórios';
  END IF;

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF upper(COALESCE(v_charge.status, '')) = ANY (
       ARRAY['CONFIRMED','RECEIVED','RECEIVED_IN_CASH','REFUNDED','CHARGEBACK']
     ) THEN
    RAISE EXCEPTION
      '[delete_tenant_charge_local] cobrança % consta como paga/estornada no nosso banco (status %) — exclusão abortada',
      p_charge_id, v_charge.status
      USING ERRCODE = '23001';
  END IF;

  v_note := format(
    'Cobrança online removida em %s (referência %s, valor R$ %s). Este lançamento foi mantido porque já tinha baixa ou vínculo. Confira se precisa de ajuste.',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador'),
    replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
  );

  -- Classifica cada espelho e resolve tudo num statement só: quem tem dinheiro
  -- ou vínculo em cima recebe o carimbo e FICA; o resto é apagado. Os dois
  -- conjuntos são disjuntos (keep_it / NOT keep_it), então não brigam entre si.
  -- CTE que escreve roda sempre, mesmo sem ser lida pela query principal.
  -- r_contract: parcela de contrato NUNCA morre por cancelamento de cobrança.
  WITH mirror AS (
    SELECT ft.id,
           (ft.is_paid IS TRUE)                  AS r_paid,
           (COALESCE(ft.amount_received, 0) > 0) AS r_partial,
           EXISTS (SELECT 1 FROM public.nfse_emissions ne WHERE ne.financial_transaction_id = ft.id) AS r_nfse,
           EXISTS (SELECT 1 FROM public.quotes q        WHERE q.financial_transaction_id  = ft.id)   AS r_quote,
           (ft.contract_id IS NOT NULL)          AS r_contract
      FROM public.financial_transactions ft
     WHERE ft.tenant_charge_id = p_charge_id
       AND ft.company_id       = p_company_id
  ), classified AS (
    SELECT m.*, (m.r_paid OR m.r_partial OR m.r_nfse OR m.r_quote OR m.r_contract) AS keep_it
      FROM mirror m
  ), stamped AS (
    UPDATE public.financial_transactions ft
       SET notes = btrim(COALESCE(ft.notes || E'\n', '') || v_note)
      FROM classified c
     WHERE ft.id = c.id
       AND c.keep_it
    RETURNING ft.id
  ), del AS (
    DELETE FROM public.financial_transactions ft
     USING classified c
     WHERE ft.id = c.id
       AND c.keep_it = false
    RETURNING ft.id
  )
  SELECT count(*),
         (SELECT count(*) FROM del),
         count(*) FILTER (WHERE c.keep_it),
         COALESCE(bool_or(c.r_paid), false),
         COALESCE(bool_or(c.r_partial), false),
         COALESCE(bool_or(c.r_nfse), false),
         COALESCE(bool_or(c.r_quote), false),
         COALESCE(bool_or(c.r_contract), false)
    INTO v_mirror_total, v_mirror_deleted, v_mirror_kept,
         v_has_paid, v_has_partial, v_has_nfse, v_has_quote, v_has_contract
    FROM classified c;

  IF v_has_paid     THEN v_reasons := v_reasons || 'paid'::text;     END IF;
  IF v_has_partial  THEN v_reasons := v_reasons || 'partial'::text;  END IF;
  IF v_has_nfse     THEN v_reasons := v_reasons || 'nfse'::text;     END IF;
  IF v_has_quote    THEN v_reasons := v_reasons || 'quote'::text;    END IF;
  IF v_has_contract THEN v_reasons := v_reasons || 'contract'::text; END IF;

  DELETE FROM public.tenant_charges
   WHERE id = p_charge_id
     AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'found', true,
    'deleted', true,
    'mirror_total',   v_mirror_total,
    'mirror_deleted', v_mirror_deleted,
    'mirror_kept',    v_mirror_kept,
    'mirror_reasons', to_jsonb(v_reasons)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_tenant_charge_local(uuid, uuid) TO service_role;

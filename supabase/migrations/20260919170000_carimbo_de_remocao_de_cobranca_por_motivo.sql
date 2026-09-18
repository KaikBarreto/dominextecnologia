-- Por quê: a 20260919160000 passou a preservar a parcela de contrato, mas o carimbo
-- gravado em notes continuou sendo UM texto só, calculado antes do WITH e aplicado
-- igual a todas as linhas preservadas. Resultado: uma parcela de contrato sem baixa
-- nenhuma recebia "foi mantido porque já tinha baixa ou vínculo", que é falso para
-- ela e confunde o usuário.
--
-- O que muda: o motivo da preservação é POR LINHA, então o carimbo passa a ser
-- decidido por linha, dentro do UPDATE ... FROM classified. Quando o ÚNICO motivo
-- for contrato, o texto afirma que a parcela continua no Financeiro. Em qualquer
-- outro caso (pago, parcial, NFS-e, orçamento, ou contrato somado a um desses), o
-- texto atual permanece sem mudança.
--
-- As duas frases saem do mesmo format() e dos mesmos três argumentos (data, refe-
-- rência, valor), montados uma vez só em v_note_base, para não duplicar formatação
-- de data nem de moeda.
--
-- Nada de assinatura muda: (uuid, uuid) -> jsonb. CREATE OR REPLACE, nunca DROP
-- (DROP levaria os GRANTs junto). ACL de hoje: {postgres=X/postgres, service_role=X/postgres}.
-- Corpo copiado da definição VIVA (pg_get_functiondef), não de arquivo em disco.

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
  v_note_base      text;
  v_note_contract  text;
  v_note_default   text;
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

  -- Cabeçalho comum às duas frases: data, referência e valor formatados uma vez só.
  v_note_base := format(
    'Cobrança online removida em %s (referência %s, valor R$ %s).',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador'),
    replace(to_char(COALESCE(v_charge.value, 0), 'FM999999990.00'), '.', ',')
  );

  -- Único motivo é ser parcela de contrato: afirma o que aconteceu, sem falar em baixa.
  v_note_contract := v_note_base || ' A parcela do contrato continua no Financeiro.';

  -- Demais casos: texto que já existia, inalterado.
  v_note_default  := v_note_base || ' Este lançamento foi mantido porque já tinha baixa ou vínculo. Confira se precisa de ajuste.';

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
    -- Carimbo por linha: o motivo da preservação varia entre os espelhos da MESMA
    -- cobrança, então o texto não pode ser global.
    UPDATE public.financial_transactions ft
       SET notes = btrim(
             COALESCE(ft.notes || E'\n', '')
             || CASE
                  WHEN c.r_contract
                   AND NOT (c.r_paid OR c.r_partial OR c.r_nfse OR c.r_quote)
                  THEN v_note_contract
                  ELSE v_note_default
                END
           )
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

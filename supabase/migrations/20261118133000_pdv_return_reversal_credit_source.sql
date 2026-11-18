BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- A compensacao comercial cria um novo cabecalho de devolucao (event_kind
-- reversal) antes de recompor os creditos da devolucao original. O writer de
-- valor precisa aceitar esse novo cabecalho como a origem da reversao, sem
-- relaxar a cadeia: ele deve apontar exatamente para a devolucao que originou
-- o credito revertido.
CREATE OR REPLACE FUNCTION public.pdv_value_credit_entry_internal_v3(
  p_company_id uuid,
  p_customer_id uuid,
  p_source_return_id uuid,
  p_source_residual_id uuid,
  p_entry_kind text,
  p_amount numeric,
  p_occurred_on date,
  p_description text,
  p_target_transaction_id uuid,
  p_reversal_of_id uuid,
  p_idempotency_key text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_claim record;
  v_entry uuid;
  v_original public.pdv_party_credit_entries%ROWTYPE;
BEGIN
  IF p_source_residual_id IS NOT NULL THEN
    IF p_company_id IS DISTINCT FROM (SELECT company_id FROM public.pdv_returns_context_v2(NULL))
      OR public.pdv_has_stock_access_scope_v2(
        auth.uid(),
        p_company_id,
        p_order_id => public.pdv_value_order_internal_v3(NULL,p_source_residual_id)
      ) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'A origem financeira está indisponível para seu perfil.'
        USING ERRCODE='42501';
    END IF;
    PERFORM public.pdv_assert_order_cash_access_v2(
      public.pdv_value_order_internal_v3(NULL,p_source_residual_id),
      auth.uid()
    );
  END IF;

  IF public.pdv_party_accounts_v2_enabled_internal(p_company_id) IS DISTINCT FROM TRUE
    OR NOT (
      EXISTS (
        SELECT 1
          FROM public.pdv_value_source_internal_v3(p_source_return_id,p_source_residual_id) header
         WHERE header.company_id=p_company_id
           AND header.customer_id=p_customer_id
      )
      OR (
        p_entry_kind='reversal'
        AND p_source_residual_id IS NULL
        AND EXISTS (
          SELECT 1
            FROM public.pdv_commercial_returns reversal_source
            JOIN public.pdv_party_credit_entries original_entry
              ON original_entry.id=p_reversal_of_id
             AND original_entry.company_id=reversal_source.company_id
           WHERE reversal_source.id=p_source_return_id
             AND reversal_source.company_id=p_company_id
             AND reversal_source.customer_id=p_customer_id
             AND reversal_source.event_kind='reversal'
             AND reversal_source.reversal_of_id=original_entry.source_commercial_return_id
        )
      )
    ) THEN
    RAISE EXCEPTION 'A conta de crédito da devolução não está disponível.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_credit_source_invalid';
  END IF;

  IF p_entry_kind NOT IN('credit','application','reversal')
    OR p_amount IS NULL
    OR p_amount=0
    OR p_amount<>round(p_amount,2)
    OR lower(p_amount::text) IN('nan','infinity','-infinity') THEN
    RAISE EXCEPTION 'Movimento financeiro da devolução inválido.'
      USING ERRCODE='22023';
  END IF;

  IF p_entry_kind='credit'
      AND (p_amount<=0 OR p_target_transaction_id IS NOT NULL OR p_reversal_of_id IS NOT NULL)
    OR p_entry_kind='application'
      AND (p_amount>=0 OR p_target_transaction_id IS NULL OR p_reversal_of_id IS NOT NULL)
    OR p_entry_kind='reversal'
      AND p_reversal_of_id IS NULL THEN
    RAISE EXCEPTION 'Formato financeiro da devolução inválido.'
      USING ERRCODE='22023';
  END IF;

  IF p_entry_kind='reversal' THEN
    SELECT * INTO v_original
      FROM public.pdv_party_credit_entries entry
     WHERE entry.id=p_reversal_of_id
       AND entry.company_id=p_company_id
     FOR UPDATE;

    IF NOT FOUND
      OR num_nonnulls(
        v_original.source_commercial_return_id,
        v_original.source_residual_cancellation_id
      )<>1
      OR p_amount<>-v_original.amount
      OR (
        v_original.source_commercial_return_id IS DISTINCT FROM p_source_return_id
        AND NOT EXISTS (
          SELECT 1
            FROM public.pdv_commercial_returns reversal_source
           WHERE reversal_source.id=p_source_return_id
             AND reversal_source.company_id=p_company_id
             AND reversal_source.customer_id=p_customer_id
             AND reversal_source.event_kind='reversal'
             AND reversal_source.reversal_of_id=v_original.source_commercial_return_id
        )
      )
      OR v_original.source_residual_cancellation_id IS DISTINCT FROM p_source_residual_id
      OR p_target_transaction_id IS DISTINCT FROM v_original.target_financial_transaction_id
      OR EXISTS (
        SELECT 1
          FROM public.pdv_party_credit_entries reversal
         WHERE reversal.reversal_of_id=v_original.id
      ) THEN
      RAISE EXCEPTION 'Crédito da devolução não pode ser compensado.'
        USING ERRCODE='23514',DETAIL='code=pdv_return_credit_not_reversible';
    END IF;
  END IF;

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      p_company_id,
      CASE
        WHEN p_entry_kind='reversal' THEN 'commercial.return.credit.reverse.v2'
        ELSE 'commercial.return.credit.post.v2'
      END,
      p_idempotency_key,
      jsonb_build_object(
        'customer_id',p_customer_id,
        'source_return_id',p_source_return_id,
        'entry_kind',p_entry_kind,
        'amount',p_amount,
        'occurred_on',p_occurred_on,
        'description',p_description,
        'target_transaction_id',p_target_transaction_id,
        'reversal_of_id',p_reversal_of_id
      ) || CASE
        WHEN p_source_residual_id IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object('source_residual_id',p_source_residual_id)
      END
    );

  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN
      RETURN (v_claim.stored_result->>'entry_id')::uuid;
    END IF;
    RAISE EXCEPTION 'O movimento financeiro da devolução já está em processamento.'
      USING ERRCODE='55000';
  END IF;

  IF p_entry_kind='reversal' AND p_source_return_id IS NOT NULL THEN
    PERFORM set_config(
      'app.pdv_return_credit_reverse',
      v_original.source_commercial_return_id::text,
      true
    );
  END IF;

  INSERT INTO public.pdv_party_credit_entries(
    company_id,
    party_type,
    customer_id,
    entry_kind,
    amount,
    occurred_on,
    description,
    target_financial_transaction_id,
    reversal_of_id,
    operation_request_id,
    metadata,
    source_commercial_return_id,
    source_residual_cancellation_id,
    created_by
  ) VALUES (
    p_company_id,
    'customer',
    p_customer_id,
    p_entry_kind,
    p_amount,
    p_occurred_on,
    p_description,
    p_target_transaction_id,
    p_reversal_of_id,
    v_claim.request_id,
    jsonb_build_object(
      'source',
      CASE
        WHEN p_source_residual_id IS NULL THEN 'commercial_return_v2'
        ELSE 'order_residual_cancellation_v3'
      END
    ),
    p_source_return_id,
    p_source_residual_id,
    auth.uid()
  ) RETURNING id INTO v_entry;

  IF p_entry_kind='reversal' THEN
    PERFORM set_config('app.pdv_return_credit_reverse','',true);
  END IF;

  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id,
    'pdv_party_credit_entry',
    v_entry,
    jsonb_build_object('ok',true,'entry_id',v_entry)
  );
  RETURN v_entry;
END
$function$;

REVOKE ALL ON FUNCTION public.pdv_value_credit_entry_internal_v3(
  uuid,uuid,uuid,uuid,text,numeric,date,text,uuid,uuid,text
) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;

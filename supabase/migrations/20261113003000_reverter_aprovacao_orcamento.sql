-- Reabre uma aprovação acidental sem deixar OS, financeiro ou cobrança em
-- contradição. A transição é deliberadamente estreita: aprovado -> enviado.
-- Rejeição continua sendo uma decisão comercial separada, e orçamento já
-- convertido/financeirizado precisa desfazer primeiro o efeito correspondente.

CREATE OR REPLACE FUNCTION public.guard_quote_approval_revert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'aprovado' AND NEW.status = 'enviado' THEN
    -- A RPC abaixo marca somente a transação atual. O cliente não consegue
    -- definir este GUC por PostgREST nem reutilizá-lo em outra requisição.
    IF current_setting('app.revert_quote_approval', true) = 'allowed' THEN
      RETURN NEW;
    END IF;

    -- O gatilho histórico de DELETE em financial_transactions também faz a
    -- transição ao limpar os vínculos. Ele atualiza quotes de dentro de outro
    -- trigger (profundidade > 1) e precisa continuar funcionando.
    IF pg_trigger_depth() > 1
       AND OLD.financial_generated_at IS NOT NULL
       AND NEW.financial_generated_at IS NULL
       AND NEW.financial_transaction_id IS NULL THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'A aprovação deve ser revertida pelo fluxo seguro do orçamento.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_quote_approval_revert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_quote_approval_revert ON public.quotes;
CREATE TRIGGER trg_guard_quote_approval_revert
  BEFORE UPDATE OF status ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_quote_approval_revert();

CREATE OR REPLACE FUNCTION public.revert_quote_approval(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_quote public.quotes%ROWTYPE;
  v_status text;
  v_is_super boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  v_is_super := COALESCE(public.is_super_admin(v_uid), false);

  -- Serializa clique duplo, retry offline e aprovação pública concorrente.
  SELECT q.*
    INTO v_quote
    FROM public.quotes q
   WHERE q.id = p_quote_id
   FOR UPDATE;

  IF v_quote.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Resposta neutra para outro tenant: não confirma que o UUID existe.
  IF NOT v_is_super AND v_quote.company_id IS DISTINCT FROM public.get_user_company_id(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT v_is_super AND (
    COALESCE(public.is_user_active(v_uid), false) IS NOT TRUE
    OR COALESCE(public.tenant_subscription_allows_access(v_quote.company_id), false) IS NOT TRUE
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotência: a primeira chamada pode ter concluído e a resposta se
  -- perdido. Repetir não deve falhar nem alterar mais nada.
  IF v_quote.status = 'enviado' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'enviado', 'reverted', false);
  END IF;

  IF v_quote.status <> 'aprovado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  IF v_quote.financial_generated_at IS NOT NULL
     OR v_quote.financial_transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'financial_exists');
  END IF;

  -- Confere os dois lados do vínculo. O segundo EXISTS protege dados antigos
  -- ou inconsistentes em que service_orders.quote_id existe, mas o ponteiro
  -- espelho quotes.converted_to_os_id ficou vazio.
  IF v_quote.converted_to_os_id IS NOT NULL OR EXISTS (
    SELECT 1
      FROM public.service_orders so
     WHERE so.company_id = v_quote.company_id
       AND so.quote_id = v_quote.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'service_order_exists');
  END IF;

  -- Mesmo conjunto de cobrança morta usado no hook useQuoteChargedIds e na
  -- edge tenant-asaas-create-charge. Status vazio/desconhecido falha fechado.
  IF EXISTS (
    SELECT 1
      FROM public.tenant_charges tc
     WHERE tc.company_id = v_quote.company_id
       AND tc.source_type = 'quote'
       AND tc.source_id = v_quote.id
       AND COALESCE(upper(btrim(tc.status)), '') NOT IN (
         'CANCELLED', 'CANCELED', 'REFUNDED', 'CHARGEBACK'
       )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'charge_exists');
  END IF;

  PERFORM set_config('app.revert_quote_approval', 'allowed', true);

  UPDATE public.quotes
     SET status = 'enviado'
   WHERE id = v_quote.id
     AND status = 'aprovado'
   RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    -- Rede de segurança para uma mudança inesperada por outro escritor.
    SELECT q.status INTO v_status FROM public.quotes q WHERE q.id = v_quote.id;
    IF v_status = 'enviado' THEN
      RETURN jsonb_build_object('ok', true, 'status', 'enviado', 'reverted', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'conflict');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'reverted', true);
END;
$$;

COMMENT ON FUNCTION public.revert_quote_approval(uuid) IS
  'Reverte aprovado -> enviado de forma idempotente, somente no tenant do chamador e sem OS, financeiro ou cobrança viva.';

REVOKE ALL ON FUNCTION public.revert_quote_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_quote_approval(uuid) TO authenticated, service_role;

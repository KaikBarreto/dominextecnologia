-- =============================================================================
-- Cobranças: "cliente escolhe as parcelas" no cartão (Asaas BYO)
-- =============================================================================
-- POR QUÊ
--   Hoje a empresa FIXA o nº de parcelas ao criar a cobrança no cartão. O modo
--   novo deixa a empresa definir só o TETO (ex.: até 10x) e o pagador escolhe
--   no checkout público /pagar/:code.
--
--   A Asaas não converte uma cobrança 1x existente em parcelada
--   (payWithCreditCard e PUT /payments/{id} não aceitam parcelas). Então:
--     1. tenant-asaas-create-charge cria a cobrança 1x e grava aqui o teto
--        (customer_max_installments) e os dados para recalcular o repasse
--        (card_fee_payer, base_value);
--     2. se o pagador escolher N, tenant-asaas-pay-charge-card cria uma
--        cobrança NOVA parcelada já com o cartão; aprovada, chama
--        replace_tenant_charge_gateway_payment (abaixo) e depois apaga a 1x
--        antiga na Asaas;
--     3. o webhook dá baixa nas parcelas pelo caminho que já existe
--        (apply_tenant_charge_installment_payment, por asaas_installment_id) e
--        ignora os eventos da 1x antiga (tenant_charge_is_superseded_payment).
--
-- INVARIANTE
--   Depois da troca, tenant_charges + espelho em financial_transactions ficam
--   IDÊNTICOS ao que existiria se a empresa tivesse criado a cobrança já com N
--   parcelas e o mesmo pagador de taxa pelo fluxo atual. No fluxo atual:
--     · tenant_charges.value      = total cobrado do pagador (com repasse);
--     · tenant_charges.net_value  = netValue devolvido na criação;
--     · asaas_payment_id          = id da 1ª parcela; asaas_installment_id =
--                                   id do agrupamento (NULL se 1x);
--     · installment_number/total  = NULL (são do LOTE de boleto/pix,
--                                   tenant_charges_installment_shape_check
--                                   exige batch_id junto);
--     · recebível-mãe ÚNICO (linha cheia) com amount = total cobrado; as
--       parcelas viram filhas "Recebimento parcial" + neta de tarifa, criadas
--       no pagamento por apply_tenant_charge_installment_payment.
--   Portanto a troca só precisa: trocar ids/valores na cobrança e alinhar
--   amount da mãe (quando a mãe é espelho PRÓPRIO desta cobrança) ao novo
--   total. Antes do pagamento não existe filha nem tarifa para ajustar.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, constraints em DO com checagem,
-- CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- RLS de tenant_charges não muda: colunas novas herdam as policies da tabela.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas novas (aditivas; só o array tem default, e '{}' é constante —
--    não reescreve a tabela no PG 11+)
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenant_charges
  ADD COLUMN IF NOT EXISTS customer_max_installments smallint NULL,
  ADD COLUMN IF NOT EXISTS card_fee_payer text NULL,
  ADD COLUMN IF NOT EXISTS base_value numeric(14,2) NULL,
  ADD COLUMN IF NOT EXISTS superseded_asaas_payment_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tenant_charges.customer_max_installments IS
  'Modo "cliente escolhe as parcelas": teto de parcelas no cartão (2..12). NULL = parcelamento definido pela empresa.';
COMMENT ON COLUMN public.tenant_charges.card_fee_payer IS
  'Quem paga a taxa do cartão NESTA cobrança (company|customer). NULL = cobrança anterior a esta coluna.';
COMMENT ON COLUMN public.tenant_charges.base_value IS
  'Valor pedido pela empresa ANTES do repasse de taxa. value guarda o total cobrado do pagador.';
COMMENT ON COLUMN public.tenant_charges.superseded_asaas_payment_ids IS
  'Ids de cobranças Asaas substituídas pela troca 1x -> parcelada. Eventos desses ids são ignorados pelo webhook; a limpeza re-tenta o DELETE no gateway.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.tenant_charges'::regclass
       AND conname  = 'tenant_charges_customer_max_installments_check'
  ) THEN
    ALTER TABLE public.tenant_charges
      ADD CONSTRAINT tenant_charges_customer_max_installments_check
      CHECK (customer_max_installments IS NULL OR customer_max_installments BETWEEN 2 AND 12);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.tenant_charges'::regclass
       AND conname  = 'tenant_charges_card_fee_payer_check'
  ) THEN
    ALTER TABLE public.tenant_charges
      ADD CONSTRAINT tenant_charges_card_fee_payer_check
      CHECK (card_fee_payer IS NULL OR card_fee_payer IN ('company', 'customer'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.tenant_charges'::regclass
       AND conname  = 'tenant_charges_base_value_check'
  ) THEN
    ALTER TABLE public.tenant_charges
      ADD CONSTRAINT tenant_charges_base_value_check
      CHECK (base_value IS NULL OR base_value > 0);
  END IF;
END $$;

-- GIN: tenant_charge_is_superseded_payment filtra por "array contém id" em
-- TODA entrega de webhook de cobrança; sem índice vira seq scan da tabela
-- inteira a cada evento.
CREATE INDEX IF NOT EXISTS idx_tenant_charges_superseded_payment_ids
  ON public.tenant_charges USING gin (superseded_asaas_payment_ids);

-- -----------------------------------------------------------------------------
-- 2. RPC de troca atômica do pagamento no gateway
-- -----------------------------------------------------------------------------
-- Chamada SÓ pela edge tenant-asaas-pay-charge-card, DEPOIS que a Asaas aprovou
-- a cobrança nova. Nunca lança exceção por regra de negócio: devolve
-- swapped=false + reason, e a edge decide (desfazer a cobrança nova no gateway).
--
-- p_new_invoice_url (opcional, acréscimo ao contrato): invoiceUrl da cobrança
-- nova. A antiga é apagada na Asaas, então o link dela morre; sem o novo, a
-- coluna fica NULL (o checkout público é o nosso /pagar/:code).
DROP FUNCTION IF EXISTS public.replace_tenant_charge_gateway_payment(uuid, text, text, text, integer, numeric, numeric);

CREATE OR REPLACE FUNCTION public.replace_tenant_charge_gateway_payment(
  p_charge_id           uuid,
  p_expected_payment_id text,
  p_new_payment_id      text,
  p_new_installment_id  text,
  p_installment_count   integer,
  p_billed_value        numeric,
  p_net_value           numeric,
  p_new_invoice_url     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge        public.tenant_charges%ROWTYPE;
  v_expected      text := NULLIF(btrim(COALESCE(p_expected_payment_id, '')), '');
  v_new           text := NULLIF(btrim(COALESCE(p_new_payment_id, '')), '');
  v_new_inst      text := NULLIF(btrim(COALESCE(p_new_installment_id, '')), '');
  v_billed        numeric(14,2);
  v_mother        public.financial_transactions%ROWTYPE;
  v_mirror        text := 'no_mirror';
  v_paid_statuses text[] := ARRAY['CONFIRMED','RECEIVED','RECEIVED_IN_CASH',
                                  'REFUNDED','REFUND_REQUESTED','REFUND_IN_PROGRESS',
                                  'PARTIALLY_REFUNDED','CHARGEBACK','CHARGEBACK_REQUESTED',
                                  'CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL'];
BEGIN
  -- Argumentos: falha de chamador vira reason, não exceção (a edge já cobrou o
  -- cartão quando chega aqui e precisa de uma resposta para desfazer).
  IF p_charge_id IS NULL OR v_expected IS NULL OR v_new IS NULL THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'missing_args');
  END IF;
  IF v_new = v_expected THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'same_payment_id');
  END IF;
  IF p_billed_value IS NULL OR p_billed_value <= 0 THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'invalid_billed_value');
  END IF;
  v_billed := round(p_billed_value, 2);

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'charge_not_found');
  END IF;

  -- Retry seguro: a troca já foi feita por esta mesma chamada antes.
  -- Vem ANTES da guarda de "já paga": o webhook da cobrança nova pode ter
  -- dado baixa entre a 1ª chamada e o retry.
  IF v_charge.asaas_payment_id = v_new THEN
    RETURN jsonb_build_object(
      'swapped', true,
      'superseded_payment_id',
        CASE WHEN v_expected = ANY (v_charge.superseded_asaas_payment_ids) THEN v_expected END,
      'reason', 'already_swapped'
    );
  END IF;

  -- Compare-and-swap.
  IF v_charge.asaas_payment_id IS DISTINCT FROM v_expected THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'payment_id_mismatch');
  END IF;

  IF v_charge.payment_date IS NOT NULL
     OR upper(COALESCE(v_charge.status, '')) = ANY (v_paid_statuses) THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'charge_already_paid');
  END IF;

  -- Allowlist de status vivo: só cobrança aberta no gateway pode ser trocada
  -- (DELETED/CANCELLED/PENDING_CREATION e afins ficam de fora).
  IF upper(COALESCE(v_charge.status, '')) NOT IN ('PENDING', 'OVERDUE') THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'charge_not_open');
  END IF;

  IF v_charge.customer_max_installments IS NULL THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'not_customer_installments_mode');
  END IF;

  -- Modo só existe no cartão e fora de lote/assinatura (as duas origens têm
  -- regras próprias de parcela/ciclo que esta troca não conhece).
  IF COALESCE(v_charge.billing_type, '') <> 'CREDIT_CARD'
     OR v_charge.batch_id IS NOT NULL
     OR v_charge.subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'charge_not_eligible');
  END IF;

  IF p_installment_count IS NULL
     OR p_installment_count < 1
     OR p_installment_count > v_charge.customer_max_installments THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'installment_count_out_of_range');
  END IF;

  -- Forma da cobrança nova: parcelada TEM agrupamento; 1x NÃO tem. Sem o
  -- agrupamento as parcelas 2..N nunca achariam esta cobrança no webhook.
  IF (p_installment_count > 1 AND v_new_inst IS NULL)
     OR (p_installment_count = 1 AND v_new_inst IS NOT NULL) THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'installment_shape_mismatch');
  END IF;

  -- Repasse nunca deixa o total abaixo do valor pedido pela empresa
  -- (1 centavo de tolerância de arredondamento do gateway).
  IF v_charge.base_value IS NOT NULL AND v_billed < v_charge.base_value - 0.01 THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'billed_below_base');
  END IF;

  -- Ids novos não podem pertencer a outra cobrança (UNIQUE de asaas_payment_id
  -- abortaria a transação; agrupamento duplicado faria a baixa cair na errada).
  IF EXISTS (
    SELECT 1 FROM public.tenant_charges tc
     WHERE tc.id <> v_charge.id
       AND (tc.asaas_payment_id = v_new
            OR (v_new_inst IS NOT NULL AND tc.asaas_installment_id = v_new_inst))
  ) THEN
    RETURN jsonb_build_object('swapped', false, 'superseded_payment_id', NULL, 'reason', 'new_payment_already_linked');
  END IF;

  -- ---- A troca ----
  -- pix/boleto/invoice eram da cobrança antiga (que será apagada na Asaas).
  -- installment_number/installment_total/batch_id NÃO são tocados: pertencem
  -- ao lote de boleto/pix e são NULL em venda parcelada no cartão.
  -- Gatilhos de aviso (e-mail/WhatsApp "cobrança criada") só disparam quando
  -- o asaas_payment_id ANTERIOR era NULL, então a troca não reenvia aviso.
  UPDATE public.tenant_charges
     SET asaas_payment_id             = v_new,
         asaas_installment_id         = v_new_inst,
         value                        = v_billed,
         net_value                    = p_net_value,
         invoice_url                  = NULLIF(btrim(COALESCE(p_new_invoice_url, '')), ''),
         pix_copy_paste               = NULL,
         boleto_url                   = NULL,
         superseded_asaas_payment_ids =
           CASE WHEN v_expected = ANY (superseded_asaas_payment_ids)
                THEN superseded_asaas_payment_ids
                ELSE array_append(superseded_asaas_payment_ids, v_expected) END,
         updated_at                   = now()
   WHERE id = v_charge.id;

  -- ---- Espelho financeiro ----
  -- Mesma régua de update_tenant_charge_local: só a mãe que é espelho PRÓPRIO
  -- desta cobrança acompanha o valor. Parcela de contrato e conta a receber
  -- preexistente (origem 'receivable') são do Financeiro do cliente — no fluxo
  -- nativo também não mudam de valor por causa da cobrança online.
  SELECT * INTO v_mother
    FROM public.financial_transactions ft
   WHERE ft.tenant_charge_id      = v_charge.id
     AND ft.company_id            = v_charge.company_id
     AND ft.transaction_type      = 'entrada'
     AND ft.parent_transaction_id IS NULL
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_charge.source_type IN ('contract_installment', 'receivable')
       OR v_mother.contract_id IS NOT NULL THEN
      v_mirror := 'linked_not_owned';
    ELSIF v_mother.amount IS NOT DISTINCT FROM v_billed THEN
      v_mirror := 'unchanged';
    ELSE
      UPDATE public.financial_transactions
         SET amount     = v_billed,
             updated_at = now()
       WHERE id         = v_mother.id
         AND company_id = v_charge.company_id;

      -- Mãe com recebimento parcial (baixa manual antes do cartão): is_paid
      -- depende de amount x soma das filhas. Quem decide é a função dona do
      -- fato; amount_received nunca é escrito aqui.
      IF COALESCE(v_mother.amount_received, 0) > 0 THEN
        PERFORM public.recalc_amount_received(v_mother.id);
      END IF;
      v_mirror := 'updated';
    END IF;
  END IF;
  -- Mãe ausente: nada a fazer. A auto-cura da baixa
  -- (rebuild_tenant_charge_receivable) usa tenant_charges.value, que já é o
  -- total novo.

  RETURN jsonb_build_object(
    'swapped', true,
    'superseded_payment_id', v_expected,
    'reason', NULL,
    'mirror', v_mirror,
    'mirror_id', v_mother.id
  );
END;
$$;

COMMENT ON FUNCTION public.replace_tenant_charge_gateway_payment(uuid, text, text, text, integer, numeric, numeric, text) IS
  'Troca atômica (compare-and-swap) do pagamento Asaas de uma cobrança no modo "cliente escolhe as parcelas". Só service_role.';

REVOKE ALL ON FUNCTION public.replace_tenant_charge_gateway_payment(uuid, text, text, text, integer, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_tenant_charge_gateway_payment(uuid, text, text, text, integer, numeric, numeric, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. O id é de uma cobrança Asaas substituída?
-- -----------------------------------------------------------------------------
-- Usada pelo webhook ANTES de processar qualquer evento PAYMENT_*. As RPCs de
-- baixa/estorno/limpeza já resolvem a cobrança por asaas_payment_id (o id
-- antigo não está mais lá, então caem em charge_not_found), mas o webhook faz
-- UPDATEs diretos e precisa distinguir "evento de cobrança substituída" de
-- "cobrança desconhecida".
CREATE OR REPLACE FUNCTION public.tenant_charge_is_superseded_payment(p_asaas_payment_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(btrim(p_asaas_payment_id), '') <> ''
     AND EXISTS (
       SELECT 1
         FROM public.tenant_charges tc
        WHERE tc.superseded_asaas_payment_ids @> ARRAY[btrim(p_asaas_payment_id)]
     );
$$;

REVOKE ALL ON FUNCTION public.tenant_charge_is_superseded_payment(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_charge_is_superseded_payment(text) TO service_role;

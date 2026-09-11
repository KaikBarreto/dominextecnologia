-- Orçamento aprovado vira RECEBÍVEL (a receber), opcionalmente parcelado —
-- e a aprovação feita pelo cliente no link público pode gerar o recebível.
--
-- POR QUE:
--   Hoje aprovar um orçamento por dentro do sistema (useQuoteConversion) grava a
--   receita com is_paid=true / paid_date=hoje / due_date nulo, valor cheio à
--   vista. O cliente "Alô Gás Jequitibá" reclamou com razão: aprovar NÃO é
--   receber. Isso infla o caixa do dia e suja o DRE no regime de caixa.
--
--   E a aprovação feita pelo CLIENTE FINAL no link público (/proposta/:token)
--   hoje não lança nada — só muda o status. Quem quiser que ela já gere o
--   "a receber" precisa de um opt-in, porque ligar isso pra todo mundo mudaria
--   o comportamento financeiro de 50 empresas de uma vez.
--
-- O QUE ESTA MIGRATION FAZ (puramente ADITIVA — nenhuma linha existente muda):
--   1. company_settings ganha 2 chaves de preferência por empresa.
--   2. quotes ganha a condição de recebimento (nº de parcelas + 1º vencimento),
--      preenchida no formulário do orçamento. É o que a aprovação PÚBLICA usa,
--      já que lá não existe operador pra perguntar na hora.
--   3. respond_quote_public passa a gerar as parcelas a receber quando a
--      empresa optou por isso.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + ADD CONSTRAINT condicional +
--   CREATE OR REPLACE FUNCTION. Rodar 2x não quebra.

------------------------------------------------------------
-- 1. company_settings — preferências da empresa
------------------------------------------------------------

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS quote_approval_revenue_mode text NOT NULL DEFAULT 'a_receber';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_settings'::regclass
      AND conname  = 'company_settings_quote_approval_revenue_mode_check'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_quote_approval_revenue_mode_check
      CHECK (quote_approval_revenue_mode IN ('recebido', 'a_receber'));
  END IF;
END
$do$;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS quote_public_approval_creates_receivable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.quote_approval_revenue_mode IS
  'Qual opção vem PRE-MARCADA no modal interno de aprovação de orçamento: "recebido" (entra paga, comportamento antigo) ou "a_receber" (entra pendente, com vencimento). É só o default do formulário — o operador troca em 1 clique na hora. Default a_receber porque aprovar não é receber (pedido do cliente Alô Gás, set/2026).';

COMMENT ON COLUMN public.company_settings.quote_public_approval_creates_receivable IS
  'Quando TRUE, a aprovação feita pelo CLIENTE FINAL no link público (/proposta/:token) já lança as parcelas a receber no financeiro, usando quotes.receivable_installments / receivable_first_due_date. Default FALSE preserva exatamente o comportamento de hoje (aprovar pelo link só muda o status). Ligar é opt-in do tenant.';

------------------------------------------------------------
-- 2. quotes — condição de recebimento do orçamento
------------------------------------------------------------

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS receivable_installments int NOT NULL DEFAULT 1;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quotes'::regclass
      AND conname  = 'quotes_receivable_installments_check'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_receivable_installments_check
      CHECK (receivable_installments BETWEEN 1 AND 60);
  END IF;
END
$do$;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS receivable_first_due_date date;

COMMENT ON COLUMN public.quotes.receivable_installments IS
  'Em quantas parcelas mensais a receita deste orçamento deve ser lançada quando ele for aprovado. 1 = parcela única. Máx 60. Preenchido no formulário do orçamento; é a condição que a aprovação PÚBLICA usa (lá não há operador pra perguntar).';

COMMENT ON COLUMN public.quotes.receivable_first_due_date IS
  'Vencimento da 1ª parcela. NULL significa "vence na data da aprovação". As parcelas seguintes caem de mês em mês CALENDÁRIO a partir daqui (31/01 -> 28/02, clamp nativo do Postgres).';

------------------------------------------------------------
-- 3. respond_quote_public — aprovação pública gera o recebível
------------------------------------------------------------
--
-- Base: definição VIVA em produção (pg_get_functiondef em 2026-09-11), não a do
-- arquivo 20260722140000 (conferido: são idênticas).
--
-- CREATE OR REPLACE com a MESMA assinatura (_token text, _status text) de
-- propósito: preserva os GRANTs pra anon/authenticated. NÃO usar DROP FUNCTION
-- aqui — DROP leva os GRANTs junto e a página pública (anônima) volta a quebrar.
--
-- SEGURANÇA: tudo continua escopado SÓ pelo token. O company_id do lançamento é
-- derivado do QUOTE, nunca de parâmetro do chamador. A assinatura não muda,
-- nenhum dado de outra empresa é exposto e token inválido continua devolvendo
-- o mesmo 'not_found' neutro.
--
-- VALOR BRUTO = quotes.total_value.
--   ⚠️ Conferido em produção (2026-09-11) antes de fixar: nos 29 orçamentos
--   aprovados, `total_value` está preenchido em 29/29 e bate 1:1 com a receita
--   que o fluxo interno lançou (financial_transaction_id). Já `total_price`
--   NÃO é o preço de venda: vem de `bdi.finalPrice` (QuoteFormDialog) e no dado
--   real espelha `total_cost` (ex.: orçamento #47 -> total_value 8557,99 e
--   total_price 3513,50 = total_cost). Usá-lo como fallback geraria recebível
--   pelo CUSTO. Por isso o COALESCE é só (total_value, 0). `final_price` nem
--   existe no banco — é campo de front, descartado antes do insert.

CREATE OR REPLACE FUNCTION public.respond_quote_public(_token text, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current   text;
  v_rows      integer;
  v_quote     public.quotes%ROWTYPE;
  v_enabled   boolean;
  v_gross     numeric;
  v_n         integer;
  v_base      date;
  v_due       date;
  v_group     uuid;
  v_share     numeric;
  v_amount    numeric;
  v_desc      text;
  v_first_id  uuid;
  v_id        uuid;
  v_i         integer;
BEGIN
  -- Só aceitamos as duas transições públicas possíveis.
  IF _status NOT IN ('aprovado', 'rejeitado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  -- Resolve o status atual SÓ pelo token. Resposta neutra quando não existe
  -- (não revela se o token é válido ou não).
  SELECT status INTO v_current
  FROM public.quotes
  WHERE token = _token
  LIMIT 1;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Transição única e idempotente: só sai de 'enviado'. Nunca rebaixa um quote
  -- já aprovado/rejeitado/convertido. Mexe SOMENTE em `status`.
  UPDATE public.quotes
     SET status = _status
   WHERE token = _token
     AND status = 'enviado';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    -- 0 linhas = já respondido/expirado. Sem erro real; devolve o status atual.
    RETURN jsonb_build_object(
      'ok', false, 'status', v_current, 'error', 'not_pending',
      'receivable_created', false
    );
  END IF;

  ------------------------------------------------------------------
  -- Daqui pra baixo o status JÁ mudou (1 linha). O recebível é um
  -- efeito colateral OPCIONAL: se qualquer guarda barrar, a resposta
  -- continua ok:true — o cliente respondeu a proposta, e isso vale.
  ------------------------------------------------------------------

  IF _status <> 'aprovado' THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  -- O UPDATE acima já travou a linha nesta transação: duas aprovações
  -- simultâneas não geram parcela em dobro (a segunda vê 0 linhas).
  SELECT * INTO v_quote FROM public.quotes WHERE token = _token LIMIT 1;

  -- Mesma guarda de idempotência que o fluxo interno usa
  -- (useQuoteConversion): se o operador já aprovou por dentro, não duplica.
  IF v_quote.financial_generated_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  -- Opt-in por empresa. company_id vem do QUOTE.
  SELECT cs.quote_public_approval_creates_receivable
    INTO v_enabled
  FROM public.company_settings cs
  WHERE cs.company_id = v_quote.company_id
  LIMIT 1;

  IF COALESCE(v_enabled, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  v_gross := COALESCE(v_quote.total_value, 0);
  IF v_gross <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'status', _status, 'receivable_created', false);
  END IF;

  v_n     := GREATEST(1, LEAST(60, COALESCE(v_quote.receivable_installments, 1)));
  -- NULL = vence na data da aprovação (fuso do Brasil, não UTC).
  v_base  := COALESCE(v_quote.receivable_first_due_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_group := gen_random_uuid();
  -- Rateio: N-1 parcelas iguais e a SOBRA na última, pra somar ao centavo.
  -- Mesmo critério do parcelamento manual do financeiro (useFinancial).
  v_share := round(v_gross / v_n, 2);

  FOR v_i IN 1..v_n LOOP
    IF v_i = v_n THEN
      v_amount := v_gross - (v_share * (v_n - 1));
    ELSE
      v_amount := v_share;
    END IF;

    -- Mês de CALENDÁRIO (regra-lei do projeto), nunca 30 dias. O Postgres já
    -- faz o clamp de fim de mês: 31/01 + 1 mês = 28/02.
    v_due := (v_base + ((v_i - 1) * interval '1 month'))::date;

    v_desc := 'Orçamento #' || v_quote.quote_number::text;
    IF v_n > 1 THEN
      -- Formato idêntico ao do parcelamento manual, pra as duas origens
      -- ficarem indistinguíveis na tela: "Orçamento #12 (2/3)".
      v_desc := v_desc || ' (' || v_i::text || '/' || v_n::text || ')';
    END IF;

    INSERT INTO public.financial_transactions (
      company_id, transaction_type, category, description, amount,
      transaction_date, due_date, paid_date, is_paid,
      customer_id, account_id, created_by,
      installment_group_id, installment_number, installment_total
    ) VALUES (
      v_quote.company_id,           -- SEMPRE do quote. Nunca de parâmetro.
      'entrada',
      'Vendas de Serviços',         -- categoria de sistema já semeada
      v_desc,
      v_amount,
      v_due, v_due, NULL, false,    -- a receber: sem conta, sem data de pagamento
      v_quote.customer_id,
      NULL,
      NULL,                         -- não há usuário autenticado: quem aprovou
                                    -- foi o cliente final, pelo link público
      -- Parcela única NÃO recebe marcação de parcelamento: é assim que o
      -- lançamento manual nasce (useFinancial só monta grupo quando n > 1) e a
      -- lista financeira desenha o badge "x/y" sempre que installment_number
      -- existe — um "1/1" denunciaria a origem pública sem nenhum ganho.
      CASE WHEN v_n > 1 THEN v_group ELSE NULL END,
      CASE WHEN v_n > 1 THEN v_i     ELSE NULL END,
      CASE WHEN v_n > 1 THEN v_n     ELSE NULL END
    )
    RETURNING id INTO v_id;

    IF v_i = 1 THEN
      v_first_id := v_id;
    END IF;
  END LOOP;

  UPDATE public.quotes
     SET financial_generated_at  = now(),
         financial_transaction_id = v_first_id
   WHERE id = v_quote.id;

  RETURN jsonb_build_object(
    'ok', true, 'status', _status,
    'receivable_created', true, 'installments', v_n
  );
END;
$function$;

-- Reforço defensivo: a assinatura não mudou, então o CREATE OR REPLACE acima
-- preservou os GRANTs. Re-emitimos mesmo assim porque a página pública é
-- ANÔNIMA — se algum dia alguém dropar a função, esta linha segura a barra.
GRANT EXECUTE ON FUNCTION public.respond_quote_public(text, text) TO anon, authenticated;

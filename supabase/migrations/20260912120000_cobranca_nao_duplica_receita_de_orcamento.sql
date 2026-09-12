-- ============================================================================
-- Cobrança online NÃO pode lançar receita de um orçamento que a APROVAÇÃO já
-- lançou — trava no servidor.
--
-- O BURACO (medido, não suposto)
-- ------------------------------
-- Um mesmo orçamento tem HOJE dois caminhos independentes que criam recebível
-- em financial_transactions, e nenhum dos dois enxerga o outro:
--
--   (1) APROVAR o orçamento  → grava o(s) "a receber" e carimba
--       quotes.financial_transaction_id + quotes.financial_generated_at.
--       Interno: useQuoteConversion (client). Público: respond_quote_public
--       (RPC, 20260911200000) — este já tem a guarda
--       `IF v_quote.financial_generated_at IS NOT NULL THEN ... não duplica`.
--
--   (2) GERAR COBRANÇA Asaas do MESMO orçamento → a edge
--       tenant-asaas-create-charge chama create_tenant_charge_receivable
--       (20260822120000), que é idempotente SÓ por tenant_charge_id e NUNCA
--       olha o orçamento de origem.
--
-- Resultado: orçamento de R$ 18.000 aprovado e depois cobrado vira R$ 36.000 de
-- receita. Nenhum erro, nenhum alerta — o faturamento e a DRE simplesmente
-- ficam melhores que a realidade, que é a pior classe de defeito num sistema
-- financeiro.
--
-- ⚠️ ZERO CASOS EM PRODUÇÃO HOJE (conferido em 12/09/2026: as 13 cobranças
-- existentes são todas source_type='avulso', nenhuma 'quote'). É bomba armada,
-- não explodida — NÃO HÁ DADO A LIMPAR nesta migration, só porta a fechar.
--
-- A METADE DE INTERFACE JÁ EXISTE (outro dev, src/pages/Quotes.tsx): a ação
-- "Aprovar" some quando já existe cobrança para aquele orçamento. Isso cobre o
-- usuário clicando. NÃO cobre chamada direta por API, corrida entre duas abas,
-- nem reprocessamento. Esta migration é a REDE; a tela é a porta.
--
-- POR QUE ERRO (RAISE) E NÃO NO-OP SILENCIOSO
-- -------------------------------------------
--   1. O ÚNICO chamador trata falha como NÃO-FATAL (index.ts:495-507 loga
--      console.warn e segue). Ou seja: levantar exceção NÃO derruba a criação
--      da cobrança — ela já existe na Asaas e em tenant_charges, e o link de
--      pagamento continua sendo devolvido ao usuário. O custo do erro aqui é
--      zero pro fluxo; o ganho é uma linha no log.
--   2. Quem chega aqui é anomalia (a tela já barrou): API direta, corrida,
--      reprocessamento. Anomalia silenciosa não vira investigação; anomalia
--      logada vira.
--   3. No-op "devolvendo o id do recebível do orçamento" seria MENTIRA de
--      contrato: aquela linha não tem tenant_charge_id, então quem recebesse o
--      id acreditaria existir um recebível vinculado à cobrança — e o webhook
--      (apply_tenant_charge_payment, passo (d)) baixa por tenant_charge_id, ou
--      seja nunca baixaria essa linha. Erro explícito > id enganoso.
--   4. A idempotência por tenant_charge_id continua ANTES da nova guarda: um
--      replay da MESMA cobrança segue devolvendo o id existente sem erro. A
--      exceção só acontece no caso novo (cobrança nova para orçamento que já
--      gerou financeiro).
--
-- O QUE ESTA MIGRATION NÃO FAZ (deliberado)
-- -----------------------------------------
--   · NÃO adota o recebível do orçamento carimbando tenant_charge_id nele pra
--     que o webhook baixe automático. Parece elegante e é armadilha: o
--     recebível do orçamento pode estar PARCELADO (respond_quote_public gera N
--     linhas) e o webhook marcaria TODAS como recebidas, com
--     amount_received = amount em cada uma, ao receber UMA cobrança. Isso é
--     dinheiro errado no banco — pior que a automação faltando.
--   · NÃO bloqueia DUAS cobranças para o mesmo orçamento. Cobrar um orçamento
--     em duas cobranças (entrada + saldo) é uso legítimo, e cada cobrança
--     merece o seu próprio recebível. A guarda é contra a DUPLA CONTAGEM da
--     aprovação, não contra o parcelamento comercial.
--   · NÃO carimba quotes.financial_generated_at pelo caminho da cobrança —
--     isso faria a 2ª cobrança legítima cair na própria guarda.
--
-- RECRIADA A PARTIR DA DEFINIÇÃO VIVA (pg_get_functiondef em 12/09/2026), não
-- do arquivo 20260822120000: a assinatura viva tem OITO parâmetros
-- (p_account_id e p_category entraram depois, e a migration antiga só tem
-- seis). Partir do arquivo antigo teria criado uma SOBRECARGA nova, deixado a
-- de 8 params intacta e a edge continuaria chamando a versão sem a trava.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_tenant_charge_receivable(
  p_company_id       uuid,
  p_tenant_charge_id uuid,
  p_customer_id      uuid,
  p_amount           numeric,
  p_due_date         date,
  p_description      text,
  p_account_id       uuid DEFAULT NULL::uuid,
  p_category         text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_existing_id      uuid;
  v_new_id           uuid;
  v_charge_company   uuid;
  v_source_type      text;
  v_source_id        uuid;
  v_quote_number     integer;
  v_quote_txn_id     uuid;
  v_quote_generated  timestamptz;
BEGIN
  -- Validações mínimas de entrada
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_company_id obrigatório';
  END IF;
  IF p_tenant_charge_id IS NULL THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_tenant_charge_id obrigatório';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_amount deve ser positivo (recebido: %)', p_amount;
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_description obrigatório';
  END IF;

  -- Guard de idempotência: retorna id existente sem inserir de novo.
  -- FICA ANTES DA GUARDA DE ORÇAMENTO DE PROPÓSITO: replay da mesma cobrança
  -- (reentrega de webhook, retry da edge) tem que ser no-op silencioso, não
  -- erro. A guarda nova só vale pra recebível que AINDA NÃO EXISTE.
  SELECT id INTO v_existing_id
  FROM public.financial_transactions
  WHERE tenant_charge_id = p_tenant_charge_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- ------------------------------------------------------------------
  -- GUARDA DE DUPLA CONTAGEM (a razão desta migration)
  -- ------------------------------------------------------------------
  -- A cobrança é lida do banco, NUNCA de parâmetro: source_type/source_id
  -- vindos de fora seriam controláveis por quem chama, e a trava viraria
  -- decorativa.
  SELECT tc.company_id, tc.source_type, tc.source_id
    INTO v_charge_company, v_source_type, v_source_id
    FROM public.tenant_charges tc
   WHERE tc.id = p_tenant_charge_id;

  IF FOUND THEN
    -- Posse: a cobrança TEM que ser da empresa informada. RLS não cobre
    -- SECURITY DEFINER, então o predicado é reaplicado à mão. Sem isto, um
    -- p_company_id trocado gravaria receita no financeiro de outro tenant.
    IF v_charge_company IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION '[create_tenant_charge_receivable] cobrança não pertence à empresa informada'
        USING ERRCODE = '42501';
    END IF;

    IF v_source_type = 'quote' AND v_source_id IS NOT NULL THEN
      SELECT q.quote_number, q.financial_transaction_id, q.financial_generated_at
        INTO v_quote_number, v_quote_txn_id, v_quote_generated
        FROM public.quotes q
       WHERE q.id = v_source_id
         AND q.company_id = p_company_id;

      -- Os DOIS carimbos, por OR: `financial_generated_at` é o que o fluxo
      -- público usa como guarda, `financial_transaction_id` é o elo que o
      -- fluxo interno grava. Exigir os dois deixaria passar um carimbo
      -- meio-feito (insert ok, update parcial).
      IF FOUND AND (v_quote_generated IS NOT NULL OR v_quote_txn_id IS NOT NULL) THEN
        RAISE EXCEPTION
          'O orçamento #% já lançou receita no Financeiro quando foi aprovado. A cobrança foi gerada normalmente, mas não criamos um segundo "a receber" para a mesma venda.',
          COALESCE(v_quote_number::text, '?')
          USING ERRCODE = '23001';
      END IF;
    END IF;
  END IF;
  -- Cobrança não encontrada (IF FOUND falso) segue o caminho antigo em vez de
  -- abortar: a edge grava tenant_charges ANTES de chamar, então não achar aqui
  -- só aconteceria em cenário anômalo — e nesse cenário recusar o recebível de
  -- uma cobrança legítima seria pior que não conseguir checar o orçamento.

  -- INSERT do recebível — predicado de posse (company_id) explícito no corpo
  -- pois RLS não cobre SECURITY DEFINER. account_id/category agora vêm dos
  -- params (config default da conta, resolvida pela edge). NULL = sem conta/
  -- categoria (mesmo comportamento anterior).
  INSERT INTO public.financial_transactions (
    company_id,
    transaction_type,
    amount,
    description,
    customer_id,
    due_date,
    tenant_charge_id,
    is_paid,
    transaction_date,
    account_id,
    category,
    created_by
  ) VALUES (
    p_company_id,
    'entrada',
    p_amount,
    p_description,
    p_customer_id,
    p_due_date,
    p_tenant_charge_id,
    false,
    now()::date,
    p_account_id,
    p_category,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;

COMMENT ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text) IS
  'Cria um "a receber" (financial_transactions, entrada, is_paid=false) vinculado a uma cobrança online do tenant (tenant_charge_id). Idempotente por tenant_charge_id. RECUSA (ERRCODE 23001) quando a cobrança tem source_type=quote e o orçamento de origem já gerou financeiro na aprovação (quotes.financial_generated_at / financial_transaction_id) — é a trava que impede a mesma venda virar receita duas vezes. Chamada pela edge tenant-asaas-create-charge (service_role), que trata o erro como não-fatal.';

-- ----------------------------------------------------------------------------
-- GRANTS — CREATE OR REPLACE preserva a ACL, mas reemitir é barato e cobre o
-- caso de a função nascer num banco novo (reset/clone), onde o DEFAULT
-- PRIVILEGE do schema public do Supabase concede EXECUTE nominalmente a anon e
-- authenticated. Grant nominal não é herdado de PUBLIC → REVOKE FROM PUBLIC
-- sozinho NÃO basta. Assinatura COMPLETA de tipos (8 params), REVOKE antes do
-- GRANT. Esta RPC é operação de SERVIDOR: só service_role.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text)
  TO service_role;

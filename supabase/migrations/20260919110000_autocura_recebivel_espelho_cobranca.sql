-- ============================================================================
-- Auto-cura do recebível espelho de cobrança (dinheiro que entra e não aparece)
-- ============================================================================
--
-- PROBLEMA (causa raiz, verificada em produção em 2026-09-17):
--
--   `tenant_charges` (espelho do gateway) e `financial_transactions` (ledger
--   interno) são ligadas só por `financial_transactions.tenant_charge_id`, com
--   FK `ON DELETE SET NULL`. Não existe nenhum acoplamento de ciclo de vida no
--   sentido inverso: apagar o recebível NÃO apaga nem invalida a cobrança.
--
--   Consequência: qualquer caminho que apague o recebível deixa a cobrança viva
--   (no Asaas E no nosso banco) e órfã de espelho. Quando o cliente paga:
--     - `apply_tenant_charge_payment` acha a cobrança, marca CONFIRMED, e o
--       UPDATE do recebível afeta 0 linhas. Retornava ok=true, 'paid'.
--     - `apply_tenant_charge_installment_payment` devolve 'receivable_not_found'
--       e não faz nada.
--   Nos dois casos o dinheiro entra e NÃO aparece no Financeiro.
--
--   Portas conhecidas que produzem a órfã (o reset é o gatilho descoberto, não
--   a única porta):
--     1. `reset_system_step('financial_movements')` apaga
--        `financial_transactions` da empresa e NUNCA toca `tenant_charges`
--        (confirmado: zero referência a tenant_charges na definição viva).
--     2. Exclusão do lançamento pela tela de Contas a Receber
--        (`useFinancial.deleteTransaction`) não tem guarda nenhuma para linha
--        com `tenant_charge_id`.
--     3. Qualquer DELETE administrativo em `financial_transactions`.
--
--   O caminho sancionado de exclusão (`delete_tenant_charge_local`) NÃO produz
--   órfã: ele apaga os dois lados e se RECUSA a apagar cobrança com status
--   CONFIRMED/RECEIVED/RECEIVED_IN_CASH/REFUNDED/CHARGEBACK. Essa recusa é a
--   regra já codificada do sistema: "cobrança com dinheiro em cima não some do
--   nosso banco". Por isso esta migration NÃO faz o reset apagar
--   `tenant_charges`: seria violar essa invariante em massa e em silêncio, e
--   deixaria cobrança viva no Asaas sem registro local nenhum (pior: perderíamos
--   value/customer/due_date, que são exatamente o que permite reconstruir).
--
-- DECISÃO: auto-cura na baixa.
--
--   O recebível é artefato DERIVADO, não original. Tudo que ele precisa
--   (empresa, cliente, valor, vencimento, descrição, data de criação) vive em
--   `tenant_charges`, que por sua vez espelha o gateway. Recriar é reconstruir
--   a partir da fonte, não ressuscitar intenção do usuário.
--
--   O risco de "ressuscitar dado apagado de propósito" é real, então ele foi
--   transformado em fato REGISTRADO em vez de argumento:
--     - `tenant_charges.post_to_finance` (coluna nova) grava, por cobrança, se
--       o usuário pediu lançamento no Financeiro. A edge `tenant-asaas-create-
--       charge` já calcula esse booleano (`input.post_to_finance ??
--       account.auto_post_to_finance !== false`) e hoje o joga fora.
--     - `tenant_payment_accounts.auto_post_to_finance` é reconferido no momento
--       da cura: tenant que desligou o lançamento automático NUNCA recebe linha
--       curada, mesmo em cobrança antiga.
--   Sem nenhum dos dois ligados, a cura não acontece e o motivo vai no retorno.
--
--   A cura só dispara em CONFIRMAÇÃO DE PAGAMENTO. Nunca em criação, nunca em
--   OVERDUE, nunca em estorno. O gatilho é "o dinheiro entrou de verdade", que
--   é exatamente o caso em que não registrar é mentir o número.
--
-- NUNCA SILENCIOSO:
--   - As RPCs passam a devolver `receivable_status` ('ok' | 'healed' |
--     'missing' | 'skipped_*' | 'heal_failed') junto do resultado.
--   - Quando o recebível continua ausente depois da tentativa, a própria função
--     emite `RAISE WARNING`, que cai no log do Postgres independentemente de
--     quem chamou (o webhook, a reconciliação, ou um operador). A reconciliação
--     hoje IGNORA o retorno das RPCs, então depender só do console da edge
--     deixaria esse caminho cego.
--
-- IDEMPOTÊNCIA (a Asaas reentrega evento):
--   - Índice único parcial novo: no máximo UM recebível-mãe por cobrança. A
--     garantia vira invariante de banco, não convenção de código.
--   - A checagem de existência da cura roda DEPOIS do `FOR UPDATE` que os dois
--     callers já tomam em `tenant_charges`, então entregas concorrentes da mesma
--     cobrança serializam nesse lock.
--   - A checagem não filtra por `is_paid`: mãe existente em QUALQUER estado
--     bloqueia a cura.
--   - `create_tenant_charge_receivable` teve a própria guarda de idempotência
--     corrigida (ver abaixo) e continua como segunda linha de defesa.
--   - A cura NUNCA cria linha de tarifa, então não há como duplicar despesa.
--
-- MULTI-TENANT: o recebível curado nasce com o `company_id` lido da PRÓPRIA
--   cobrança, nunca de parâmetro. `create_tenant_charge_receivable` já reaplica
--   o predicado de posse à mão (RLS não cobre SECURITY DEFINER).
--
-- Nenhuma função é dropada: todas as recriações usam CREATE OR REPLACE com
-- assinatura idêntica, então os GRANTs existentes permanecem. Os GRANT/REVOKE
-- no fim são reafirmação explícita, e um bloco de verificação aborta a migration
-- se o ACL de service_role tiver se perdido.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Intenção de lançamento no Financeiro, gravada por cobrança
-- ----------------------------------------------------------------------------
-- DEFAULT true e backfill implícito em true: para as cobranças que já existem,
-- "tinha recebível e sumiu" é a leitura correta (é literalmente o incidente).
ALTER TABLE public.tenant_charges
  ADD COLUMN IF NOT EXISTS post_to_finance boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenant_charges.post_to_finance IS
  'Se esta cobranca deve ter espelho em financial_transactions. Gravado na criacao pela edge tenant-asaas-create-charge (input.post_to_finance, senao tenant_payment_accounts.auto_post_to_finance). Lido pela auto-cura do recebivel para nao recriar lancamento que o usuario recusou.';


-- ----------------------------------------------------------------------------
-- 2) Invariante estrutural: no maximo UM recebivel-mae por cobranca
-- ----------------------------------------------------------------------------
-- Mae = entrada sem parent. As filhas "Recebimento parcial" (parcelamento)
-- tambem carregam tenant_charge_id e transaction_type='entrada', por isso o
-- predicado exige parent_transaction_id IS NULL. A linha de tarifa e 'saida'.
-- Verificado antes de escrever: zero violacao em producao.
CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_transactions_one_mother_per_charge
  ON public.financial_transactions (tenant_charge_id)
  WHERE tenant_charge_id IS NOT NULL
    AND transaction_type = 'entrada'
    AND parent_transaction_id IS NULL;


-- ----------------------------------------------------------------------------
-- 3) create_tenant_charge_receivable: guarda de idempotencia escopada
-- ----------------------------------------------------------------------------
-- Recriada a partir da DEFINICAO VIVA. Unica mudanca de comportamento: a guarda
-- de idempotencia deixa de ser "existe QUALQUER financial_transaction com este
-- tenant_charge_id" e passa a ser "existe o RECEBIVEL-MAE desta empresa".
--
-- Por que: a linha de TARIFA ('saida') tambem carrega tenant_charge_id. Com a
-- guarda antiga, uma cobranca que tivesse perdido o recebivel mas conservado a
-- tarifa faria a funcao devolver o id da TARIFA e nao criar nada, em silencio.
-- Com a auto-cura chamando esta funcao, isso viraria um buraco novo.
-- As filhas "Recebimento parcial" (entrada com parent) tambem ficam de fora
-- pelo mesmo motivo.
CREATE OR REPLACE FUNCTION public.create_tenant_charge_receivable(
  p_company_id uuid,
  p_tenant_charge_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_due_date date,
  p_description text,
  p_account_id uuid DEFAULT NULL::uuid,
  p_category text DEFAULT NULL::text,
  p_cost_center_id uuid DEFAULT NULL::uuid
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
  --
  -- ESCOPO (2026-09-19): só o RECEBÍVEL-MÃE desta empresa conta como "já
  -- existe". Antes era qualquer linha com este tenant_charge_id, o que incluía
  -- a linha de TARIFA ('saida') e as filhas de "Recebimento parcial" — e fazia
  -- a função devolver o id errado e não criar o recebível, em silêncio.
  SELECT id INTO v_existing_id
  FROM public.financial_transactions
  WHERE tenant_charge_id      = p_tenant_charge_id
    AND company_id            = p_company_id
    AND transaction_type      = 'entrada'
    AND parent_transaction_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Posse do centro de custo: FK real, RLS não cobre SECURITY DEFINER. Sem
  -- este check, um p_cost_center_id de outra empresa gravaria FK cross-tenant
  -- silenciosa. Erro explícito, capturado como NÃO-FATAL pelos dois
  -- chamadores (edge de criação e webhook de assinatura) — mesmo tratamento
  -- que a guarda de posse da cobrança logo abaixo.
  IF p_cost_center_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cost_centers cc
       WHERE cc.id = p_cost_center_id
         AND cc.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION '[create_tenant_charge_receivable] centro de custo não pertence à empresa informada'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ------------------------------------------------------------------
  -- GUARDA DE DUPLA CONTAGEM (não desta migration, preservada)
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
  -- pois RLS não cobre SECURITY DEFINER. account_id/category/cost_center_id
  -- vêm dos params (config default da conta ou escolha do usuário, resolvidos
  -- pelo chamador). NULL = sem conta/categoria/centro (mesmo comportamento
  -- anterior pra quem não usa nenhum dos três).
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
    cost_center_id,
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
    p_cost_center_id,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 4) rebuild_tenant_charge_receivable: a peca de cura, um lugar so
-- ----------------------------------------------------------------------------
-- Reconstroi o recebivel-mae de UMA cobranca a partir da propria cobranca.
-- NAO marca pago, NAO lanca tarifa, NAO toca tenant_charges. Quem chama decide
-- o resto. Nunca levanta excecao para o chamador: devolve o motivo no jsonb,
-- porque abortar a transacao aqui faria o webhook perder tambem a confirmacao
-- da cobranca e a Asaas reentregar para sempre.
--
-- Por que NAO recria a tarifa: `tenant_charges.net_value` em venda parcelada
-- guarda o liquido DA PARCELA, nao o da venda (medido: cobranca de R$ 550,00
-- com net_value R$ 53,32). Calcular `value - net_value` aqui refabricaria
-- exatamente a tarifa fantasma de 90% corrigida em 1.24.29.
CREATE OR REPLACE FUNCTION public.rebuild_tenant_charge_receivable(
  p_charge_id uuid,
  p_reason text DEFAULT 'baixa de cobrança'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_charge        public.tenant_charges%ROWTYPE;
  v_existing_id   uuid;
  v_new_id        uuid;
  v_auto_post     boolean;
  v_account_id    uuid;
  v_category      text;
  v_default_desc  text;
  v_tpa_found     boolean := false;
  v_customer_name text;
  v_description   text;
  v_note          text;
BEGIN
  IF p_charge_id IS NULL THEN
    RETURN jsonb_build_object('healed', false, 'status', 'charge_not_found');
  END IF;

  SELECT * INTO v_charge
    FROM public.tenant_charges
   WHERE id = p_charge_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('healed', false, 'status', 'charge_not_found');
  END IF;

  -- (1) Ja existe mae? Checagem sob o lock que o chamador ja tomou em
  --     tenant_charges. Nao filtra is_paid de proposito: mae em QUALQUER
  --     estado bloqueia a cura.
  SELECT id INTO v_existing_id
    FROM public.financial_transactions
   WHERE tenant_charge_id      = v_charge.id
     AND company_id            = v_charge.company_id
     AND transaction_type      = 'entrada'
     AND parent_transaction_id IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'healed', false,
      'status', 'already_exists',
      'receivable_id', v_existing_id
    );
  END IF;

  -- (2) Intencao gravada NA COBRANCA. Cobranca criada com "nao lancar no
  --     financeiro" nunca e curada.
  IF COALESCE(v_charge.post_to_finance, true) = false THEN
    RETURN jsonb_build_object('healed', false, 'status', 'skipped_charge_opt_out');
  END IF;

  -- (3) Config ATUAL do tenant. Quem desligou o lancamento automatico esta
  --     dizendo hoje "meu financeiro nao e aqui" — respeita, e diz que pulou.
  SELECT COALESCE(tpa.auto_post_to_finance, true),
         tpa.default_finance_account_id,
         NULLIF(btrim(tpa.default_income_category), ''),
         NULLIF(btrim(tpa.default_description), '')
    INTO v_auto_post, v_account_id, v_category, v_default_desc
    FROM public.tenant_payment_accounts tpa
   WHERE tpa.company_id = v_charge.company_id
   LIMIT 1;

  v_tpa_found := FOUND;

  IF v_tpa_found AND v_auto_post = false THEN
    RETURN jsonb_build_object('healed', false, 'status', 'skipped_tenant_opt_out');
  END IF;

  -- Conta default pode ter sido apagada (o proprio "Zerar Sistema" recria a
  -- lista de contas). FK invalida abortaria o INSERT, entao valida a posse.
  IF v_account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.financial_accounts fa
       WHERE fa.id = v_account_id
         AND fa.company_id = v_charge.company_id
    ) THEN
      v_account_id := NULL;
    END IF;
  END IF;

  -- (4) Descricao: mesma cascata da edge de criacao (descricao da cobranca,
  --     default da conta, "Cobranca de <cliente>"). create_tenant_charge_
  --     receivable EXIGE descricao nao vazia, e cobranca sem descricao existe
  --     de verdade em producao.
  SELECT c.name INTO v_customer_name
    FROM public.customers c
   WHERE c.id = v_charge.customer_id
     AND c.company_id = v_charge.company_id;

  v_description := COALESCE(
    NULLIF(btrim(v_charge.description), ''),
    v_default_desc,
    CASE WHEN v_customer_name IS NOT NULL
         THEN 'Cobrança de ' || v_customer_name
         ELSE NULL END,
    'Cobrança online ' || left(v_charge.id::text, 8)
  );

  -- (5) Reconstrucao propriamente dita.
  BEGIN
    v_new_id := public.create_tenant_charge_receivable(
      v_charge.company_id,
      v_charge.id,
      v_charge.customer_id,
      v_charge.value,
      COALESCE(v_charge.due_date, v_charge.created_at::date),
      left(v_description, 500),
      v_account_id,
      v_category,
      NULL   -- centro de custo original nao e reconstruivel; fica em branco
    );
  EXCEPTION
    WHEN SQLSTATE '23001' THEN
      -- Dupla contagem: o orcamento de origem ja lancou a receita. Nao criar
      -- aqui e o comportamento CORRETO, e precisa ser dito em voz alta.
      RETURN jsonb_build_object(
        'healed', false,
        'status', 'skipped_double_count',
        'detail', SQLERRM
      );
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'healed', false,
        'status', 'heal_failed',
        'detail', SQLERRM,
        'sqlstate', SQLSTATE
      );
  END;

  IF v_new_id IS NULL THEN
    RETURN jsonb_build_object('healed', false, 'status', 'heal_failed', 'detail', 'insert sem id');
  END IF;

  -- (6) Fidelidade + rastro. `create_tenant_charge_receivable` carimba
  --     transaction_date = hoje (correto na criacao da cobranca, errado numa
  --     reconstrucao meses depois: jogaria a receita para o mes errado no
  --     regime de competencia). A data de criacao da COBRANCA e exatamente a
  --     data que a linha original tinha.
  --
  --     A nota existe para a linha nao "aparecer do nada": trocar uma omissao
  --     silenciosa por um surgimento silencioso seria o mesmo pecado.
  v_note := format(
    'Lançamento recriado automaticamente em %s porque o pagamento foi confirmado no gateway e este a receber não existia mais (%s). Valor e vencimento vieram da cobrança online (referência %s).',
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    COALESCE(NULLIF(btrim(p_reason), ''), 'origem não informada'),
    COALESCE(v_charge.asaas_payment_id, 'sem identificador')
  );

  UPDATE public.financial_transactions
     SET transaction_date = v_charge.created_at::date,
         notes            = btrim(COALESCE(notes || E'\n', '') || v_note),
         updated_at       = now()
   WHERE id = v_new_id
     AND company_id = v_charge.company_id;

  RETURN jsonb_build_object(
    'healed', true,
    'status', 'healed',
    'receivable_id', v_new_id,
    'company_id', v_charge.company_id,
    'amount', v_charge.value
  );
END;
$fn$;

COMMENT ON FUNCTION public.rebuild_tenant_charge_receivable(uuid, text) IS
  'Reconstroi o recebivel-mae de uma cobranca a partir da propria tenant_charges. Uso interno das RPCs de baixa e da RPC de cura. Nunca marca pago, nunca lanca tarifa, nunca levanta excecao para o chamador.';


-- ----------------------------------------------------------------------------
-- 5) apply_tenant_charge_payment: cura antes de desistir
-- ----------------------------------------------------------------------------
-- Recriada a partir da DEFINICAO VIVA. Mudancas:
--   (i)  o caminho "ja pago" deixa de ser return-cedo cego: se o recebivel-mae
--        sumiu, cura e quita. Fora disso continua no-op (nao re-marca pago um
--        recebivel que o usuario reabriu a mao, e nao relanca tarifa).
--   (ii) o caminho normal cura antes do UPDATE de baixa.
--   (iii) retorno ganha `receivable_status`; ausencia persistente vira
--        RAISE WARNING no log do Postgres (a reconciliacao ignora o retorno).
-- Assinatura identica: CREATE OR REPLACE preserva os GRANTs.
CREATE OR REPLACE FUNCTION public.apply_tenant_charge_payment(
  p_asaas_payment_id text,
  p_paid_at timestamp with time zone DEFAULT now(),
  p_net numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_charge        public.tenant_charges%ROWTYPE;
  v_receivables   int     := 0;
  v_auto_fees     boolean := false;
  v_fee_category  text    := 'Tarifas e Taxas';
  v_fee           numeric;
  v_fee_exists    boolean := false;
  v_fee_posted    boolean := false;
  v_mother_id     uuid;
  v_heal          jsonb   := NULL;
  v_recv_status   text;
BEGIN
  IF p_asaas_payment_id IS NULL OR length(trim(p_asaas_payment_id)) = 0 THEN
    RAISE EXCEPTION '[apply_tenant_charge_payment] asaas_payment_id obrigatório';
  END IF;

  -- (a) acha a cobrança; lock pra serializar reentregas concorrentes do webhook
  SELECT * INTO v_charge
  FROM public.tenant_charges
  WHERE asaas_payment_id = p_asaas_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'charge_not_found',
      'asaas_payment_id', p_asaas_payment_id
    );
  END IF;

  -- (b) idempotência: já pago.
  --     ANTES: return-cedo puro. Isso era exatamente o que impedia a
  --     recuperação do buraco — cobrança já marcada CONFIRMED cujo recebível
  --     foi apagado depois NUNCA mais era olhada por ninguém.
  --     AGORA: continua no-op para tudo, MENOS para o recebível ausente.
  IF v_charge.payment_date IS NOT NULL THEN
    SELECT id INTO v_mother_id
      FROM public.financial_transactions
     WHERE tenant_charge_id      = v_charge.id
       AND company_id            = v_charge.company_id
       AND transaction_type      = 'entrada'
       AND parent_transaction_id IS NULL
     LIMIT 1;

    IF v_mother_id IS NULL THEN
      v_heal := public.rebuild_tenant_charge_receivable(
        v_charge.id,
        'reentrega de pagamento já confirmado'
      );

      IF COALESCE((v_heal->>'healed')::boolean, false) THEN
        v_mother_id := (v_heal->>'receivable_id')::uuid;
        -- Quita SÓ a linha recém-criada. Escopo mínimo de propósito: não
        -- mexe em recebível preexistente que alguém tenha reaberto à mão.
        UPDATE public.financial_transactions
           SET is_paid    = true,
               paid_date  = p_paid_at::date,
               updated_at = now()
         WHERE id         = v_mother_id
           AND company_id = v_charge.company_id;
        v_receivables := 1;
      END IF;
    END IF;

    v_recv_status := CASE
      WHEN v_mother_id IS NOT NULL AND v_heal IS NOT NULL THEN 'healed'
      WHEN v_mother_id IS NOT NULL                        THEN 'ok'
      ELSE COALESCE(v_heal->>'status', 'missing')
    END;

    IF v_mother_id IS NULL THEN
      RAISE WARNING '[apply_tenant_charge_payment] cobrança % (empresa %) está paga e SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
        v_charge.id, v_charge.company_id, v_recv_status;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_paid',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'fee_posted', null,
      'receivables_settled', v_receivables,
      'receivable_status', v_recv_status,
      'heal', v_heal
    );
  END IF;

  -- (c) marca a cobrança como confirmada
  UPDATE public.tenant_charges
  SET status       = 'CONFIRMED',
      payment_date = p_paid_at,
      net_value    = COALESCE(p_net, net_value),
      updated_at   = now()
  WHERE id = v_charge.id;

  -- (c2) AUTO-CURA. Roda depois do FOR UPDATE de (a), então entregas
  --      concorrentes da mesma cobrança serializam aqui e só uma cria.
  SELECT id INTO v_mother_id
    FROM public.financial_transactions
   WHERE tenant_charge_id      = v_charge.id
     AND company_id            = v_charge.company_id
     AND transaction_type      = 'entrada'
     AND parent_transaction_id IS NULL
   LIMIT 1;

  IF v_mother_id IS NULL THEN
    v_heal := public.rebuild_tenant_charge_receivable(
      v_charge.id,
      'baixa automática de cobrança online'
    );
    IF COALESCE((v_heal->>'healed')::boolean, false) THEN
      v_mother_id := (v_heal->>'receivable_id')::uuid;
    END IF;
  END IF;

  -- (d) baixa no recebível vinculado — predicado de posse reaplicado
  --     (company_id da row TEM que bater com a company da cobrança).
  --     Só baixa o que ainda está pendente (is_paid distinto de true),
  --     tornando a operação idempotente também do lado do recebível.
  --     NÃO grava `amount_received`: esta é uma quitação TOTAL, de uma
  --     vez só, sem filha de "Recebimento parcial" — mesmo contrato do
  --     fluxo legado de baixa manual (useFinancial.ts). Gravar
  --     `amount_received = amount` aqui, sem criar a filha que o
  --     contrato da coluna exige, foi a causa do incidente Aldebaran
  --     (cobrança paga sumindo do DRE em Regime de Caixa).
  UPDATE public.financial_transactions ft
  SET is_paid         = true,
      paid_date       = p_paid_at::date,
      updated_at      = now()
  WHERE ft.tenant_charge_id = v_charge.id
    AND ft.company_id       = v_charge.company_id
    AND ft.transaction_type = 'entrada'
    AND ft.is_paid IS DISTINCT FROM true;

  GET DIAGNOSTICS v_receivables = ROW_COUNT;

  v_recv_status := CASE
    WHEN v_mother_id IS NOT NULL AND v_heal IS NOT NULL THEN 'healed'
    WHEN v_mother_id IS NOT NULL                        THEN 'ok'
    ELSE COALESCE(v_heal->>'status', 'missing')
  END;

  IF v_mother_id IS NULL THEN
    RAISE WARNING '[apply_tenant_charge_payment] baixa aplicada na cobrança % (empresa %) SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
      v_charge.id, v_charge.company_id, v_recv_status;
  END IF;

  -- [TARIFA] (e) ler config auto_post_fees + categoria da despesa da tarifa
  SELECT COALESCE(tpa.auto_post_fees, true),
         COALESCE(NULLIF(trim(tpa.default_fee_category), ''), 'Tarifas e Taxas')
    INTO v_auto_fees, v_fee_category
  FROM public.tenant_payment_accounts tpa
  WHERE tpa.company_id = v_charge.company_id
  LIMIT 1;

  -- Se não achou conta de pagamento, mantém os defaults das variáveis
  -- (v_auto_fees=false, v_fee_category='Tarifas e Taxas').
  IF NOT FOUND THEN
    v_auto_fees := false;
    v_fee_category := 'Tarifas e Taxas';
  END IF;

  -- [TARIFA] (f) lançar tarifa como despesa se configurado e houver diferença
  IF v_auto_fees
     AND p_net IS NOT NULL
     AND p_net < v_charge.value
  THEN
    v_fee := v_charge.value - p_net;

    -- Idempotência: se já existe despesa vinculada a esta cobrança, pula
    SELECT EXISTS (
      SELECT 1
      FROM public.financial_transactions
      WHERE tenant_charge_id  = v_charge.id
        AND company_id        = v_charge.company_id
        AND transaction_type  = 'saida'
    ) INTO v_fee_exists;

    IF NOT v_fee_exists THEN
      INSERT INTO public.financial_transactions (
        company_id,
        transaction_type,
        amount,
        description,
        category,
        is_paid,
        paid_date,
        transaction_date,
        tenant_charge_id,
        account_id,
        customer_id,
        created_by
      ) VALUES (
        v_charge.company_id,
        'saida',
        v_fee,
        'Tarifa de recebimento (Asaas) — cobrança #' || v_charge.id::text,
        v_fee_category,
        true,
        p_paid_at::date,
        p_paid_at::date,
        v_charge.id,
        NULL,   -- account_id: NULL (mesmo padrão do recebível de entrada)
        NULL,   -- customer_id: tarifa é custo da plataforma, não do cliente
        NULL    -- created_by: NULL (ação automática de sistema)
      );
      v_fee_posted := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'paid',
    'charge_id', v_charge.id,
    'company_id', v_charge.company_id,
    'receivables_settled', v_receivables,
    'fee_posted', v_fee_posted,
    'receivable_status', v_recv_status,
    'heal', v_heal
  );
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 6) apply_tenant_charge_installment_payment: cura antes de desistir
-- ----------------------------------------------------------------------------
-- Recriada a partir da DEFINICAO VIVA. Unica mudanca: no ponto (b), quando a
-- mae nao existe, tenta curar e so devolve 'receivable_not_found' se a cura nao
-- resolver — agora com o motivo dentro do retorno e um RAISE WARNING no log.
-- Este e o caminho que devolveu `receivable_not_found` nos 20 eventos reais da
-- Glacial no dry-run.
-- Assinatura identica: CREATE OR REPLACE preserva os GRANTs.
CREATE OR REPLACE FUNCTION public.apply_tenant_charge_installment_payment(
  p_asaas_payment_id text,
  p_asaas_installment_id text,
  p_value numeric,
  p_net_value numeric DEFAULT NULL::numeric,
  p_paid_at timestamp with time zone DEFAULT now(),
  p_installment_number integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_charge          public.tenant_charges%ROWTYPE;
  v_parent          public.financial_transactions%ROWTYPE;
  v_child_id        uuid;
  v_fee             numeric;
  v_fee_exists      boolean := false;
  v_fee_posted      boolean := false;
  v_auto_fees       boolean := false;
  v_fee_category    text    := 'Tarifas e Taxas';
  v_is_paid         boolean := false;
  v_amount_received numeric;
  v_installment_tag text;
  v_heal            jsonb   := NULL;
BEGIN
  IF p_asaas_payment_id IS NULL OR length(trim(p_asaas_payment_id)) = 0 THEN
    RAISE EXCEPTION '[apply_tenant_charge_installment_payment] asaas_payment_id obrigatório';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION '[apply_tenant_charge_installment_payment] p_value deve ser positivo (recebido: %)', p_value;
  END IF;

  v_installment_tag := CASE WHEN p_installment_number IS NOT NULL
                             THEN ' (parcela ' || p_installment_number::text || ')'
                             ELSE '' END;

  -- (a) acha a cobrança; lock serializa reentregas/parcelas concorrentes do
  --     MESMO grupo (ver nota de concorrência real no cabeçalho).
  SELECT * INTO v_charge
  FROM public.tenant_charges
  WHERE asaas_payment_id = p_asaas_payment_id
     OR (p_asaas_installment_id IS NOT NULL AND asaas_installment_id = p_asaas_installment_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'charge_not_found',
      'asaas_payment_id', p_asaas_payment_id,
      'asaas_installment_id', p_asaas_installment_id
    );
  END IF;

  -- Backfill do vínculo: garante que a PRÓXIMA parcela (payment.id diferente
  -- desta) já ache esta charge por asaas_installment_id, mesmo que esta
  -- venda nunca tenha passado por tenant-asaas-create-charge com a coluna
  -- nova (venda anterior a esta migration).
  IF p_asaas_installment_id IS NOT NULL
     AND v_charge.asaas_installment_id IS DISTINCT FROM p_asaas_installment_id THEN
    UPDATE public.tenant_charges
    SET asaas_installment_id = p_asaas_installment_id,
        updated_at = now()
    WHERE id = v_charge.id;
  END IF;

  -- (b) acha o recebível MÃE (linha cheia — nunca fatiada, decisão 1.24.18).
  SELECT * INTO v_parent
  FROM public.financial_transactions
  WHERE tenant_charge_id      = v_charge.id
    AND company_id            = v_charge.company_id
    AND transaction_type      = 'entrada'
    AND parent_transaction_id IS NULL
  LIMIT 1;

  -- (b2) AUTO-CURA. Sem a mãe, cada parcela confirmada era dinheiro entrando e
  --      sumindo. A cura roda depois do FOR UPDATE de (a), então as parcelas do
  --      mesmo grupo serializam e só a primeira a chegar cria a mãe.
  IF NOT FOUND THEN
    v_heal := public.rebuild_tenant_charge_receivable(
      v_charge.id,
      'baixa de parcela de venda parcelada'
    );

    IF COALESCE((v_heal->>'healed')::boolean, false) THEN
      SELECT * INTO v_parent
      FROM public.financial_transactions
      WHERE id = (v_heal->>'receivable_id')::uuid;
    END IF;

    IF NOT FOUND OR v_parent.id IS NULL THEN
      RAISE WARNING '[apply_tenant_charge_installment_payment] parcela % da cobrança % (empresa %) confirmada SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
        COALESCE(p_installment_number::text, '?'), v_charge.id, v_charge.company_id,
        COALESCE(v_heal->>'status', 'missing');

      RETURN jsonb_build_object(
        'ok', false,
        'result', 'receivable_not_found',
        'charge_id', v_charge.id,
        'company_id', v_charge.company_id,
        'receivable_status', COALESCE(v_heal->>'status', 'missing'),
        'heal', v_heal
      );
    END IF;
  END IF;

  -- (c) idempotência POR PARCELA: UNIQUE parcial em asaas_payment_id.
  --     Reentrega do MESMO evento cai no ON CONFLICT DO NOTHING — nunca
  --     duplica filha, mesmo se o dedupe de evento (event_id) falhar.
  INSERT INTO public.financial_transactions (
    company_id, transaction_type, amount, description, category,
    customer_id, cost_center_id, transaction_date, due_date, paid_date,
    is_paid, parent_transaction_id, tenant_charge_id, asaas_payment_id,
    created_by
  ) VALUES (
    v_charge.company_id,
    'entrada',
    p_value,
    'Recebimento parcial' || v_installment_tag || ' — '
      || COALESCE(v_parent.description, 'cobrança #' || v_charge.id::text),
    'Recebimento parcial',
    v_parent.customer_id,
    v_parent.cost_center_id,
    p_paid_at::date,
    v_parent.due_date,
    p_paid_at::date,
    true,
    v_parent.id,
    v_charge.id,
    p_asaas_payment_id,
    NULL
  )
  ON CONFLICT (asaas_payment_id) WHERE (asaas_payment_id IS NOT NULL) DO NOTHING
  RETURNING id INTO v_child_id;

  IF v_child_id IS NULL THEN
    -- Esta PARCELA já foi processada antes (reentrega) — no-op idempotente.
    -- Não mexe em tenant_charges nem tenta lançar tarifa de novo.
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_applied',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'asaas_payment_id', p_asaas_payment_id,
      'receivable_status', CASE WHEN v_heal IS NULL THEN 'ok' ELSE 'healed' END,
      'heal', v_heal
    );
  END IF;

  -- (d) [TARIFA] neta = value - netValue DESTA parcela (nunca do total da
  --     venda — era exatamente esse o bug fabricando 90% de tarifa fantasma
  --     em 1.24.29). Mesmo padrão de buildReceiptFeeRow (useFinancial.ts) e
  --     mesmo gate de config (auto_post_fees) do irmão apply_tenant_charge_
  --     payment, para o tenant que desligou tarifa automática não ver
  --     comportamento diferente entre baixa total e baixa parcelada.
  SELECT COALESCE(tpa.auto_post_fees, true),
         COALESCE(NULLIF(trim(tpa.default_fee_category), ''), 'Tarifas e Taxas')
    INTO v_auto_fees, v_fee_category
  FROM public.tenant_payment_accounts tpa
  WHERE tpa.company_id = v_charge.company_id
  LIMIT 1;

  IF NOT FOUND THEN
    v_auto_fees := false;
    v_fee_category := 'Tarifas e Taxas';
  END IF;

  IF v_auto_fees AND p_net_value IS NOT NULL AND p_net_value < p_value THEN
    v_fee := p_value - p_net_value;

    -- Idempotência da neta: amarrada ao ID da filha desta parcela (não ao
    -- tenant_charge_id, que é compartilhado por TODAS as parcelas — usar
    -- tenant_charge_id aqui faria a 2ª parcela em diante nunca lançar tarifa
    -- por achar que "já existe despesa vinculada a esta cobrança").
    SELECT EXISTS (
      SELECT 1 FROM public.financial_transactions
      WHERE parent_transaction_id = v_child_id
        AND company_id            = v_charge.company_id
        AND transaction_type      = 'saida'
    ) INTO v_fee_exists;

    IF NOT v_fee_exists THEN
      INSERT INTO public.financial_transactions (
        company_id, transaction_type, amount, description, category,
        cost_center_id, is_paid, paid_date, transaction_date,
        tenant_charge_id, parent_transaction_id, account_id, customer_id,
        created_by
      ) VALUES (
        v_charge.company_id,
        'saida',
        v_fee,
        'Tarifa de recebimento (Asaas) — cobrança #' || v_charge.id::text || v_installment_tag,
        v_fee_category,
        v_parent.cost_center_id,
        true,
        p_paid_at::date,
        p_paid_at::date,
        v_charge.id,
        v_child_id,   -- neta da FILHA desta parcela, não da mãe
        NULL,
        NULL,         -- tarifa é custo da plataforma, não do cliente
        NULL
      );
      v_fee_posted := true;
    END IF;
  END IF;

  -- (e) o trigger trg_recalc_amount_received já rodou (AFTER INSERT na
  --     filha, síncrono) e atualizou amount_received/is_paid na MÃE. Lê o
  --     resultado para decidir se a VENDA INTEIRA está quitada — só então a
  --     cobrança vira CONFIRMED. Deixa o trigger trabalhar; esta função não
  --     recalcula nada por conta própria.
  SELECT is_paid, amount_received INTO v_is_paid, v_amount_received
  FROM public.financial_transactions
  WHERE id = v_parent.id;

  IF v_is_paid THEN
    UPDATE public.tenant_charges
    SET status       = 'CONFIRMED',
        payment_date = p_paid_at,
        updated_at   = now()
    WHERE id = v_charge.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'paid',
    'charge_id', v_charge.id,
    'company_id', v_charge.company_id,
    'child_id', v_child_id,
    'fee_posted', v_fee_posted,
    'amount_received', v_amount_received,
    'receivable_fully_paid', v_is_paid,
    'receivable_status', CASE WHEN v_heal IS NULL THEN 'ok' ELSE 'healed' END,
    'heal', v_heal
  );
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 7) Censo de cobrancas orfas de espelho (SO LEITURA)
-- ----------------------------------------------------------------------------
-- Existe para (i) dar numero honesto ao aviso do "Zerar Sistema" e (ii) permitir
-- auditoria sem SQL avulso. Mesma guarda de permissao do reset_system_step.
CREATE OR REPLACE FUNCTION public.tenant_charges_without_receivable(
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não informada.' USING ERRCODE = '22023';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para consultar cobranças da empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_user_id, 'super_admin'::public.app_role) THEN
    IF NOT (
      public.has_role(v_user_id, 'admin'::public.app_role)
      AND p_company_id = public.get_user_company_id(v_user_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para consultar cobranças da empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT jsonb_build_object(
           'company_id', p_company_id,
           'open_count',  COALESCE(count(*) FILTER (WHERE bucket = 'open'), 0),
           'open_value',  COALESCE(sum(value) FILTER (WHERE bucket = 'open'), 0),
           'paid_count',  COALESCE(count(*) FILTER (WHERE bucket = 'paid'), 0),
           'paid_value',  COALESCE(sum(value) FILTER (WHERE bucket = 'paid'), 0),
           'other_count', COALESCE(count(*) FILTER (WHERE bucket = 'other'), 0),
           'total_count', COALESCE(count(*), 0),
           'charges',     COALESCE(jsonb_agg(
                            jsonb_build_object(
                              'id', id,
                              'status', status,
                              'bucket', bucket,
                              'value', value,
                              'due_date', due_date,
                              'description', description,
                              'asaas_payment_id', asaas_payment_id
                            ) ORDER BY due_date DESC NULLS LAST
                          ), '[]'::jsonb)
         )
    INTO v_result
    FROM (
      SELECT tc.id, tc.status, tc.value, tc.due_date, tc.description, tc.asaas_payment_id,
             CASE
               WHEN upper(COALESCE(tc.status, '')) IN ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH') THEN 'paid'
               WHEN upper(COALESCE(tc.status, '')) IN ('PENDING','PENDING_CREATION','AWAITING_RISK_ANALYSIS','AWAITING_PAYMENT','OVERDUE') THEN 'open'
               ELSE 'other'
             END AS bucket
        FROM public.tenant_charges tc
       WHERE tc.company_id = p_company_id
         AND NOT EXISTS (
           SELECT 1
             FROM public.financial_transactions ft
            WHERE ft.tenant_charge_id      = tc.id
              AND ft.company_id            = tc.company_id
              AND ft.transaction_type      = 'entrada'
              AND ft.parent_transaction_id IS NULL
         )
    ) s;

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.tenant_charges_without_receivable(uuid) IS
  'Somente leitura. Conta e lista as cobrancas online da empresa que estao sem recebivel espelho no Financeiro, separadas em abertas / pagas / outras. Usada pelo aviso do Zerar Sistema e por auditoria.';


-- ----------------------------------------------------------------------------
-- 8) Cura deliberada do passivo existente (dry-run por padrao)
-- ----------------------------------------------------------------------------
-- A auto-cura das RPCs de baixa so protege pagamentos FUTUROS: cobranca ja
-- marcada paga localmente nao volta a passar por webhook nem entra no recorte
-- da reconciliacao (`tenant-asaas-reconcile` so olha status PENDING/OVERDUE).
-- Entao o passivo ja existente precisa de um ato explicito, e ele fica aqui:
-- auditavel, com a mesma guarda de permissao do reset, e em DRY-RUN por padrao.
--
-- Cura apenas cobrancas PAGAS (dinheiro comprovadamente entrou). Cobranca ainda
-- em aberto sera curada sozinha quando o pagamento confirmar, entao nao ha
-- motivo para materializar previsao que o usuario pode ter apagado de proposito.
--
-- NAO reconstroi tarifa nem parcelas: ver a nota em
-- rebuild_tenant_charge_receivable. `fees_not_restored` sinaliza o que ficou
-- faltando, para ninguem achar que o trabalho terminou.
CREATE OR REPLACE FUNCTION public.heal_orphan_tenant_charge_receivables(
  p_company_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user_id  uuid := auth.uid();
  v_charge   record;
  v_heal     jsonb;
  v_items    jsonb := '[]'::jsonb;
  v_healed   int   := 0;
  v_skipped  int   := 0;
  v_fees_gap int   := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não informada.' USING ERRCODE = '22023';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para recriar lançamentos da empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(v_user_id, 'super_admin'::public.app_role) THEN
    IF NOT (
      public.has_role(v_user_id, 'admin'::public.app_role)
      AND p_company_id = public.get_user_company_id(v_user_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissão para recriar lançamentos da empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_charge IN
    SELECT tc.id, tc.value, tc.net_value, tc.payment_date, tc.status, tc.description
      FROM public.tenant_charges tc
     WHERE tc.company_id = p_company_id
       AND upper(COALESCE(tc.status, '')) IN ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')
       AND NOT EXISTS (
         SELECT 1
           FROM public.financial_transactions ft
          WHERE ft.tenant_charge_id      = tc.id
            AND ft.company_id            = tc.company_id
            AND ft.transaction_type      = 'entrada'
            AND ft.parent_transaction_id IS NULL
       )
     ORDER BY tc.created_at
     FOR UPDATE OF tc
  LOOP
    IF COALESCE(v_charge.net_value, v_charge.value) < v_charge.value THEN
      v_fees_gap := v_fees_gap + 1;
    END IF;

    IF p_dry_run THEN
      v_items := v_items || jsonb_build_object(
        'charge_id', v_charge.id,
        'status', v_charge.status,
        'value', v_charge.value,
        'action', 'would_heal'
      );
      CONTINUE;
    END IF;

    v_heal := public.rebuild_tenant_charge_receivable(
      v_charge.id,
      'recuperação manual de cobranças sem lançamento'
    );

    IF COALESCE((v_heal->>'healed')::boolean, false) THEN
      -- A cobrança está paga: o recebível recriado nasce quitado, na data em
      -- que o pagamento foi registrado. `amount_received` fica em 0, que é o
      -- contrato da coluna para mãe sem filha de recebimento parcial.
      UPDATE public.financial_transactions
         SET is_paid    = true,
             paid_date  = COALESCE(v_charge.payment_date::date, CURRENT_DATE),
             updated_at = now()
       WHERE id         = (v_heal->>'receivable_id')::uuid
         AND company_id = p_company_id;
      v_healed := v_healed + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;

    v_items := v_items || jsonb_build_object(
      'charge_id', v_charge.id,
      'status', v_charge.status,
      'value', v_charge.value,
      'result', v_heal
    );
  END LOOP;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'dry_run', p_dry_run,
    'healed', v_healed,
    'skipped', v_skipped,
    'fees_not_restored', v_fees_gap,
    'items', v_items
  );
END;
$fn$;

COMMENT ON FUNCTION public.heal_orphan_tenant_charge_receivables(uuid, boolean) IS
  'Recria o recebivel espelho das cobrancas JA PAGAS que ficaram sem lancamento no Financeiro. Dry-run por padrao. Nao reconstroi tarifa nem parcelas (ver fees_not_restored).';


-- ----------------------------------------------------------------------------
-- 9) GRANTs (reafirmacao explicita) + verificacao
-- ----------------------------------------------------------------------------
-- Nenhuma funcao foi dropada, entao os GRANTs antigos sobreviveram ao
-- CREATE OR REPLACE. Ainda assim os privilegios sao reafirmados: esquecer o
-- grant de service_role aqui pararia a baixa automatica de cobranca em silencio.
-- As funcoes NOVAS precisam de REVOKE explicito porque o ACL default do
-- Postgres concede EXECUTE a PUBLIC.

REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid,uuid,uuid,numeric,date,text,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(uuid,uuid,uuid,numeric,date,text,uuid,text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text,timestamp with time zone,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_payment(text,timestamp with time zone,numeric) TO service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_charge_installment_payment(text,text,numeric,numeric,timestamp with time zone,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_installment_payment(text,text,numeric,numeric,timestamp with time zone,integer) TO service_role;

REVOKE ALL ON FUNCTION public.rebuild_tenant_charge_receivable(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_tenant_charge_receivable(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.tenant_charges_without_receivable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_charges_without_receivable(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.heal_orphan_tenant_charge_receivables(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heal_orphan_tenant_charge_receivables(uuid,boolean) TO authenticated, service_role;

DO $verify$
DECLARE
  v_missing text := '';
BEGIN
  IF NOT has_function_privilege('service_role',
      'public.apply_tenant_charge_payment(text,timestamp with time zone,numeric)', 'EXECUTE') THEN
    v_missing := v_missing || ' apply_tenant_charge_payment';
  END IF;
  IF NOT has_function_privilege('service_role',
      'public.apply_tenant_charge_installment_payment(text,text,numeric,numeric,timestamp with time zone,integer)', 'EXECUTE') THEN
    v_missing := v_missing || ' apply_tenant_charge_installment_payment';
  END IF;
  IF NOT has_function_privilege('service_role',
      'public.create_tenant_charge_receivable(uuid,uuid,uuid,numeric,date,text,uuid,text,uuid)', 'EXECUTE') THEN
    v_missing := v_missing || ' create_tenant_charge_receivable';
  END IF;
  IF NOT has_function_privilege('service_role',
      'public.rebuild_tenant_charge_receivable(uuid,text)', 'EXECUTE') THEN
    v_missing := v_missing || ' rebuild_tenant_charge_receivable';
  END IF;

  IF length(v_missing) > 0 THEN
    RAISE EXCEPTION 'GRANT EXECUTE de service_role ausente em:%. O webhook do Asaas pararia de dar baixa em silêncio.', v_missing;
  END IF;

  -- anon nunca pode executar nada disto.
  IF has_function_privilege('anon',
      'public.heal_orphan_tenant_charge_receivables(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar heal_orphan_tenant_charge_receivables.';
  END IF;

  RAISE NOTICE 'ACL verificado: service_role com EXECUTE nas 4 RPCs de baixa/cura; anon sem acesso.';
END
$verify$;

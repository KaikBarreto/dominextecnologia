-- ============================================================================
-- Pagamento em lote: (1) a trava de folha sai da tela e vai pro SERVIDOR,
--                    (2) contas a RECEBER passam a entrar no lote
-- ============================================================================
--
-- Continua `20260924180000_pagamento_em_lote_contas_a_pagar.sql`. O carimbo
-- (`payment_group_id`), o indice parcial, o gatilho `normalize_payment_group_id`
-- e a RPC `undo_payment_group` NAO mudam — foram desenhados desde o inicio pra
-- servir aos dois lados, e servem. O unico corpo reescrito e o da
-- `pay_transactions_batch`.
--
--
-- (1) POR QUE A TRAVA DE FOLHA PRECISA ESTAR AQUI
--
-- `src/lib/finance-batch-payment.ts` ja recusa salario e rescisao no lote, mas
-- recusava SO NA TELA: a RPC aceitava os dois de bracos abertos. Isso viola o
-- principio do projeto ("a tela e UX, a guarda e o servidor") e o efeito nao e
-- teorico. Quitar salario no Dominex NUNCA e um UPDATE simples: passa por
-- `pay_payroll_transaction`, que
--     a) reescreve `amount` com o LIQUIDO (bruto - vales adiantados),
--     b) grava o bruto em `accrual_amount` (regime de Competencia), e
--     c) insere dois `employee_movements` (o pagamento e o reset do ciclo).
-- Entrando pelo lote, nada disso acontece: o funcionario recebe o valor CHEIO
-- depois de ja ter recebido o vale, o extrato dele no RH nao registra o
-- pagamento, e o ciclo nao zera. Erro de dinheiro, em silencio, sem nenhuma
-- linha vermelha na tela.
--
-- CRITERIO: exatamente o mesmo da tela — `payroll_kind IN ('salary',
-- 'rescission')`. Nao vale "amarrar em `employee_id IS NOT NULL`" ou em
-- `payroll_kind IS NOT NULL` (que seria o criterio da `pay_payroll_transaction`):
-- um criterio mais largo aqui do que la em cima faria a tela oferecer o
-- checkbox e o servidor recusar o lote inteiro no clique, que e a pior UX
-- possivel. Se um dia a regra mudar, muda NOS DOIS.
--   Nota de escopo: `payroll_kind = 'bonus'` existe na union de tipos do front
--   (`src/types/database.ts`) mas nenhum codigo o grava e nao ha uma linha
--   sequer em producao. Fica DE FORA desta trava de proposito, pra nao divergir
--   da tela. Se o bonus virar fluxo real, ele entra aqui E la no mesmo commit.
--
--
-- (2) CONTAS A RECEBER — o que muda e o que NAO muda
--
-- Recebimento em lote e a imagem espelhada do pagamento em lote: N titulos
-- baixados juntos viram UMA entrada no extrato. Mesma mecanica, mesmo carimbo,
-- mesmo "nenhuma linha nova nasce" — e por isso mesmo o saldo tambem nao pode
-- dobrar do lado da receita.
--
-- Tres cortes especificos do lado do recebimento:
--
--   a) BAIXA PARCIAL CONTINUA FORA. Recebimento parcial no Dominex NAO e um
--      update: `buildPartialReceiptRow` (src/hooks/useFinancial.ts) INSERE uma
--      linha filha `entrada` com `category = 'Recebimento parcial'`, e o gatilho
--      `trg_recalc_amount_received` recalcula a mae a partir das filhas. Um lote
--      que fizesse isso deixaria de ser um carimbo e viraria um criador de
--      linhas — exatamente o desenho que recusamos no EcoSistema por dobrar
--      saldo. Entao o lote so faz quitacao TOTAL, dos dois lados, e uma conta
--      que ja tem filha de parcial e recusada. O teste e pela EXISTENCIA DA
--      FILHA (fato estrutural), nunca por `amount_received > 0` — ha RPC que
--      grava `amount_received = amount` numa quitacao total sem filha nenhuma.
--      Mesma decisao ja tomada pras contas a pagar; coerente, e a mais segura.
--
--   b) TARIFA DE RECEBIMENTO NAO EXISTE NO LOTE. `buildReceiptFeeRow` tambem
--      nasce como linha filha (`saida`, na categoria do papel `receipt_fee`), e
--      so nasce quando ha tarifa informada. O lote nao pergunta tarifa e nao
--      cria filha nenhuma: quem recebe em lote recebe o valor CHEIO do titulo.
--      Isso e uma decisao, nao um esquecimento — recebimento com tarifa (o
--      caso da maquininha) continua sendo feito um a um, onde o usuario informa
--      a tarifa. Consequencia visivel: no detalhamento bruto/tarifa/liquido
--      (`buildReceiptBreakdowns`) um titulo recebido em lote aparece com tarifa
--      zero e liquido = bruto, que e a verdade do que aconteceu.
--
--   c) COBRANCA DE GATEWAY NAO SE BAIXA POR DENTRO. Um titulo com
--      `tenant_charge_id` (ou `asaas_payment_id`) e o ESPELHO local de uma
--      cobranca no Asaas; quem o quita e `apply_tenant_charge_payment`, no
--      retorno do webhook, com o valor LIQUIDO e a tarifa do gateway. Baixar
--      esse espelho por fora marcaria como recebido um dinheiro que o gateway
--      ainda nao liberou e faria o extrato local divergir do extrato do Asaas,
--      sem nada na tela denunciando. Lei do projeto: o gateway vem antes do
--      banco. Recusado.
--
--
-- (3) UM LOTE NAO MISTURA ENTRADA E SAIDA
--
-- Esta e a regra de SELECAO (nao de linha) que o lado do recebimento obriga a
-- existir. Um lote e "uma linha do extrato": quitar contas a pagar e a receber
-- sob o mesmo carimbo produziria um grupo cuja soma nao corresponde a nenhum
-- debito nem a nenhum credito unico — o total do grupo seria a soma de dinheiro
-- que saiu com dinheiro que entrou, um numero que nao significa nada em
-- extrato nenhum. Pior: `undo_payment_group`, que devolve `total_amount` como
-- soma simples, devolveria esse mesmo numero sem sentido. Entao o lote e
-- homogeneo por construcao, e a mistura e recusada com mensagem explicita.
--
-- A tela ja nao consegue misturar (contas a pagar e a receber sao abas
-- separadas), o que torna esta guarda invisivel no uso normal — que e
-- exatamente o objetivo: ela existe pro caminho que NAO passa pela tela.
-- ============================================================================


CREATE OR REPLACE FUNCTION public.pay_transactions_batch(
  p_transaction_ids uuid[],
  p_account_id      uuid,
  p_payment_method  text DEFAULT NULL,
  p_paid_date       date DEFAULT NULL,
  p_group_id        uuid DEFAULT NULL
)
RETURNS TABLE (
  payment_group_id  uuid,
  paid_date         date,
  transaction_count integer,
  total_amount      numeric,
  already_applied   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
-- DISCIPLINA OBRIGATORIA NESTE CORPO: os nomes do RETURNS TABLE
-- (`payment_group_id`, `paid_date`) TAMBEM sao nomes de coluna de
-- `financial_transactions`. Toda referencia a coluna dentro das consultas vai
-- QUALIFICADA (`ft.payment_group_id`, `ft.paid_date`). Uma referencia solta
-- vira "column reference is ambiguous" em runtime — erro que nenhum parser
-- pega antes de a RPC ser chamada de verdade.
DECLARE
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
  v_can_manage boolean := false;
  v_ids        uuid[];
  v_expected   integer;
  v_locked     integer;
  v_account    public.financial_accounts%ROWTYPE;
  v_today      date;
  v_paid_date  date;
  v_group_id   uuid;
  v_motivo     text;
  v_amostra    text;
  v_tipos      integer;
  v_count      integer;
  v_total      numeric;
BEGIN
  -- --- Identidade e empresa -------------------------------------------------
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário não autenticado';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário sem empresa vinculada';
  END IF;

  -- SECURITY DEFINER passa por cima da RLS, entao a empresa e a permissao sao
  -- checadas AQUI, no servidor. Nada do que o cliente manda (nem os ids, nem a
  -- conta) e aceito sem cruzar com a empresa do chamador.
  SELECT (
    public.is_admin_or_gestor(v_user_id)
    OR public.has_full_permissions(v_user_id)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = v_user_id
         AND up.is_active = true
         AND (up.permissions ? '*' OR up.permissions @> '"fn:manage_finance"'::jsonb)
    )
  ) INTO v_can_manage;

  IF NOT COALESCE(v_can_manage, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Sem permissão para gerenciar o Financeiro';
  END IF;

  -- --- Selecao --------------------------------------------------------------
  -- Deduplica: o mesmo id repetido na selecao nao pode virar contagem inflada
  -- nem estourar a conferencia de linhas travadas.
  SELECT array_agg(DISTINCT x)
    INTO v_ids
    FROM unnest(COALESCE(p_transaction_ids, ARRAY[]::uuid[])) AS x
   WHERE x IS NOT NULL;

  v_expected := COALESCE(cardinality(v_ids), 0);

  IF v_expected = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Selecione ao menos uma conta para quitar';
  END IF;

  IF v_expected > 500 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Limite de 500 contas por lote. Divida a seleção.';
  END IF;

  -- --- Conta bancaria do lote ----------------------------------------------
  SELECT * INTO v_account
    FROM public.financial_accounts fa
   WHERE fa.id = p_account_id
     AND fa.company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Conta financeira inválida ou de outra empresa';
  END IF;

  IF v_account.is_active = false THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Conta financeira inativa';
  END IF;

  -- Cartao nao tem saldo de conta, tem FATURA: despesa de cartao so "pesa" no
  -- bolso quando a fatura e quitada. Quitar um lote "no cartao" criaria uma
  -- saida de caixa que nunca aconteceu. Do lado do recebimento a recusa e ainda
  -- mais obvia: dinheiro nao "entra" numa conta de cartao de credito.
  IF v_account.type = 'cartao' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Lote não pode ser quitado em conta de cartão de crédito. Use a fatura do cartão.';
  END IF;

  -- --- Data do pagamento, no fuso DA EMPRESA -------------------------------
  v_today     := public.company_today(v_company_id);
  v_paid_date := COALESCE(p_paid_date, v_today);

  -- Caixa e dinheiro que JA se moveu: nao existe "caixa do mes que vem". Mesma
  -- trava que a tela aplica (`isPaidDateAllowedInTz`), agora tambem no servidor
  -- — o cliente manda a data, entao a tela nao pode ser a unica guarda.
  IF v_paid_date > v_today THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A data de pagamento não pode ser futura';
  END IF;

  -- --- Trava pessimista das linhas do lote ---------------------------------
  -- Ordenado por id: dois usuarios quitando selecoes que se cruzam pegam os
  -- bloqueios na MESMA ordem, entao um espera o outro em vez de dar deadlock.
  -- O `company_id` entra ja aqui: id de outra empresa simplesmente nao trava, e
  -- a conferencia de contagem logo abaixo recusa o lote inteiro.
  PERFORM 1
     FROM public.financial_transactions ft
    WHERE ft.id = ANY(v_ids)
      AND ft.company_id = v_company_id
    ORDER BY ft.id
      FOR UPDATE;
  -- GET DIAGNOSTICS no MESMO bloco PL/pgSQL do comando — em bloco separado
  -- leria 0 e a conferencia passaria batido.
  GET DIAGNOSTICS v_locked = ROW_COUNT;

  IF v_locked <> v_expected THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Uma ou mais contas selecionadas não existem ou não pertencem à sua empresa';
  END IF;

  -- --- Idempotencia (contrato PWA: retry e seguro) -------------------------
  -- O cliente pode gerar o uuid do lote antes de chamar. Reenvio da MESMA
  -- selecao com o MESMO id devolve o lote existente sem reaplicar nada.
  v_group_id := COALESCE(p_group_id, gen_random_uuid());

  IF p_group_id IS NOT NULL THEN
    SELECT count(*) INTO v_count
      FROM public.financial_transactions ft
     WHERE ft.id = ANY(v_ids)
       AND ft.company_id = v_company_id
       AND ft.payment_group_id = p_group_id
       AND ft.is_paid = true;

    IF v_count = v_expected THEN
      SELECT count(*), COALESCE(sum(ft.amount), 0), max(ft.paid_date)
        INTO v_count, v_total, v_paid_date
        FROM public.financial_transactions ft
       WHERE ft.payment_group_id = p_group_id
         AND ft.company_id = v_company_id;

      RETURN QUERY SELECT p_group_id, v_paid_date, v_count, v_total, true;
      RETURN;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.financial_transactions ft
       WHERE ft.payment_group_id = p_group_id
         AND ft.company_id = v_company_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'Este lote já foi usado para outro conjunto de contas';
    END IF;
  END IF;

  -- --- Elegibilidade de cada linha -----------------------------------------
  -- Tudo ou nada: uma linha inelegivel recusa o lote INTEIRO, com o motivo em
  -- PT-BR e uma amostra das contas que travaram. Recusar em silencio (ignorar a
  -- linha ruim e pagar o resto) seria pior: o usuario acha que pagou tudo.
  --
  -- A ordem dos testes e a MESMA de `getBatchPayIneligibility`
  -- (src/lib/finance-batch-payment.ts), pra que a explicacao que a tela da
  -- ANTES do clique seja a mesma que o servidor daria depois. Se divergirem,
  -- quem manda e este bloco.
  SELECT b.motivo, b.amostra
    INTO v_motivo, v_amostra
    FROM (
      SELECT q.motivo,
             left(string_agg(q.description, ', ' ORDER BY q.description), 180) AS amostra,
             count(*) AS n
        FROM (
          SELECT a.description,
                 CASE
                   -- Tipos que nao sao dinheiro a pagar nem a receber nao
                   -- existem hoje no enum, mas o teste fica explicito: o lote e
                   -- so pra 'entrada' e 'saida'.
                   WHEN a.transaction_type NOT IN ('saida', 'entrada')
                     THEN 'Este lançamento não pode ser quitado em lote'

                   -- ---- Comuns aos dois lados ------------------------------
                   WHEN COALESCE(a.is_paid, false)
                     THEN 'Há contas já quitadas na seleção'
                   WHEN a.cancelled_at IS NOT NULL
                     THEN 'Há contas canceladas na seleção'
                   -- Invariante do cartao: despesa com `credit_card_bill_date`
                   -- NUNCA e paga sozinha — quem quita e a fatura.
                   WHEN a.credit_card_bill_date IS NOT NULL
                     THEN 'Despesa de cartão é quitada pela fatura, não em lote'
                   WHEN a.transfer_pair_id IS NOT NULL
                     THEN 'Transferência entre contas não entra em lote'
                   WHEN EXISTS (
                     SELECT 1 FROM public.credit_card_bills b
                      WHERE b.payment_transaction_id = a.id
                   ) THEN 'Pagamento de fatura é quitado pela própria fatura'
                   -- Baixa parcial fica fora, dos DOIS lados. O corte e pela
                   -- existencia da FILHA (fato estrutural), nunca por
                   -- `amount_received` sozinho — ha RPC que grava
                   -- `amount_received = amount` na quitacao total sem filha
                   -- nenhuma (achado Aldebaran).
                   WHEN EXISTS (
                     SELECT 1 FROM public.financial_transactions f
                      WHERE f.parent_transaction_id = a.id
                        AND f.category = 'Recebimento parcial'
                   ) THEN 'Conta com baixa parcial não entra em lote'

                   -- ---- So contas a PAGAR ----------------------------------
                   -- O gatilho `guard_linked_employee_vale_transaction` recusa
                   -- mexer em is_paid/paid_date de vale vinculado. Sem este
                   -- teste o lote morreria com a mensagem generica do gatilho.
                   WHEN a.payroll_kind = 'vale' AND EXISTS (
                     SELECT 1 FROM public.employee_movements em
                      WHERE em.financial_transaction_id = a.id
                   ) THEN 'Vale de funcionário é quitado pelo fluxo do RH'
                   -- NOVO (esta migration): a trava que so existia na tela.
                   -- Quitar salario/rescisao por aqui pula o abatimento de
                   -- vales, o `accrual_amount` e os lancamentos no extrato do
                   -- funcionario — ver o cabecalho, secao (1).
                   WHEN a.payroll_kind IN ('salary', 'rescission')
                     THEN 'Salário é quitado pela folha, não em lote'

                   -- ---- So contas a RECEBER --------------------------------
                   -- Espelho local de cobranca no gateway: quem baixa e o
                   -- webhook (`apply_tenant_charge_payment`), com o valor
                   -- liquido. Ver cabecalho, secao (2c).
                   WHEN a.transaction_type = 'entrada'
                        AND (a.tenant_charge_id IS NOT NULL OR a.asaas_payment_id IS NOT NULL)
                     THEN 'Cobrança é baixada pelo fluxo de Cobranças, não em lote'

                   ELSE NULL
                 END AS motivo
            FROM public.financial_transactions a
           WHERE a.id = ANY(v_ids)
             AND a.company_id = v_company_id
        ) q
       WHERE q.motivo IS NOT NULL
       GROUP BY q.motivo
       ORDER BY n DESC, q.motivo
       LIMIT 1
    ) b;

  IF v_motivo IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = v_motivo,
      DETAIL  = 'Contas: ' || COALESCE(v_amostra, '');
  END IF;

  -- --- Regra de SELECAO: lote homogeneo ------------------------------------
  -- Nao e uma propriedade de nenhuma linha isolada, entao nao cabe no CASE
  -- acima e tambem nao cabe em `getBatchPayIneligibility` (que e por linha).
  -- Ver cabecalho, secao (3).
  SELECT count(DISTINCT a.transaction_type)
    INTO v_tipos
    FROM public.financial_transactions a
   WHERE a.id = ANY(v_ids)
     AND a.company_id = v_company_id;

  IF v_tipos > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Um lote não pode misturar contas a pagar e contas a receber. Faça um lote de cada.';
  END IF;

  -- --- A quitacao ----------------------------------------------------------
  -- NENHUM INSERT. So o `is_paid` das N linhas vira true. E o que garante que o
  -- saldo nao pode dobrar: o universo somado continua sendo o mesmo — e vale
  -- igual pro lado da receita, porque tambem la nao nasce linha nenhuma.
  --
  -- `transaction_date` NAO e tocado de proposito: e ele que define o mes do
  -- titulo no regime de Competencia. O lote muda QUANDO o dinheiro se moveu
  -- (`paid_date`, regime de Caixa), nunca o mes de competencia de cada conta.
  --
  -- `amount_received` tambem nao e tocado: e exatamente o que o caminho legado
  -- de quitacao TOTAL faz em `useFinancial.markAsPaid` (`{ is_paid: true,
  -- paid_date }` e mais nada). Quem escreve `amount_received` e o gatilho
  -- `trg_recalc_amount_received`, a partir das filhas de recebimento parcial —
  -- e essas contas nem chegam aqui.
  --
  -- `created_at` tambem nao e tocado — e nao ha linha nova. O saldo corrente do
  -- extrato ordena por (transaction_date, created_at, id) e o desempate por id
  -- ja e o que torna a caminhada deterministica quando duas linhas nascem no
  -- mesmo microssegundo; como este lote nao cria linha alguma, ele nao introduz
  -- nenhum empate novo de `created_at`. O retorno agregado tambem nao depende de
  -- ordem.
  UPDATE public.financial_transactions ft
     SET is_paid          = true,
         paid_date        = v_paid_date,
         payment_group_id = v_group_id,
         account_id       = p_account_id,
         payment_method   = COALESCE(NULLIF(p_payment_method, ''), ft.payment_method),
         updated_at       = now()
   WHERE ft.id = ANY(v_ids)
     AND ft.company_id = v_company_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> v_expected THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'Falha ao quitar o lote: a seleção mudou durante a operação. Tente de novo.';
  END IF;

  SELECT COALESCE(sum(ft.amount), 0)
    INTO v_total
    FROM public.financial_transactions ft
   WHERE ft.payment_group_id = v_group_id
     AND ft.company_id = v_company_id;

  RETURN QUERY SELECT v_group_id, v_paid_date, v_count, v_total, false;
END
$function$;

COMMENT ON FUNCTION public.pay_transactions_batch(uuid[], uuid, text, date, uuid) IS
  'Quita N contas a pagar OU N contas a receber como UM evento (mesmo payment_group_id, mesma conta, mesma data, mesma forma). Nunca as duas coisas no mesmo lote. Nao cria lancamento nenhum: so marca as N linhas como pagas — por isso o saldo nao pode dobrar. Tudo ou nada. Fora do lote: baixa parcial, cartao/fatura, transferencia, vale, salario/rescisao (vao pela folha) e cobranca de gateway (vai pelo webhook). p_group_id opcional deixa o retry idempotente. Valida empresa, permissao fn:manage_finance e data nao futura no fuso da empresa.';

REVOKE ALL ON FUNCTION public.pay_transactions_batch(uuid[], uuid, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_transactions_batch(uuid[], uuid, text, date, uuid) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- `undo_payment_group`: NENHUMA mudanca de codigo, so o comentario
-- ----------------------------------------------------------------------------
-- Conferido linha a linha contra o lado do recebimento e nada precisou mudar:
--   * o escopo e por `payment_group_id` + `company_id`, que nao sabem nem
--     precisam saber de `transaction_type`;
--   * o UPDATE de volta (`is_paid = false, paid_date = NULL, carimbo = NULL`) e
--     a mesma semantica do "desfazer" individual de uma conta a receber;
--   * a varredura de filhas (`parent_transaction_id = ANY(...)`) so encontra
--     algo se a mae tiver filha paga — e nenhuma conta com filha entra em lote
--     (parcial e recusada, e tarifa so nasce em recebimento individual). Ou
--     seja: no lote de recebimento ela e um no-op, e continua cobrindo o caso
--     legado de filha herdada do lado da despesa;
--   * a cortesia do vale continua valendo pro lado da despesa e e inofensiva do
--     lado da receita.
-- Mesma conclusao pro carimbo, pro indice parcial e pro gatilho
-- `normalize_payment_group_id`: os tres sao agnosticos de tipo por construcao.
COMMENT ON FUNCTION public.undo_payment_group(uuid) IS
  'Desfaz o lote inteiro (de contas a pagar OU a receber): as N linhas voltam a pendente e perdem o carimbo. Escopado na empresa do chamador e exige fn:manage_finance. Grupo inexistente devolve already_undone = true (retry seguro), nunca erro.';


-- ----------------------------------------------------------------------------
-- Relatorio: o que existe hoje na base que este lote NUNCA vai poder tocar
-- ----------------------------------------------------------------------------
-- Nao corrige nada e nao muda dado — so deixa registrado, no log da migration,
-- o tamanho de cada bolso excluido. Serve de linha de base pra quando alguem
-- perguntar "por que aquela conta nao aparece pra marcar?".
DO $$
DECLARE
  v_folha    integer := 0;
  v_gateway  integer := 0;
  v_parcial  integer := 0;
  v_receber  integer := 0;
BEGIN
  SELECT count(*) INTO v_folha
    FROM public.financial_transactions t
   WHERE COALESCE(t.is_paid, false) = false
     AND t.cancelled_at IS NULL
     AND t.payroll_kind IN ('salary', 'rescission');

  SELECT count(*) INTO v_gateway
    FROM public.financial_transactions t
   WHERE COALESCE(t.is_paid, false) = false
     AND t.cancelled_at IS NULL
     AND t.transaction_type = 'entrada'
     AND (t.tenant_charge_id IS NOT NULL OR t.asaas_payment_id IS NOT NULL);

  SELECT count(*) INTO v_parcial
    FROM public.financial_transactions t
   WHERE COALESCE(t.is_paid, false) = false
     AND t.cancelled_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.financial_transactions f
        WHERE f.parent_transaction_id = t.id
          AND f.category = 'Recebimento parcial'
     );

  SELECT count(*) INTO v_receber
    FROM public.financial_transactions t
   WHERE COALESCE(t.is_paid, false) = false
     AND t.cancelled_at IS NULL
     AND t.transaction_type = 'entrada';

  RAISE NOTICE 'lote v2: contas a receber em aberto = % (agora elegiveis, menos as excecoes abaixo)', v_receber;
  RAISE NOTICE 'lote v2: fora do lote hoje -> folha (salario/rescisao) = %, cobranca de gateway = %, baixa parcial = %',
    v_folha, v_gateway, v_parcial;
END $$;

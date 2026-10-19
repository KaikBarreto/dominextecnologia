-- PDV, competencia do caixa: a venda da noite nascia no dia seguinte
--
-- O BUG, medido e nao teorico. O banco roda em UTC (current_setting('TimeZone')
-- = 'UTC', conferido no proprio servidor) e todo o caminho feliz do PDV carimbava
-- CURRENT_DATE. CURRENT_DATE em UTC esta 3h adiante de Sao Paulo, entao a partir
-- das 21h locais ele JA E O DIA SEGUINTE. Medicao do momento em que isto foi
-- escrito:
--
--     now()                                  = 2026-10-18 23:40 +00
--     now() AT TIME ZONE 'America/Sao_Paulo'  = 2026-10-18 20:40
--     CURRENT_DATE                            = 2026-10-18
--
-- Vinte minutos depois disso, UTC virou dia 19 com a loja ainda no dia 18. Uma
-- venda fechada as 21h30 de Sao Paulo nascia com transaction_date = 19, ou seja
-- com competencia de AMANHA.
--
-- POR QUE ISTO E GRAVE NESTE MODULO E NAO EM OUTRO: o modulo se chama "caixa" e
-- a promessa dele e o FECHAMENTO DO DIA. Venda das 21h30 caindo em amanha quebra
-- exatamente essa promessa: o fechamento nao bate com o que foi vendido, o DRE
-- divide o dia em dois e o operador nao tem como entender o porque, porque na
-- tela dele ainda e hoje.
--
-- O CONSERTO: todo lugar do PDV que decide COMPETENCIA passa a usar
-- public.company_today(company_id).
--
-- POR QUE company_today E NAO 'America/Sao_Paulo' CRAVADO. Procurei a regua
-- existente antes de inventar uma. Ela existe e tem dono:
--
--   public.company_today(p_company_id)  -> (now() AT TIME ZONE company_settings.timezone)::date
--                                          com fallback 'America/Sao_Paulo'
--   public.brt_today()                  -> crava Sao Paulo, e a regua do painel Auctus
--
-- company_today ja e quem carimba financial_transactions no resto do Financeiro
-- (pagamento em lote de contas a pagar, baixa de contas a receber, compra direta
-- com estoque). O PDV escreve na MESMA TABELA. Cravar Sao Paulo aqui criaria a
-- SEGUNDA regua de "que dia e hoje" dentro de financial_transactions, e as duas
-- discordariam no mesmo extrato. Alem disso company_settings.timezone nao e
-- decorativo: em producao hoje existem 55 empresas em America/Sao_Paulo e 9 fora
-- dele (America/Manaus, America/Cuiaba, America/Porto_Velho, America/Belem,
-- America/Fortaleza, America/Bahia, America/Guayaquil e uma em Asia/Calcutta).
-- Pra essas 9, cravar Sao Paulo seria trocar um erro de fuso por outro. Pra as
-- 55 de Sao Paulo o resultado e identico a cravar, porque e o fallback.
--
-- Nota de leitura pra quem vier depois: o fuso da empresa cria divergencia nos
-- DOIS sentidos. O tenant em Asia/Calcutta (UTC+5:30) sofria o espelho deste bug,
-- com a venda da manha nascendo com competencia de ONTEM.
--
-- ESCOPO, varrido em pg_proc e nao por lista de memoria. Foram procuradas todas
-- as funcoes de public cuja definicao viva menciona 'pdv' E carimba data
-- (current_date, now()::date, current_timestamp, localtimestamp). O resultado foi
-- exatamente tres:
--
--   pdv_settle_order        transaction_date e paid_date do pago, transaction_date
--                           do fiado, e por consequencia o vencimento default do
--                           fiado (data da venda + 1 MES CALENDARIO)
--   pdv_close_cash_session  transaction_date e paid_date do ajuste de quebra
--   pdv_cash_movement       transaction_date e paid_date das DUAS pernas da
--                           sangria e do suprimento
--
-- pdv_revert_cash_movement FICOU DE FORA DE PROPOSITO: ela so carimba
-- cancelled_at, que e timestamptz (instante absoluto, sem nocao de dia), e nao
-- cria nem redata nenhum lancamento. Nao ha o que consertar ali.
--
-- O QUE NAO MUDA, e isto importa porque mexe no caminho feliz de TODA venda:
-- nenhuma assinatura muda (as tres continuam com os mesmos argumentos, sem
-- sobrecarga nova, entao o PostgREST nao fica ambiguo e types.ts nao precisa de
-- regen), nenhum GRANT muda, e paid_at continua now() na venda de hoje. As tres
-- funcoes foram recriadas a partir de pg_get_functiondef da versao VIVA, nao do
-- arquivo de origem, porque o arquivo ja nao era a verdade (pdv_settle_order
-- levou duas rodadas de ajuste depois da 20261018220000). O diff contra a
-- definicao viva e so o que esta comentado no lugar.
--
-- DADO JA GRAVADO: medido antes de escrever isto. Das 23 linhas de
-- financial_transactions com origin='pdv', ZERO tem transaction_date maior que o
-- dia local da empresa na hora da criacao. O bug foi pego antes de produzir
-- lancamento errado, porque todas as vendas de teste cairam entre 15h e 20h de
-- Sao Paulo. Nao ha backfill nesta migration, e nao deve haver.
--
-- IDEMPOTENTE: CREATE OR REPLACE nas tres, mais GRANT reafirmado. Rodar duas
-- vezes nao muda nada.

-- =========================================================================
-- pdv_settle_order
-- =========================================================================

CREATE OR REPLACE FUNCTION public.pdv_settle_order(p_order_id uuid, p_payments jsonb, p_client_request_id text, p_transaction_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_company     uuid;
  v_order       public.pdv_orders;
  v_snap        record;
  v_pay         jsonb;
  v_method      text;
  v_amount      numeric;
  v_change      numeric;
  v_account     uuid;
  v_acc_type    text;
  v_due         date;
  v_charge      uuid;
  v_tx          uuid;
  v_subtotal    numeric := 0;
  v_total       numeric := 0;
  v_sum_pay     numeric := 0;
  v_items       integer := 0;
  v_has_cash    boolean := false;
  v_session     uuid;
  v_session_st  text;
  v_other_num   integer;
  v_customer    record;
  v_debt        numeric := 0;
  v_fiado       numeric := 0;
  v_avisos      jsonb := '[]'::jsonb;
  v_stock_res   jsonb := NULL;
  v_cat_done    boolean := false;
  -- Retrodatacao. v_eff_date e a COMPETENCIA do lancamento (transaction_date /
  -- paid_date) e v_eff_paid_at e o paid_at do pedido.
  --
  -- v_today e HOJE NO FUSO DA EMPRESA, via public.company_today(company_id), que
  -- e a regua de "hoje" que o Financeiro desta casa ja usa pra carimbar
  -- financial_transactions (pagamento em lote, baixa de contas a receber, compra
  -- direta). NAO e CURRENT_DATE: o banco roda em UTC e UTC esta 3h adiante de
  -- Sao Paulo, entao depois das 21h locais CURRENT_DATE ja virou amanha e a
  -- venda da noite nascia com competencia de amanha. v_today NAO pode ser
  -- inicializado aqui no DECLARE porque depende de v_company, que so e resolvido
  -- no corpo; a atribuicao acontece logo depois da checagem de modulo.
  v_eff_date    date;
  v_eff_paid_at timestamptz;
  v_today       date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_has_module(v_company, 'pdv') THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.' USING ERRCODE = '42501';
  END IF;

  -- HOJE, no fuso da empresa. Primeira coisa depois de saber de que empresa e a
  -- venda, porque tudo abaixo (validacao de data futura, competencia do
  -- lancamento, vencimento do fiado) pendura nisto.
  v_today := public.company_today(v_company);

  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos uma forma de pagamento.' USING ERRCODE = '22023';
  END IF;

  -- Serializa o retry: duas chamadas pro mesmo pedido entram em fila aqui.
  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-order:' || p_order_id::text, 0));

  SELECT * INTO v_order
    FROM public.pdv_orders o
   WHERE o.id = p_order_id
     AND o.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- CAMINHO IDEMPOTENTE: mesma chave, pedido ja finalizado. Devolve o resumo
  -- gravado e sai. Nao e erro: e retry de rede, offline ou duplo clique no F9.
  IF v_order.status IN ('pago', 'entregue') THEN
    IF p_client_request_id IS NOT NULL
       AND v_order.client_request_id IS NOT NULL
       AND v_order.client_request_id = p_client_request_id THEN
      -- data_lancamento vem do LANCAMENTO, nao do paid_at: pedido fechado
      -- antes desta migration tem paid_at = now() do momento, e derivar a data
      -- dali erraria em um dia nas vendas fechadas entre 21h e meia-noite.
      SELECT min(t.transaction_date) INTO v_eff_date
        FROM public.pdv_order_payments pay
        JOIN public.financial_transactions t ON t.id = pay.financial_transaction_id
       WHERE pay.order_id   = v_order.id
         AND pay.company_id = v_company;

      RETURN public.pdv_order_summary(v_order.id)
             || jsonb_build_object(
                  'idempotente',     true,
                  'avisos',          '[]'::jsonb,
                  'data_lancamento', v_eff_date
                );
    END IF;
    RAISE EXCEPTION 'O pedido nº % já foi finalizado.', v_order.number USING ERRCODE = '23505';
  END IF;

  IF v_order.status = 'cancelado' THEN
    RAISE EXCEPTION 'O pedido nº % foi cancelado e não pode ser finalizado.', v_order.number USING ERRCODE = '42501';
  END IF;

  -- -------------------------------------------------------------------------
  -- A DATA DO LANCAMENTO (p_transaction_date)
  -- -------------------------------------------------------------------------
  -- Esta validacao fica DEPOIS do retorno idempotente de proposito: um retry
  -- de pedido ja finalizado tem que devolver o mesmo resumo, mesmo que o
  -- payload do retry carregue uma data que hoje seria recusada. Idempotencia
  -- nao pode depender da validacao de parametro.
  --
  -- DATA FUTURA E RECUSADA. Nao e teimosia: este lancamento nasce is_paid=true
  -- (dinheiro que JA entrou), e pagamento no futuro nao existe. E a mesma regua
  -- que o Financeiro ja aplica no TransactionFormDialog ("Já foi pago (ou
  -- recebido) é, no máximo, hoje"), com a MESMA frase, pra o operador nao
  -- aprender duas regras pro mesmo conceito. A comparacao e contra o dia da
  -- EMPRESA (company_today), nao contra CURRENT_DATE: entre 21h e meia-noite
  -- CURRENT_DATE (UTC) ja e amanha, e recusar "hoje" pro caixa de uma loja
  -- aberta a noite seria um bug inexplicavel na tela.
  --
  -- NAO HA LIMITE DE QUANTO PRA TRAS, de proposito. Procurei trava de
  -- competencia fechada no Financeiro antes de decidir: nao existe nenhuma
  -- (financial_transactions nao tem CHECK nem trigger de data, e dado legado
  -- com data futura existe em producao justamente porque nunca houve trava).
  -- A unica nocao de "competencia encerrada" da casa mora na NFS-e automatica
  -- (nfse_auto_aguardar_decisao) e e sobre EMITIR NOTA, nao sobre lancar venda.
  -- Inventar aqui um segundo limite seria criar uma regua nova que o contador
  -- do cliente nao pediu e que ninguem mais respeita. O aviso de "isso muda a
  -- competencia" fica na TELA, onde o humano decide.
  IF p_transaction_date IS NOT NULL AND p_transaction_date > v_today THEN
    RAISE EXCEPTION 'Esta data não pode ser no futuro. Já foi pago (ou recebido) é, no máximo, hoje.'
      USING ERRCODE = '22023';
  END IF;

  -- O CONSERTO DESTA MIGRATION. Parametro nulo = HOJE NO FUSO DA EMPRESA, nao
  -- CURRENT_DATE. Era exatamente aqui que a venda das 21h30 de Sao Paulo nascia
  -- com competencia de amanha, porque nesse instante CURRENT_DATE (UTC) ja e o
  -- dia seguinte.
  v_eff_date := COALESCE(p_transaction_date, v_today);

  IF p_transaction_date IS NULL OR p_transaction_date = v_today THEN
    -- Venda de hoje guarda a HORA de verdade. O front que sempre manda a data
    -- (picker preenchido com hoje) nao perde o relogio por isso.
    v_eff_paid_at := now();
  ELSE
    -- Venda retrodatada: MEIO-DIA de Sao Paulo no dia escolhido. Meio-dia e
    -- ancora anti-drift: 12:00 em Sao Paulo e 15:00 UTC no MESMO dia, entao
    -- qualquer leitura (local ou UTC crua) devolve a data que a pessoa
    -- escolheu. Meia-noite local cairia no dia anterior em UTC e a venda
    -- apareceria um dia antes em qualquer relatorio que leia o timestamp cru.
    v_eff_paid_at := (p_transaction_date + time '12:00') AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  -- Chave ja usada em OUTRO pedido: o indice unico parcial estouraria com erro
  -- cru 23505 mais abaixo. Aqui vira mensagem que o operador entende.
  IF p_client_request_id IS NOT NULL THEN
    SELECT o.number INTO v_other_num
      FROM public.pdv_orders o
     WHERE o.company_id = v_company
       AND o.client_request_id = p_client_request_id
       AND o.id <> p_order_id
     LIMIT 1;
    IF v_other_num IS NOT NULL THEN
      RAISE EXCEPTION 'Esta finalização já foi registrada no pedido nº %.', v_other_num USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Total recalculado dos ITENS. Pedido sem item nao fecha.
  SELECT COUNT(*), COALESCE(SUM(i.total), 0)
    INTO v_items, v_subtotal
    FROM public.pdv_order_items i
   WHERE i.order_id = v_order.id;

  IF v_items = 0 THEN
    RAISE EXCEPTION 'Não dá para finalizar um pedido sem itens.' USING ERRCODE = '22023';
  END IF;

  v_subtotal := round(v_subtotal, 2);
  v_total    := round(GREATEST(v_subtotal - COALESCE(v_order.discount_amount, 0), 0), 2);

  -- Total zero (desconto comeu a venda inteira) nao fecha: cada forma de
  -- pagamento tem que ser maior que zero por CHECK, entao a soma nunca
  -- fecharia em zero e o operador ficaria num beco sem mensagem.
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'O total do pedido nº % ficou em zero. Revise o desconto antes de finalizar.', v_order.number
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_snap FROM public.pdv_cofre_snapshot(v_company);

  -- Primeira passada: valida tudo e soma, SEM gravar nada. Dinheiro nao se
  -- grava pela metade, e e mais barato recusar antes de inserir a primeira
  -- linha do que confiar no rollback.
  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := NULLIF(btrim(COALESCE(v_pay->>'method', '')), '');
    v_amount := round(COALESCE((v_pay->>'amount')::numeric, 0), 2);

    IF v_method IS NULL THEN
      RAISE EXCEPTION 'Escolha a forma de pagamento.' USING ERRCODE = '22023';
    END IF;
    IF v_method = 'pontos' THEN
      RAISE EXCEPTION 'Pagamento com pontos ainda não está disponível.' USING ERRCODE = '0A000';
    END IF;
    IF v_method NOT IN ('dinheiro', 'pix', 'transferencia', 'debito', 'credito', 'fiado') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida: %.', v_method USING ERRCODE = '22023';
    END IF;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'O valor de cada forma de pagamento tem que ser maior que zero.' USING ERRCODE = '22023';
    END IF;

    v_sum_pay := v_sum_pay + v_amount;
    IF v_method = 'dinheiro' THEN
      v_has_cash := true;
    ELSIF v_method = 'fiado' THEN
      v_fiado := v_fiado + v_amount;
    ELSE
      v_account := NULLIF(v_pay->>'account_id', '')::uuid;
      IF v_account IS NULL THEN
        RAISE EXCEPTION 'Escolha a conta que vai receber o pagamento em %.', v_method USING ERRCODE = '23502';
      END IF;
      -- Mensagem unica pra conta inexistente, inativa ou de outra empresa.
      SELECT fa.type INTO v_acc_type
        FROM public.financial_accounts fa
       WHERE fa.id = v_account
         AND fa.company_id = v_company
         AND fa.is_active IS TRUE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
      END IF;
      IF v_acc_type = 'cartao' THEN
        RAISE EXCEPTION 'Cartão de crédito não recebe venda. Escolha uma conta de banco ou de dinheiro.' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  IF abs(v_sum_pay - v_total) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pagamentos (%) não confere com o total do pedido (%).',
      public.pdv_fmt_brl(v_sum_pay), public.pdv_fmt_brl(v_total)
      USING ERRCODE = '23514';
  END IF;

  IF v_has_cash AND v_snap.cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta do cofre em Configurações do PDV antes de receber em dinheiro.' USING ERRCODE = '23502';
  END IF;

  -- Fiado: cliente obrigatorio e limite respeitado. O saldo devedor e a SOMA do
  -- ledger, nunca uma coluna em customers.
  IF v_fiado > 0 THEN
    IF v_order.customer_id IS NULL THEN
      RAISE EXCEPTION 'Venda no fiado precisa de cliente identificado no pedido.' USING ERRCODE = '23502';
    END IF;

    SELECT c.name, c.credit_limit INTO v_customer
      FROM public.customers c
     WHERE c.id = v_order.customer_id
       AND c.company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(SUM(l.amount), 0) INTO v_debt
      FROM public.customer_credit_ledger l
     WHERE l.company_id  = v_company
       AND l.customer_id = v_order.customer_id;

    IF v_customer.credit_limit IS NULL THEN
      v_avisos := v_avisos || jsonb_build_array('cliente_sem_limite_definido');
    ELSIF round(v_debt + v_fiado, 2) > round(v_customer.credit_limit, 2) THEN
      RAISE EXCEPTION '% já deve % e o limite é %. Esta venda no fiado (%) passaria do limite.',
        v_customer.name,
        public.pdv_fmt_brl(v_debt),
        public.pdv_fmt_brl(v_customer.credit_limit),
        public.pdv_fmt_brl(v_fiado)
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Sessao de caixa: a do pedido, senao a aberta do terminal, senao a aberta
  -- deste operador. Venda em DINHEIRO exige caixa aberto; venda so em pix /
  -- cartao / fiado nao, porque ali nada entra na gaveta.
  v_session := v_order.cash_session_id;
  IF v_session IS NULL AND v_order.terminal_id IS NOT NULL THEN
    SELECT s.id INTO v_session
      FROM public.pdv_cash_sessions s
     WHERE s.terminal_id = v_order.terminal_id
       AND s.company_id  = v_company
       AND s.status      = 'aberta'
     LIMIT 1;
  END IF;
  IF v_session IS NULL THEN
    SELECT s.id INTO v_session
      FROM public.pdv_cash_sessions s
     WHERE s.company_id = v_company
       AND s.status     = 'aberta'
       AND s.opened_by  = v_uid
     ORDER BY s.opened_at DESC
     LIMIT 1;
  END IF;

  IF v_has_cash THEN
    IF v_session IS NULL THEN
      RAISE EXCEPTION 'Abra o caixa antes de receber em dinheiro.' USING ERRCODE = '42501';
    END IF;
    SELECT s.status INTO v_session_st
      FROM public.pdv_cash_sessions s
     WHERE s.id = v_session AND s.company_id = v_company;
    IF v_session_st IS DISTINCT FROM 'aberta' THEN
      RAISE EXCEPTION 'O caixa deste pedido já foi fechado. Abra um caixa para receber em dinheiro.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Daqui pra baixo GRAVA. Tudo na mesma transacao.
  UPDATE public.pdv_orders
     SET subtotal          = v_subtotal,
         total             = v_total,
         cash_session_id   = COALESCE(cash_session_id, v_session),
         client_request_id = COALESCE(p_client_request_id, client_request_id)
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    v_method := btrim(v_pay->>'method');
    v_amount := round((v_pay->>'amount')::numeric, 2);
    v_change := round(GREATEST(COALESCE((v_pay->>'change_amount')::numeric, 0), 0), 2);
    v_charge := NULLIF(v_pay->>'tenant_charge_id', '')::uuid;
    v_tx     := NULL;

    IF NOT v_cat_done THEN
      INSERT INTO public.financial_categories (company_id, name, type, dre_group, icon, color)
      VALUES (v_company, 'Venda no PDV', 'entrada', 'opex', 'ShoppingCart', '#16a34a')
      ON CONFLICT (company_id, name) DO NOTHING;
      IF v_fiado > 0 THEN
        INSERT INTO public.financial_categories (company_id, name, type, dre_group, icon, color)
        VALUES (v_company, 'Venda no fiado', 'entrada', 'opex', 'Handshake', '#16a34a')
        ON CONFLICT (company_id, name) DO NOTHING;
      END IF;
      v_cat_done := true;
    END IF;

    IF v_method = 'fiado' THEN
      -- A RECEBER: is_paid=false, com vencimento, SEM conta (o dinheiro nao
      -- entrou). Default do vencimento e hoje + 1 MES CALENDARIO, nunca 30 dias.
      -- O prazo conta da DATA DA VENDA, nao de hoje: fiado de 3 dias atras com
      -- 1 mes de prazo vence 1 mes depois DAQUELE dia. Ancorar em hoje daria ao
      -- cliente alguns dias de brinde e o extrato nao fecharia com o papel.
      -- Mes CALENDARIO (interval '1 month'), nunca 30 dias.
      v_due := COALESCE(NULLIF(v_pay->>'due_date', '')::date, (v_eff_date + interval '1 month')::date);

      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount, category,
        transaction_date, due_date, is_paid, customer_id, origin,
        payment_method, created_by
      ) VALUES (
        v_company, 'entrada'::transaction_type,
        'Venda no fiado, pedido PDV nº ' || v_order.number::text,
        v_amount, 'Venda no fiado',
        v_eff_date, v_due, false, v_order.customer_id, 'pdv',
        'fiado', v_uid
      )
      RETURNING id INTO v_tx;

      INSERT INTO public.pdv_order_payments (
        company_id, order_id, method, amount, change_amount,
        financial_account_id, financial_transaction_id, tenant_charge_id, created_by
      ) VALUES (
        v_company, v_order.id, 'fiado', v_amount, 0,
        NULL, v_tx, v_charge, v_uid
      );

      -- Ledger append-only. Correcao futura e linha de kind 'ajuste'.
      INSERT INTO public.customer_credit_ledger (
        company_id, customer_id, kind, amount, order_id,
        financial_transaction_id, created_by, notes
      ) VALUES (
        v_company, v_order.customer_id, 'venda_fiado', v_amount, v_order.id,
        v_tx, v_uid, 'Venda no fiado, pedido PDV nº ' || v_order.number::text
      );
    ELSE
      v_account := CASE
                     WHEN v_method = 'dinheiro' THEN v_snap.cash_account_id
                     ELSE NULLIF(v_pay->>'account_id', '')::uuid
                   END;

      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount, category,
        transaction_date, paid_date, is_paid, account_id, customer_id,
        origin, payment_method, tenant_charge_id, created_by
      ) VALUES (
        v_company, 'entrada'::transaction_type,
        'Venda no PDV, pedido nº ' || v_order.number::text,
        v_amount, 'Venda no PDV',
        v_eff_date, v_eff_date, true, v_account, v_order.customer_id,
        -- payment_method segue a convencao JA usada no resto do financeiro
        -- (medido em producao: pix / dinheiro / transferencia / cartao_debito /
        -- cartao_credito). Gravar 'debito' cru criaria um valor novo pro mesmo
        -- conceito e quebraria agrupamento de relatorio por forma de pagamento.
        'pdv',
        CASE v_method
          WHEN 'debito'  THEN 'cartao_debito'
          WHEN 'credito' THEN 'cartao_credito'
          ELSE v_method
        END,
        v_charge, v_uid
      )
      RETURNING id INTO v_tx;

      INSERT INTO public.pdv_order_payments (
        company_id, order_id, method, amount, change_amount,
        financial_account_id, financial_transaction_id, tenant_charge_id, created_by
      ) VALUES (
        v_company, v_order.id, v_method, v_amount, v_change,
        v_account, v_tx, v_charge, v_uid
      );
    END IF;
  END LOOP;

  UPDATE public.pdv_orders
     SET status  = 'pago',
         paid_at = v_eff_paid_at
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- Modo SIMPLES: um operador faz tudo e o estoque baixa na hora do pagamento.
  -- Modo BALCAO: o estoque so baixa na entrega (Expedicao, Onda 2), entao aqui
  -- nao se baixa nada.
  IF COALESCE(v_snap.pdv_mode, 'simples') = 'simples' THEN
    v_stock_res := public.pdv_commit_order_stock(v_order.id);
    IF jsonb_typeof(v_stock_res->'avisos') = 'array' THEN
      v_avisos := v_avisos || (v_stock_res->'avisos');
    END IF;
  END IF;

  RETURN public.pdv_order_summary(v_order.id)
         || jsonb_build_object(
              'idempotente',     false,
              'modo',            COALESCE(v_snap.pdv_mode, 'simples'),
              'estoque',         v_stock_res,
              'avisos',          v_avisos,
              -- A tela confirma pelo retorno em que dia a venda caiu, sem
              -- precisar de um SELECT depois.
              'data_lancamento', v_eff_date,
              'retrodatado',     (p_transaction_date IS NOT NULL AND p_transaction_date < v_today)
            );
END
$function$;

-- =========================================================================
-- pdv_close_cash_session
-- =========================================================================

CREATE OR REPLACE FUNCTION public.pdv_close_cash_session(p_session_id uuid, p_counted_amount numeric, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_company    uuid;
  v_session    public.pdv_cash_sessions;
  v_terminal   text;
  v_snap       record;
  v_cash_sales numeric := 0;
  v_supply     numeric := 0;
  v_bleed      numeric := 0;
  v_expected   numeric;
  v_diff       numeric;
  v_tx         uuid;
  v_avisos     jsonb := '[]'::jsonb;
  v_by_method  jsonb;
  -- HOJE no fuso da EMPRESA (public.company_today), a mesma regua de
  -- pdv_settle_order. O ajuste de quebra de caixa usava CURRENT_DATE, que e UTC:
  -- fechamento depois das 21h de Sao Paulo nascia com competencia de amanha, e o
  -- "fechamento do dia" nao batia com o que foi vendido no dia.
  v_today      date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_has_module(v_company, 'pdv') THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.' USING ERRCODE = '42501';
  END IF;

  v_today := public.company_today(v_company);

  IF p_counted_amount IS NULL OR p_counted_amount < 0 THEN
    RAISE EXCEPTION 'Informe quanto foi contado na gaveta (zero ou mais).' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-cash-session:' || p_session_id::text, 0));

  SELECT * INTO v_session
    FROM public.pdv_cash_sessions s
   WHERE s.id = p_session_id
     AND s.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status = 'fechada' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado em %.', to_char(v_session.closed_at, 'DD/MM/YYYY HH24:MI')
      USING ERRCODE = '42501';
  END IF;

  SELECT t.name INTO v_terminal FROM public.pdv_terminals t WHERE t.id = v_session.terminal_id;
  SELECT * INTO v_snap FROM public.pdv_cofre_snapshot(v_company);

  SELECT COALESCE(SUM(pay.amount), 0)
    INTO v_cash_sales
    FROM public.pdv_order_payments pay
    JOIN public.pdv_orders o ON o.id = pay.order_id
   WHERE o.cash_session_id = v_session.id
     AND o.company_id      = v_company
     AND o.status IN ('pago', 'entregue')
     AND pay.method = 'dinheiro';

  SELECT COALESCE(SUM(CASE WHEN m.kind = 'suprimento' THEN m.amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN m.kind = 'sangria'    THEN m.amount ELSE 0 END), 0)
    INTO v_supply, v_bleed
    FROM public.pdv_cash_movements m
   WHERE m.session_id = v_session.id
     AND m.cancelled_at IS NULL;

  v_expected := round(v_session.opening_amount + v_cash_sales + v_supply - v_bleed, 2);
  v_diff     := round(p_counted_amount - v_expected, 2);

  -- Venda por forma de pagamento, pro comprovante de fechamento.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', q.method, 'total', round(q.total, 2)) ORDER BY q.method), '[]'::jsonb)
    INTO v_by_method
    FROM (
      SELECT pay.method, SUM(pay.amount) AS total
        FROM public.pdv_order_payments pay
        JOIN public.pdv_orders o ON o.id = pay.order_id
       WHERE o.cash_session_id = v_session.id
         AND o.company_id      = v_company
         AND o.status IN ('pago', 'entregue')
       GROUP BY pay.method
    ) q;

  IF v_diff <> 0 THEN
    IF v_expected < 0 THEN
      v_avisos := v_avisos || jsonb_build_array('esperado_negativo_sem_ajuste');
    ELSIF v_snap.cash_account_id IS NULL THEN
      v_avisos := v_avisos || jsonb_build_array('cofre_nao_configurado_sem_ajuste');
    ELSE
      -- A categoria entra no catalogo da empresa pra o DRE agrupar certo em vez
      -- de mostrar um texto orfao. ON CONFLICT porque (company_id, name) e
      -- unique e porque a migration tem que rodar duas vezes sem quebrar.
      INSERT INTO public.financial_categories (company_id, name, type, dre_group, icon, color)
      VALUES (v_company, 'Quebra de caixa', 'ambos', 'opex', 'Scale', '#f59e0b')
      ON CONFLICT (company_id, name) DO NOTHING;

      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount, category,
        transaction_date, paid_date, is_paid, account_id, origin, created_by, notes
      ) VALUES (
        v_company,
        CASE WHEN v_diff > 0 THEN 'entrada'::transaction_type ELSE 'saida'::transaction_type END,
        CASE WHEN v_diff > 0 THEN 'Sobra de caixa no fechamento do ' ELSE 'Falta de caixa no fechamento do ' END
          || COALESCE(v_terminal, 'PDV'),
        abs(v_diff),
        'Quebra de caixa',
        v_today, v_today, true, v_snap.cash_account_id, 'pdv', v_uid,
        'Esperado ' || public.pdv_fmt_brl(v_expected) || ', contado ' || public.pdv_fmt_brl(p_counted_amount)
          || COALESCE('. ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), '')
      )
      RETURNING id INTO v_tx;
    END IF;
  END IF;

  UPDATE public.pdv_cash_sessions
     SET status          = 'fechada',
         closed_by       = v_uid,
         closed_at       = now(),
         counted_amount  = p_counted_amount,
         expected_amount = v_expected,
         difference      = v_diff,
         notes           = COALESCE(NULLIF(btrim(COALESCE(p_notes, '')), ''), notes)
   WHERE id = v_session.id
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'session_id',                v_session.id,
    'terminal_id',               v_session.terminal_id,
    'terminal_nome',             v_terminal,
    'abertura',                  round(v_session.opening_amount, 2),
    'vendas_em_dinheiro',        round(v_cash_sales, 2),
    'suprimentos',               round(v_supply, 2),
    'sangrias',                  round(v_bleed, 2),
    'esperado',                  v_expected,
    'contado',                   round(p_counted_amount, 2),
    'diferenca',                 v_diff,
    'ajuste_transaction_id',     v_tx,
    'vendas_por_forma',          v_by_method,
    'aberto_em',                 v_session.opened_at,
    'fechado_em',                v_session.closed_at,
    'avisos',                    v_avisos
  );
END
$function$;

-- =========================================================================
-- pdv_cash_movement
-- =========================================================================

CREATE OR REPLACE FUNCTION public.pdv_cash_movement(p_session_id uuid, p_kind text, p_amount numeric, p_to_account_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_company     uuid;
  v_session     public.pdv_cash_sessions;
  v_terminal    text;
  v_snap        record;
  v_pair        uuid;
  v_desc        text;
  v_tx_cofre    uuid;
  v_tx_other    uuid;
  v_movement    uuid;
  v_na_gaveta   numeric;
  v_other_name  text;
  v_other_type  text;
  -- HOJE no fuso da EMPRESA (public.company_today), a mesma regua de
  -- pdv_settle_order. As duas pernas da sangria / do suprimento usavam
  -- CURRENT_DATE, que e UTC: movimento depois das 21h de Sao Paulo nascia com
  -- competencia de amanha e saia do dia do caixa que ele movimentou.
  v_today       date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_has_module(v_company, 'pdv') THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.' USING ERRCODE = '42501';
  END IF;

  v_today := public.company_today(v_company);

  IF p_kind IS NULL OR p_kind NOT IN ('sangria', 'suprimento') THEN
    RAISE EXCEPTION 'Tipo de movimento de caixa inválido. Use sangria ou suprimento.' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-cash-session:' || p_session_id::text, 0));

  SELECT * INTO v_session
    FROM public.pdv_cash_sessions s
   WHERE s.id = p_session_id
     AND s.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.status <> 'aberta' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado. Sangria e suprimento só entram com o caixa aberto.' USING ERRCODE = '42501';
  END IF;

  SELECT t.name INTO v_terminal FROM public.pdv_terminals t WHERE t.id = v_session.terminal_id;
  SELECT * INTO v_snap FROM public.pdv_cofre_snapshot(v_company);

  -- Quanto tem na gaveta AGORA (mesma formula do fechamento).
  SELECT v_session.opening_amount
       + COALESCE((
           SELECT SUM(pay.amount)
             FROM public.pdv_order_payments pay
             JOIN public.pdv_orders o ON o.id = pay.order_id
            WHERE o.cash_session_id = v_session.id
              AND o.company_id      = v_company
              AND o.status IN ('pago', 'entregue')
              AND pay.method = 'dinheiro'
         ), 0)
       + COALESCE((
           SELECT SUM(CASE WHEN m.kind = 'suprimento' THEN m.amount ELSE -m.amount END)
             FROM public.pdv_cash_movements m
            WHERE m.session_id = v_session.id
              AND m.cancelled_at IS NULL
         ), 0)
    INTO v_na_gaveta;

  IF p_kind = 'sangria' AND v_snap.strict_tracking AND p_amount > v_na_gaveta THEN
    RAISE EXCEPTION 'A gaveta tem %. Reduza o valor da sangria.', public.pdv_fmt_brl(v_na_gaveta)
      USING ERRCODE = '23514';
  END IF;

  IF p_to_account_id IS NOT NULL THEN
    -- Mensagem unica pra conta inexistente e pra conta de outra empresa.
    SELECT fa.name, fa.type INTO v_other_name, v_other_type
      FROM public.financial_accounts fa
     WHERE fa.id = p_to_account_id
       AND fa.company_id = v_company
       AND fa.is_active IS TRUE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
    END IF;
    IF v_other_type = 'cartao' THEN
      RAISE EXCEPTION 'Cartão de crédito não recebe sangria nem manda suprimento. Escolha uma conta de banco ou de dinheiro.' USING ERRCODE = '22023';
    END IF;
    IF v_snap.cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Escolha a conta do cofre em Configurações do PDV antes de movimentar dinheiro entre contas.' USING ERRCODE = '23502';
    END IF;
    IF p_to_account_id = v_snap.cash_account_id THEN
      RAISE EXCEPTION 'A conta informada é a própria conta do cofre. Deixe a conta em branco quando o dinheiro não sai do cofre.' USING ERRCODE = '22023';
    END IF;

    v_pair := gen_random_uuid();
    v_desc := CASE p_kind WHEN 'sangria' THEN 'Sangria do caixa ' ELSE 'Suprimento do caixa ' END
              || COALESCE(v_terminal, 'PDV')
              || COALESCE(' (' || NULLIF(btrim(COALESCE(p_reason, '')), '') || ')', '');

    -- Perna do COFRE
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount, category,
      transaction_date, paid_date, is_paid, account_id, transfer_pair_id,
      origin, created_by, notes
    ) VALUES (
      v_company,
      CASE p_kind WHEN 'sangria' THEN 'saida'::transaction_type ELSE 'entrada'::transaction_type END,
      v_desc, p_amount, 'Transferência entre contas',
      v_today, v_today, true, v_snap.cash_account_id, v_pair,
      'pdv', v_uid, p_reason
    )
    RETURNING id INTO v_tx_cofre;

    -- Perna da OUTRA conta
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount, category,
      transaction_date, paid_date, is_paid, account_id, transfer_pair_id,
      origin, created_by, notes
    ) VALUES (
      v_company,
      CASE p_kind WHEN 'sangria' THEN 'entrada'::transaction_type ELSE 'saida'::transaction_type END,
      v_desc, p_amount, 'Transferência entre contas',
      v_today, v_today, true, p_to_account_id, v_pair,
      'pdv', v_uid, p_reason
    )
    RETURNING id INTO v_tx_other;
  END IF;

  INSERT INTO public.pdv_cash_movements (
    company_id, session_id, kind, amount, to_account_id,
    financial_transaction_id, reason, created_by
  ) VALUES (
    v_company, v_session.id, p_kind, p_amount, p_to_account_id,
    v_tx_cofre, p_reason, v_uid
  )
  RETURNING id INTO v_movement;

  RETURN jsonb_build_object(
    'movement_id',           v_movement,
    'session_id',            v_session.id,
    'kind',                  p_kind,
    'amount',                round(p_amount, 2),
    'to_account_id',         p_to_account_id,
    'to_account_name',       v_other_name,
    'transaction_cofre_id',  v_tx_cofre,
    'transaction_destino_id', v_tx_other,
    'na_gaveta_antes',       round(v_na_gaveta, 2),
    'na_gaveta_depois',      round(v_na_gaveta + CASE WHEN p_kind = 'suprimento' THEN p_amount ELSE -p_amount END, 2)
  );
END
$function$;

-- =========================================================================
-- ACL reafirmada. CREATE OR REPLACE preserva GRANT (so DROP perde), mas
-- reafirmar deixa a intencao no arquivo e torna a migration auto-suficiente
-- se alguem precisar derrubar e recriar.
-- =========================================================================

REVOKE ALL ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) TO authenticated, service_role;

-- =========================================================================
-- COMMENT: o proximo a abrir estas funcoes tem que bater na regra antes do
-- codigo.
-- =========================================================================

COMMENT ON FUNCTION public.pdv_settle_order(uuid, jsonb, text, date) IS
  'Finaliza o pedido do PDV: valida pagamento, grava as pernas em financial_transactions, o fiado no ledger do cliente e baixa estoque no modo simples. A COMPETENCIA (transaction_date / paid_date) e public.company_today(company_id), nunca CURRENT_DATE: o banco roda em UTC e depois das 21h de Sao Paulo CURRENT_DATE ja e amanha, o que fazia a venda da noite nascer com competencia do dia seguinte e o fechamento do caixa nao bater com o que foi vendido. p_transaction_date opcional retrodata a competencia, limitada a company_today (data futura e recusada).';

COMMENT ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) IS
  'Fecha a sessao de caixa e, se houver quebra, lanca o ajuste em financial_transactions. A competencia do ajuste e public.company_today(company_id), nunca CURRENT_DATE (UTC), senao o fechamento feito depois das 21h de Sao Paulo cai no dia seguinte.';

COMMENT ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) IS
  'Registra sangria ou suprimento do caixa e, quando ha conta de destino, as duas pernas da transferencia em financial_transactions. A competencia das pernas e public.company_today(company_id), nunca CURRENT_DATE (UTC), senao o movimento feito depois das 21h de Sao Paulo cai no dia seguinte e sai do dia do caixa que ele movimentou.';

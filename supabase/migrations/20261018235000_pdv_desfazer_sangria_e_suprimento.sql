-- PDV: desfazer sangria e suprimento sem apagar linha de livro-razao
--
-- O Dev Financeiro montou o historico do caixa com coluna de acoes e encontrou
-- o buraco: VENDA tem pdv_cancel_order, LANCAMENTO AVULSO tem o caminho de
-- exclusao do Financeiro, mas SANGRIA e SUPRIMENTO nao tinham como ser
-- desfeitos. A acao ficou desabilitada na tela, com o motivo escrito, em vez de
-- improvisar um DELETE por fora. Esta migration fecha o buraco.
--
-- ===========================================================================
-- POR QUE NAO DAVA, E POR QUE A SAIDA NAO E DELETE
-- ===========================================================================
--
-- 1) pdv_cash_movements tem policy SO de SELECT e INSERT (20261018163000), de
--    proposito: e livro-razao de DINHEIRO, append-only no privilegio. O
--    cliente nao apaga e nao atualiza. Quem desfaz e uma RPC SECURITY DEFINER,
--    que pertence a `postgres` e por isso escreve sem precisar de policy nova.
--    Nao se abre UPDATE/DELETE pra authenticated nesta tabela.
--
-- 2) Com conta informada, pdv_cash_movement cria um PAR em
--    financial_transactions (mesmo transfer_pair_id, categoria "Transferencia
--    entre contas"). O caminho de exclusao do Financeiro
--    (deleteTransactionCascade) so trata par de "Pagamento de Fatura": apagar
--    uma perna deixaria a outra orfa, a linha de pdv_cash_movements viva e o
--    esperado da gaveta errado.
--
-- 3) A saida e cancelled_at, nao DELETE. cancelled_at e o marcador canonico de
--    estorno da casa (FinanceDRE.tsx e useFinancialAccounts.ts ja pulam linha
--    cancelada), a conciliacao bancaria tem trava contra DELETE, e apagar linha
--    de livro-razao de dinheiro contradiz a escolha append-only que este modulo
--    fez de proposito. A linha fica VIVA no historico e sai da conta.
--
-- ===========================================================================
-- A CONSEQUENCIA QUE ESTA MIGRATION E OBRIGADA A TRATAR
-- ===========================================================================
--
-- A formula do esperado da gaveta somava kind SEM FILTRAR NADA:
--
--     esperado = abertura + vendas em dinheiro + suprimentos - sangrias
--
-- Marcar cancelled_at e NAO filtrar deixaria o movimento desfeito CONTINUAR
-- CONTANDO, e o caixa fecharia errado. Isso e dinheiro errado, que e o pior
-- desfecho possivel aqui. Por isso as DUAS funcoes que usam a formula sao
-- recriadas com "AND m.cancelled_at IS NULL":
--
--     pdv_close_cash_session   soma de suprimento e de sangria do fechamento
--     pdv_cash_movement        a conta "quanto tem na gaveta AGORA", que e a
--                              base da recusa de sangria acima do disponivel
--
-- As duas foram recriadas A PARTIR DA DEFINICAO VIVA (pg_get_functiondef),
-- nao do arquivo da 20261018220000: recriar de arquivo velho foi o que teria
-- revertido 32 linhas da admin_delete_company hoje de manha. Confirmado antes:
-- a definicao viva e byte a byte igual a do arquivo, e a unica diferenca
-- introduzida aqui e o filtro acima.
--
-- O ESPELHO EM TYPESCRIPT PRECISA DO MESMO FILTRO. Servidor filtrando e tela
-- nao filtrando e divergencia de dinheiro na cara do operador. Fora do escopo
-- desta migration (nenhum arquivo de src/ e tocado aqui), reportado ao Tech
-- Lead: src/pages/PdvCaixa.tsx (agregacao de supplies/bleeds do breakdown),
-- src/hooks/usePdvCashRegister.ts (select de pdv_cash_movements precisa trazer
-- cancelled_at e o historico precisa esconder movimento cancelado, por
-- coerencia com a decisao do CEO de venda cancelada sair do historico).
--
-- ===========================================================================
-- SEGURANCA (mesma regua da 20261018220000)
-- ===========================================================================
--
--   a) REVOKE ALL ... FROM PUBLIC, anon, authenticated ANTES do GRANT. "FROM
--      anon" sozinho NAO basta: o "=X" de PUBLIC na proacl e o vetor, e foi
--      assim que o oraculo cross-tenant de hoje de manha nasceu.
--   b) a conferencia de ACL no fim do arquivo usa has_function_privilege,
--      nunca leitura de proacl.
--   c) SECURITY DEFINER ignora RLS, entao a checagem de empresa vai DENTRO do
--      corpo, contra get_user_company_id(auth.uid()), nunca contra parametro
--      do cliente. A funcao nova recebe SO o id do movimento e o motivo.
--   d) mensagem de erro NAO distingue "nao existe" de "e de outra empresa".
--   e) o lock e pg_advisory_xact_lock na MESMA CHAVE que pdv_cash_movement e
--      pdv_close_cash_session usam ('pdv-cash-session:' || session_id). Chave
--      diferente seria lock decorativo: nao serializaria contra a sangria nem
--      contra o fechamento concorrente.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) As tres colunas de cancelamento em pdv_cash_movements
-- ---------------------------------------------------------------------------
-- Mesmo trio de pdv_orders (cancelled_at + cancelled_by + cancelled_reason):
-- QUANDO, QUEM e POR QUE. O motivo nao vai pra `reason` porque `reason` e o
-- motivo da SANGRIA; isto e auditoria do ESTORNO, e misturar os dois perde a
-- resposta pra pergunta que o cliente faz seis meses depois.
ALTER TABLE public.pdv_cash_movements
  ADD COLUMN IF NOT EXISTS cancelled_at     timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

COMMENT ON COLUMN public.pdv_cash_movements.cancelled_at IS
  'Preenchido por pdv_revert_cash_movement. Movimento com cancelled_at NÃO entra na conta do esperado da gaveta (nem em pdv_close_cash_session, nem na checagem de disponível de pdv_cash_movement) e sai do histórico do caixa, por coerência com venda cancelada. A linha continua viva: isto é livro-razão de dinheiro, aqui nunca se faz DELETE.';
COMMENT ON COLUMN public.pdv_cash_movements.cancelled_by IS
  'Quem desfez o movimento. ON DELETE SET NULL: excluir o usuário não apaga o movimento nem a marca de estorno.';
COMMENT ON COLUMN public.pdv_cash_movements.cancelled_reason IS
  'Motivo informado ao desfazer. Separado de reason de propósito: reason é o motivo da sangria/suprimento, isto é auditoria do estorno.';

-- Os dois indices existentes (session_id, created_at) e (company_id,
-- created_at DESC) ja atendem as somas da sessao, que leem poucas linhas por
-- caixa. Indice parcial em cancelled_at seria peso sem ganho medido.

-- ---------------------------------------------------------------------------
-- 2) pdv_cash_movement : a gaveta AGORA ignora movimento desfeito
-- ---------------------------------------------------------------------------
-- Recriada a partir da definicao viva. Unica mudanca: o filtro de cancelado na
-- subquery da gaveta. Sem isso, desfazer uma sangria de R$ 300 nao devolveria
-- os R$ 300 ao teto da proxima sangria: o operador veria "A gaveta tem R$ 0,00"
-- com dinheiro na gaveta.
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
      CURRENT_DATE, CURRENT_DATE, true, v_snap.cash_account_id, v_pair,
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
      CURRENT_DATE, CURRENT_DATE, true, p_to_account_id, v_pair,
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

COMMENT ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) IS
  'Sangria (dinheiro sai da gaveta) e suprimento (dinheiro entra). Com conta informada, gera PAR de transferência (mesmo transfer_pair_id, categoria Transferência entre contas), igual ao transfer() de useFinancialAccounts.ts: é movimento de balanço, não de resultado. Sem conta, não gera lançamento nenhum (o dinheiro não saiu do cofre), só muda o esperado da gaveta. Sangria acima do que há na gaveta é recusada quando o controle estrito está ligado. Movimento desfeito (cancelled_at) NÃO conta na gaveta.';

-- CREATE OR REPLACE preserva a ACL, mas o REVOKE explicito fica escrito como
-- INTENCAO, e nao como heranca de outra migration.
REVOKE ALL ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) pdv_close_cash_session : o esperado ignora movimento desfeito
-- ---------------------------------------------------------------------------
-- Recriada a partir da definicao viva. Unica mudanca: "AND m.cancelled_at IS
-- NULL" nas somas de suprimento e de sangria. Este e o ponto mais caro do
-- arquivo: sem o filtro, uma sangria desfeita continuaria sendo subtraida do
-- esperado, o esperado fecharia abaixo do contado e o sistema lancaria uma
-- SOBRA de caixa que nunca existiu, com lancamento de verdade na conta do
-- cofre. Dinheiro errado com aparencia de conferencia feita.
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
        CURRENT_DATE, CURRENT_DATE, true, v_snap.cash_account_id, 'pdv', v_uid,
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

COMMENT ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) IS
  'Fecha a sessão de caixa. esperado = abertura + vendas em dinheiro + suprimentos - sangrias, contando só movimento NÃO cancelado (troco não entra: pdv_order_payments.amount já é líquido). A diferença vira financial_transactions na conta cofre, categoria Quebra de caixa (sobra = entrada, falta = saída), origin=pdv. NÃO lança ajuste quando o esperado dá negativo: isso é sintoma de dado faltando, e ajuste sobre base negativa é ficção contábil (acerto aprendido na EcoSistema). Devolve o resumo do comprovante.';

REVOKE ALL ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) public.pdv_revert_cash_movement : desfazer sangria ou suprimento
-- ---------------------------------------------------------------------------
-- O que ela faz, em UMA transacao:
--
--   a) marca cancelled_at / cancelled_by / cancelled_reason no movimento;
--   b) cancela AS DUAS PERNAS do par em financial_transactions, achadas por
--      transfer_pair_id (nao pelo id de uma perna so: pdv_cash_movements
--      guarda apenas a perna do COFRE em financial_transaction_id, e cancelar
--      so ela deixaria a outra viva, com o saldo da outra conta errado pra
--      sempre e sem erro nenhum na tela);
--   c) devolve o esperado da gaveta ANTES e DEPOIS, LIDO DA TABELA nas duas
--      vezes. Nao e aritmetica de confianca ("antes menos o valor"): o DEPOIS
--      e recalculado pela mesma formula do fechamento, ja com o filtro de
--      cancelado, entao o numero que volta pra tela PROVA que o filtro pegou.
--
-- Movimento SEM conta nao tem lancamento nenhum pra tocar: quando a conta e
-- nula o dinheiro nunca saiu do cofre, e pdv_cash_movement nao gerou
-- financial_transactions (comentario dela diz isso). Nesse caso cancela-se so
-- o movimento, e transactions_revertidas volta vazio.
--
-- RECUSAS, todas com mensagem, nunca em silencio:
--
--   SESSAO FECHADA. Caixa fechado ja virou conferencia: expected_amount,
--   counted_amount e difference estao gravados na sessao, e pode existir
--   lancamento de "Quebra de caixa" emitido com base naquele esperado.
--   Desfazer um movimento depois disso reescreveria a quebra de caixa de um
--   fechamento que ja foi assinado. Quem precisa corrigir caixa fechado faz
--   lancamento de ajuste no Financeiro, que e visivel e auditavel.
--
--   JA CANCELADO. Idempotencia honesta: a segunda chamada RECUSA com a data do
--   primeiro estorno em vez de devolver "ok" calado. Aqui silencio seria pior
--   que erro: o operador acharia que desfez duas coisas.
--
--   PERNA CONCILIADA com o extrato bancario. Mesma regra que
--   _guard_reconciled_transaction_delete aplica no DELETE, e pela mesma razao:
--   cancelar lancamento amarrado a linha de extrato deixa a conciliacao
--   apontando pra linha morta. A conciliacao se desfaz primeiro, na tela dela.
CREATE OR REPLACE FUNCTION public.pdv_revert_cash_movement(
  p_movement_id uuid,
  p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_company    uuid;
  v_session_id uuid;
  v_mov        public.pdv_cash_movements;
  v_session    public.pdv_cash_sessions;
  v_terminal   text;
  v_reason     text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_label      text;
  v_pair       uuid;
  v_antes      numeric;
  v_depois     numeric;
  v_txs        jsonb := '[]'::jsonb;
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

  -- Primeira leitura serve SO pra descobrir a sessao e poder tomar o lock.
  -- Mensagem unica pra movimento inexistente e pra movimento de outra empresa:
  -- distinguir os dois casos transformaria a RPC em oraculo de existencia.
  SELECT m.session_id INTO v_session_id
    FROM public.pdv_cash_movements m
   WHERE m.id = p_movement_id
     AND m.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento de caixa não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-cash-session:' || v_session_id::text, 0));

  -- Rele DEPOIS do lock, com FOR UPDATE. Duas chamadas simultaneas pro mesmo
  -- movimento (duplo clique, retry de rede) e exatamente o caso que o lock
  -- existe pra resolver: a segunda tem que ver o cancelled_at que a primeira
  -- gravou, e nao o estado de antes.
  SELECT * INTO v_mov
    FROM public.pdv_cash_movements m
   WHERE m.id = p_movement_id
     AND m.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento de caixa não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_session
    FROM public.pdv_cash_sessions s
   WHERE s.id = v_mov.session_id
     AND s.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'aberta' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado%. Sangria e suprimento só podem ser desfeitos com o caixa aberto: depois do fechamento, use um lançamento de ajuste no Financeiro.',
      COALESCE(' em ' || to_char(v_session.closed_at, 'DD/MM/YYYY HH24:MI'), '')
      USING ERRCODE = '42501';
  END IF;

  IF v_mov.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este movimento já foi desfeito em %.', to_char(v_mov.cancelled_at, 'DD/MM/YYYY HH24:MI')
      USING ERRCODE = '42501';
  END IF;

  SELECT t.name INTO v_terminal FROM public.pdv_terminals t WHERE t.id = v_session.terminal_id;

  -- Esperado da gaveta ANTES, com o movimento ainda contando. Mesma formula de
  -- pdv_close_cash_session, ja com o filtro de cancelado (que neste momento
  -- ainda nao exclui este movimento).
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
    INTO v_antes;

  v_label := 'Estorno da ' || CASE v_mov.kind WHEN 'sangria' THEN 'sangria' ELSE 'suprimento' END
             || ' do caixa ' || COALESCE(v_terminal, 'PDV')
             || COALESCE(': ' || v_reason, '');

  IF v_mov.financial_transaction_id IS NOT NULL THEN
    SELECT t.transfer_pair_id INTO v_pair
      FROM public.financial_transactions t
     WHERE t.id = v_mov.financial_transaction_id
       AND t.company_id = v_company;

    -- Conciliado nao se cancela por aqui. Mesma mensagem e mesma razao de
    -- _guard_reconciled_transaction_delete: a linha de extrato ficaria
    -- apontando pra lancamento morto.
    IF EXISTS (
      SELECT 1
        FROM public.financial_transactions t
        JOIN public.reconciliation_matches rm ON rm.financial_transaction_id = t.id
       WHERE t.company_id = v_company
         AND (
           t.id = v_mov.financial_transaction_id
           OR (v_pair IS NOT NULL AND t.transfer_pair_id = v_pair)
         )
    ) THEN
      RAISE EXCEPTION 'Esta % está conciliada com o extrato bancário. Desfaça a conciliação antes de desfazê-la.',
        CASE v_mov.kind WHEN 'sangria' THEN 'sangria' ELSE 'suprimento' END
        USING ERRCODE = 'P0001';
    END IF;

    IF v_pair IS NOT NULL THEN
      -- AS DUAS PERNAS, por transfer_pair_id.
      WITH upd AS (
        UPDATE public.financial_transactions t
           SET cancelled_at     = now(),
               cancelled_reason = v_label
         WHERE t.transfer_pair_id = v_pair
           AND t.company_id      = v_company
           AND t.cancelled_at IS NULL
        RETURNING t.id, t.account_id, t.transaction_type, t.amount
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'transaction_id',   u.id,
               'account_id',       u.account_id,
               'transaction_type', u.transaction_type,
               'amount',           round(u.amount, 2)
             ) ORDER BY u.id), '[]'::jsonb)
        INTO v_txs
        FROM upd u;
    ELSE
      -- Perna sem par (nao deveria existir: pdv_cash_movement sempre cria o
      -- par). Cancela a perna conhecida em vez de deixar passar calado.
      WITH upd AS (
        UPDATE public.financial_transactions t
           SET cancelled_at     = now(),
               cancelled_reason = v_label
         WHERE t.id         = v_mov.financial_transaction_id
           AND t.company_id = v_company
           AND t.cancelled_at IS NULL
        RETURNING t.id, t.account_id, t.transaction_type, t.amount
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'transaction_id',   u.id,
               'account_id',       u.account_id,
               'transaction_type', u.transaction_type,
               'amount',           round(u.amount, 2)
             ) ORDER BY u.id), '[]'::jsonb)
        INTO v_txs
        FROM upd u;
    END IF;
  END IF;

  UPDATE public.pdv_cash_movements m
     SET cancelled_at     = now(),
         cancelled_by     = v_uid,
         cancelled_reason = v_reason
   WHERE m.id         = v_mov.id
     AND m.company_id = v_company
     AND m.cancelled_at IS NULL
  RETURNING * INTO v_mov;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível desfazer este movimento. Recarregue a tela e tente de novo.' USING ERRCODE = '42501';
  END IF;

  -- Esperado DEPOIS, lido da tabela de novo. Prova que o filtro pegou.
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
    INTO v_depois;

  RETURN jsonb_build_object(
    'movement_id',              v_mov.id,
    'session_id',               v_session.id,
    'kind',                     v_mov.kind,
    'amount',                   round(v_mov.amount, 2),
    'to_account_id',            v_mov.to_account_id,
    'motivo',                   v_reason,
    'cancelado_em',             v_mov.cancelled_at,
    'cancelado_por',            v_mov.cancelled_by,
    'na_gaveta_antes',          round(v_antes, 2),
    'na_gaveta_depois',         round(v_depois, 2),
    'transactions_revertidas',  v_txs
  );
END
$fn$;

COMMENT ON FUNCTION public.pdv_revert_cash_movement(uuid, text) IS
  'Desfaz sangria ou suprimento marcando cancelled_at (NUNCA DELETE: pdv_cash_movements é livro-razão de dinheiro, append-only no privilégio, e cancelled_at é o marcador canônico de estorno da casa). Cancela AS DUAS pernas do par em financial_transactions por transfer_pair_id; movimento sem conta não tem lançamento a tocar. Movimento cancelado sai da conta do esperado da gaveta (pdv_close_cash_session e pdv_cash_movement filtram cancelled_at). Recusa com mensagem: caixa já fechado, movimento já desfeito, e perna conciliada com o extrato bancário. Devolve o esperado da gaveta antes e depois, lido da tabela nas duas vezes.';

REVOKE ALL ON FUNCTION public.pdv_revert_cash_movement(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_revert_cash_movement(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_revert_cash_movement(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_revert_cash_movement(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) A migration CONFERE A PROPRIA ACL antes de comitar
-- ---------------------------------------------------------------------------
-- has_function_privilege e a fonte da verdade, NUNCA a leitura de proacl:
-- proacl nao mostra privilegio herdado de PUBLIC, e foi essa leitura errada
-- que deixou o oraculo cross-tenant de hoje de manha passar na revisao.
DO $acl$
DECLARE
  v_sig  text;
  v_oid  oid;
  v_sigs text[] := ARRAY[
    'public.pdv_revert_cash_movement(uuid,text)',
    'public.pdv_cash_movement(uuid,text,numeric,uuid,text)',
    'public.pdv_close_cash_session(uuid,numeric,text)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs
  LOOP
    v_oid := v_sig::regprocedure::oid;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: anon ainda tem EXECUTE em %. Revogue de PUBLIC (nao basta revogar de anon).', v_sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: authenticated precisa de EXECUTE em % e nao tem.', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: service_role precisa de EXECUTE em % e nao tem.', v_sig;
    END IF;
  END LOOP;

  RAISE NOTICE 'ACL conferida por has_function_privilege: 3 RPCs com authenticated + service_role, 0 com anon.';
END
$acl$;

-- ---------------------------------------------------------------------------
-- 6) E CONFERE QUE pdv_cash_movements SEGUE APPEND-ONLY PRO CLIENTE
-- ---------------------------------------------------------------------------
-- Desfazer passa pela RPC SECURITY DEFINER, NAO por UPDATE do cliente. Se
-- alguma migration futura abrir UPDATE ou DELETE nesta tabela pra
-- authenticated, a intencao deste modulo foi perdida e a migration estoura
-- aqui, no deploy, em vez de virar descoberta em producao.
DO $appendonly$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(g.privilege_type, ', ' ORDER BY g.privilege_type)
    INTO v_extra
    FROM information_schema.role_table_grants g
   WHERE g.table_schema = 'public'
     AND g.table_name   = 'pdv_cash_movements'
     AND g.grantee      = 'authenticated'
     AND g.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'pdv_cash_movements e livro-razao append-only: authenticated nao pode ter % nela. Desfazer e via pdv_revert_cash_movement.', v_extra;
  END IF;

  RAISE NOTICE 'pdv_cash_movements segue append-only pro cliente: authenticated tem SELECT e INSERT, nada mais.';
END
$appendonly$;

COMMIT;

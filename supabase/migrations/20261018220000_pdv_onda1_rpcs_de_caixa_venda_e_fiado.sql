-- PDV Onda 1, parte final: as RPCs que mexem em DINHEIRO e em SALDO DE ESTOQUE
--
-- Esta migration fecha a Onda 1 do modulo PDV. As tabelas ja existem
-- (20261018163000) e a trava de saldo de estoque tambem (20261018164000). Aqui
-- entram as 7 funcoes que a tela do Caixa chama, mais 3 ajudantes internos.
--
-- ===========================================================================
-- AS REGRAS DE NEGOCIO QUE ESTE ARQUIVO IMPLEMENTA (secoes 3, 4 e 5 do plano)
-- ===========================================================================
--
-- 1) O COFRE E UMA CONTA, A SESSAO DE CAIXA E UM CONFERIDOR.
--    O cofre e a conta financial_accounts apontada em
--    company_settings.pdv_cash_account_id. Abrir o caixa NAO TRANSFERE NADA: o
--    dinheiro continua inteiro na conta cofre. O que muda e a DISPONIBILIDADE:
--
--        reservado  = soma de opening_amount das sessoes com status 'aberta'
--        disponivel = saldo da conta cofre menos reservado
--
--    A reserva e DERIVADA, nunca materializada. Coluna de saldo materializado
--    ja defasou na EcoSistema e precisou de migration de recalculo; aqui o
--    numero e calculado na hora, sempre, e fechar o caixa devolve o valor ao
--    disponivel de graca, porque a sessao sai da soma.
--
-- 2) ABRIR CAIXA ACIMA DO DISPONIVEL E RECUSADO NO SERVIDOR.
--    Na EcoSistema essa trava vivia so no cliente, e um client bugado furava a
--    regra inserindo direto. Aqui a regra mora na RPC, com
--    pg_advisory_xact_lock por empresa tomado ANTES de calcular o disponivel:
--    sem o lock, duas aberturas simultaneas leem o mesmo disponivel e as duas
--    passam. O opt-out e company_settings.pdv_strict_cash_tracking (servidor,
--    nao localStorage, porque e regra de negocio e localStorage e burlavel).
--
-- 3) FECHAMENTO: ESPERADO E CONTA DE CONFERENCIA, NAO SALDO DE CONTA.
--        esperado = abertura + vendas em dinheiro + suprimentos menos sangrias
--    (venda em dinheiro credita a conta cofre direto, e o amount do pagamento
--     ja e o valor LIQUIDO aplicado ao pedido, entao troco nao entra na conta)
--    A diferenca entre contado e esperado vira financial_transactions de
--    ajuste na conta cofre, categoria "Quebra de caixa": sobra e entrada,
--    falta e saida. QUANDO O ESPERADO DA NEGATIVO, NAO SE LANCA AJUSTE
--    AUTOMATICO: esperado negativo e sintoma de dado faltando (sangria
--    registrada sem a venda correspondente), e lancar ajuste ali e inventar
--    ficcao contabil. Acerto aprendido na EcoSistema.
--
-- 4) VENDA: UMA TRANSACAO SO, IDEMPOTENTE POR client_request_id.
--    pdv_settle_order cria os financial_transactions, grava
--    pdv_order_payments, muda o status e (no modo simples) baixa o estoque,
--    tudo numa transacao. Chamar duas vezes com o mesmo client_request_id nao
--    duplica lancamento nem baixa estoque duas vezes: a segunda chamada
--    devolve o mesmo resumo com "idempotente": true.
--    PAGAMENTO MISTO E REGRA, NAO EXCECAO: p_payments e um array.
--        dinheiro                              credita a conta COFRE
--        pix, transferencia, debito, credito    creditam a conta escolhida
--        fiado                                  vai pro ledger do cliente
--        pontos                                 Onda 4, recusado com mensagem
--
-- 5) FIADO NAO E DINHEIRO RECEBIDO.
--    Gera financial_transactions A RECEBER (is_paid=false, com due_date) mais
--    linha 'venda_fiado' no customer_credit_ledger. Respeita
--    customers.credit_limit: acima do limite a venda e recusada; sem limite
--    definido a venda passa e volta um aviso pra tela. O ledger e append-only
--    no privilegio (authenticated nao tem UPDATE nem DELETE nele), entao
--    correcao e LINHA NOVA de kind 'ajuste', nunca UPDATE.
--
-- 6) ESTOQUE SO MUDA PELO KARDEX.
--    pdv_commit_order_stock chama register_inventory_movement item a item.
--    Nunca escreve saldo direto: alem de ser a lei do plano, a trava
--    guard_inventory_quantity_write (20261018164000) bloquearia, e com razao.
--    Idempotente por pdv_orders.stock_committed_at. Item de servico avulso tem
--    inventory_id nulo e nao move estoque nenhum.
--
-- 7) CANCELAMENTO ESTORNA AS DUAS PERNAS.
--    Estoque volta por movimento 'estorno' (o Kardex mostra a saida e o
--    estorno, historico preservado) e o financeiro e marcado com cancelled_at,
--    que e o marcador canonico de estorno da casa: a linha continua viva no
--    historico e sai do saldo e do DRE (ver FinanceDRE.tsx e
--    useFinancialAccounts.ts, que pulam cancelled_at). NUNCA DELETE: delete
--    perde historico e bate na trava de conciliacao bancaria.
--
-- 8) TODO LANCAMENTO NASCE COM origin = 'pdv'.
--    E o que permite o filtro "so a Loja" no DRE e nos relatorios (secao 7 do
--    plano). Dado tem que nascer classificado; backfill depois e chute.
--
-- ===========================================================================
-- SEGURANCA (a regua ficou mais cara hoje, 18/10/2026)
-- ===========================================================================
--
-- Nos mesmos publicamos um oraculo cross-tenant de manha, numa migration que
-- seguiu a regua antiga a risca. Entao, pra CADA funcao nova aqui:
--
--   a) REVOKE ALL ... FROM PUBLIC, anon, authenticated ANTES do GRANT.
--      "FROM anon" sozinho NAO basta: o "=X" de PUBLIC na proacl e o vetor, e
--      foi exatamente assim que o furo nasceu. O event trigger
--      tg_evt_funcao_nova_sem_public (20261018212000) ja revoga PUBLIC de
--      funcao nova, mas nao se confia nele cegamente (ele nao alcanca DDL de
--      script de extensao) e o REVOKE explicito deixa a INTENCAO escrita.
--   b) a conferencia de ACL no fim deste arquivo usa
--      has_function_privilege('anon', oid, 'EXECUTE'), nunca leitura de
--      proacl: proacl nao mostra privilegio herdado de PUBLIC.
--   c) SECURITY DEFINER ignora RLS por definicao, entao a checagem de empresa
--      vai DENTRO do corpo, contra get_user_company_id(auth.uid()), e NUNCA
--      contra parametro vindo do cliente. Nenhuma funcao daqui recebe
--      company_id, regclass ou nome de objeto por parametro (receber regclass
--      foi o que virou arma hoje de manha).
--   d) mensagem de erro NAO DISTINGUE "nao existe" de "e de outra empresa".
--      Mensagem unica, pra nao transformar a RPC em oraculo de existencia.
--   e) regra de integridade vai em RAISE EXCEPTION, nunca no USING de policy:
--      RLS negando DELETE no PostgREST devolve 204 com zero linhas e o usuario
--      ve "sucesso" sem ter acontecido nada.
--
-- ===========================================================================
-- O QUE E AJUDANTE INTERNO (sem EXECUTE pra authenticated)
-- ===========================================================================
--   pdv_fmt_brl(numeric)            formata valor em reais pra mensagem de erro
--   next_pdv_order_number(uuid)     consome o contador de numero de pedido
--   set_pdv_order_number()          trigger que preenche pdv_orders.number
--   pdv_cofre_snapshot(uuid)        saldo, reservado e disponivel do cofre
--
-- As quatro recebem ou leem company_id arbitrario, entao ficam com EXECUTE so
-- pra service_role. Quem chama de verdade sao as RPCs e o trigger, que sao
-- SECURITY DEFINER e pertencem a `postgres`: o OWNER tem EXECUTE implicito e
-- sobrevive aos REVOKEs. Mesmo raciocinio de next_project_code.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Duas colunas que faltavam pro cancelamento ser auditavel
-- ---------------------------------------------------------------------------
-- pdv_orders ja tinha cancelled_at, mas nao tinha onde guardar o MOTIVO nem
-- QUEM cancelou. Guardar o motivo em notes misturaria observacao de venda com
-- auditoria de estorno, e e exatamente o tipo de dado que o cliente pergunta
-- seis meses depois ("por que esse cupom foi cancelado?").
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pdv_orders.cancelled_reason IS
  'Motivo informado no cancelamento (pdv_cancel_order). Separado de notes de propósito: notes é observação da venda, isto é auditoria de estorno.';
COMMENT ON COLUMN public.pdv_orders.cancelled_by IS
  'Quem cancelou o pedido. ON DELETE SET NULL: excluir o usuário não apaga o pedido nem o histórico de cancelamento.';

-- ---------------------------------------------------------------------------
-- 2) public.pdv_fmt_brl : valor em reais dentro da mensagem de erro
-- ---------------------------------------------------------------------------
-- "Disponivel no cofre: R$ 1.234,56" exige separador BR. to_char com os
-- simbolos G e D depende de lc_numeric do servidor (medido aqui: en_US.UTF-8,
-- entao G=',' e D='.'), e um dia alguem muda esse parametro e as mensagens de
-- dinheiro do PDV ficam erradas sem ninguem notar. O agrupamento aqui e feito
-- a mao justamente pra NAO depender de locale.
CREATE OR REPLACE FUNCTION public.pdv_fmt_brl(p_value numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_abs   numeric := round(abs(COALESCE(p_value, 0)), 2);
  v_int   text;
  v_cents text;
  v_out   text := '';
  v_i     integer;
BEGIN
  v_int   := trunc(v_abs)::text;
  v_cents := lpad((round((v_abs - trunc(v_abs)) * 100))::text, 2, '0');

  v_i := length(v_int);
  WHILE v_i > 3 LOOP
    v_out := '.' || substr(v_int, v_i - 2, 3) || v_out;
    v_i   := v_i - 3;
  END LOOP;
  v_out := substr(v_int, 1, v_i) || v_out;

  RETURN 'R$ '
      || CASE WHEN COALESCE(p_value, 0) < 0 THEN '-' ELSE '' END
      || v_out || ',' || v_cents;
END
$fn$;

COMMENT ON FUNCTION public.pdv_fmt_brl(numeric) IS
  'Formata valor em reais (R$ 1.234,56) para mensagem de erro em PT-BR. Agrupamento feito à mão, sem to_char com G/D, pra não depender de lc_numeric do servidor.';

REVOKE ALL ON FUNCTION public.pdv_fmt_brl(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_fmt_brl(numeric) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_fmt_brl(numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_fmt_brl(numeric) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Numero do pedido : contador por empresa, preenchido por trigger
-- ---------------------------------------------------------------------------
-- A tabela pdv_order_number_counters nasceu em 20261018163000 e a funcao que a
-- consome ficou explicitamente pra este despacho ("a funcao que consome o
-- contador vem no despacho das RPCs"). Sem ela, NENHUM pedido pode ser
-- inserido: number e NOT NULL sem default.
--
-- NAO e sequence global (buraco na sequencia vaza o volume de operacao do
-- vizinho, e cada loja comeca no pedido 1 na casa dela) e NAO e MAX+1 (duas
-- vendas simultaneas leriam o mesmo MAX). Upsert atomico, igual
-- next_project_code.
CREATE OR REPLACE FUNCTION public.next_pdv_order_number(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_consumed integer;
BEGIN
  -- No primeiro pedido da empresa a linha nasce com next_value=2 e o RETURNING
  -- ve a linha final, logo 2-1 = 1 = numero consumido. Em conflito, o DO UPDATE
  -- soma 1 e (next_value)-1 e exatamente o valor antigo = o numero consumido.
  INSERT INTO public.pdv_order_number_counters AS c (company_id, next_value)
  VALUES (p_company_id, 2)
  ON CONFLICT (company_id) DO UPDATE SET next_value = c.next_value + 1
  RETURNING (c.next_value - 1)
  INTO v_consumed;

  RETURN v_consumed;
END
$fn$;

COMMENT ON FUNCTION public.next_pdv_order_number(uuid) IS
  'Consome o próximo número de pedido do PDV da empresa (atômico, sem corrida). INTERNA: sem EXECUTE pra authenticated porque recebe company_id arbitrário e um usuário poderia avançar o contador de outro tenant. Chamada só pelo trigger tg_set_pdv_order_number.';

REVOKE ALL ON FUNCTION public.next_pdv_order_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_pdv_order_number(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.next_pdv_order_number(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_pdv_order_number(uuid) TO service_role;

-- Respeita um number que o chamador tenha informado (importacao de dado legado
-- pode querer preservar a numeracao antiga); so gera quando vem NULL.
--
-- O nome tg_set_... garante que roda DEPOIS de tg_set_company_id_pdv_orders
-- (o Postgres dispara por ordem alfabetica dentro do mesmo evento, e
-- "tg_set_c" < "tg_set_p"), entao company_id ja esta preenchido aqui. E roda
-- ANTES de tg_zz_tenant_refs_pdv_orders, que valida as FKs.
CREATE OR REPLACE FUNCTION public.set_pdv_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.number IS NULL AND NEW.company_id IS NOT NULL THEN
    NEW.number := public.next_pdv_order_number(NEW.company_id);
  END IF;
  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.set_pdv_order_number() IS
  'Preenche pdv_orders.number com o próximo sequencial da empresa quando o INSERT vem sem número. O client NUNCA calcula número de pedido. Precedente: trg_set_project_code / projects.code (o hook omite a coluna do payload com cast).';

REVOKE ALL ON FUNCTION public.set_pdv_order_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_pdv_order_number() FROM anon;
REVOKE ALL ON FUNCTION public.set_pdv_order_number() FROM authenticated;

DROP TRIGGER IF EXISTS tg_set_pdv_order_number ON public.pdv_orders;
CREATE TRIGGER tg_set_pdv_order_number
  BEFORE INSERT ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_pdv_order_number();

-- ---------------------------------------------------------------------------
-- 4) public.pdv_cofre_snapshot : saldo, reservado e disponivel (DERIVADOS)
-- ---------------------------------------------------------------------------
-- A formula do saldo e IDENTICA a de useFinancialAccounts.ts (balancesQuery):
--     initial_balance + entradas pagas - saidas pagas, ignorando canceladas
-- Divergir dali faria o numero da RPC brigar com o numero da tela, e quando
-- isso acontece com dinheiro ninguem confia em nenhum dos dois.
--
-- Conta de cartao nao entra aqui porque o cofre e sempre type='caixa'; se
-- alguem apontar um cartao como cofre, a validacao abaixo rejeita.
CREATE OR REPLACE FUNCTION public.pdv_cofre_snapshot(p_company_id uuid)
RETURNS TABLE (
  cash_account_id uuid,
  cash_account_name text,
  strict_tracking boolean,
  pdv_mode text,
  saldo_total numeric,
  reservado numeric,
  disponivel numeric,
  caixas_abertos integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_acc       uuid;
  v_acc_name  text;
  v_strict    boolean := true;
  v_mode      text    := 'simples';
  v_saldo     numeric := 0;
  v_reservado numeric := 0;
  v_abertos   integer := 0;
BEGIN
  SELECT cs.pdv_cash_account_id,
         COALESCE(cs.pdv_strict_cash_tracking, true),
         COALESCE(NULLIF(btrim(cs.pdv_mode), ''), 'simples')
    INTO v_acc, v_strict, v_mode
    FROM public.company_settings cs
   WHERE cs.company_id = p_company_id;

  IF NOT FOUND THEN
    v_strict := true;
    v_mode   := 'simples';
  END IF;

  -- Conta apontada em outra empresa ou inativa vale como NAO CONFIGURADA. Nao
  -- ha oraculo aqui: a funcao e interna e o chamador ja provou a empresa.
  IF v_acc IS NOT NULL THEN
    SELECT fa.name INTO v_acc_name
      FROM public.financial_accounts fa
     WHERE fa.id = v_acc
       AND fa.company_id = p_company_id
       AND fa.type <> 'cartao';
    IF NOT FOUND THEN
      v_acc := NULL;
    END IF;
  END IF;

  IF v_acc IS NOT NULL THEN
    SELECT fa.initial_balance
         + COALESCE((
             SELECT SUM(CASE WHEN t.transaction_type = 'entrada' THEN t.amount ELSE -t.amount END)
               FROM public.financial_transactions t
              WHERE t.account_id   = fa.id
                AND t.company_id   = p_company_id
                AND t.is_paid      IS TRUE
                AND t.cancelled_at IS NULL
           ), 0)
      INTO v_saldo
      FROM public.financial_accounts fa
     WHERE fa.id = v_acc;
  END IF;

  SELECT COALESCE(SUM(s.opening_amount), 0), COUNT(*)
    INTO v_reservado, v_abertos
    FROM public.pdv_cash_sessions s
   WHERE s.company_id = p_company_id
     AND s.status = 'aberta';

  RETURN QUERY SELECT
    v_acc,
    v_acc_name,
    v_strict,
    v_mode,
    COALESCE(v_saldo, 0),
    COALESCE(v_reservado, 0),
    COALESCE(v_saldo, 0) - COALESCE(v_reservado, 0),
    COALESCE(v_abertos, 0);
END
$fn$;

COMMENT ON FUNCTION public.pdv_cofre_snapshot(uuid) IS
  'Saldo do cofre, reservado pelas sessões abertas e disponível, todos DERIVADOS na hora (nunca materializados). A fórmula do saldo é idêntica à de useFinancialAccounts.ts pra o número da RPC não brigar com o da tela. INTERNA: recebe company_id arbitrário, EXECUTE só pra service_role.';

REVOKE ALL ON FUNCTION public.pdv_cofre_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_cofre_snapshot(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_cofre_snapshot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_cofre_snapshot(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) public.pdv_cofre_balance() : o que a tela do Caixa le
-- ---------------------------------------------------------------------------
-- Sem parametro NENHUM de proposito: a empresa vem de
-- get_user_company_id(auth.uid()). Uma versao que aceitasse p_company_id seria
-- um oraculo de saldo de outro tenant com uma linha de curl.
CREATE OR REPLACE FUNCTION public.pdv_cofre_balance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_snap    record;
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

  SELECT * INTO v_snap FROM public.pdv_cofre_snapshot(v_company);

  RETURN jsonb_build_object(
    'saldo_total',       round(v_snap.saldo_total, 2),
    'reservado',         round(v_snap.reservado, 2),
    'disponivel',        round(v_snap.disponivel, 2),
    'caixas_abertos',    v_snap.caixas_abertos,
    'conta_id',          v_snap.cash_account_id,
    'conta_nome',        v_snap.cash_account_name,
    'controle_estrito',  v_snap.strict_tracking
  );
END
$fn$;

COMMENT ON FUNCTION public.pdv_cofre_balance() IS
  'Saldo do cofre da empresa do usuário: { saldo_total, reservado, disponivel, caixas_abertos, conta_id, conta_nome, controle_estrito }. Reservado = soma de opening_amount das sessões abertas. SEM PARÂMETRO de propósito: aceitar p_company_id transformaria a RPC em oráculo de saldo cross-tenant.';

REVOKE ALL ON FUNCTION public.pdv_cofre_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_cofre_balance() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_cofre_balance() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_cofre_balance() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) public.pdv_open_cash_session : a trava da reserva do cofre
-- ---------------------------------------------------------------------------
-- O pg_advisory_xact_lock vem ANTES de calcular o disponivel, e isso nao e
-- detalhe de estilo: sem ele, duas aberturas simultaneas leem o mesmo
-- disponivel e as duas passam, cada uma reservando o mesmo dinheiro.
CREATE OR REPLACE FUNCTION public.pdv_open_cash_session(
  p_terminal_id    uuid,
  p_opening_amount numeric
)
RETURNS public.pdv_cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_company   uuid;
  v_terminal  record;
  v_snap      record;
  v_session   public.pdv_cash_sessions;
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

  IF p_opening_amount IS NULL OR p_opening_amount < 0 THEN
    RAISE EXCEPTION 'Informe um valor de abertura igual ou maior que zero.' USING ERRCODE = '22023';
  END IF;

  -- LOCK PRIMEIRO. Qualquer leitura de disponivel antes daqui e leitura suja
  -- do ponto de vista da corrida.
  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-cofre:' || v_company::text, 0));

  -- Mensagem UNICA pra inexistente e pra terminal de outra empresa: a RPC nao
  -- pode servir de oraculo de "esse id existe em algum tenant".
  SELECT t.id, t.name, t.is_active
    INTO v_terminal
    FROM public.pdv_terminals t
   WHERE t.id = p_terminal_id
     AND t.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terminal de caixa não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_terminal.is_active THEN
    RAISE EXCEPTION 'O terminal "%" está desativado. Ative ele em Configurações do PDV.', v_terminal.name
      USING ERRCODE = '42501';
  END IF;

  -- Cinto do indice unico parcial uniq_pdv_cash_sessions_aberta_por_terminal:
  -- o indice garante o invariante, isto garante a MENSAGEM.
  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions s
     WHERE s.terminal_id = p_terminal_id
       AND s.company_id  = v_company
       AND s.status      = 'aberta'
  ) THEN
    RAISE EXCEPTION 'O terminal "%" já tem um caixa aberto. Feche ele antes de abrir outro.', v_terminal.name
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_snap FROM public.pdv_cofre_snapshot(v_company);

  IF v_snap.strict_tracking THEN
    IF v_snap.cash_account_id IS NULL THEN
      RAISE EXCEPTION 'Escolha a conta do cofre em Configurações do PDV antes de abrir o caixa, ou desligue o controle estrito de dinheiro.'
        USING ERRCODE = '23502';
    END IF;

    IF p_opening_amount > v_snap.disponivel THEN
      RAISE EXCEPTION 'Disponível no cofre: %. Reduza o valor de abertura ou ajuste o saldo do cofre. (Saldo %, reservado % em % caixa(s) aberto(s).)',
        public.pdv_fmt_brl(v_snap.disponivel),
        public.pdv_fmt_brl(v_snap.saldo_total),
        public.pdv_fmt_brl(v_snap.reservado),
        v_snap.caixas_abertos
        USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.pdv_cash_sessions (
    company_id, terminal_id, opened_by, opening_amount, status
  ) VALUES (
    v_company, p_terminal_id, v_uid, p_opening_amount, 'aberta'
  )
  RETURNING * INTO v_session;

  RETURN v_session;
END
$fn$;

COMMENT ON FUNCTION public.pdv_open_cash_session(uuid, numeric) IS
  'Abre a sessão de caixa do terminal. NÃO move dinheiro: só RESERVA (reservado = soma de opening_amount das sessões abertas). Recusa abertura acima do disponível no cofre quando company_settings.pdv_strict_cash_tracking está ligado, com pg_advisory_xact_lock por empresa tomado ANTES de calcular o disponível (sem o lock, duas aberturas simultâneas leem o mesmo disponível e as duas passam).';

REVOKE ALL ON FUNCTION public.pdv_open_cash_session(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_open_cash_session(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_open_cash_session(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_open_cash_session(uuid, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) public.pdv_cash_movement : sangria e suprimento
-- ---------------------------------------------------------------------------
-- Sangria = dinheiro sai da gaveta. Suprimento = dinheiro entra.
--
-- Com p_to_account_id informado, o dinheiro MUDA DE CONTA de verdade e o
-- lancamento e um par de transferencia (mesmo transfer_pair_id, categoria
-- "Transferência entre contas"), exatamente como o transfer() de
-- useFinancialAccounts.ts. As duas pernas ficam fora do resultado do DRE por
-- transfer_pair_id, e isso esta certo: e movimento de BALANCO, nao receita nem
-- despesa. Dinheiro trocando de bolso dentro da mesma empresa nao e lucro.
--
-- Com p_to_account_id NULL, o dinheiro so trocou de lugar DENTRO do proprio
-- cofre (gaveta -> gavetao), entao nao existe lancamento financeiro: o saldo
-- da conta cofre nao muda. Muda so o ESPERADO da gaveta.
CREATE OR REPLACE FUNCTION public.pdv_cash_movement(
  p_session_id    uuid,
  p_kind          text,
  p_amount        numeric,
  p_to_account_id uuid,
  p_reason        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
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
$fn$;

COMMENT ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) IS
  'Sangria (dinheiro sai da gaveta) e suprimento (dinheiro entra). Com conta informada, gera PAR de transferência (mesmo transfer_pair_id, categoria Transferência entre contas), igual ao transfer() de useFinancialAccounts.ts: é movimento de balanço, não de resultado. Sem conta, não gera lançamento nenhum (o dinheiro não saiu do cofre), só muda o esperado da gaveta. Sangria acima do que há na gaveta é recusada quando o controle estrito está ligado.';

REVOKE ALL ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_cash_movement(uuid, text, numeric, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) public.pdv_close_cash_session : conferencia e quebra de caixa
-- ---------------------------------------------------------------------------
--     esperado = abertura + vendas em dinheiro + suprimentos - sangrias
--
-- Troco NAO entra na conta porque pdv_order_payments.amount ja e o valor
-- LIQUIDO aplicado ao pedido (o que o cliente entregou e amount +
-- change_amount). Descontar troco aqui contaria duas vezes.
--
-- ESPERADO NEGATIVO NAO GERA AJUSTE AUTOMATICO. Esperado negativo significa
-- que falta dado (sangria registrada sem a venda que a justifica, importacao
-- pela metade), e lancar "quebra de caixa" sobre base negativa e inventar
-- ficcao contabil que ninguem consegue explicar depois. A sessao fecha, a
-- diferenca fica registrada na propria sessao, e o aviso volta pra tela.
CREATE OR REPLACE FUNCTION public.pdv_close_cash_session(
  p_session_id     uuid,
  p_counted_amount numeric,
  p_notes          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
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
   WHERE m.session_id = v_session.id;

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
$fn$;

COMMENT ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) IS
  'Fecha a sessão de caixa. esperado = abertura + vendas em dinheiro + suprimentos - sangrias (troco não entra: pdv_order_payments.amount já é líquido). A diferença vira financial_transactions na conta cofre, categoria Quebra de caixa (sobra = entrada, falta = saída), origin=pdv. NÃO lança ajuste quando o esperado dá negativo: isso é sintoma de dado faltando, e ajuste sobre base negativa é ficção contábil (acerto aprendido na EcoSistema). Devolve o resumo do comprovante.';

REVOKE ALL ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_close_cash_session(uuid, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9) public.pdv_order_summary : o resumo do pedido, montado do que esta gravado
-- ---------------------------------------------------------------------------
-- Existe pra o caminho IDEMPOTENTE de pdv_settle_order devolver EXATAMENTE o
-- mesmo resumo da primeira chamada, lendo o que ficou gravado em vez de
-- remontar com os valores do payload (que podem ter vindo diferentes no retry).
--
-- INTERNA: recebe order_id arbitrario e nao tem como provar a empresa do
-- chamador sem recebe-la, entao nao ganha EXECUTE pra authenticated. Quem
-- chama ja validou a posse do pedido.
CREATE OR REPLACE FUNCTION public.pdv_order_summary(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order public.pdv_orders;
  v_pays  jsonb;
  v_items integer;
BEGIN
  SELECT * INTO v_order FROM public.pdv_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'payment_id',     pay.id,
           'method',         pay.method,
           'amount',         round(pay.amount, 2),
           'change_amount',  round(pay.change_amount, 2),
           'account_id',     pay.financial_account_id,
           'transaction_id', pay.financial_transaction_id,
           'received_at',    pay.received_at
         ) ORDER BY pay.received_at, pay.id), '[]'::jsonb)
    INTO v_pays
    FROM public.pdv_order_payments pay
   WHERE pay.order_id = p_order_id;

  SELECT COUNT(*) INTO v_items FROM public.pdv_order_items i WHERE i.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order_id',            v_order.id,
    'numero',              v_order.number,
    'status',              v_order.status,
    'cliente_id',          v_order.customer_id,
    'subtotal',            round(v_order.subtotal, 2),
    'desconto',            round(v_order.discount_amount, 2),
    'total',               round(v_order.total, 2),
    'itens',               v_items,
    'cash_session_id',     v_order.cash_session_id,
    'pago_em',             v_order.paid_at,
    'cancelado_em',        v_order.cancelled_at,
    'estoque_baixado_em',  v_order.stock_committed_at,
    'client_request_id',   v_order.client_request_id,
    'pagamentos',          v_pays
  );
END
$fn$;

COMMENT ON FUNCTION public.pdv_order_summary(uuid) IS
  'Resumo do pedido do PDV montado a partir do que está GRAVADO. Existe pra o caminho idempotente de pdv_settle_order devolver o mesmo resumo da primeira chamada em vez de remontar com o payload do retry. INTERNA: recebe order_id arbitrário, EXECUTE só pra service_role.';

REVOKE ALL ON FUNCTION public.pdv_order_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_order_summary(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_order_summary(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_order_summary(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 10) public.pdv_commit_order_stock : a baixa de estoque da venda
-- ---------------------------------------------------------------------------
-- NUNCA escreve saldo direto. Chama register_inventory_movement item a item,
-- que e o caminho unico de escrita de saldo da casa. Alem de ser a lei do
-- plano, a trava guard_inventory_quantity_write (20261018164000) bloquearia
-- qualquer UPDATE direto em inventory_stock_levels.quantity, e com razao.
--
-- IDEMPOTENTE por pdv_orders.stock_committed_at (mesma ideia do
-- committed_quantity do consumo de OS): preenchido, nao baixa de novo e devolve
-- "ja_baixado": true SEM erro. Chamar duas vezes e o caso NORMAL (retry de
-- rede, duplo clique), nao e abuso.
--
-- Item de servico avulso (inventory_id NULL: mao de obra de balcao, carga de
-- gas) NAO move estoque nenhum: nao tem produto no catalogo.
--
-- Saldo negativo NAO e erro (decisao do CEO, ja vigente no consumo de OS):
-- avisa em "avisos" e segue. Loja que vendeu antes de dar entrada na nota tem
-- que conseguir vender.
CREATE OR REPLACE FUNCTION public.pdv_commit_order_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_company  uuid;
  v_order    public.pdv_orders;
  v_stock    uuid;
  v_purpose  text;
  v_item     record;
  v_mov      public.inventory_movements;
  v_movs     jsonb := '[]'::jsonb;
  v_avisos   jsonb := '[]'::jsonb;
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

  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-order:' || p_order_id::text, 0));

  SELECT * INTO v_order
    FROM public.pdv_orders o
   WHERE o.id = p_order_id
     AND o.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.stock_committed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'order_id',    v_order.id,
      'numero',      v_order.number,
      'baixado',     false,
      'ja_baixado',  true,
      'baixado_em',  v_order.stock_committed_at,
      'movimentos',  '[]'::jsonb,
      'avisos',      '[]'::jsonb
    );
  END IF;

  IF v_order.status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido nº % está cancelado: o estoque dele não baixa.', v_order.number USING ERRCODE = '42501';
  END IF;
  IF v_order.status NOT IN ('pago', 'entregue') THEN
    RAISE EXCEPTION 'O estoque do pedido nº % só baixa depois que ele é pago.', v_order.number USING ERRCODE = '42501';
  END IF;

  -- Local de venda: o do pedido, senao o do terminal, senao o local padrao da
  -- empresa. Sem local, nao da pra baixar nada.
  v_stock := v_order.stock_id;
  IF v_stock IS NULL AND v_order.terminal_id IS NOT NULL THEN
    SELECT t.stock_id INTO v_stock
      FROM public.pdv_terminals t
     WHERE t.id = v_order.terminal_id AND t.company_id = v_company;
  END IF;
  IF v_stock IS NULL THEN
    SELECT s.id INTO v_stock
      FROM public.stocks s
     WHERE s.company_id = v_company AND s.customer_id IS NULL AND s.is_default
     LIMIT 1;
  END IF;
  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Escolha o local de estoque da venda: este pedido não tem local e o terminal também não.' USING ERRCODE = '23502';
  END IF;

  -- O local tem que ser da empresa. Vale como cinto: a trigger
  -- tg_zz_tenant_refs_pdv_orders ja barra pedido apontando local de outro
  -- tenant, mas o local pode ter vindo do terminal ou do padrao.
  SELECT s.purpose INTO v_purpose
    FROM public.stocks s
   WHERE s.id = v_stock AND s.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Local de estoque não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  -- O plano diz que o PDV vende de local purpose='pdv'. Isso AVISA em vez de
  -- recusar de proposito: na Onda 1 muitas empresas ainda nao converteram
  -- nenhum local pra Loja, e recusar travaria a primeira venda de todas elas.
  IF v_purpose IS DISTINCT FROM 'pdv' THEN
    v_avisos := v_avisos || jsonb_build_array('local_nao_e_de_loja');
  END IF;

  FOR v_item IN
    SELECT i.id, i.inventory_id, i.description, i.quantity, i.unit_cost
      FROM public.pdv_order_items i
     WHERE i.order_id = v_order.id
       AND i.inventory_id IS NOT NULL
     ORDER BY i.sort_order, i.id
  LOOP
    SELECT * INTO v_mov FROM public.register_inventory_movement(
      p_inventory_id        => v_item.inventory_id,
      p_movement_type       => 'saida',
      -- quantidade NEGATIVA: register_inventory_movement soma o que recebe.
      p_quantity            => -v_item.quantity,
      p_supplier_id         => NULL,
      p_unit_cost           => NULLIF(v_item.unit_cost, 0),
      p_notes               => 'Venda no PDV, pedido nº ' || v_order.number::text,
      p_service_order_id    => NULL,
      p_related_movement_id => NULL,
      p_stock_id            => v_stock
    );

    v_movs := v_movs || jsonb_build_array(jsonb_build_object(
      'item_id',      v_item.id,
      'inventory_id', v_item.inventory_id,
      'descricao',    v_item.description,
      'quantidade',   v_item.quantity,
      'movement_id',  v_mov.id,
      'stock_before', v_mov.stock_before,
      'stock_after',  v_mov.stock_after
    ));

    IF v_mov.stock_after < 0 THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
        'motivo',       'saldo_negativo',
        'inventory_id', v_item.inventory_id,
        'descricao',    v_item.description,
        'stock_after',  v_mov.stock_after
      ));
    END IF;
  END LOOP;

  UPDATE public.pdv_orders
     SET stock_committed_at = now(),
         stock_id           = COALESCE(stock_id, v_stock)
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'order_id',    v_order.id,
    'numero',      v_order.number,
    'baixado',     true,
    'ja_baixado',  false,
    'baixado_em',  v_order.stock_committed_at,
    'stock_id',    v_stock,
    'movimentos',  v_movs,
    'avisos',      v_avisos
  );
END
$fn$;

COMMENT ON FUNCTION public.pdv_commit_order_stock(uuid) IS
  'Baixa o estoque do pedido do PDV chamando register_inventory_movement item a item (NUNCA escreve saldo direto: a trava guard_inventory_quantity_write bloquearia). Idempotente por pdv_orders.stock_committed_at: a segunda chamada devolve ja_baixado=true sem erro. Item com inventory_id NULL (serviço avulso de balcão) não move estoque. Saldo negativo não é erro, volta em avisos.';

REVOKE ALL ON FUNCTION public.pdv_commit_order_stock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_commit_order_stock(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_commit_order_stock(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_commit_order_stock(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11) public.pdv_settle_order : a venda, numa transacao so
-- ---------------------------------------------------------------------------
-- Contrato de p_payments (array JSON, pagamento MISTO e o caso normal):
--   [
--     { "method": "dinheiro",   "amount": 50.00, "change_amount": 5.00 },
--     { "method": "pix",        "amount": 70.00, "account_id": "<uuid da conta>",
--       "tenant_charge_id": "<uuid, opcional, Pix por QR via Cobranças>" },
--     { "method": "fiado",      "amount": 30.00, "due_date": "2026-11-18" }
--   ]
--   method em dinheiro | pix | transferencia | debito | credito | fiado
--   . dinheiro ignora account_id do payload e vai SEMPRE pra conta cofre
--     (company_settings.pdv_cash_account_id). Deixar o cliente escolher a conta
--     do dinheiro seria deixar o cliente furar a conferencia da gaveta.
--   . pix / transferencia / debito / credito EXIGEM account_id, conta ativa da
--     propria empresa e que nao seja cartao de credito.
--   . fiado EXIGE cliente no pedido, respeita customers.credit_limit e NAO e
--     dinheiro recebido: gera financial_transactions a receber (is_paid=false,
--     com due_date, default hoje + 1 MES CALENDARIO) mais linha 'venda_fiado'
--     no customer_credit_ledger.
--   . pontos e Onda 4 e e recusado com mensagem, nunca ignorado em silencio.
--
-- IDEMPOTENCIA (p_client_request_id): chave gerada NO CLIENTE. Chamar duas
-- vezes com a mesma chave devolve o resumo da primeira chamada com
-- "idempotente": true, sem duplicar lancamento e sem baixar estoque de novo.
-- O indice unico parcial uniq_pdv_orders_company_client_request e o cinto.
--
-- O TOTAL E RECALCULADO NO SERVIDOR a partir da soma de pdv_order_items.total
-- antes de conferir os pagamentos. O total que o cliente mandou no pedido nao
-- e autoridade sobre quanto a venda vale: os ITENS sao.
CREATE OR REPLACE FUNCTION public.pdv_settle_order(
  p_order_id         uuid,
  p_payments         jsonb,
  p_client_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
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
      RETURN public.pdv_order_summary(v_order.id)
             || jsonb_build_object('idempotente', true, 'avisos', '[]'::jsonb);
    END IF;
    RAISE EXCEPTION 'O pedido nº % já foi finalizado.', v_order.number USING ERRCODE = '23505';
  END IF;

  IF v_order.status = 'cancelado' THEN
    RAISE EXCEPTION 'O pedido nº % foi cancelado e não pode ser finalizado.', v_order.number USING ERRCODE = '42501';
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
      v_due := COALESCE(NULLIF(v_pay->>'due_date', '')::date, (CURRENT_DATE + interval '1 month')::date);

      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount, category,
        transaction_date, due_date, is_paid, customer_id, origin,
        payment_method, created_by
      ) VALUES (
        v_company, 'entrada'::transaction_type,
        'Venda no fiado, pedido PDV nº ' || v_order.number::text,
        v_amount, 'Venda no fiado',
        CURRENT_DATE, v_due, false, v_order.customer_id, 'pdv',
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
        CURRENT_DATE, CURRENT_DATE, true, v_account, v_order.customer_id,
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
         paid_at = now()
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
              'idempotente', false,
              'modo',        COALESCE(v_snap.pdv_mode, 'simples'),
              'estoque',     v_stock_res,
              'avisos',      v_avisos
            );
END
$fn$;

COMMENT ON FUNCTION public.pdv_settle_order(uuid, jsonb, text) IS
  'Finaliza a venda do PDV numa transação só: recalcula o total pelos itens, valida as formas de pagamento, cria os financial_transactions (origin=pdv), grava pdv_order_payments, marca o pedido como pago e, no modo simples, baixa o estoque. Pagamento misto é regra. dinheiro vai pra conta cofre, pix/transferencia/debito/credito pra conta escolhida, fiado gera a receber (is_paid=false, vencimento default hoje + 1 mês calendário) mais linha no customer_credit_ledger respeitando customers.credit_limit. IDEMPOTENTE por p_client_request_id: a segunda chamada devolve o mesmo resumo com idempotente=true, sem duplicar lançamento nem baixar estoque de novo.';

REVOKE ALL ON FUNCTION public.pdv_settle_order(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_settle_order(uuid, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_settle_order(uuid, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_settle_order(uuid, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12) public.pdv_cancel_order : estorna estoque E financeiro
-- ---------------------------------------------------------------------------
-- As duas pernas numa transacao so (equivalente da
-- revert_consolidated_order_atomic da EcoSistema):
--
--   ESTOQUE   movimento 'estorno' de volta, item a item, pelo caminho unico
--             (register_inventory_movement). O Kardex passa a mostrar as DUAS
--             pernas, a saida da venda e o estorno do cancelamento, e e isso
--             que permite auditar depois. stock_committed_at volta pra NULL
--             porque a baixa deixou de existir.
--
--   FINANCEIRO  cancelled_at + cancelled_reason nos lancamentos da venda.
--             NUNCA DELETE: cancelled_at e o marcador canonico de estorno da
--             casa (FinanceDRE.tsx e useFinancialAccounts.ts pulam a linha
--             cancelada, entao saldo e DRE voltam ao que eram), a linha segue
--             viva no historico, e DELETE ainda bateria na trava de
--             conciliacao bancaria se o lancamento ja estivesse conciliado.
--
--   FIADO     o ledger e append-only, entao a correcao e LINHA NOVA de kind
--             'ajuste' com valor negativo, nunca UPDATE da linha original.
--
-- NAO e idempotente de proposito: pedido ja cancelado recusa com mensagem. Um
-- "cancelar de novo" silencioso esconderia duplo clique em cima de dinheiro.
CREATE OR REPLACE FUNCTION public.pdv_cancel_order(
  p_order_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_company  uuid;
  v_order    public.pdv_orders;
  v_reason   text;
  v_item     record;
  v_led      record;
  v_mov      public.inventory_movements;
  v_movs     jsonb := '[]'::jsonb;
  v_txs      jsonb := '[]'::jsonb;
  v_ledger   jsonb := '[]'::jsonb;
  v_tx_row   record;
  v_new_led  uuid;
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

  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-order:' || p_order_id::text, 0));

  SELECT * INTO v_order
    FROM public.pdv_orders o
   WHERE o.id = p_order_id
     AND o.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status = 'cancelado' THEN
    RAISE EXCEPTION 'O pedido nº % já está cancelado.', v_order.number USING ERRCODE = '42501';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');

  -- 1) Estoque de volta
  IF v_order.stock_committed_at IS NOT NULL THEN
    FOR v_item IN
      SELECT i.id, i.inventory_id, i.description, i.quantity, i.unit_cost
        FROM public.pdv_order_items i
       WHERE i.order_id = v_order.id
         AND i.inventory_id IS NOT NULL
       ORDER BY i.sort_order, i.id
    LOOP
      SELECT * INTO v_mov FROM public.register_inventory_movement(
        p_inventory_id        => v_item.inventory_id,
        p_movement_type       => 'estorno',
        -- quantidade POSITIVA: devolve ao saldo o que a venda tirou.
        p_quantity            => v_item.quantity,
        p_supplier_id         => NULL,
        -- mesmo custo da venda, pra devolucao valorizar igual a saida
        p_unit_cost           => NULLIF(v_item.unit_cost, 0),
        p_notes               => 'Cancelamento da venda no PDV, pedido nº ' || v_order.number::text
                                 || COALESCE(' (' || v_reason || ')', ''),
        p_service_order_id    => NULL,
        p_related_movement_id => NULL,
        p_stock_id            => v_order.stock_id
      );

      v_movs := v_movs || jsonb_build_array(jsonb_build_object(
        'item_id',      v_item.id,
        'inventory_id', v_item.inventory_id,
        'descricao',    v_item.description,
        'quantidade',   v_item.quantity,
        'movement_id',  v_mov.id,
        'stock_before', v_mov.stock_before,
        'stock_after',  v_mov.stock_after
      ));
    END LOOP;
  END IF;

  -- 2) Financeiro cancelado (linha viva, fora do saldo e do DRE)
  FOR v_tx_row IN
    SELECT pay.id AS payment_id, pay.method, pay.amount, pay.financial_transaction_id
      FROM public.pdv_order_payments pay
     WHERE pay.order_id = v_order.id
       AND pay.financial_transaction_id IS NOT NULL
     ORDER BY pay.received_at, pay.id
  LOOP
    UPDATE public.financial_transactions t
       SET cancelled_at     = now(),
           cancelled_reason = 'Cancelamento do pedido PDV nº ' || v_order.number::text
                              || COALESCE(': ' || v_reason, '')
     WHERE t.id = v_tx_row.financial_transaction_id
       AND t.company_id = v_company
       AND t.cancelled_at IS NULL;

    v_txs := v_txs || jsonb_build_array(jsonb_build_object(
      'payment_id',     v_tx_row.payment_id,
      'method',         v_tx_row.method,
      'amount',         round(v_tx_row.amount, 2),
      'transaction_id', v_tx_row.financial_transaction_id
    ));
  END LOOP;

  -- 3) Fiado: linha nova de ajuste, nunca UPDATE (ledger e append-only)
  FOR v_led IN
    SELECT l.id, l.customer_id, l.amount
      FROM public.customer_credit_ledger l
     WHERE l.order_id   = v_order.id
       AND l.company_id = v_company
       AND l.kind       = 'venda_fiado'
     ORDER BY l.created_at, l.id
  LOOP
    INSERT INTO public.customer_credit_ledger (
      company_id, customer_id, kind, amount, order_id, created_by, notes
    ) VALUES (
      v_company, v_led.customer_id, 'ajuste', -v_led.amount, v_order.id, v_uid,
      'Estorno por cancelamento do pedido PDV nº ' || v_order.number::text
        || COALESCE(': ' || v_reason, '')
    )
    RETURNING id INTO v_new_led;

    v_ledger := v_ledger || jsonb_build_array(jsonb_build_object(
      'estornou_ledger_id', v_led.id,
      'ajuste_ledger_id',   v_new_led,
      'amount',             round(-v_led.amount, 2)
    ));
  END LOOP;

  UPDATE public.pdv_orders
     SET status             = 'cancelado',
         cancelled_at       = now(),
         cancelled_by       = v_uid,
         cancelled_reason   = v_reason,
         stock_committed_at = NULL
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN public.pdv_order_summary(v_order.id)
         || jsonb_build_object(
              'cancelado',          true,
              'motivo',             v_reason,
              'estoque_estornado',  v_movs,
              'financeiro_cancelado', v_txs,
              'fiado_estornado',    v_ledger
            );
END
$fn$;

COMMENT ON FUNCTION public.pdv_cancel_order(uuid, text) IS
  'Cancela o pedido do PDV estornando as duas pernas numa transação só: estoque volta por movimento estorno (o Kardex mostra a saída e o estorno) e o financeiro recebe cancelled_at + cancelled_reason (marcador canônico de estorno da casa: a linha fica viva no histórico e sai do saldo e do DRE). Fiado é estornado com LINHA NOVA de kind ajuste, porque o ledger é append-only. Nunca DELETE. Pedido já cancelado é recusado com mensagem, de propósito.';

REVOKE ALL ON FUNCTION public.pdv_cancel_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_cancel_order(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_cancel_order(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_cancel_order(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13) A migration CONFERE A PROPRIA ACL antes de comitar
-- ---------------------------------------------------------------------------
-- has_function_privilege e a fonte da verdade, NUNCA a leitura de proacl:
-- proacl nao mostra privilegio herdado de PUBLIC, e foi exatamente essa leitura
-- errada que deixou o oraculo cross-tenant de hoje de manha passar na revisao.
--
-- Se qualquer uma das 11 funcoes deste arquivo sair com EXECUTE pra anon, ou se
-- alguma das 7 publicas sair SEM EXECUTE pra authenticated, a migration estoura
-- aqui e NADA e comitado. Falhar no deploy e muito mais barato que descobrir em
-- producao.
DO $acl$
DECLARE
  v_sig      text;
  v_oid      oid;
  v_publicas text[] := ARRAY[
    'public.pdv_cofre_balance()',
    'public.pdv_open_cash_session(uuid,numeric)',
    'public.pdv_close_cash_session(uuid,numeric,text)',
    'public.pdv_cash_movement(uuid,text,numeric,uuid,text)',
    'public.pdv_settle_order(uuid,jsonb,text)',
    'public.pdv_commit_order_stock(uuid)',
    'public.pdv_cancel_order(uuid,text)'
  ];
  v_internas text[] := ARRAY[
    'public.pdv_fmt_brl(numeric)',
    'public.next_pdv_order_number(uuid)',
    'public.set_pdv_order_number()',
    'public.pdv_cofre_snapshot(uuid)',
    'public.pdv_order_summary(uuid)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY (v_publicas || v_internas)
  LOOP
    v_oid := v_sig::regprocedure::oid;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: anon ainda tem EXECUTE em %. Revogue de PUBLIC (nao basta revogar de anon).', v_sig;
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY v_publicas
  LOOP
    v_oid := v_sig::regprocedure::oid;

    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: authenticated precisa de EXECUTE em % e nao tem.', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: service_role precisa de EXECUTE em % e nao tem.', v_sig;
    END IF;
  END LOOP;

  FOREACH v_sig IN ARRAY v_internas
  LOOP
    v_oid := v_sig::regprocedure::oid;

    IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'ACL: % e ajudante INTERNO e nao pode ter EXECUTE pra authenticated.', v_sig;
    END IF;
  END LOOP;

  RAISE NOTICE 'ACL conferida por has_function_privilege: 7 RPCs publicas (authenticated + service_role), 5 ajudantes internos (service_role), 0 com anon.';
END
$acl$;

COMMIT;

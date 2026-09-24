-- ============================================================================
-- Pagamento em lote de contas a pagar — AGRUPAR, nunca criar transacao-mae
-- ============================================================================
--
-- Objetivo: quitar N contas a pagar de uma vez e enxergar o resultado como UMA
-- linha do extrato bancario, sem perder o controle individual de cada titulo.
--
-- POR QUE NAO PORTAMOS O DESENHO DO ECOSISTEMA (`pay_financial_bills_batch`):
--   No EcoSistema, titulo (`financial_bills`) e lancamento
--   (`financial_transactions`) sao linhas SEPARADAS — dar baixa CRIA um
--   lancamento. Por isso la fazia sentido gravar 1 transacao-mae com o total.
--   No Dominex titulo e lancamento sao A MESMA LINHA: dar baixa so marca
--   `is_paid = true` + `paid_date`. E o saldo da conta bancaria e a soma das
--   linhas com `is_paid = true` (`useFinancialAccounts.ts` e o modulo puro
--   `src/lib/finance-balance.ts`). Criar uma mae paga com o total E marcar as N
--   filhas como pagas contaria o MESMO dinheiro duas vezes, em toda conta
--   bancaria de todo cliente, sem erro nenhum na tela.
--
-- DESENHO ADOTADO: o lote e um CARIMBO, nao um lancamento.
--   `payment_group_id` (uuid, nullable, indexado) marca as N linhas quitadas
--   juntas — mesmo padrao ja consagrado em `installment_group_id`. Quitar em
--   lote e um UPDATE nas N linhas; NENHUMA linha nova nasce.
--
--   Prova de que o saldo nao pode dobrar: o conjunto de linhas somadas pelo
--   saldo antes e depois do lote e EXATAMENTE o mesmo (as N contas). O lote so
--   muda o `is_paid` de false pra true — o mesmo efeito de quitar uma a uma, na
--   mesma ordem de grandeza. Como nao existe linha nova, nao existe parcela do
--   total contada duas vezes; e como o total exibido pro usuario e derivado
--   (soma das N linhas do grupo), ele nunca pode divergir do que o saldo usou.
--   Corolario: excluir UMA conta do lote depois nao deixa mae orfa com valor
--   inflado — o total do grupo simplesmente encolhe junto.
--
-- ESCOPO DESTA VERSAO: contas a PAGAR (`transaction_type = 'saida'`), quitacao
--   TOTAL, uma conta bancaria e uma data pro lote inteiro. Baixa parcial em
--   lote e "saldo de parceiro/fiado" ficam de fora (o segundo nem existe no
--   Dominex). Contas a receber ficam de fora POR ORA: o ponto de extensao e
--   unico e esta marcado com `[EXTENSAO: CONTAS A RECEBER]` mais abaixo — o
--   carimbo, o indice, o gatilho de consistencia e a RPC de desfazer ja servem
--   aos dois lados sem refatoracao.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) O carimbo do lote
-- ----------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS payment_group_id uuid;

COMMENT ON COLUMN public.financial_transactions.payment_group_id IS
  'Carimbo das linhas quitadas na MESMA operacao de pagamento em lote (mesma conta, mesma data, mesma forma). NAO existe transacao-mae: o total do lote e sempre derivado da soma das linhas com este id. NULL em linha quitada individualmente e em linha nao quitada.';

-- Indice parcial: a esmagadora maioria das linhas tem o carimbo NULL, e toda
-- leitura util filtra por um grupo especifico (expandir o lote no extrato,
-- desfazer o lote). Indexar so o que interessa mantem o indice pequeno.
CREATE INDEX IF NOT EXISTS financial_transactions_payment_group_idx
  ON public.financial_transactions (payment_group_id)
  WHERE payment_group_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2) Invariante do carimbo: grupo so existe em linha PAGA
-- ----------------------------------------------------------------------------
-- Sem isto, desfazer UMA conta pela tela normal (`updateTransaction` marca
-- `is_paid = false, paid_date = NULL`, sem saber que grupo existe) deixaria uma
-- linha nao paga carimbada — e o extrato mostraria um lote cujo total nao bate
-- com o dinheiro que saiu. O gatilho normaliza em vez de bloquear: nenhuma tela
-- existente quebra, e o grupo passa a significar exatamente "linhas que estao
-- pagas juntas".
CREATE OR REPLACE FUNCTION public._normalize_payment_group_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_group_id IS NOT NULL AND COALESCE(NEW.is_paid, false) = false THEN
    NEW.payment_group_id := NULL;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public._normalize_payment_group_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_payment_group_id ON public.financial_transactions;
CREATE TRIGGER normalize_payment_group_id
  BEFORE INSERT OR UPDATE OF is_paid, payment_group_id
  ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public._normalize_payment_group_id();


-- ----------------------------------------------------------------------------
-- 3) "Hoje" no fuso DA EMPRESA — a lei do `paid_date`, agora tambem em SQL
-- ----------------------------------------------------------------------------
-- `paid_date` define o MES da movimentacao no regime de Caixa. Baixa feita as
-- 21h30 do dia 31 com `toISOString()` gravava dia 1o do mes seguinte (UTC-3) e
-- jogava a despesa pro mes errado; empresa em Cuiaba (UTC-4) dando baixa as
-- 23h15 do dia 30 tem que gravar 30, nao 31. A regra ja vivia so no front
-- (`todayInTz` + `isPaidDateAllowedInTz`); uma RPC que decide data no servidor
-- PRECISA da mesma regra, senao reabre exatamente o bug que a trava de tela
-- fechou. E mes aqui e sempre mes CALENDARIO (o `::date` no fuso da empresa cai
-- no dia civil correto), nunca janela de 30 dias.
--
-- SECURITY INVOKER de proposito (nao DEFINER): a funcao recebe um company_id
-- arbitrario, e DEFINER a transformaria numa sonda que le configuracao de outro
-- tenant. Como INVOKER ela so enxerga o que a RLS ja permite ao chamador — e
-- quando e chamada de dentro de uma RPC SECURITY DEFINER (como as duas abaixo)
-- roda no contexto do definer e le normalmente.
CREATE OR REPLACE FUNCTION public.company_today(p_company_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT (now() AT TIME ZONE COALESCE(
    NULLIF((SELECT cs.timezone
              FROM public.company_settings cs
             WHERE cs.company_id = p_company_id
             ORDER BY cs.updated_at DESC
             LIMIT 1), ''),
    'America/Sao_Paulo'
  ))::date;
$function$;

COMMENT ON FUNCTION public.company_today(uuid) IS
  'Data civil de HOJE no fuso da empresa (company_settings.timezone, default America/Sao_Paulo). Espelho SQL de `todayInTz` do front. Use em qualquer RPC que grave paid_date/transaction_date: now()::date usa o fuso do servidor e erra o dia (e o MES) na virada.';

REVOKE ALL ON FUNCTION public.company_today(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_today(uuid) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4) Quitacao em lote
-- ----------------------------------------------------------------------------
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
  -- saida de caixa que nunca aconteceu.
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
  SELECT b.motivo, b.amostra
    INTO v_motivo, v_amostra
    FROM (
      SELECT q.motivo,
             left(string_agg(q.description, ', ' ORDER BY q.description), 180) AS amostra,
             count(*) AS n
        FROM (
          SELECT a.description,
                 CASE
                   -- [EXTENSAO: CONTAS A RECEBER] Este e o UNICO ponto que
                   -- amarra a RPC a contas a pagar. Estender = decidir o que
                   -- fazer com baixa parcial e tarifa de recebimento (que hoje
                   -- nascem como linha filha) e trocar este teste. O carimbo, o
                   -- indice, o gatilho e a RPC de desfazer nao mudam.
                   WHEN a.transaction_type <> 'saida'
                     THEN 'Nesta versão o pagamento em lote cobre apenas contas a pagar'
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
                   -- O gatilho `guard_linked_employee_vale_transaction` recusa
                   -- mexer em is_paid/paid_date de vale vinculado. Sem este
                   -- teste o lote morreria com a mensagem generica do gatilho.
                   WHEN a.payroll_kind = 'vale' AND EXISTS (
                     SELECT 1 FROM public.employee_movements em
                      WHERE em.financial_transaction_id = a.id
                   ) THEN 'Vale de funcionário é quitado pelo fluxo do RH'
                   -- Baixa parcial fica fora desta versao. O corte e pela
                   -- existencia da FILHA (fato estrutural), nunca por
                   -- `amount_received` sozinho — ha RPC que grava
                   -- `amount_received = amount` na quitacao total sem filha
                   -- nenhuma (achado Aldebaran).
                   WHEN EXISTS (
                     SELECT 1 FROM public.financial_transactions f
                      WHERE f.parent_transaction_id = a.id
                        AND f.category = 'Recebimento parcial'
                   ) THEN 'Conta com baixa parcial não entra em lote'
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

  -- --- A quitacao ----------------------------------------------------------
  -- NENHUM INSERT. So o `is_paid` das N linhas vira true. E o que garante que o
  -- saldo nao pode dobrar: o universo somado continua sendo o mesmo.
  --
  -- `transaction_date` NAO e tocado de proposito: e ele que define o mes do
  -- titulo no regime de Competencia. O lote muda QUANDO o dinheiro saiu
  -- (`paid_date`, regime de Caixa), nunca o mes de competencia de cada conta.
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
  'Quita N contas a pagar como UM evento (mesmo payment_group_id, mesma conta, mesma data, mesma forma). Nao cria lancamento nenhum: so marca as N linhas como pagas — por isso o saldo nao pode dobrar. Tudo ou nada. p_group_id opcional deixa o retry idempotente. Valida empresa, permissao fn:manage_finance e data nao futura no fuso da empresa.';

REVOKE ALL ON FUNCTION public.pay_transactions_batch(uuid[], uuid, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_transactions_batch(uuid[], uuid, text, date, uuid) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5) Desfazer o lote inteiro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_payment_group(p_payment_group_id uuid)
RETURNS TABLE (
  payment_group_id  uuid,
  transaction_count integer,
  total_amount      numeric,
  already_undone    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
  v_can_manage boolean := false;
  v_ids        uuid[];
  v_count      integer;
  v_total      numeric;
  v_locked     integer;
  v_amostra    text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário não autenticado';
  END IF;

  IF p_payment_group_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Lote de pagamento não informado';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário sem empresa vinculada';
  END IF;

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

  -- Escopo por empresa ANTES de qualquer escrita. Grupo de outro tenant simples-
  -- mente nao existe daqui — e o retorno e o mesmo de "ja desfeito", entao nem
  -- serve de sonda pra descobrir se um uuid existe em outra empresa.
  SELECT array_agg(ft.id ORDER BY ft.id)
    INTO v_ids
    FROM public.financial_transactions ft
   WHERE ft.payment_group_id = p_payment_group_id
     AND ft.company_id = v_company_id;

  -- Retry de uma chamada que ja funcionou (rede caiu antes do ack) devolve
  -- sucesso silencioso em vez de erro — contrato de mutacao idempotente do PWA.
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN QUERY SELECT p_payment_group_id, 0, 0::numeric, true;
    RETURN;
  END IF;

  PERFORM 1
     FROM public.financial_transactions ft
    WHERE ft.id = ANY(v_ids)
    ORDER BY ft.id
      FOR UPDATE;
  GET DIAGNOSTICS v_locked = ROW_COUNT;

  IF v_locked <> cardinality(v_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'O lote mudou durante a operação. Tente de novo.';
  END IF;

  -- Mesma cortesia da quitacao: o gatilho do vale recusaria com mensagem
  -- generica. Na pratica nao deveria acontecer (vale nao entra em lote), mas um
  -- vinculo criado DEPOIS da quitacao cairia aqui.
  SELECT left(string_agg(ft.description, ', ' ORDER BY ft.description), 180)
    INTO v_amostra
    FROM public.financial_transactions ft
   WHERE ft.id = ANY(v_ids)
     AND ft.payroll_kind = 'vale'
     AND EXISTS (
       SELECT 1 FROM public.employee_movements em
        WHERE em.financial_transaction_id = ft.id
     );

  IF v_amostra IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Há vale de funcionário neste lote: desfaça pelo fluxo do RH',
      DETAIL  = 'Contas: ' || v_amostra;
  END IF;

  SELECT count(*), COALESCE(sum(ft.amount), 0)
    INTO v_count, v_total
    FROM public.financial_transactions ft
   WHERE ft.id = ANY(v_ids);

  -- Mesma semantica do desfazer individual que ja existe no app: volta
  -- `is_paid`/`paid_date` e solta o carimbo. `account_id` e `payment_method`
  -- ficam como estao — igual ao fluxo de uma conta so, que tambem nao restaura
  -- o valor anterior. Nao ha linha pra apagar, justamente porque nao houve
  -- linha criada.
  UPDATE public.financial_transactions ft
     SET is_paid          = false,
         paid_date        = NULL,
         payment_group_id = NULL,
         updated_at       = now()
   WHERE ft.id = ANY(v_ids);

  GET DIAGNOSTICS v_locked = ROW_COUNT;

  IF v_locked <> v_count THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'Falha ao desfazer o lote. Nenhuma conta foi alterada.';
  END IF;

  -- Filhas herdadas (tarifa, CMV) acompanham a mae, igual ao caminho de uma
  -- conta so em `updateTransaction`.
  UPDATE public.financial_transactions c
     SET is_paid   = false,
         paid_date = NULL,
         updated_at = now()
   WHERE c.parent_transaction_id = ANY(v_ids)
     AND c.company_id = v_company_id
     AND COALESCE(c.is_paid, false) = true;

  RETURN QUERY SELECT p_payment_group_id, v_count, v_total, false;
END
$function$;

COMMENT ON FUNCTION public.undo_payment_group(uuid) IS
  'Desfaz o lote inteiro: as N linhas voltam a pendente e perdem o carimbo. Escopado na empresa do chamador e exige fn:manage_finance. Grupo inexistente devolve already_undone = true (retry seguro), nunca erro.';

REVOKE ALL ON FUNCTION public.undo_payment_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_payment_group(uuid) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 6) Higiene de dados legados
-- ----------------------------------------------------------------------------
-- Idempotente e barato: coluna nasce NULL em tudo, entao nada a corrigir hoje.
-- O bloco existe pra deixar o numero registrado se a migration for reaplicada
-- depois de o recurso estar em uso (ex.: rollback parcial que deixou carimbo em
-- linha nao paga).
DO $$
DECLARE
  v_fixed integer := 0;
BEGIN
  UPDATE public.financial_transactions
     SET payment_group_id = NULL
   WHERE payment_group_id IS NOT NULL
     AND COALESCE(is_paid, false) = false;

  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  RAISE NOTICE 'pagamento_em_lote: % linha(s) tinham carimbo de lote sem estar pagas e foram normalizadas', v_fixed;
END $$;

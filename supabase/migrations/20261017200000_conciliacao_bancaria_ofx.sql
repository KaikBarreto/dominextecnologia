-- ============================================================================
-- Conciliação bancária com extrato .OFX — schema + RPCs (Dominex)
-- ============================================================================
--
-- Três tabelas novas: bank_statement_imports (o arquivo), bank_statement_entries
-- (as linhas, imutáveis) e reconciliation_matches (o vínculo linha↔lançamento).
-- Tudo o mais é RPC SECURITY DEFINER sobre o modelo financeiro que já existe.
--
-- ── INVARIANTES (quebrar qualquer uma destas é bug de dinheiro) ─────────────
--
-- 1. SINAL. O Dominex NÃO guarda valor com sinal: `financial_transactions.amount`
--    é SEMPRE positivo e a direção vive em `transaction_type` ('entrada'/'saida').
--    O OFX chega true-signed. Toda comparação passa por public.ft_signed_amount()
--    — função única. Inline de `CASE WHEN type='entrada' THEN amount ELSE -amount`
--    em cada CTE é proibido: são ~12 pontos de comparação e basta um invertido
--    pra conciliação casar receita com despesa.
--
-- 2. GUARDA DE ACESSO PELO PAPEL, NUNCA POR auth.uid() IS NULL. O papel `anon`
--    (qualquer visitante da internet com a chave publicável) também tem uid NULL.
--    No EcoSistema essa guarda entregou dado financeiro de 13 empresas pro anon,
--    comprovado com md5 idêntico ao do dono. Aqui o bypass de backend é detectado
--    pelo PAPEL (claim role=service_role) ou por sessão direta sem JWT que não é
--    o `authenticator` do PostgREST; uid NULL vira 42501.
--
-- 3. company_id NUNCA vem do client: sai de public.get_user_company_id(auth.uid())
--    ou é derivado da conta/linha. Toda RPC de escrita exige
--    tenant_subscription_allows_access() + company_plan_allows_product_area(...,
--    'finance'), porque RPC DEFINER não passa por RLS.
--
-- 4. CATEGORIA / CONTA / CENTRO DE CUSTO / CLIENTE / FORNECEDOR / FUNCIONÁRIO são
--    validados como pertencentes à empresa DENTRO da RPC. RLS não protege INSERT
--    feito por SECURITY DEFINER.
--
-- 5. DESPESA DE CARTÃO NÃO É PAGA INDIVIDUALMENTE. Tudo com
--    `credit_card_bill_date IS NOT NULL` está fora de candidato de baixa e de
--    match. Só a FATURA agregada é paga, e só via public.pay_credit_card_bill.
--    Oferecer baixa individual regride o bug histórico do "(1/6) sumindo".
--
-- 6. O FILTRO DE CANDIDATO DA UI É O MESMO DO MATCH, por construção: existe UMA
--    função que devolve o conjunto (_reconcile_match_candidates /
--    _reconcile_settle_candidates) e tanto get_bank_reconciliation_state quanto
--    reconcile_match_existing / reconcile_settle_transaction consultam ELA. Se a
--    UI sugerir o que o match recusa, o cliente clica e toma erro.
--
-- 6b. EXCLUIR LANÇAMENTO CONCILIADO É BARRADO em duas camadas: trigger BEFORE
--    DELETE (mensagem em PT-BR, imediata) + FK de reconciliation_matches
--    adiada (consistência garantida no COMMIT). A FK NÃO é RESTRICT de
--    propósito: RESTRICT é imediato e não-adiável, e quebraria
--    reset_system_step e o cascade de exclusão de empresa, que apagam
--    financial_transactions ANTES de chegar nestas tabelas.
--
-- 7. DESFAZER DESFAZ O EFEITO, não só o vínculo. Cada match guarda em
--    `undo_snapshot` o estado anterior das colunas que tocou. Quando não é
--    possível desfazer com segurança, a RPC RECUSA com mensagem em PT-BR em vez
--    de deixar meio-feito.
--
-- 8. DEDUP TEM DUAS TRAVAS. (a) UNIQUE (account_id, dedup_key);
--    (b) conteúdo occurrence-aware via bank_entry_content_key(), porque o
--    Santander reemite FITID novo a cada exportação — o dedup_key muda, não
--    colide, e reimportar janela sobreposta criaria cópias-fantasma eternamente
--    "pending sem casar". Nada é descartado em silêncio: o retorno traz
--    skipped_dup_count + amostras.
--
-- 9. SALDO. opening_balance = ledger_balance − Σ(effective_amount de TODAS as
--    entries do import). reconciled_balance = opening + Σ(effective_amount das
--    não-ignoradas). difference = ledger_balance − reconciled_balance. Inverter
--    sinal RECALCULA o opening (senão a diferença sai de zero sozinha e trava o
--    Finalizar). Finalizar exige difference ≈ 0 E pending_count = 0. Nunca
--    lançamento-tampão.
--
-- 10. DATA CIVIL sempre (posted_at AT TIME ZONE 'America/Sao_Paulo')::date.
--     `::date` cru lê UTC e joga pagamento noturno pro dia (e mês) seguinte.
--
-- ── O QUE ESTA MIGRATION DELIBERADAMENTE **NÃO** FAZ ───────────────────────
--
-- * Não cria destino "Ajuste / fora da DRE": adiado pro fluxo de caixa (decisão
--   do CEO, 17/10). A linha que não é receita nem despesa vai por "Criar
--   lançamento" com categoria própria, que o fluxo de caixa marca depois.
-- * Não reimplementa pagamento de fatura de cartão: chama pay_credit_card_bill.
-- * Não reimplementa vale: chama create_employee_vale (que é atômico, idempotente
--   e tem triggers próprios proibindo vale sem o par RH↔Financeiro).
-- * Não aceita 'bonus' como destino: bônus é crédito interno que só vira despesa
--   quando a folha é paga. Aceitar aqui criaria despesa fantasma.
-- * Não aceita pagamento de FOLHA: ver comentário em
--   reconcile_create_employee_movement. O caminho é pagar em Funcionários (que
--   também mexe no extrato do funcionário) e depois casar a linha com o
--   lançamento já realizado.
-- * Não importa extrato de conta `cartao`: conciliar fatura linha a linha é
--   exatamente a baixa individual de compra de cartão que a invariante 5 proíbe.
-- ============================================================================
--
-- NOTA DE TIMESTAMP (2026-10-18): esta migration nasceu como 20261017190000,
-- mas uma sessao paralela ja havia registrado esse timestamp em producao
-- (`employees_regime_pj_e_contratos`). Timestamp ocupado faz o `db push`
-- responder "up to date" e PULAR o arquivo pra sempre, em silencio. Por isso
-- foi renumerada pra 20261017200000, acima do maximo remoto (20261017192000).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ===========================================================================
-- 1. HELPERS PUROS
-- ===========================================================================

-- Sinal canônico de um lançamento do Dominex. UM lugar só, usado em todos os
-- pontos de comparação (invariante 1).
CREATE OR REPLACE FUNCTION public.ft_signed_amount(p_type text, p_amount numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
           WHEN p_type = 'entrada' THEN coalesce(p_amount, 0)
           ELSE -coalesce(p_amount, 0)
         END
$fn$;

COMMENT ON FUNCTION public.ft_signed_amount(text, numeric) IS
  'Valor COM SINAL de um financial_transactions (entrada = +amount, saida = -amount). IMMUTABLE. Fonte única de verdade de sinal da conciliação bancária: o Dominex guarda amount sempre positivo e a direção em transaction_type.';

-- Chave de conteúdo de uma linha de extrato (2ª trava de dedup, invariante 8).
-- IMMUTABLE de propósito: acento removido com translate(), NUNCA unaccent()
-- (que é STABLE porque depende de dicionário e não pode entrar em CTE/índice).
CREATE OR REPLACE FUNCTION public.bank_entry_content_key(
  p_posted_at timestamptz,
  p_amount    numeric,
  p_memo      text,
  p_name      text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  WITH src AS (
    SELECT
      (p_posted_at)::date AS d,
      to_char(round(coalesce(p_amount, 0), 2), 'FM999999999990.00') AS val,
      coalesce(nullif(btrim(p_name), ''), p_memo, '') AS raw_party
  ),
  cleaned AS (
    SELECT
      d, val,
      regexp_replace(
        lower(
          translate(
            regexp_replace(raw_party, '(\.\.\.|…)\s*$', '', 'g'),
            'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
            'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
          )
        ),
        '[^a-z0-9 ]', '', 'g'
      ) AS p0
    FROM src
  ),
  normalized AS (
    SELECT
      d, val,
      btrim(
        regexp_replace(
          regexp_replace(
            btrim(regexp_replace(p0, '\s+', ' ', 'g')),
            '^(pix enviado|pix recebido|pix|ted|doc|transferencia|transf)\s+',
            '', 'i'
          ),
          '\s+', ' ', 'g'
        )
      ) AS party
    FROM cleaned
  )
  SELECT md5(d::text || '|' || val || '|' || left(party, 24))
  FROM normalized
$fn$;

COMMENT ON FUNCTION public.bank_entry_content_key(timestamptz, numeric, text, text) IS
  'IMMUTABLE. Chave de conteúdo (data + valor com sinal + contraparte normalizada sem acento) de uma linha de extrato OFX. É a 2ª trava de dedup, occurrence-aware, de create_bank_statement_import: cobre banco que reemite FITID a cada exportação (Santander). Não usa unaccent (STABLE).';

-- ===========================================================================
-- 2. GUARDAS DE ACESSO
-- ===========================================================================

-- Invariante 2. Espelha a forma de public.tenant_subscription_allows_access /
-- company_plan_allows_product_area, que detectam backend por auth.role().
CREATE OR REPLACE FUNCTION public._reconcile_assert_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller_company uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: recurso sem empresa.' USING ERRCODE = '42501';
  END IF;

  -- Backend confiável bypassa, detectado pelo PAPEL:
  --   (a) JWT com claim role=service_role (edge function, worker). nullif(...,'')
  --       é obrigatório: a GUC pode estar setada como string vazia e ''::jsonb
  --       estoura com "invalid input syntax for type json".
  --   (b) conexão direta sem JWT nenhum (psql/cron/manutenção) cujo session_user
  --       NÃO é o `authenticator` do PostgREST. Tráfego da internet nunca cai
  --       aqui: PostgREST sempre conecta como authenticator e sempre carimba as
  --       claims.
  -- current_user NÃO serve: dentro de SECURITY DEFINER ele já é o dono da função.
  IF auth.role() = 'service_role'
     OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
     OR ( nullif(current_setting('request.jwt.claims', true), '') IS NULL
          AND session_user::text IN ('postgres', 'supabase_admin', 'service_role') )
  THEN
    RETURN;
  END IF;

  -- Sem sessão e sem ser backend = visitante anônimo. Barra.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  IF public.is_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  v_caller_company := public.get_user_company_id(auth.uid());

  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado: recurso de outra empresa.' USING ERRCODE = '42501';
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public._reconcile_assert_company(uuid) IS
  'Guarda de leitura das RPCs de conciliação bancária. Bypassa backend pelo PAPEL (claim role=service_role ou sessão direta sem JWT), NUNCA por auth.uid() IS NULL — o papel anon também tem uid NULL e foi exatamente assim que o EcoSistema vazou dado financeiro de 13 empresas.';

-- Gate de ESCRITA: tudo o que a guarda de leitura exige, mais entitlement de
-- assinatura e de área do plano. RPC DEFINER não passa por RLS, então o que as
-- policies de financial_transactions cobram tem que ser cobrado aqui à mão.
CREATE OR REPLACE FUNCTION public._reconcile_assert_write(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public._reconcile_assert_company(p_company_id);

  -- Backend segue liberado (as duas funções abaixo já bypassam service_role,
  -- mas em sessão direta sem JWT auth.role() é NULL e elas barrariam).
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.tenant_subscription_allows_access(p_company_id) THEN
    RAISE EXCEPTION 'Assinatura inativa ou vencida: a conciliação bancária está bloqueada.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.company_plan_allows_product_area(p_company_id, 'finance') THEN
    RAISE EXCEPTION 'O plano desta empresa não inclui o Financeiro.'
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public._reconcile_assert_write(uuid) IS
  'Gate de escrita das RPCs de conciliação bancária: _reconcile_assert_company + tenant_subscription_allows_access + company_plan_allows_product_area(finance). Existe porque RPC SECURITY DEFINER não passa por RLS e precisa cobrar à mão o que as policies de financial_transactions cobram.';

-- ===========================================================================
-- 3. TABELAS
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id          uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  file_name           text,
  file_hash           text NOT NULL,
  bank_id             text,
  acct_id             text,
  period_start        date,
  period_end          date,
  ledger_balance      numeric,
  ledger_balance_date date,
  opening_balance     numeric NOT NULL DEFAULT 0,
  entry_count         integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'open',
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  finalized_at        timestamptz,
  finalized_by        uuid REFERENCES auth.users(id),
  CONSTRAINT bank_statement_imports_status_chk CHECK (status IN ('open', 'finalized')),
  CONSTRAINT bank_statement_imports_file_uq UNIQUE (company_id, account_id, file_hash)
);

COMMENT ON TABLE public.bank_statement_imports IS
  'Um arquivo .OFX importado para uma conta financeira. O progresso da conciliação vive no banco, por isso a retomada sobrevive a reload e a troca de aba.';
COMMENT ON COLUMN public.bank_statement_imports.file_hash IS
  'Hash do arquivo. UNIQUE por (company_id, account_id): reimportar o mesmo arquivo devolve o import existente em vez de criar outro.';
COMMENT ON COLUMN public.bank_statement_imports.ledger_balance IS
  'Saldo final informado pelo banco no próprio arquivo (LEDGERBAL). É o lado "banco" da conferência.';
COMMENT ON COLUMN public.bank_statement_imports.opening_balance IS
  'DERIVADO: ledger_balance − Σ(effective_amount de todas as entries deste import). Recalculado a cada inversão de sinal, senão a diferença do rodapé sai de zero sozinha.';
COMMENT ON COLUMN public.bank_statement_imports.entry_count IS
  'Quantidade de linhas EFETIVAMENTE inseridas (pós-dedup). Contar o array cru inflaria a soma e o saldo conciliado nunca fecharia.';
COMMENT ON COLUMN public.bank_statement_imports.acct_id IS
  'ACCTID do arquivo. Serve de aviso quando um import novo da mesma conta vem com ACCTID diferente (arquivo da conta errada).';

CREATE TABLE IF NOT EXISTS public.bank_statement_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id       uuid NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  fitid           text,
  dedup_key       text NOT NULL,
  posted_at       timestamptz NOT NULL,
  amount          numeric NOT NULL,
  trn_type        text,
  memo            text,
  name            text,
  sign_suspect    boolean NOT NULL DEFAULT false,
  sign_flipped    boolean NOT NULL DEFAULT false,
  sign_flipped_at timestamptz,
  sign_flipped_by uuid REFERENCES auth.users(id),
  effective_amount numeric GENERATED ALWAYS AS
    (CASE WHEN sign_flipped THEN -amount ELSE amount END) STORED,
  status          text NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_statement_entries_status_chk CHECK (status IN ('pending', 'matched', 'ignored')),
  CONSTRAINT bank_statement_entries_dedup_uq UNIQUE (account_id, dedup_key)
);

COMMENT ON TABLE public.bank_statement_entries IS
  'Linha do extrato .OFX. amount/posted_at/dedup_key são IMUTÁVEIS (trigger): é o documento do banco. Correção de sinal é ato explícito do usuário e vive em sign_flipped, nunca sobrescrevendo o valor cru.';
COMMENT ON COLUMN public.bank_statement_entries.amount IS
  'Valor CRU do arquivo, true-signed, imutável. NUNCA é corrigido — é prova documental.';
COMMENT ON COLUMN public.bank_statement_entries.sign_suspect IS
  'O parser detectou divergência entre TRNTYPE e o sinal do valor (ex.: TRNTYPE=DEBIT com valor positivo). O parser NUNCA corrige sozinho, só marca.';
COMMENT ON COLUMN public.bank_statement_entries.sign_flipped IS
  'O usuário inverteu o sinal desta linha. Ato explícito, auditado (quem/quando) e reversível.';
COMMENT ON COLUMN public.bank_statement_entries.effective_amount IS
  'GERADO: é ESTE valor que todo o resto usa (saldo, candidatos, match). amount cru fica intacto.';

CREATE TABLE IF NOT EXISTS public.reconciliation_matches (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entry_id                  uuid NOT NULL UNIQUE
                              REFERENCES public.bank_statement_entries(id) ON DELETE CASCADE,
  -- ⚠️ NÃO é ON DELETE RESTRICT, e isso é DELIBERADO (ver bloco 5).
  -- RESTRICT é checado na hora e NÃO é adiável: ele quebraria em dois caminhos
  -- legítimos de limpeza em massa que apagam financial_transactions ANTES de
  -- chegarem nestas tabelas — reset_system_step('financial_movements') e o
  -- cascade de exclusão de empresa. NO ACTION DEFERRABLE INITIALLY DEFERRED dá
  -- a MESMA proteção no caminho do usuário (a violação estoura no COMMIT) e
  -- deixa a limpeza em massa passar, porque até o COMMIT o cascade de
  -- financial_accounts/companies já removeu os matches.
  financial_transaction_id  uuid NOT NULL
                              REFERENCES public.financial_transactions(id)
                              ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  match_type                text NOT NULL,
  transfer_pair_id          uuid,
  transfer_pair_created     boolean NOT NULL DEFAULT false,
  card_bill_id              uuid REFERENCES public.credit_card_bills(id)
                              ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  employee_movement_id      uuid,
  value_difference          numeric NOT NULL DEFAULT 0,
  confidence                text NOT NULL DEFAULT 'manual',
  undo_snapshot             jsonb,
  created_by                uuid REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_matches_type_chk CHECK (
    match_type IN ('existing', 'created', 'settled', 'transfer', 'card_bill', 'employee_vale')
  ),
  CONSTRAINT reconciliation_matches_confidence_chk CHECK (confidence IN ('auto', 'manual'))
);

COMMENT ON TABLE public.reconciliation_matches IS
  'Vínculo 1:1 entre uma linha do extrato e um financial_transactions. UNIQUE nas duas pontas: fecha a corrida de casar a mesma linha (ou o mesmo lançamento) duas vezes em duas abas.';
COMMENT ON COLUMN public.reconciliation_matches.match_type IS
  'existing = casou com lançamento já realizado; created = lançamento criado pela conciliação; settled = baixa de conta a pagar/receber; transfer = perna de transferência (criada ou reaproveitada); card_bill = pagamento de fatura de cartão via pay_credit_card_bill; employee_vale = vale criado via create_employee_vale. NÃO existe adjustment: o destino "Ajuste / fora da DRE" foi adiado pro fluxo de caixa.';
COMMENT ON COLUMN public.reconciliation_matches.transfer_pair_created IS
  'TRUE quando a conciliação CRIOU o par de transferência (desfazer apaga as duas pernas). FALSE quando reaproveitou uma perna que já existia (desfazer só remove o vínculo).';
COMMENT ON COLUMN public.reconciliation_matches.undo_snapshot IS
  'Estado anterior das colunas que o match alterou (ex.: is_paid/paid_date/account_id antes da baixa). Desfazer restaura daqui; sem snapshot, a RPC recusa em vez de deixar meio-feito.';
COMMENT ON COLUMN public.reconciliation_matches.value_difference IS
  'entry.effective_amount − signed(lançamento). 0 nos casamentos exatos; só a busca manual por termo gera ≠ 0 (janela de R$ 2,00). NÃO entra no cálculo da diferença do rodapé e NÃO bloqueia o Finalizar — é resumo auditável.';

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rm_financial_transaction
  ON public.reconciliation_matches (financial_transaction_id);

CREATE INDEX IF NOT EXISTS idx_bsi_account_status
  ON public.bank_statement_imports (account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bsi_company
  ON public.bank_statement_imports (company_id);
CREATE INDEX IF NOT EXISTS idx_bse_import
  ON public.bank_statement_entries (import_id);
CREATE INDEX IF NOT EXISTS idx_bse_account_status
  ON public.bank_statement_entries (account_id, status);
CREATE INDEX IF NOT EXISTS idx_bse_posted
  ON public.bank_statement_entries (posted_at);
CREATE INDEX IF NOT EXISTS idx_rm_company
  ON public.reconciliation_matches (company_id);
CREATE INDEX IF NOT EXISTS idx_rm_card_bill
  ON public.reconciliation_matches (card_bill_id) WHERE card_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rm_transfer_pair
  ON public.reconciliation_matches (transfer_pair_id) WHERE transfer_pair_id IS NOT NULL;

-- Índices PARCIAIS em financial_transactions desenhados para os dois conjuntos
-- de candidatos: get_bank_reconciliation_state chama cada um uma vez POR LINHA
-- do extrato (um extrato mensal tem centenas), e sem eles cada chamada varre a
-- tabela do tenant inteiro.
--   (a) contas em aberto do tenant (destino "dar baixa");
--   (b) movimentações já realizadas da conta (destino "casar").
-- O predicado repete EXATAMENTE as exclusões fixas das funções de candidatos.
CREATE INDEX IF NOT EXISTS idx_ft_reconcile_open
  ON public.financial_transactions (company_id, due_date, transaction_date)
  WHERE is_paid IS NOT TRUE
    AND cancelled_at IS NULL
    AND credit_card_bill_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_ft_reconcile_paid_by_account
  ON public.financial_transactions (account_id, paid_date, transaction_date)
  WHERE is_paid IS TRUE
    AND cancelled_at IS NULL
    AND credit_card_bill_date IS NULL;

-- ===========================================================================
-- 4. RLS — espelha EXATAMENTE o padrão de financial_transactions neste repo
--    (20261004213000: tenant + entitlement, super_admin como caminho paralelo,
--     DELETE com gate de permissão; toda função de auth embrulhada em
--     (SELECT ...) pra preservar InitPlan).
--    Regra definida por dev-plataforma-multitenant; aqui só o SQL.
-- ===========================================================================

ALTER TABLE public.bank_statement_imports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_matches  ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['bank_statement_imports', 'bank_statement_entries', 'reconciliation_matches']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_full_access_' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users view entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users insert entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users update entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Managers delete entitled own company ' || v_table, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Subscription plan allows finance on ' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$, 'service_role_full_access_' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
        USING (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
    $p$, 'Users view entitled own company ' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
    $p$, 'Users insert entitled own company ' || v_table, v_table);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
        WITH CHECK (
          (SELECT public.is_super_admin(auth.uid()))
          OR (
            company_id = (SELECT public.get_user_company_id(auth.uid()))
            AND public.tenant_subscription_allows_access(company_id)
          )
        )
    $p$, 'Users update entitled own company ' || v_table, v_table);

    -- DELETE com o MESMO gate de permissão de financial_transactions: apagar um
    -- import descarta conciliação, e apagar match/entry mexe em dinheiro.
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
        USING (
          (
            (SELECT public.is_super_admin(auth.uid()))
            OR (
              company_id = (SELECT public.get_user_company_id(auth.uid()))
              AND public.tenant_subscription_allows_access(company_id)
            )
          )
          AND (SELECT public.can_delete_finance(auth.uid()))
        )
    $p$, 'Managers delete entitled own company ' || v_table, v_table);

    -- RESTRICTIVE de área do plano, igual financial_transactions (plano EXCEÇÃO
    -- não tem Financeiro). Complementa, não abre acesso novo.
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
        USING (public.company_plan_allows_product_area(company_id, 'finance'))
        WITH CHECK (public.company_plan_allows_product_area(company_id, 'finance'))
    $p$, 'Subscription plan allows finance on ' || v_table, v_table);
  END LOOP;
END
$policies$;

-- ===========================================================================
-- 5. IMUTABILIDADE E GUARDAS DE EXCLUSÃO
-- ===========================================================================

-- A linha do extrato é documento do banco: só status e os campos de inversão
-- de sinal podem mudar.
CREATE OR REPLACE FUNCTION public._bank_statement_entry_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.import_id  IS DISTINCT FROM OLD.import_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.dedup_key  IS DISTINCT FROM OLD.dedup_key
     OR NEW.posted_at  IS DISTINCT FROM OLD.posted_at
     OR NEW.amount     IS DISTINCT FROM OLD.amount
     OR NEW.fitid      IS DISTINCT FROM OLD.fitid THEN
    RAISE EXCEPTION 'A linha do extrato é imutável: corrija o sinal (que é reversível e auditado) em vez de alterar o valor importado.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public._bank_statement_entry_immutable() IS
  'Impede UPDATE de valor/data/identidade de uma linha de extrato importada. Só status e os campos de inversão de sinal podem mudar.';

DROP TRIGGER IF EXISTS bank_statement_entry_immutable ON public.bank_statement_entries;
CREATE TRIGGER bank_statement_entry_immutable
  BEFORE UPDATE ON public.bank_statement_entries
  FOR EACH ROW
  EXECUTE FUNCTION public._bank_statement_entry_immutable();

-- Apagar entry/import conciliado apagaria o match por CASCADE e deixaria o
-- lançamento criado órfão (ou a baixa aplicada sem rastro). Exige desfazer antes.
CREATE OR REPLACE FUNCTION public._bank_statement_entry_block_matched_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Exclusão em CASCADE (conta financeira apagada, empresa apagada, extrato
  -- apagado) roda com pg_trigger_depth() > 1. Ali a intenção é limpar tudo e
  -- bloquear só faria a limpeza falhar pela metade. O guard protege o caminho
  -- do usuário, que é DELETE direto (depth = 1).
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.reconciliation_matches rm WHERE rm.entry_id = OLD.id) THEN
    RAISE EXCEPTION 'Esta linha do extrato está conciliada. Desfaça a conciliação antes de excluí-la.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS bank_statement_entry_block_matched_delete ON public.bank_statement_entries;
CREATE TRIGGER bank_statement_entry_block_matched_delete
  BEFORE DELETE ON public.bank_statement_entries
  FOR EACH ROW
  EXECUTE FUNCTION public._bank_statement_entry_block_matched_delete();

CREATE OR REPLACE FUNCTION public._bank_statement_import_block_matched_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_matched integer;
BEGIN
  -- Mesma razão do guard de entry: cascade (depth > 1) é limpeza intencional.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_matched
    FROM public.reconciliation_matches rm
    JOIN public.bank_statement_entries e ON e.id = rm.entry_id
   WHERE e.import_id = OLD.id;

  IF v_matched > 0 THEN
    RAISE EXCEPTION 'Este extrato tem % linha(s) conciliada(s). Desfaça a conciliação dessas linhas antes de excluir o extrato.', v_matched
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS bank_statement_import_block_matched_delete ON public.bank_statement_imports;
CREATE TRIGGER bank_statement_import_block_matched_delete
  BEFORE DELETE ON public.bank_statement_imports
  FOR EACH ROW
  EXECUTE FUNCTION public._bank_statement_import_block_matched_delete();

-- O outro lado: excluir o lançamento pela tela de Movimentações não pode apagar
-- o match em silêncio e deixar a linha 'matched' apontando pro nada. Duas
-- camadas: a FK adiada de reconciliation_matches (estrutura, confere no COMMIT)
-- e este trigger, que existe pela MENSAGEM em PT-BR — o 23503 da FK chega
-- ilegível na tela. Também cobre a perna IRMÃ de transferência: apagar a outra
-- ponta de um par conciliado quebraria o par pela metade, em silêncio.
CREATE OR REPLACE FUNCTION public._guard_reconciled_transaction_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- CAMINHO RÁPIDO (99,9% dos DELETEs do sistema): nada a proteger. Uma sondada
  -- no índice único de reconciliation_matches e sai. Este trigger roda em TODO
  -- DELETE de financial_transactions, inclusive em limpezas de milhares de
  -- linhas — ele não pode custar caro quando não há conciliação envolvida.
  IF OLD.transfer_pair_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.reconciliation_matches rm
        WHERE rm.financial_transaction_id = OLD.id
     )
  THEN
    RETURN OLD;
  END IF;

  -- (a) CASCADE (exclusão de empresa, de conta financeira): depth > 1. A
  --     intenção ali é apagar tudo, e o mesmo cascade também remove os
  --     matches — a FK adiada confere isso no COMMIT.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- (b) "Zerar sistema": reset_system_step apaga financial_transactions ANTES
  --     de financial_accounts (é o cascade de accounts que limpa extrato,
  --     linhas e matches), tudo na MESMA transação. Bloquear aqui travaria um
  --     comando que o próprio usuário pediu e que ficou auditado.
  --
  --     ⚠️ A JANELA NÃO É PROTEÇÃO DE INTEGRIDADE, e por isso é generosa.
  --     Quem garante a consistência é a FK adiada: se os matches sobrarem, o
  --     COMMIT estoura de qualquer forma. Esta válvula decide APENAS se o erro
  --     chega legível (trigger, PT-BR) ou cru (23503). Uma janela apertada não
  --     protege nada e introduz uma falha real: `reset_system_audit_start` roda
  --     numa chamada SEPARADA, antes das steps, e o front executa as steps em
  --     sequência — num tenant grande o reset pode levar mais que alguns
  --     minutos e quebraria NO MEIO, com metade do financeiro apagado. 6 horas
  --     cobre qualquer reset real com folga sem afrouxar nada.
  IF EXISTS (
    SELECT 1 FROM public.destructive_actions_audit a
     WHERE a.company_id  = OLD.company_id
       AND a.action_type = 'reset_system'
       AND a.created_at > now() - interval '6 hours'
  ) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reconciliation_matches rm
     WHERE rm.financial_transaction_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Este lançamento está conciliado com o extrato bancário. Desfaça a conciliação antes de excluí-lo.'
      USING ERRCODE = 'P0001';
  END IF;

  -- A perna IRMÃ de um par de transferência conciliado: apagar a outra ponta
  -- deixaria meia transferência no sistema e o saldo da outra conta errado
  -- pra sempre, sem erro nenhum na tela.
  IF OLD.transfer_pair_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.financial_transactions t
      JOIN public.reconciliation_matches rm ON rm.financial_transaction_id = t.id
     WHERE t.transfer_pair_id = OLD.transfer_pair_id
  ) THEN
    RAISE EXCEPTION 'Uma das pernas desta transferência está conciliada com o extrato bancário. Desfaça a conciliação antes de excluí-la.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$fn$;

COMMENT ON FUNCTION public._guard_reconciled_transaction_delete() IS
  'Recusa, com mensagem em PT-BR, DELETE de financial_transactions conciliado (ou da perna irmã de um par de transferência conciliado). A FK adiada de reconciliation_matches já barra no COMMIT; o trigger existe porque o 23503 chega ilegível na tela. Libera dois casos: cascade (pg_trigger_depth > 1, exclusão de empresa/conta) e janela de 6 h de "zerar sistema" auditado (generosa de propósito: a janela não protege integridade, só a legibilidade do erro — quem barra é a FK adiada no COMMIT) — nos dois a FK adiada continua garantindo consistência no COMMIT. reconcile_unmatch_entry apaga o match ANTES de excluir, então desfazer passa.';

DROP TRIGGER IF EXISTS guard_reconciled_transaction_delete ON public.financial_transactions;
CREATE TRIGGER guard_reconciled_transaction_delete
  BEFORE DELETE ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public._guard_reconciled_transaction_delete();

-- ===========================================================================
-- 6. CONJUNTOS DE CANDIDATOS — fonte ÚNICA (invariante 6)
--
--    Estas funções são INTERNAS e NÃO recebem grant pra authenticated/anon de
--    propósito: elas recebem p_entry_id e NÃO chamam a guarda de company, pra
--    poderem ser usadas dentro de LATERAL/EXISTS sem repetir a checagem 200x.
--    Quem chama é sempre uma RPC DEFINER que JÁ validou o tenant. Dar grant
--    aqui abriria sondagem de entry_id de outro tenant.
-- ===========================================================================

-- ATENCAO: `REVOKE ... FROM PUBLIC` NAO basta neste projeto. O Supabase mantem
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon`
-- (conferido em pg_default_acl, grantors postgres E supabase_admin), entao TODA
-- funcao nova nasce com um grant EXPLICITO `anon=X` no proacl — que o revoke de
-- PUBLIC nao remove. Sem o `FROM anon` abaixo, has_function_privilege('anon',...)
-- devolve true. Vale pra qualquer funcao nova em public, nao so pra estas duas.
REVOKE ALL ON FUNCTION public.ft_signed_amount(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ft_signed_amount(text, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bank_entry_content_key(timestamptz, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_entry_content_key(timestamptz, numeric, text, text) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- Candidatos para "casar com movimentação JÁ REALIZADA".
--   p_tolerance        0.01 no automático; 2.00 na busca manual COM termo.
--   p_date_window_days NULL = sem janela de data (busca manual); 3 = sugestão.
-- Sinal: exige MESMO SINAL sempre. Dentro de uma janela de R$ 2,00 cruzar
-- débito com crédito casaria receita com despesa — é o erro mais caro possível.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._reconcile_match_candidates(uuid, text, numeric, integer);

CREATE FUNCTION public._reconcile_match_candidates(
  p_entry_id         uuid,
  p_query            text    DEFAULT NULL,
  p_tolerance        numeric DEFAULT 0.01,
  p_date_window_days integer DEFAULT 3
)
RETURNS SETOF public.financial_transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH e AS (
    SELECT company_id, account_id, effective_amount,
           (posted_at AT TIME ZONE 'America/Sao_Paulo')::date AS posted_date
      FROM public.bank_statement_entries
     WHERE id = p_entry_id
  ),
  q AS (SELECT nullif(btrim(coalesce(p_query, '')), '') AS term)
  SELECT t.*
    FROM public.financial_transactions t
    CROSS JOIN e
    CROSS JOIN q
    LEFT JOIN public.customers cus ON cus.id = t.customer_id
    LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
    LEFT JOIN public.employees emp ON emp.id = t.employee_id
   WHERE t.company_id = e.company_id
     AND t.account_id = e.account_id
     AND t.is_paid IS TRUE
     AND t.cancelled_at IS NULL
     -- Compra de cartão não é caixa do banco: ela só sai da conta quando a
     -- FATURA é paga (invariante 5).
     AND t.credit_card_bill_date IS NULL
     -- Mãe de recebimento parcial não é linha de caixa: o dinheiro entrou nas
     -- filhas ('Recebimento parcial'), e são elas que batem com o extrato.
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_transactions c
        WHERE c.parent_transaction_id = t.id
          AND c.category = 'Recebimento parcial'
          AND c.transaction_type = 'entrada'
     )
     AND abs(public.ft_signed_amount(t.transaction_type::text, t.amount) - e.effective_amount)
         <= coalesce(p_tolerance, 0.01)
     AND sign(public.ft_signed_amount(t.transaction_type::text, t.amount)) = sign(e.effective_amount)
     AND NOT EXISTS (
       SELECT 1 FROM public.reconciliation_matches rm
        WHERE rm.financial_transaction_id = t.id
     )
     AND (
       p_date_window_days IS NULL
       OR coalesce(t.paid_date, t.transaction_date)
            BETWEEN e.posted_date - p_date_window_days AND e.posted_date + p_date_window_days
     )
     AND (
       q.term IS NULL
       OR t.description ILIKE '%' || q.term || '%'
       OR t.category    ILIKE '%' || q.term || '%'
       OR t.notes       ILIKE '%' || q.term || '%'
       OR cus.name      ILIKE '%' || q.term || '%'
       OR sup.name      ILIKE '%' || q.term || '%'
       OR emp.name      ILIKE '%' || q.term || '%'
     )
$fn$;

COMMENT ON FUNCTION public._reconcile_match_candidates(uuid, text, numeric, integer) IS
  'Conjunto ÚNICO de candidatos a match com lançamento já realizado. Mesma conta, is_paid, não cancelado, sem credit_card_bill_date, não conciliado, MESMO SINAL e valor dentro da tolerância; janela de data opcional. Consumida pela sugestão (get_bank_reconciliation_state), pela busca manual (reconcile_search_candidates) e pela validação (reconcile_match_existing) — por isso a UI nunca oferece o que o match recusa. INTERNA: sem grant pra authenticated, porque não valida tenant (quem chama já validou).';

-- --------------------------------------------------------------------------
-- Candidatos para "dar baixa em conta a pagar / a receber".
-- No Dominex conta em aberto é a MESMA financial_transactions com is_paid=false.
-- Sem janela de data de propósito: due_date de conta em aberto não tem relação
-- com o dia em que o dinheiro saiu.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._reconcile_settle_candidates(uuid, text, numeric);

CREATE FUNCTION public._reconcile_settle_candidates(
  p_entry_id  uuid,
  p_query     text    DEFAULT NULL,
  p_tolerance numeric DEFAULT 0.01
)
RETURNS SETOF public.financial_transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH e AS (
    SELECT company_id, account_id, effective_amount
      FROM public.bank_statement_entries
     WHERE id = p_entry_id
  ),
  q AS (SELECT nullif(btrim(coalesce(p_query, '')), '') AS term)
  SELECT t.*
    FROM public.financial_transactions t
    CROSS JOIN e
    CROSS JOIN q
    LEFT JOIN public.customers cus ON cus.id = t.customer_id
    LEFT JOIN public.suppliers sup ON sup.id = t.supplier_id
   WHERE t.company_id = e.company_id
     AND t.is_paid IS NOT TRUE
     AND t.cancelled_at IS NULL
     -- ⚠️ A EXCLUSÃO MAIS IMPORTANTE DESTA FUNÇÃO. Despesa de cartão NUNCA é
     -- paga individualmente: só a fatura agregada é. Oferecer baixa aqui
     -- regride o bug histórico da "parcela (1/6) sumindo".
     AND t.credit_card_bill_date IS NULL
     -- Folha/vale/rescisão têm fluxo próprio no RH (extrato do funcionário,
     -- desconto de vale, holerite). Dar baixa por aqui deixaria o lado RH
     -- pela metade, em silêncio. O caminho é pagar em Funcionários e depois
     -- casar a linha com o lançamento já realizado.
     AND t.payroll_kind IS NULL
     -- Perna de transferência nasce paga; se aparecer em aberto é dado torto.
     AND t.transfer_pair_id IS NULL
     -- Recebimento parcial em andamento: baixa total mentiria sobre o resto.
     AND coalesce(t.amount_received, 0) = 0
     AND abs(public.ft_signed_amount(t.transaction_type::text, t.amount) - e.effective_amount)
         <= coalesce(p_tolerance, 0.01)
     AND sign(public.ft_signed_amount(t.transaction_type::text, t.amount)) = sign(e.effective_amount)
     AND NOT EXISTS (
       SELECT 1 FROM public.reconciliation_matches rm
        WHERE rm.financial_transaction_id = t.id
     )
     AND (
       q.term IS NULL
       OR t.description ILIKE '%' || q.term || '%'
       OR t.category    ILIKE '%' || q.term || '%'
       OR t.notes       ILIKE '%' || q.term || '%'
       OR cus.name      ILIKE '%' || q.term || '%'
       OR sup.name      ILIKE '%' || q.term || '%'
     )
$fn$;

COMMENT ON FUNCTION public._reconcile_settle_candidates(uuid, text, numeric) IS
  'Conjunto ÚNICO de contas a pagar/receber em aberto casáveis com uma linha do extrato (is_paid=false na própria financial_transactions). Exclui credit_card_bill_date (despesa de cartão nunca é paga individualmente), payroll_kind (fluxo do RH), transfer_pair_id, cancelado, recebimento parcial em andamento e já conciliado. MESMO SINAL obrigatório. Sem janela de data. INTERNA: sem grant pra authenticated.';

-- --------------------------------------------------------------------------
-- Faturas de cartão pagáveis por uma linha de DÉBITO do extrato.
-- Total da fatura NÃO é coluna: é a soma das compras do cartão carimbadas com
-- aquele reference_month. MESMA definição de pay_credit_card_bill e do
-- useCreditCardBills — as três TÊM que bater.
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._reconcile_card_bill_candidates(uuid);

CREATE FUNCTION public._reconcile_card_bill_candidates(p_entry_id uuid)
RETURNS TABLE (
  id              uuid,
  account_id      uuid,
  account_name    text,
  reference_month date,
  closing_date    date,
  due_date        date,
  status          text,
  bill_total      numeric,
  amount_paid     numeric,
  remaining       numeric,
  is_closed       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH e AS (
    SELECT company_id, effective_amount
      FROM public.bank_statement_entries
     WHERE id = p_entry_id
  )
  SELECT
    b.id,
    b.account_id,
    ca.name,
    b.reference_month,
    b.closing_date,
    b.due_date,
    b.status,
    round(coalesce(tot.bill_total, 0), 2),
    round(coalesce(b.amount_paid, 0), 2),
    round(coalesce(tot.bill_total, 0) - coalesce(b.amount_paid, 0), 2),
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date >= b.closing_date)
  FROM public.credit_card_bills b
  CROSS JOIN e
  JOIN public.financial_accounts ca
    ON ca.id = b.account_id
   AND ca.company_id = e.company_id
   AND ca.type = 'cartao'
  LEFT JOIN LATERAL (
    SELECT coalesce(SUM(t.amount), 0) AS bill_total
      FROM public.financial_transactions t
     WHERE t.account_id = b.account_id
       AND t.transaction_type = 'saida'
       AND t.credit_card_bill_date = b.reference_month
  ) tot ON true
  WHERE b.company_id = e.company_id
    -- Só linha de DÉBITO paga fatura.
    AND e.effective_amount < 0
    AND coalesce(tot.bill_total, 0) - coalesce(b.amount_paid, 0) > 0.01
  ORDER BY b.due_date DESC
$fn$;

COMMENT ON FUNCTION public._reconcile_card_bill_candidates(uuid) IS
  'Faturas de cartão do tenant com saldo restante, para uma linha de DÉBITO do extrato. bill_total é a SOMA das compras do cartão com aquele reference_month — mesma definição de pay_credit_card_bill e do hook useCreditCardBills. is_closed segue a regra de produção: hoje em America/Sao_Paulo >= closing_date (o próprio dia do fechamento já libera o pagamento). INTERNA: sem grant pra authenticated.';

-- --------------------------------------------------------------------------
-- opening_balance é DERIVADO. Recalcular é o certo — e é o que devolve o saldo
-- inicial verdadeiro quando o arquivo veio com sinal errado (invariante 9).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._reconcile_recalc_opening(p_import_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_opening numeric;
BEGIN
  UPDATE public.bank_statement_imports i
     SET opening_balance = coalesce(i.ledger_balance, 0) - coalesce((
           SELECT SUM(e.effective_amount)
             FROM public.bank_statement_entries e
            WHERE e.import_id = i.id
         ), 0)
   WHERE i.id = p_import_id
  RETURNING i.opening_balance INTO v_opening;

  RETURN v_opening;
END;
$fn$;

COMMENT ON FUNCTION public._reconcile_recalc_opening(uuid) IS
  'Recalcula opening_balance = ledger_balance − Σ(effective_amount de TODAS as entries do import). Chamada na importação e a cada inversão de sinal: sem isso a diferença do rodapé sai de zero sozinha e trava o Finalizar.';

REVOKE ALL ON FUNCTION public._reconcile_match_candidates(uuid, text, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reconcile_settle_candidates(uuid, text, numeric)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reconcile_card_bill_candidates(uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reconcile_recalc_opening(uuid)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reconcile_assert_company(uuid)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._reconcile_assert_write(uuid)                                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._reconcile_assert_company(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._reconcile_assert_write(uuid)   TO authenticated, service_role;

-- ===========================================================================
-- 7. RPC — IMPORTAÇÃO
-- ===========================================================================

DROP FUNCTION IF EXISTS public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb);

CREATE FUNCTION public.create_bank_statement_import(
  p_account_id          uuid,
  p_file_name           text,
  p_file_hash           text,
  p_bank_id             text,
  p_acct_id             text,
  p_period_start        date,
  p_period_end          date,
  p_ledger_balance      numeric,
  p_ledger_balance_date date,
  p_entries             jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company_id      uuid;
  v_account         public.financial_accounts%ROWTYPE;
  v_existing        public.bank_statement_imports%ROWTYPE;
  v_import_id       uuid;
  v_inserted        integer := 0;
  v_total           integer;
  v_skipped_content integer := 0;
  v_skipped_samples jsonb   := '[]'::jsonb;
  v_opening         numeric;
  v_prev_acct       text;
  v_suspect         integer := 0;
  v_pending_existing integer := 0;
BEGIN
  SELECT * INTO v_account
    FROM public.financial_accounts
   WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta financeira não encontrada.' USING ERRCODE = '42501';
  END IF;

  v_company_id := v_account.company_id;
  PERFORM public._reconcile_assert_write(v_company_id);

  -- Conta de cartão fora: conciliar fatura linha a linha é exatamente a baixa
  -- individual de compra de cartão que a invariante 5 proíbe. O cartão entra
  -- por outro caminho (pagar a FATURA pela linha do extrato bancário).
  IF v_account.type = 'cartao' THEN
    RAISE EXCEPTION 'Não é possível importar extrato para uma conta de cartão de crédito. Importe o extrato da conta bancária e use o destino "Pagar fatura de cartão".'
      USING ERRCODE = '22023';
  END IF;

  IF v_account.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta conta está inativa. Reative a conta antes de importar o extrato.'
      USING ERRCODE = '22023';
  END IF;

  IF p_file_hash IS NULL OR btrim(p_file_hash) = '' THEN
    RAISE EXCEPTION 'O arquivo precisa de uma identificação (hash) para evitar importação duplicada.'
      USING ERRCODE = '22023';
  END IF;

  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'A lista de linhas do extrato é inválida.' USING ERRCODE = '22023';
  END IF;

  -- Mesmo arquivo, mesma conta: devolve o import que já existe em vez de
  -- estourar 23505 na cara do usuário. A UI decide (retomar se 'open', avisar
  -- se 'finalized').
  SELECT * INTO v_existing
    FROM public.bank_statement_imports
   WHERE company_id = v_company_id
     AND account_id = p_account_id
     AND file_hash  = p_file_hash;

  IF FOUND THEN
    SELECT count(*) FILTER (WHERE e.status = 'pending')
      INTO v_pending_existing
      FROM public.bank_statement_entries e
     WHERE e.import_id = v_existing.id;

    RETURN jsonb_build_object(
      'already_imported',  true,
      'import_id',         v_existing.id,
      'status',            v_existing.status,
      'file_name',         v_existing.file_name,
      'inserted_count',    0,
      'total_entries',     jsonb_array_length(p_entries),
      'skipped_count',     jsonb_array_length(p_entries),
      'skipped_dup_count', jsonb_array_length(p_entries),
      'skipped_samples',   '[]'::jsonb,
      'pending_count',     coalesce(v_pending_existing, 0),
      'opening_balance',   v_existing.opening_balance,
      'ledger_balance',    v_existing.ledger_balance,
      'acct_warning',      false,
      'acct_warning_previous', NULL,
      'sign_suspect_count',    0
    );
  END IF;

  v_total := jsonb_array_length(p_entries);

  -- Aviso (não bloqueia): import anterior desta conta tinha outro ACCTID →
  -- provavelmente é o arquivo da conta errada.
  SELECT i.acct_id INTO v_prev_acct
    FROM public.bank_statement_imports i
   WHERE i.account_id = p_account_id
     AND nullif(btrim(coalesce(i.acct_id, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(p_acct_id, '')), '') IS NOT NULL
     AND nullif(btrim(i.acct_id), '') <> nullif(btrim(p_acct_id), '')
   ORDER BY i.created_at DESC
   LIMIT 1;

  INSERT INTO public.bank_statement_imports (
    company_id, account_id, file_name, file_hash, bank_id, acct_id,
    period_start, period_end, ledger_balance, ledger_balance_date,
    opening_balance, entry_count, status, created_by
  ) VALUES (
    v_company_id, p_account_id, p_file_name, p_file_hash,
    nullif(btrim(coalesce(p_bank_id, '')), ''),
    nullif(btrim(coalesce(p_acct_id, '')), ''),
    p_period_start, p_period_end, p_ledger_balance, p_ledger_balance_date,
    0, 0, 'open', auth.uid()
  )
  RETURNING id INTO v_import_id;

  -- ── AS DUAS TRAVAS DE DEDUP (invariante 8) ──────────────────────────────
  -- incoming  : payload com content_key + ordem de chegada.
  -- ranked    : batch_rank = qual OCORRÊNCIA daquele conteúdo é esta linha
  --             DENTRO do arquivo (preserva 2 pagamentos legitimamente iguais
  --             no mesmo dia pro mesmo fornecedor).
  -- existing  : quantas linhas daquele mesmo conteúdo JÁ existem na conta
  --             (content_key calculado on-the-fly: sem coluna nova, sem
  --             backfill; import é raro e o scan por conta é barato).
  -- Insere só o que excede o que já existe. A 1ª trava (ON CONFLICT dedup_key)
  -- fica como rede de segurança.
  WITH incoming AS (
    SELECT
      ord.ord_num                                      AS ord_num,
      nullif(ord.e->>'fitid', '')                      AS fitid,
      ord.e->>'dedup_key'                              AS dedup_key,
      (ord.e->>'posted_at')::timestamptz               AS posted_at,
      (ord.e->>'amount')::numeric                      AS amount,
      nullif(ord.e->>'trn_type', '')                   AS trn_type,
      nullif(ord.e->>'memo', '')                       AS memo,
      nullif(ord.e->>'name', '')                       AS name,
      coalesce((ord.e->>'sign_suspect')::boolean, false) AS sign_suspect,
      public.bank_entry_content_key(
        (ord.e->>'posted_at')::timestamptz,
        (ord.e->>'amount')::numeric,
        ord.e->>'memo',
        ord.e->>'name'
      )                                                AS content_key
    FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS ord(e, ord_num)
    WHERE ord.e->>'dedup_key' IS NOT NULL
      AND ord.e->>'posted_at' IS NOT NULL
      AND ord.e->>'amount'    IS NOT NULL
  ),
  ranked AS (
    SELECT i.*, row_number() OVER (PARTITION BY i.content_key ORDER BY i.ord_num) AS batch_rank
      FROM incoming i
  ),
  existing AS (
    SELECT public.bank_entry_content_key(e.posted_at, e.amount, e.memo, e.name) AS content_key,
           count(*) AS cnt
      FROM public.bank_statement_entries e
     WHERE e.account_id = p_account_id
     GROUP BY 1
  ),
  to_consider AS (
    SELECT r.*, coalesce(x.cnt, 0) AS existing_cnt
      FROM ranked r
      LEFT JOIN existing x USING (content_key)
  ),
  ins AS (
    INSERT INTO public.bank_statement_entries (
      import_id, company_id, account_id, fitid, dedup_key,
      posted_at, amount, trn_type, memo, name, sign_suspect, status
    )
    SELECT v_import_id, v_company_id, p_account_id, t.fitid, t.dedup_key,
           t.posted_at, t.amount, t.trn_type, t.memo, t.name, t.sign_suspect, 'pending'
      FROM to_consider t
     WHERE t.batch_rank > t.existing_cnt
    ON CONFLICT (account_id, dedup_key) DO NOTHING
    RETURNING sign_suspect
  ),
  ins_agg AS (
    SELECT count(*) AS c, count(*) FILTER (WHERE sign_suspect) AS suspect FROM ins
  ),
  skipped AS (
    SELECT t.posted_at, t.amount, t.memo, t.name,
           row_number() OVER (ORDER BY t.posted_at, t.ord_num) AS rn
      FROM to_consider t
     WHERE t.batch_rank <= t.existing_cnt
  ),
  skipped_agg AS (
    SELECT count(*) AS c,
           coalesce(
             jsonb_agg(
               jsonb_build_object('posted_at', s.posted_at, 'amount', s.amount,
                                  'memo', s.memo, 'name', s.name)
               ORDER BY s.rn
             ) FILTER (WHERE s.rn <= 20),
             '[]'::jsonb
           ) AS samples
      FROM skipped s
  )
  SELECT ia.c, ia.suspect, sa.c, sa.samples
    INTO v_inserted, v_suspect, v_skipped_content, v_skipped_samples
    FROM ins_agg ia CROSS JOIN skipped_agg sa;

  UPDATE public.bank_statement_imports
     SET entry_count = coalesce(v_inserted, 0)
   WHERE id = v_import_id;

  v_opening := public._reconcile_recalc_opening(v_import_id);

  RETURN jsonb_build_object(
    'already_imported',      false,
    'import_id',             v_import_id,
    'status',                'open',
    'file_name',             p_file_name,
    'inserted_count',        coalesce(v_inserted, 0),
    'total_entries',         coalesce(v_total, 0),
    'skipped_count',         coalesce(v_total, 0) - coalesce(v_inserted, 0),
    'skipped_dup_count',     coalesce(v_skipped_content, 0),
    'skipped_samples',       coalesce(v_skipped_samples, '[]'::jsonb),
    'pending_count',         coalesce(v_inserted, 0),
    'opening_balance',       v_opening,
    'ledger_balance',        p_ledger_balance,
    'acct_warning',          v_prev_acct IS NOT NULL,
    'acct_warning_previous', v_prev_acct,
    'sign_suspect_count',    coalesce(v_suspect, 0)
  );
END;
$fn$;

COMMENT ON FUNCTION public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb) IS
  'Cria o import e as linhas do extrato .OFX com as DUAS travas de dedup (UNIQUE account_id+dedup_key e conteúdo occurrence-aware via bank_entry_content_key). Reimportar o mesmo arquivo devolve already_imported=true com o import existente, sem estourar. Nada é descartado em silêncio: skipped_dup_count + skipped_samples (até 20) voltam no payload. opening_balance é derivado das linhas efetivamente inseridas. Conta de cartão é recusada.';

-- ===========================================================================
-- 8. RPC — LISTAGEM DE IMPORTS (retomar / histórico)
-- ===========================================================================

DROP FUNCTION IF EXISTS public.get_statement_imports(uuid);

CREATE FUNCTION public.get_statement_imports(p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company_id uuid;
  v_result     jsonb;
BEGIN
  SELECT company_id INTO v_company_id
    FROM public.financial_accounts
   WHERE id = p_account_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Conta financeira não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_company_id);

  SELECT coalesce(jsonb_agg(row_json ORDER BY sort_open DESC, created_at DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT
      CASE WHEN i.status = 'open' THEN 1 ELSE 0 END AS sort_open,
      i.created_at,
      jsonb_build_object(
        'id',              i.id,
        'account_id',      i.account_id,
        'file_name',       i.file_name,
        'bank_id',         i.bank_id,
        'acct_id',         i.acct_id,
        'period_start',    i.period_start,
        'period_end',      i.period_end,
        'created_at',      i.created_at,
        'finalized_at',    i.finalized_at,
        'status',          i.status,
        'ledger_balance',  i.ledger_balance,
        'opening_balance', i.opening_balance,
        'total_entries',   coalesce(agg.total_entries, 0),
        'pending_count',   coalesce(agg.pending_count, 0),
        'matched_count',   coalesce(agg.matched_count, 0),
        'ignored_count',   coalesce(agg.ignored_count, 0),
        'difference',      round(
                             coalesce(i.ledger_balance, 0)
                             - (coalesce(i.opening_balance, 0) + coalesce(agg.reconciled_sum, 0))
                           , 2)
      ) AS row_json
    FROM public.bank_statement_imports i
    LEFT JOIN LATERAL (
      SELECT count(*)                                          AS total_entries,
             count(*) FILTER (WHERE e.status = 'pending')       AS pending_count,
             count(*) FILTER (WHERE e.status = 'matched')       AS matched_count,
             count(*) FILTER (WHERE e.status = 'ignored')       AS ignored_count,
             coalesce(SUM(e.effective_amount)
                      FILTER (WHERE e.status <> 'ignored'), 0)  AS reconciled_sum
        FROM public.bank_statement_entries e
       WHERE e.import_id = i.id
    ) agg ON true
    WHERE i.account_id = p_account_id
  ) sub;

  RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.get_statement_imports(uuid) IS
  'Lista os extratos importados de uma conta, com "open" primeiro (retomar) e "finalized" depois (histórico), cada um com total/pending/matched/ignored e a diferença atual. É isso que faz a retomada sobreviver a reload: o progresso vive no banco.';

-- ===========================================================================
-- 9. RPC — ESTADO DA CONCILIAÇÃO
-- ===========================================================================

-- Shape ÚNICO de lançamento no payload. Existe pra sugestão, busca manual,
-- contas em aberto e lista de movimentações devolverem campos idênticos — o
-- front tipa uma vez só.
DROP FUNCTION IF EXISTS public._reconcile_tx_json(public.financial_transactions, numeric);

CREATE FUNCTION public._reconcile_tx_json(p_t public.financial_transactions, p_effective numeric)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'id',                 (p_t).id,
    'transaction_date',   (p_t).transaction_date,
    'paid_date',          (p_t).paid_date,
    'due_date',           (p_t).due_date,
    'description',        (p_t).description,
    'category',           (p_t).category,
    'notes',              (p_t).notes,
    'amount',             (p_t).amount,
    'transaction_type',   (p_t).transaction_type,
    'signed_amount',      public.ft_signed_amount((p_t).transaction_type::text, (p_t).amount),
    -- Sem linha de referência (listas de contexto) a diferença não existe:
    -- devolver -signed seria um número sem significado na tela.
    'value_difference',   CASE WHEN p_effective IS NULL THEN NULL ELSE round(
                            p_effective
                            - public.ft_signed_amount((p_t).transaction_type::text, (p_t).amount)
                          , 2) END,
    'account_id',         (p_t).account_id,
    'cost_center_id',     (p_t).cost_center_id,
    'transfer_pair_id',   (p_t).transfer_pair_id,
    'installment_number', (p_t).installment_number,
    'installment_total',  (p_t).installment_total,
    'is_paid',            coalesce((p_t).is_paid, false),
    'service_order_id',   (p_t).service_order_id,
    'customer_name',      (SELECT c.name  FROM public.customers c  WHERE c.id = (p_t).customer_id),
    'supplier_name',      (SELECT s.name  FROM public.suppliers s  WHERE s.id = (p_t).supplier_id),
    'employee_name',      (SELECT em.name FROM public.employees em WHERE em.id = (p_t).employee_id)
  )
$fn$;

COMMENT ON FUNCTION public._reconcile_tx_json(public.financial_transactions, numeric) IS
  'Shape único de lançamento no payload da conciliação (sugestão, busca manual, contas em aberto, movimentações). signed_amount já vem resolvido por ft_signed_amount; value_difference é entry.effective_amount − signed_amount (NULL quando não há linha de referência). INTERNA: sem grant pra authenticated.';

DROP FUNCTION IF EXISTS public.get_bank_reconciliation_state(uuid);

CREATE FUNCTION public.get_bank_reconciliation_state(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_import         public.bank_statement_imports%ROWTYPE;
  v_account        public.financial_accounts%ROWTYPE;
  v_statement_bal  numeric;
  v_reconciled_bal numeric;
  v_difference     numeric;
  v_pending        integer;
  v_matched        integer;
  v_ignored        integer;
  v_suspect        integer;
  v_flipped        integer;
  v_vd_total       numeric;
  v_vd_count       integer;
  v_entries        jsonb;
  v_open_bills     jsonb;
  v_movements      jsonb;
BEGIN
  SELECT * INTO v_import FROM public.bank_statement_imports WHERE id = p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_import.company_id);

  SELECT * INTO v_account FROM public.financial_accounts WHERE id = v_import.account_id;

  v_statement_bal := coalesce(v_import.ledger_balance, 0);

  SELECT coalesce(v_import.opening_balance, 0)
         + coalesce(SUM(e.effective_amount) FILTER (WHERE e.status <> 'ignored'), 0),
         count(*) FILTER (WHERE e.status = 'pending'),
         count(*) FILTER (WHERE e.status = 'matched'),
         count(*) FILTER (WHERE e.status = 'ignored'),
         count(*) FILTER (WHERE e.sign_suspect AND NOT e.sign_flipped),
         count(*) FILTER (WHERE e.sign_flipped)
    INTO v_reconciled_bal, v_pending, v_matched, v_ignored, v_suspect, v_flipped
    FROM public.bank_statement_entries e
   WHERE e.import_id = p_import_id;

  v_difference := round(v_statement_bal - coalesce(v_reconciled_bal, 0), 2);

  -- Resumo auditável das diferenças de valor aceitas na busca manual. NÃO entra
  -- na diferença do rodapé e NÃO bloqueia o Finalizar: o saldo conciliado segue
  -- o valor do MOVIMENTO, não o da linha.
  SELECT coalesce(SUM(rm.value_difference), 0),
         count(*) FILTER (WHERE rm.value_difference <> 0)
    INTO v_vd_total, v_vd_count
    FROM public.reconciliation_matches rm
    JOIN public.bank_statement_entries e ON e.id = rm.entry_id
   WHERE e.import_id = p_import_id;

  -- Uma linha por entry. As duas LATERAIS agregam DENTRO delas (retornam
  -- exatamente 1 row): lateral que devolve N rows multiplicaria a entry por N.
  SELECT coalesce(jsonb_agg(row_json ORDER BY sort_posted, sort_created, sort_id), '[]'::jsonb)
    INTO v_entries
  FROM (
    SELECT
      e.posted_at  AS sort_posted,
      e.created_at AS sort_created,
      e.id         AS sort_id,
      jsonb_build_object(
        'id',               e.id,
        'fitid',            e.fitid,
        'posted_at',        e.posted_at,
        'posted_date',      (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date,
        'amount',           e.amount,
        'effective_amount', e.effective_amount,
        'trn_type',         e.trn_type,
        'memo',             e.memo,
        'name',             e.name,
        'sign_suspect',     e.sign_suspect,
        'sign_flipped',     e.sign_flipped,
        'sign_flipped_at',  e.sign_flipped_at,
        'status',           e.status,
        'current_match', (
          SELECT jsonb_build_object(
                   'match_id',                 rm.id,
                   'financial_transaction_id', rm.financial_transaction_id,
                   'match_type',               rm.match_type,
                   'transfer_pair_id',          rm.transfer_pair_id,
                   'transfer_pair_created',     rm.transfer_pair_created,
                   'card_bill_id',              rm.card_bill_id,
                   'employee_movement_id',      rm.employee_movement_id,
                   'value_difference',          rm.value_difference,
                   'confidence',                rm.confidence,
                   'created_at',                rm.created_at,
                   'transaction',               public._reconcile_tx_json(t, e.effective_amount)
                 )
            FROM public.reconciliation_matches rm
            JOIN public.financial_transactions t ON t.id = rm.financial_transaction_id
           WHERE rm.entry_id = e.id
        ),
        -- Sugestão AUTOMÁTICA: janela de ±3 dias e valor EXATO (≤ R$ 0,01).
        -- Automático nunca casa torto — a janela de R$ 2,00 só existe na busca
        -- manual por termo. candidate_count é limitado a 10 (ver COMMENT).
        'suggested', jsonb_build_object(
          'ambiguous',                coalesce(cand.candidate_count, 0) >= 2,
          'candidate_count',          coalesce(cand.candidate_count, 0),
          'suggested_transaction_id', cand.single_id,
          'candidates',               coalesce(cand.candidates, '[]'::jsonb)
        ),
        'settle', jsonb_build_object(
          'candidate_count', coalesce(scand.candidate_count, 0),
          'candidates',      coalesce(scand.candidates, '[]'::jsonb)
        )
      ) AS row_json
    FROM public.bank_statement_entries e
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS candidate_count,
             CASE WHEN count(*) = 1 THEN (array_agg(c.cid))[1] ELSE NULL END AS single_id,
             coalesce(jsonb_agg(c.js ORDER BY c.proximity, c.cid), '[]'::jsonb) AS candidates
        FROM (
          SELECT mc.id AS cid,
                 public._reconcile_tx_json(mc, e.effective_amount) AS js,
                 abs(coalesce(mc.paid_date, mc.transaction_date)
                     - (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date) AS proximity
            FROM public._reconcile_match_candidates(e.id, NULL, 0.01, 3) mc
           ORDER BY abs(coalesce(mc.paid_date, mc.transaction_date)
                        - (e.posted_at AT TIME ZONE 'America/Sao_Paulo')::date), mc.id
           LIMIT 10
        ) c
    ) cand ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS candidate_count,
             coalesce(jsonb_agg(s.js ORDER BY s.sort_due, s.sort_date, s.sid), '[]'::jsonb) AS candidates
        FROM (
          SELECT sc.id AS sid,
                 public._reconcile_tx_json(sc, e.effective_amount) AS js,
                 sc.due_date         AS sort_due,
                 sc.transaction_date AS sort_date
            FROM public._reconcile_settle_candidates(e.id, NULL, 0.01) sc
           ORDER BY sc.due_date NULLS LAST, sc.transaction_date, sc.id
           LIMIT 10
        ) s
    ) scand ON true
    WHERE e.import_id = p_import_id
  ) sub;

  -- Contas em aberto do tenant (contexto do painel direito). O que é CASÁVEL
  -- com cada linha vem em entries[].settle, que usa a MESMA função do match.
  SELECT coalesce(jsonb_agg(ob.js ORDER BY ob.sort_due, ob.sort_date, ob.oid), '[]'::jsonb)
    INTO v_open_bills
  FROM (
    SELECT t.id AS oid,
           public._reconcile_tx_json(t, NULL) AS js,
           t.due_date         AS sort_due,
           t.transaction_date AS sort_date
      FROM public.financial_transactions t
     WHERE t.company_id = v_import.company_id
       AND t.is_paid IS NOT TRUE
       AND t.cancelled_at IS NULL
       AND t.credit_card_bill_date IS NULL
       AND t.payroll_kind IS NULL
       AND t.transfer_pair_id IS NULL
       AND coalesce(t.amount_received, 0) = 0
       AND NOT EXISTS (
         SELECT 1 FROM public.reconciliation_matches rm
          WHERE rm.financial_transaction_id = t.id
       )
     ORDER BY t.due_date NULLS LAST, t.transaction_date, t.id
     LIMIT 300
  ) ob;

  -- Movimentações JÁ realizadas da conta no período do extrato (± 7 dias), com
  -- o selo de conciliada. É o painel "sistema" ao lado do painel "extrato".
  SELECT coalesce(jsonb_agg(m.js ORDER BY m.sort_date DESC, m.mid), '[]'::jsonb)
    INTO v_movements
  FROM (
    SELECT t.id AS mid,
           coalesce(t.paid_date, t.transaction_date) AS sort_date,
           public._reconcile_tx_json(t, NULL) || jsonb_build_object(
             'is_matched',       rm.id IS NOT NULL,
             'matched_entry_id', rm.entry_id
           ) AS js
      FROM public.financial_transactions t
      LEFT JOIN public.reconciliation_matches rm ON rm.financial_transaction_id = t.id
     WHERE t.company_id = v_import.company_id
       AND t.account_id = v_import.account_id
       AND t.is_paid IS TRUE
       AND t.cancelled_at IS NULL
       AND t.credit_card_bill_date IS NULL
       AND (
         v_import.period_start IS NULL OR v_import.period_end IS NULL
         OR coalesce(t.paid_date, t.transaction_date)
              BETWEEN v_import.period_start - 7 AND v_import.period_end + 7
       )
     ORDER BY coalesce(t.paid_date, t.transaction_date) DESC, t.id
     LIMIT 500
  ) m;

  RETURN jsonb_build_object(
    'import', jsonb_build_object(
      'id',                  v_import.id,
      'account_id',          v_import.account_id,
      'account_name',        v_account.name,
      'account_type',        v_account.type,
      'file_name',           v_import.file_name,
      'bank_id',             v_import.bank_id,
      'acct_id',             v_import.acct_id,
      'status',              v_import.status,
      'period_start',        v_import.period_start,
      'period_end',          v_import.period_end,
      'ledger_balance',      v_import.ledger_balance,
      'ledger_balance_date', v_import.ledger_balance_date,
      'opening_balance',     v_import.opening_balance,
      'entry_count',         v_import.entry_count,
      'created_at',          v_import.created_at,
      'finalized_at',        v_import.finalized_at
    ),
    'statement_balance',              v_statement_bal,
    'reconciled_balance',             round(coalesce(v_reconciled_bal, 0), 2),
    'difference',                     v_difference,
    'can_finalize',                   (coalesce(v_pending, 0) = 0
                                       AND abs(v_difference) <= 0.01
                                       AND v_import.status = 'open'),
    'pending_count',                  coalesce(v_pending, 0),
    'matched_count',                  coalesce(v_matched, 0),
    'ignored_count',                  coalesce(v_ignored, 0),
    'sign_suspect_count',             coalesce(v_suspect, 0),
    'sign_flipped_count',             coalesce(v_flipped, 0),
    'matched_value_difference_total', round(coalesce(v_vd_total, 0), 2),
    'matched_value_difference_count', coalesce(v_vd_count, 0),
    'entries',                        v_entries,
    'open_bills',                     v_open_bills,
    'ledger_movements',               v_movements
  );
END;
$fn$;

COMMENT ON FUNCTION public.get_bank_reconciliation_state(uuid) IS
  'Payload completo da tela de conciliação: cabeçalho do extrato, totais do rodapé (banco x conciliado x diferença + can_finalize), linhas com match atual, sugestão automática (janela de ±3 dias, valor exato) e candidatos de baixa, mais contas em aberto (até 300) e movimentações realizadas da conta no período ±7 dias (até 500). entries[].suggested.candidate_count e entries[].settle.candidate_count são limitados a 10 por linha. Sugestão e baixa saem das MESMAS funções que o match valida, por isso a UI nunca oferece o que a RPC recusa.';

-- ===========================================================================
-- 10. RPC — BUSCA MANUAL (sem janela de data)
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_search_candidates(uuid, text);

CREATE FUNCTION public.reconcile_search_candidates(
  p_entry_id uuid,
  p_query    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_term      text;
  v_tolerance numeric;
  v_matches   jsonb;
  v_settles   jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.bank_statement_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_entry.company_id);

  v_term := nullif(btrim(coalesce(p_query, '')), '');

  -- COM termo: tolera até R$ 2,00 (pagamento parcial, arredondamento de Pix),
  -- sempre com MESMO SINAL (garantido dentro da função de candidatos).
  -- SEM termo: exato. Automático nunca casa torto.
  v_tolerance := CASE WHEN v_term IS NULL THEN 0.01 ELSE 2.00 END;

  SELECT coalesce(jsonb_agg(x.js ORDER BY x.sort_date DESC, x.xid), '[]'::jsonb)
    INTO v_matches
  FROM (
    SELECT mc.id AS xid,
           coalesce(mc.paid_date, mc.transaction_date) AS sort_date,
           public._reconcile_tx_json(mc, v_entry.effective_amount) AS js
      FROM public._reconcile_match_candidates(p_entry_id, v_term, v_tolerance, NULL) mc
     ORDER BY coalesce(mc.paid_date, mc.transaction_date) DESC, mc.id
     LIMIT 50
  ) x;

  SELECT coalesce(jsonb_agg(y.js ORDER BY y.sort_due, y.sort_date, y.yid), '[]'::jsonb)
    INTO v_settles
  FROM (
    SELECT sc.id AS yid,
           sc.due_date         AS sort_due,
           sc.transaction_date AS sort_date,
           public._reconcile_tx_json(sc, v_entry.effective_amount) AS js
      FROM public._reconcile_settle_candidates(p_entry_id, v_term, v_tolerance) sc
     ORDER BY sc.due_date NULLS LAST, sc.transaction_date, sc.id
     LIMIT 50
  ) y;

  RETURN jsonb_build_object(
    'query',             v_term,
    'tolerance',         v_tolerance,
    'effective_amount',  v_entry.effective_amount,
    'realized',          v_matches,
    'open_bills',        v_settles
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_search_candidates(uuid, text) IS
  'Busca manual de lançamentos casáveis com uma linha do extrato, IGNORANDO A DATA (o par correto pode ter sido lançado dias antes/depois). Devolve dois conjuntos: realized (já pagos, pro match) e open_bills (em aberto, pra baixa), até 50 cada. SEM termo casa valor exato; COM termo tolera até R$ 2,00 de diferença exigindo MESMO SINAL — nunca cruza débito com crédito. A diferença aceita é gravada em reconciliation_matches.value_difference como resumo auditável.';

-- ===========================================================================
-- 11. RPC — FATURAS DE CARTÃO PAGÁVEIS POR UMA LINHA DE DÉBITO
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_list_card_bills(uuid);

CREATE FUNCTION public.reconcile_list_card_bills(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry  public.bank_statement_entries%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.bank_statement_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_entry.company_id);

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'id',               b.id,
             'account_id',       b.account_id,
             'account_name',     b.account_name,
             'reference_month',  b.reference_month,
             'closing_date',     b.closing_date,
             'due_date',         b.due_date,
             'status',           b.status,
             'bill_total',       b.bill_total,
             'amount_paid',      b.amount_paid,
             'remaining',        b.remaining,
             'is_closed',        b.is_closed,
             -- A linha do extrato cobre a fatura inteira? Se não, a UI avisa em
             -- PT-BR ANTES de confirmar: pagamento parcial NÃO quita compra
             -- nenhuma (não há como saber quais, e inventar critério produz
             -- dado falso — v1.22.4).
             'covers_remaining', (abs(v_entry.effective_amount) >= b.remaining - 0.01),
             'line_amount',      abs(v_entry.effective_amount)
           ) ORDER BY b.due_date DESC
         ), '[]'::jsonb)
    INTO v_result
    FROM public._reconcile_card_bill_candidates(p_entry_id) b;

  RETURN jsonb_build_object(
    'effective_amount', v_entry.effective_amount,
    'bills',            v_result
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_list_card_bills(uuid) IS
  'Faturas de cartão do tenant com saldo restante, para uma linha de DÉBITO do extrato. covers_remaining diz se o valor da linha cobre a fatura inteira: quando não cobre, a UI tem que avisar em PT-BR que pagamento parcial NÃO quita compra nenhuma antes de confirmar. Linha de crédito devolve lista vazia.';

-- ===========================================================================
-- 12. RPC — PERNAS DE TRANSFERÊNCIA JÁ EXISTENTES
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_list_transfer_legs(uuid);

CREATE FUNCTION public.reconcile_list_transfer_legs(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry  public.bank_statement_entries%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_entry FROM public.bank_statement_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_company(v_entry.company_id);

  SELECT coalesce(jsonb_agg(z.js ORDER BY z.sort_date DESC, z.zid), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT mc.id AS zid,
           coalesce(mc.paid_date, mc.transaction_date) AS sort_date,
           public._reconcile_tx_json(mc, v_entry.effective_amount)
             || jsonb_build_object(
                  'other_account_id',   sib.account_id,
                  'other_account_name', oa.name
                ) AS js
      FROM public._reconcile_match_candidates(p_entry_id, NULL, 0.01, 3) mc
      -- A perna irmã: mesmo transfer_pair_id, outra linha.
      JOIN public.financial_transactions sib
        ON sib.transfer_pair_id = mc.transfer_pair_id
       AND sib.id <> mc.id
      LEFT JOIN public.financial_accounts oa ON oa.id = sib.account_id
     WHERE mc.transfer_pair_id IS NOT NULL
     ORDER BY coalesce(mc.paid_date, mc.transaction_date) DESC, mc.id
     LIMIT 20
  ) z;

  RETURN jsonb_build_object('legs', v_result);
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_list_transfer_legs(uuid) IS
  'Pernas de transferência JÁ existentes nesta conta que casam com a linha do extrato (valor exato, ±3 dias, ainda não conciliadas), com o nome da conta do outro lado. Existe para o caso em que o extrato da outra conta foi conciliado primeiro: casar com a perna existente em vez de criar par duplicado, senão o mesmo dinheiro entra duas vezes.';

-- ===========================================================================
-- 13. HELPER DE ESCRITA — trava e valida a linha
--     ORDEM DE LOCK FIXA em TODAS as RPCs: import primeiro, entry depois.
--     Ordem invertida entre duas RPCs é deadlock esperando acontecer.
-- ===========================================================================

DROP FUNCTION IF EXISTS public._reconcile_lock_entry(uuid, boolean);

CREATE FUNCTION public._reconcile_lock_entry(
  p_entry_id        uuid,
  p_require_pending boolean DEFAULT true
)
RETURNS public.bank_statement_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry       public.bank_statement_entries%ROWTYPE;
  v_import_id   uuid;
  v_import_stat text;
BEGIN
  SELECT e.import_id INTO v_import_id
    FROM public.bank_statement_entries e
   WHERE e.id = p_entry_id;

  IF v_import_id IS NULL THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  SELECT i.status INTO v_import_stat
    FROM public.bank_statement_imports i
   WHERE i.id = v_import_id
   FOR UPDATE;

  SELECT * INTO v_entry
    FROM public.bank_statement_entries e
   WHERE e.id = p_entry_id
   FOR UPDATE;

  PERFORM public._reconcile_assert_write(v_entry.company_id);

  IF v_import_stat = 'finalized' THEN
    RAISE EXCEPTION 'Este extrato já foi finalizado. Não é possível alterar as linhas.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_require_pending AND v_entry.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta linha já foi conciliada ou ignorada. Desfaça antes de escolher outro destino.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_entry;
END;
$fn$;

COMMENT ON FUNCTION public._reconcile_lock_entry(uuid, boolean) IS
  'Trava o import e a linha (nesta ordem, sempre), cobra o gate de escrita e exige status pending quando pedido. Ordem de lock fixa evita deadlock entre as RPCs de conciliação. INTERNA: sem grant pra authenticated.';

-- ===========================================================================
-- 14. RPC — CASAR COM MOVIMENTAÇÃO JÁ REALIZADA
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_match_existing(uuid, uuid, text, boolean);

CREATE FUNCTION public.reconcile_match_existing(
  p_entry_id                 uuid,
  p_financial_transaction_id uuid,
  p_confidence               text    DEFAULT 'manual',
  p_allow_any_date           boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry   public.bank_statement_entries%ROWTYPE;
  v_tx      public.financial_transactions%ROWTYPE;
  v_signed  numeric;
  v_diff    numeric;
  v_tol     numeric;
  v_window  integer;
  v_match_id uuid;
BEGIN
  IF coalesce(p_confidence, 'manual') NOT IN ('auto', 'manual') THEN
    RAISE EXCEPTION 'Confiança inválida (%).', p_confidence USING ERRCODE = '22023';
  END IF;

  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  SELECT * INTO v_tx
    FROM public.financial_transactions
   WHERE id = p_financial_transaction_id
   FOR UPDATE;

  IF NOT FOUND OR v_tx.company_id <> v_entry.company_id THEN
    -- Mensagem única pra "não existe" e "é de outro tenant": não confirma a
    -- existência de id de outra empresa.
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = '42501';
  END IF;

  -- Diagnóstico em PT-BR na ordem em que o usuário entende o problema. A
  -- autoridade final é a função de candidatos, checada no fim.
  IF v_tx.account_id IS DISTINCT FROM v_entry.account_id THEN
    RAISE EXCEPTION 'Este lançamento está em outra conta. Só é possível casar com lançamentos da conta que está sendo conciliada.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.is_paid IS NOT TRUE THEN
    RAISE EXCEPTION 'Este lançamento ainda está em aberto. Use "Dar baixa" em vez de "Casar".'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este lançamento foi cancelado e não pode ser conciliado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.credit_card_bill_date IS NOT NULL THEN
    RAISE EXCEPTION 'Esta é uma compra no cartão de crédito. Ela não sai da conta bancária individualmente: o que sai é o pagamento da fatura.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reconciliation_matches rm
     WHERE rm.financial_transaction_id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Este lançamento já está conciliado com outra linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  v_signed := public.ft_signed_amount(v_tx.transaction_type::text, v_tx.amount);
  v_diff   := round(v_entry.effective_amount - v_signed, 2);

  IF sign(v_signed) <> sign(v_entry.effective_amount) THEN
    RAISE EXCEPTION 'A linha do extrato é % e o lançamento é %. Conciliação nunca cruza entrada com saída.',
      CASE WHEN v_entry.effective_amount < 0 THEN 'uma saída' ELSE 'uma entrada' END,
      CASE WHEN v_signed < 0 THEN 'uma saída' ELSE 'uma entrada' END
      USING ERRCODE = 'P0001';
  END IF;

  -- Tolerância e janela de data saem do MODO, não da confiança:
  --   p_allow_any_date = false (sugestão / lista): valor exato, ±3 dias.
  --   p_allow_any_date = true  (busca manual): sem data, até R$ 2,00.
  v_tol    := CASE WHEN p_allow_any_date THEN 2.00 ELSE 0.01 END;
  v_window := CASE WHEN p_allow_any_date THEN NULL ELSE 3 END;

  IF abs(v_diff) > v_tol THEN
    RAISE EXCEPTION 'O valor do lançamento (R$ %) não bate com a linha do extrato (R$ %).',
      to_char(abs(v_signed), 'FM999999990.00'),
      to_char(abs(v_entry.effective_amount), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- Gate autoritativo: é EXATAMENTE o conjunto que a UI mostrou.
  IF NOT EXISTS (
    SELECT 1 FROM public._reconcile_match_candidates(p_entry_id, NULL, v_tol, v_window) c
     WHERE c.id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Este lançamento não pode ser casado com esta linha. Use a busca manual para procurar sem restrição de data.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, p_financial_transaction_id,
    CASE WHEN v_tx.transfer_pair_id IS NOT NULL THEN 'transfer' ELSE 'existing' END,
    v_tx.transfer_pair_id, v_diff, coalesce(p_confidence, 'manual'), auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', p_financial_transaction_id,
    'match_type',               CASE WHEN v_tx.transfer_pair_id IS NOT NULL THEN 'transfer' ELSE 'existing' END,
    'transfer_pair_id',         v_tx.transfer_pair_id,
    'value_difference',         v_diff
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_match_existing(uuid, uuid, text, boolean) IS
  'Casa uma linha do extrato com um lançamento JÁ REALIZADO da mesma conta. Vínculo puro: não cria nem altera lançamento. p_allow_any_date=false exige valor exato na janela de ±3 dias (sugestão); true libera a data e tolera até R$ 2,00 (busca manual), sempre com MESMO SINAL. Quando o lançamento é perna de transferência, o match nasce como transfer e guarda o transfer_pair_id. O gate final é a função _reconcile_match_candidates — a mesma que alimentou a UI.';

-- ===========================================================================
-- 15. RPC — DAR BAIXA EM CONTA A PAGAR / A RECEBER
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_settle_transaction(uuid, uuid);

CREATE FUNCTION public.reconcile_settle_transaction(
  p_entry_id                 uuid,
  p_financial_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry    public.bank_statement_entries%ROWTYPE;
  v_tx       public.financial_transactions%ROWTYPE;
  v_signed   numeric;
  v_diff     numeric;
  v_paid     date;
  v_match_id uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  SELECT * INTO v_tx
    FROM public.financial_transactions
   WHERE id = p_financial_transaction_id
   FOR UPDATE;

  IF NOT FOUND OR v_tx.company_id <> v_entry.company_id THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF v_tx.is_paid IS TRUE THEN
    RAISE EXCEPTION 'Esta conta já está quitada. Use "Casar" em vez de "Dar baixa".' USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta conta foi cancelada e não pode receber baixa.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ A trava que protege o bug histórico da "parcela (1/6) sumindo".
  IF v_tx.credit_card_bill_date IS NOT NULL THEN
    RAISE EXCEPTION 'Despesa no cartão de crédito não é paga individualmente: o que sai da conta é o pagamento da FATURA. Use o destino "Pagar fatura de cartão".'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tx.payroll_kind IS NOT NULL THEN
    RAISE EXCEPTION 'Folha e vale de funcionário são registrados na tela de Funcionários, que também atualiza o extrato do funcionário. Registre lá e depois volte para casar esta linha com o lançamento.'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_tx.amount_received, 0) <> 0 THEN
    RAISE EXCEPTION 'Esta conta tem recebimento parcial em andamento. Conclua o recebimento pela tela do Financeiro.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reconciliation_matches rm
     WHERE rm.financial_transaction_id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Esta conta já está conciliada com outra linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  v_signed := public.ft_signed_amount(v_tx.transaction_type::text, v_tx.amount);
  v_diff   := round(v_entry.effective_amount - v_signed, 2);

  IF sign(v_signed) <> sign(v_entry.effective_amount) THEN
    RAISE EXCEPTION 'Conta a % exige uma % no extrato.',
      CASE WHEN v_signed < 0 THEN 'pagar' ELSE 'receber' END,
      CASE WHEN v_signed < 0 THEN 'saída (débito)' ELSE 'entrada (crédito)' END
      USING ERRCODE = 'P0001';
  END IF;

  IF abs(v_diff) > 0.01 THEN
    RAISE EXCEPTION 'A baixa é total: o valor da linha (R$ %) precisa ser igual ao da conta (R$ %). Baixa parcial não é feita pela conciliação.',
      to_char(abs(v_entry.effective_amount), 'FM999999990.00'),
      to_char(abs(v_signed), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public._reconcile_settle_candidates(p_entry_id, NULL, 0.01) c
     WHERE c.id = p_financial_transaction_id
  ) THEN
    RAISE EXCEPTION 'Esta conta não pode receber baixa por esta linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  -- Data CIVIL da linha em São Paulo: ::date cru leria UTC e jogaria pagamento
  -- noturno pro dia (e mês) seguinte.
  v_paid := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;

  -- O snapshot é o que permite DESFAZER de verdade: guarda exatamente o que
  -- estava aqui antes, em vez de "chutar" NULL no desfazer.
  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    value_difference, confidence, created_by, undo_snapshot
  ) VALUES (
    v_entry.company_id, p_entry_id, p_financial_transaction_id, 'settled',
    v_diff, 'manual', auth.uid(),
    jsonb_build_object(
      'is_paid',    v_tx.is_paid,
      'paid_date',  v_tx.paid_date,
      'account_id', v_tx.account_id
    )
  )
  RETURNING id INTO v_match_id;

  UPDATE public.financial_transactions
     SET is_paid     = true,
         paid_date   = v_paid,
         account_id  = v_entry.account_id,
         updated_at  = now()
   WHERE id = p_financial_transaction_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', p_financial_transaction_id,
    'match_type',               'settled',
    'paid_date',                v_paid,
    'account_id',               v_entry.account_id,
    'value_difference',         v_diff
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_settle_transaction(uuid, uuid) IS
  'Dá baixa TOTAL em uma conta a pagar/receber (financial_transactions com is_paid=false) pela linha do extrato: is_paid=true, paid_date = data civil da linha em America/Sao_Paulo, account_id = a conta conciliada. Recusa despesa de cartão (credit_card_bill_date), folha/vale (payroll_kind), cancelado, recebimento parcial em andamento e valor diferente. Guarda em undo_snapshot o is_paid/paid_date/account_id anteriores, para que desfazer restaure o estado exato.';

-- ===========================================================================
-- 16. RPC — CRIAR LANÇAMENTO AVULSO
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text);

CREATE FUNCTION public.reconcile_create_transaction(
  p_entry_id       uuid,
  p_category_id    uuid,
  p_description    text,
  p_cost_center_id uuid DEFAULT NULL,
  p_customer_id    uuid DEFAULT NULL,
  p_supplier_id    uuid DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_category  public.financial_categories%ROWTYPE;
  v_type      text;
  v_date      date;
  v_desc      text;
  v_tx_id     uuid;
  v_match_id  uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  IF v_entry.effective_amount = 0 THEN
    RAISE EXCEPTION 'Linha com valor zero não gera lançamento. Use "Ignorar".' USING ERRCODE = '22023';
  END IF;

  v_type := CASE WHEN v_entry.effective_amount > 0 THEN 'entrada' ELSE 'saida' END;
  v_date := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;

  -- RPC é SECURITY DEFINER: a RLS NÃO protege este INSERT. Categoria é validada
  -- como da empresa, ativa e do TIPO certo — categoria de entrada em linha de
  -- débito classificaria receita como despesa na DRE.
  IF p_category_id IS NULL THEN
    RAISE EXCEPTION 'Escolha uma categoria para o lançamento.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_category
    FROM public.financial_categories c
   WHERE c.id = p_category_id
     AND c.company_id = v_entry.company_id
     AND c.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria inválida: não pertence a esta empresa ou está inativa.' USING ERRCODE = '42501';
  END IF;

  IF v_category.type IS DISTINCT FROM v_type THEN
    RAISE EXCEPTION 'A linha do extrato é uma % e a categoria escolhida é de %.',
      CASE WHEN v_type = 'entrada' THEN 'entrada (crédito)' ELSE 'saída (débito)' END,
      CASE WHEN v_category.type = 'entrada' THEN 'entrada' ELSE 'saída' END
      USING ERRCODE = 'P0001';
  END IF;

  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cost_centers cc
     WHERE cc.id = p_cost_center_id
       AND cc.company_id = v_entry.company_id
       AND cc.is_active = true
  ) THEN
    RAISE EXCEPTION 'Centro de custo inválido: não pertence a esta empresa ou está inativo.' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = p_customer_id AND c.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido: não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s
     WHERE s.id = p_supplier_id AND s.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido: não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;

  -- Descrição: o que o usuário escreveu; na falta, o que o banco escreveu.
  v_desc := nullif(btrim(coalesce(p_description, '')), '');
  v_desc := coalesce(v_desc,
                     nullif(btrim(coalesce(v_entry.name, '')), ''),
                     nullif(btrim(coalesce(v_entry.memo, '')), ''),
                     'Lançamento do extrato bancário');

  -- category guarda o NOME copiado (coluna text, não é FK) — mesma convenção do
  -- resto do schema; category_id não existe em financial_transactions.
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description, notes,
    category, cost_center_id, customer_id, supplier_id,
    transaction_date, paid_date, is_paid, created_by
  ) VALUES (
    v_entry.company_id, v_entry.account_id, v_type::public.transaction_type,
    abs(v_entry.effective_amount), v_desc, p_notes,
    v_category.name, p_cost_center_id, p_customer_id, p_supplier_id,
    v_date, v_date, true, auth.uid()
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_tx_id, 'created', 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_tx_id,
    'match_type',               'created',
    'transaction_type',         v_type,
    'amount',                   abs(v_entry.effective_amount),
    'category',                 v_category.name,
    'paid_date',                v_date
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text) IS
  'Cria o lançamento avulso que falta no sistema, a partir da linha do extrato: transaction_type pelo SINAL do effective_amount, amount = abs(effective_amount), is_paid=true, paid_date e transaction_date = data civil da linha, account_id = a conta conciliada. A categoria chega por ID (validada como da empresa, ativa e do tipo compatível com o sinal) e o NOME atual é copiado para a coluna text `category`. É também o destino da linha que não é receita nem despesa (aporte, resgate): o marcador "fora do resultado" nasce na categoria junto com o fluxo de caixa e reclassifica o histórico de uma vez.';

-- ===========================================================================
-- 17. RPC — TRANSFERÊNCIA ENTRE CONTAS
--     No Dominex transferência é um PAR de linhas com o mesmo transfer_pair_id.
--     O transfer_pair_id é o marcador estrutural que DRE/DFC/relatório/KPI
--     pulam — transferência não é receita nem despesa.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_create_transfer(uuid, uuid, text);

CREATE FUNCTION public.reconcile_create_transfer(
  p_entry_id         uuid,
  p_other_account_id uuid,
  p_description      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry      public.bank_statement_entries%ROWTYPE;
  v_other      public.financial_accounts%ROWTYPE;
  v_date       date;
  v_desc       text;
  v_amount     numeric;
  v_this_type  text;
  v_other_type text;
  v_pair_id    uuid;
  v_this_leg   uuid;
  v_other_leg  uuid;
  v_reuse_id   uuid;
  v_reuse_cnt  integer;
  v_reuse_pair uuid;
  v_match_id   uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  IF v_entry.effective_amount = 0 THEN
    RAISE EXCEPTION 'Linha com valor zero não gera transferência.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_other FROM public.financial_accounts WHERE id = p_other_account_id;

  IF NOT FOUND OR v_other.company_id <> v_entry.company_id THEN
    RAISE EXCEPTION 'Conta de destino não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF v_other.id = v_entry.account_id THEN
    RAISE EXCEPTION 'A conta de destino tem que ser diferente da conta que está sendo conciliada.'
      USING ERRCODE = '22023';
  END IF;

  IF v_other.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'A conta de destino está inativa.' USING ERRCODE = '22023';
  END IF;

  -- Transferir para o cartão é, na prática, pagar a fatura — e aí o caminho
  -- certo é pay_credit_card_bill, que quita as compras e devolve o limite.
  IF v_other.type = 'cartao' THEN
    RAISE EXCEPTION 'Para o cartão de crédito use o destino "Pagar fatura de cartão": é ele que quita as compras da fatura e devolve o limite.'
      USING ERRCODE = 'P0001';
  END IF;

  v_amount    := abs(v_entry.effective_amount);
  v_date      := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;
  v_this_type := CASE WHEN v_entry.effective_amount < 0 THEN 'saida' ELSE 'entrada' END;
  v_other_type:= CASE WHEN v_entry.effective_amount < 0 THEN 'entrada' ELSE 'saida' END;

  -- ── A perna oposta JÁ EXISTE? ──────────────────────────────────────────
  -- Cenário real: o extrato da OUTRA conta foi conciliado primeiro e o par já
  -- está no sistema. Criar um par novo aqui faria o MESMO dinheiro entrar duas
  -- vezes. Então, se existe exatamente uma perna compatível nesta conta cujo
  -- irmão está na conta escolhida, casa com ela.
  SELECT count(*), min(mc.id::text)::uuid, min(mc.transfer_pair_id::text)::uuid
    INTO v_reuse_cnt, v_reuse_id, v_reuse_pair
    FROM public._reconcile_match_candidates(p_entry_id, NULL, 0.01, 3) mc
   WHERE mc.transfer_pair_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.financial_transactions sib
        WHERE sib.transfer_pair_id = mc.transfer_pair_id
          AND sib.id <> mc.id
          AND sib.account_id = p_other_account_id
     );

  IF coalesce(v_reuse_cnt, 0) > 1 THEN
    RAISE EXCEPTION 'Existe mais de uma transferência compatível entre estas contas. Escolha a correta na lista de movimentações em vez de criar outra.'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(v_reuse_cnt, 0) = 1 THEN
    INSERT INTO public.reconciliation_matches (
      company_id, entry_id, financial_transaction_id, match_type,
      transfer_pair_id, transfer_pair_created, value_difference, confidence, created_by
    ) VALUES (
      v_entry.company_id, p_entry_id, v_reuse_id, 'transfer',
      v_reuse_pair, false, 0, 'manual', auth.uid()
    )
    RETURNING id INTO v_match_id;

    UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

    RETURN jsonb_build_object(
      'match_id',                 v_match_id,
      'entry_id',                 p_entry_id,
      'financial_transaction_id', v_reuse_id,
      'match_type',               'transfer',
      'transfer_pair_id',         v_reuse_pair,
      'transfer_pair_created',    false,
      'reused_existing_pair',     true,
      'other_account_id',         p_other_account_id,
      'amount',                   v_amount,
      'paid_date',                v_date
    );
  END IF;

  v_desc := coalesce(nullif(btrim(coalesce(p_description, '')), ''), 'Transferência entre contas');
  v_pair_id := gen_random_uuid();

  -- A categoria é o literal 'Transferência entre contas' de propósito: é
  -- EXATAMENTE o que o fluxo de transferência da tela grava hoje
  -- (useFinancialAccounts.transfer). Paridade com produção vale mais que
  -- esperteza; quem efetivamente tira o par da DRE/DFC é o transfer_pair_id.
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description,
    category, transaction_date, paid_date, is_paid, transfer_pair_id, created_by
  ) VALUES (
    v_entry.company_id, v_entry.account_id, v_this_type::public.transaction_type,
    v_amount, v_desc, 'Transferência entre contas', v_date, v_date, true, v_pair_id, auth.uid()
  )
  RETURNING id INTO v_this_leg;

  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, amount, description,
    category, transaction_date, paid_date, is_paid, transfer_pair_id, created_by
  ) VALUES (
    v_entry.company_id, p_other_account_id, v_other_type::public.transaction_type,
    v_amount, v_desc, 'Transferência entre contas', v_date, v_date, true, v_pair_id, auth.uid()
  )
  RETURNING id INTO v_other_leg;

  -- A linha do extrato casa com a perna DESTA conta.
  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, transfer_pair_created, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_this_leg, 'transfer',
    v_pair_id, true, 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                  v_match_id,
    'entry_id',                  p_entry_id,
    'financial_transaction_id',  v_this_leg,
    'other_leg_transaction_id',  v_other_leg,
    'match_type',                'transfer',
    'transfer_pair_id',          v_pair_id,
    'transfer_pair_created',     true,
    'reused_existing_pair',      false,
    'other_account_id',          p_other_account_id,
    'amount',                    v_amount,
    'paid_date',                 v_date
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_create_transfer(uuid, uuid, text) IS
  'Transferência entre contas pela linha do extrato. Se já existir UMA perna compatível nesta conta cujo irmão está na conta escolhida (o extrato da outra conta foi conciliado antes), casa com ela — criar par novo faria o mesmo dinheiro entrar duas vezes. Caso contrário cria o PAR de linhas com o mesmo transfer_pair_id (saída na conta conciliada e entrada na outra, ou o inverso pelo sinal), categoria "Transferência entre contas" e is_paid=true, e casa a linha com a perna DESTA conta. Cartão de crédito é recusado: ali o caminho é pagar a fatura.';

-- ===========================================================================
-- 18. RPC — PAGAR FATURA DE CARTÃO DE CRÉDITO
--     NÃO reimplementa nada: chama public.pay_credit_card_bill, que é o
--     contrato fechado (par de pernas + quitação das compras + limite).
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_pay_card_bill(uuid, uuid, numeric, text);

CREATE FUNCTION public.reconcile_pay_card_bill(
  p_entry_id uuid,
  p_bill_id  uuid,
  p_amount   numeric DEFAULT NULL,
  p_notes    text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry    public.bank_statement_entries%ROWTYPE;
  v_bill     record;
  v_date     date;
  v_amount   numeric;
  v_result   jsonb;
  v_pay_tx   uuid;
  v_match_id uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  IF v_entry.effective_amount >= 0 THEN
    RAISE EXCEPTION 'Só uma saída (débito) do extrato pode pagar fatura de cartão.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_bill
    FROM public._reconcile_card_bill_candidates(p_entry_id) b
   WHERE b.id = p_bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura não encontrada ou já quitada.' USING ERRCODE = '42501';
  END IF;

  v_date   := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;
  -- O valor pago É o que saiu do banco: a linha do extrato. Aceitar valor
  -- diferente do client inventaria um pagamento que não aconteceu.
  v_amount := coalesce(p_amount, abs(v_entry.effective_amount));

  IF abs(v_amount - abs(v_entry.effective_amount)) > 0.01 THEN
    RAISE EXCEPTION 'O valor do pagamento (R$ %) tem que ser o valor da linha do extrato (R$ %).',
      to_char(v_amount, 'FM999999990.00'),
      to_char(abs(v_entry.effective_amount), 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- pay_credit_card_bill valida fechamento da fatura, valor maior que o
  -- restante, tenant das duas contas e cartão, cria as DUAS pernas com
  -- transfer_pair_id e quita as compras que couberem no valor pago.
  -- ⚠️ Pagamento PARCIAL não quita compra nenhuma quando nenhuma compra cabe:
  -- não há como saber quais foram pagas, e inventar critério (mais antigas
  -- primeiro, rateio) produz dado falso (v1.22.4). A RPC só reporta.
  v_result := public.pay_credit_card_bill(p_bill_id, v_entry.account_id, v_date, v_amount, p_notes);

  v_pay_tx := (v_result->>'payment_transaction_id')::uuid;

  IF v_pay_tx IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar o lançamento do pagamento da fatura.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    transfer_pair_id, card_bill_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_pay_tx, 'card_bill',
    (v_result->>'transfer_pair_id')::uuid, p_bill_id, 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_pay_tx,
    'match_type',               'card_bill',
    'card_bill_id',             p_bill_id,
    'paid_date',                v_date,
    'amount',                   v_amount,
    'bill',                     v_result
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_pay_card_bill(uuid, uuid, numeric, text) IS
  'Paga uma fatura de cartão pela linha de DÉBITO do extrato chamando public.pay_credit_card_bill (contrato fechado — NÃO reimplementa pagamento de fatura) e linka o payment_transaction_id devolvido à linha. O valor é obrigatoriamente o da linha do extrato: é esse o dinheiro que saiu do banco. Pagamento parcial é aceito e reportado (o payload "bill" devolve o retorno integral da RPC de fatura), mas não inventa quitação de compra. Precisa de sessão de usuário: pay_credit_card_bill exige auth.uid().';

-- ===========================================================================
-- 19. RPC — VALE DE FUNCIONÁRIO
--     Delega para public.create_employee_vale, que já é atômico, idempotente e
--     protegido por triggers que proíbem vale sem o par RH↔Financeiro.
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_create_employee_movement(uuid, uuid, text, uuid, text, uuid);

CREATE FUNCTION public.reconcile_create_employee_movement(
  p_entry_id        uuid,
  p_employee_id     uuid,
  p_kind            text,
  p_idempotency_key uuid,
  p_description     text DEFAULT NULL,
  p_cost_center_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry     public.bank_statement_entries%ROWTYPE;
  v_date      date;
  v_mov_id    uuid;
  v_tx_id     uuid;
  v_created   boolean;
  v_existing  public.reconciliation_matches%ROWTYPE;
  v_match_id  uuid;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, true);

  -- ⚠️ BÔNUS NÃO ENTRA, EM NENHUMA HIPÓTESE. Bônus é crédito interno do
  -- funcionário: ele só vira despesa quando a FOLHA é paga. Aceitar bônus como
  -- destino de uma linha de extrato criaria uma despesa fantasma (o dinheiro
  -- sairia duas vezes: aqui e no pagamento da folha).
  IF p_kind = 'bonus' THEN
    RAISE EXCEPTION 'Bônus não gera lançamento financeiro: ele é crédito interno do funcionário e só vira despesa quando a folha é paga. Registre o bônus na tela de Funcionários.'
      USING ERRCODE = '22023';
  END IF;

  -- ⚠️ FOLHA NÃO ENTRA NESTA RPC, E É DELIBERADO. Pagar folha não é só criar
  -- uma saída: a tela de Funcionários registra o movimento 'pagamento', o
  -- 'ajuste' que reseta o saldo, o 'vale_residual' do que não foi descontado e
  -- o snapshot do holerite em payment_details (é dali que o extrato do
  -- funcionário reconstrói o holerite). Reproduzir isso aqui, em SQL, criaria
  -- folha sem holerite e faria o saldo de vales do funcionário desaparecer no
  -- reset — perda silenciosa de dado. Recusar é reversível; dado torto não é.
  IF p_kind IN ('folha', 'salary', 'pagamento') THEN
    RAISE EXCEPTION 'Pagamento de folha é registrado na tela de Funcionários, que também desconta vales e guarda o holerite. Registre lá e depois volte para casar esta linha com o lançamento.'
      USING ERRCODE = '22023';
  END IF;

  IF p_kind IS DISTINCT FROM 'vale' THEN
    RAISE EXCEPTION 'Tipo de movimento de funcionário inválido (%). Pela conciliação só é possível registrar vale.', p_kind
      USING ERRCODE = '22023';
  END IF;

  IF v_entry.effective_amount >= 0 THEN
    RAISE EXCEPTION 'Vale é saída de dinheiro: só uma linha de débito do extrato pode registrar vale.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotência obrigatória para registrar vale.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id AND e.company_id = v_entry.company_id
  ) THEN
    RAISE EXCEPTION 'Funcionário não encontrado.' USING ERRCODE = '42501';
  END IF;

  v_date := (v_entry.posted_at AT TIME ZONE 'America/Sao_Paulo')::date;

  -- create_employee_vale faz TUDO numa transação: a saída paga no Financeiro
  -- (payroll_kind='vale', account_id, is_paid=true, paid_date) e a linha em
  -- employee_movements, com os guards de tenant/conta/centro de custo e o gate
  -- fn:manage_finance. Retry com a mesma chave devolve o mesmo par.
  SELECT v.employee_movement_id, v.financial_transaction_id, v.created
    INTO v_mov_id, v_tx_id, v_created
    FROM public.create_employee_vale(
           p_employee_id,
           v_entry.account_id,
           abs(v_entry.effective_amount),
           p_idempotency_key,
           v_date,
           nullif(btrim(coalesce(p_description, '')), ''),
           p_cost_center_id
         ) v;

  -- Retry: o vale já existia. Se já está casado com ESTA linha, devolve o
  -- mesmo resultado (idempotente). Se está casado com outra, recusa — nunca
  -- rouba o vínculo de outra linha.
  SELECT * INTO v_existing
    FROM public.reconciliation_matches
   WHERE financial_transaction_id = v_tx_id;

  IF FOUND THEN
    IF v_existing.entry_id = p_entry_id THEN
      RETURN jsonb_build_object(
        'match_id',                 v_existing.id,
        'entry_id',                 p_entry_id,
        'financial_transaction_id', v_tx_id,
        'employee_movement_id',     v_existing.employee_movement_id,
        'match_type',               'employee_vale',
        'paid_date',                v_date,
        'amount',                   abs(v_entry.effective_amount),
        'created',                  false
      );
    END IF;
    RAISE EXCEPTION 'Este vale já está conciliado com outra linha do extrato.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.reconciliation_matches (
    company_id, entry_id, financial_transaction_id, match_type,
    employee_movement_id, value_difference, confidence, created_by
  ) VALUES (
    v_entry.company_id, p_entry_id, v_tx_id, 'employee_vale',
    v_mov_id, 0, 'manual', auth.uid()
  )
  RETURNING id INTO v_match_id;

  UPDATE public.bank_statement_entries SET status = 'matched' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'match_id',                 v_match_id,
    'entry_id',                 p_entry_id,
    'financial_transaction_id', v_tx_id,
    'employee_movement_id',     v_mov_id,
    'match_type',               'employee_vale',
    'paid_date',                v_date,
    'amount',                   abs(v_entry.effective_amount),
    'created',                  coalesce(v_created, true)
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_create_employee_movement(uuid, uuid, text, uuid, text, uuid) IS
  'Registra VALE de funcionário pela linha de DÉBITO do extrato, delegando para public.create_employee_vale (atômico: saída paga no Financeiro com payroll_kind=vale + linha em employee_movements; idempotente pela chave). ACEITA SOMENTE p_kind = ''vale''. Bônus é recusado por contrato (crédito interno que só vira despesa na folha — aceitar aqui criaria despesa fantasma) e pagamento de folha também (a tela de Funcionários desconta vales e guarda o holerite; reproduzir isso em SQL perderia dado em silêncio).';

-- ===========================================================================
-- 20. RPC — INVERTER SINAL (crédito ↔ débito)
--     O valor CRU nunca muda. Inverter é ato explícito, auditado e reversível,
--     e RECALCULA o opening_balance (invariante 9).
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_flip_sign(uuid[], boolean);

CREATE FUNCTION public.reconcile_flip_sign(
  p_entry_ids uuid[],
  p_flipped   boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_companies uuid[];
  v_imports   uuid[];
  v_import_id uuid;
  v_changed   integer := 0;
  v_matched   integer := 0;
  v_openings  jsonb   := '[]'::jsonb;
  v_opening   numeric;
BEGIN
  IF p_entry_ids IS NULL OR array_length(p_entry_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhuma linha informada.' USING ERRCODE = '22023';
  END IF;

  IF p_flipped IS NULL THEN
    RAISE EXCEPTION 'Informe se o sinal deve ficar invertido ou não.' USING ERRCODE = '22023';
  END IF;

  -- Todas as linhas têm que ser da MESMA empresa: array misturado só vem de
  -- tentativa de abuso, e o gate de escrita é por empresa.
  SELECT array_agg(DISTINCT e.company_id),
         array_agg(DISTINCT e.import_id)
    INTO v_companies, v_imports
    FROM public.bank_statement_entries e
   WHERE e.id = ANY(p_entry_ids);

  IF v_companies IS NULL OR array_length(v_companies, 1) IS NULL THEN
    RAISE EXCEPTION 'Linha do extrato não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF array_length(v_companies, 1) > 1 THEN
    RAISE EXCEPTION 'As linhas informadas pertencem a empresas diferentes.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_write(v_companies[1]);

  -- Ordena os imports pra travar sempre na mesma ordem.
  SELECT array_agg(x ORDER BY x) INTO v_imports FROM unnest(v_imports) AS x;

  -- Ordem de lock fixa (imports em ordem de id, depois as linhas): mesma
  -- disciplina de _reconcile_lock_entry.
  FOREACH v_import_id IN ARRAY v_imports LOOP
    PERFORM 1 FROM public.bank_statement_imports i WHERE i.id = v_import_id FOR UPDATE;

    IF EXISTS (
      SELECT 1 FROM public.bank_statement_imports i
       WHERE i.id = v_import_id AND i.status = 'finalized'
    ) THEN
      RAISE EXCEPTION 'Este extrato já foi finalizado. Não é possível inverter o sinal das linhas.'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- Linha conciliada não pode ter o sinal invertido: o valor mudaria embaixo de
  -- um match já feito (e de um lançamento já criado). Desfazer primeiro.
  SELECT count(*) INTO v_matched
    FROM public.bank_statement_entries e
   WHERE e.id = ANY(p_entry_ids) AND e.status = 'matched';

  IF v_matched > 0 THEN
    RAISE EXCEPTION 'Há % linha(s) já conciliada(s) na seleção. Desfaça a conciliação antes de inverter o sinal.', v_matched
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_entries e
     SET sign_flipped    = p_flipped,
         sign_flipped_at = CASE WHEN p_flipped THEN now() ELSE NULL END,
         sign_flipped_by = CASE WHEN p_flipped THEN auth.uid() ELSE NULL END
   WHERE e.id = ANY(p_entry_ids)
     AND e.status <> 'matched'
     AND e.sign_flipped IS DISTINCT FROM p_flipped;

  GET DIAGNOSTICS v_changed = ROW_COUNT;

  -- Recalcular o opening é o que mantém a diferença do rodapé em zero. Sem
  -- isso, inverter uma linha move a diferença sozinho e trava o Finalizar.
  FOREACH v_import_id IN ARRAY v_imports LOOP
    v_opening := public._reconcile_recalc_opening(v_import_id);
    v_openings := v_openings || jsonb_build_array(
      jsonb_build_object('import_id', v_import_id, 'opening_balance', v_opening)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'flipped',          p_flipped,
    'changed_count',    coalesce(v_changed, 0),
    'requested_count',  coalesce(array_length(p_entry_ids, 1), 0),
    'imports',          v_openings
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_flip_sign(uuid[], boolean) IS
  'Inverte (ou desinverte) o sinal de linhas do extrato, em lote. O amount CRU nunca muda: a inversão vive em sign_flipped, é auditada (quem/quando) e reversível; effective_amount é coluna gerada. RECALCULA opening_balance de cada import afetado — sem isso a diferença do rodapé sai de zero sozinha e trava o Finalizar. Recusa linha já conciliada (o valor mudaria embaixo do match).';

-- ===========================================================================
-- 21. RPC — IGNORAR / REVERTER (individual e em lote)
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_ignore_entry(uuid);

CREATE FUNCTION public.reconcile_ignore_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry public.bank_statement_entries%ROWTYPE;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, false);

  IF v_entry.status = 'matched' THEN
    RAISE EXCEPTION 'Desfaça a conciliação antes de ignorar esta linha.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_entries SET status = 'ignored' WHERE id = p_entry_id;

  RETURN jsonb_build_object('entry_id', p_entry_id, 'status', 'ignored');
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_ignore_entry(uuid) IS
  'Marca uma linha do extrato como ignorada (sai do saldo conciliado, mas continua visível e reversível). Recusa linha conciliada: desfazer primeiro.';

DROP FUNCTION IF EXISTS public.reconcile_ignore_entries_batch(uuid[], uuid);

CREATE FUNCTION public.reconcile_ignore_entries_batch(
  p_entry_ids uuid[],
  p_import_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_import public.bank_statement_imports%ROWTYPE;
  v_count  integer;
BEGIN
  SELECT * INTO v_import FROM public.bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_write(v_import.company_id);

  IF v_import.status = 'finalized' THEN
    RAISE EXCEPTION 'Este extrato já foi finalizado. Não é possível alterar as linhas.' USING ERRCODE = 'P0001';
  END IF;

  -- Seleção em massa: linha fora do status-alvo é PULADA, não aborta o lote.
  -- GET DIAGNOSTICS fica no MESMO bloco PL/pgSQL do UPDATE de propósito.
  UPDATE public.bank_statement_entries
     SET status = 'ignored'
   WHERE id = ANY(p_entry_ids)
     AND import_id = p_import_id
     AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ignored_count',   coalesce(v_count, 0),
    'requested_count', coalesce(array_length(p_entry_ids, 1), 0)
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_ignore_entries_batch(uuid[], uuid) IS
  'Ignora em lote apenas as linhas pending do import informado. Linhas matched/ignored são puladas em silêncio (seleção em massa não pode abortar por causa de uma linha), e a contagem real volta no payload.';

DROP FUNCTION IF EXISTS public.reconcile_unignore_entries_batch(uuid[], uuid);

CREATE FUNCTION public.reconcile_unignore_entries_batch(
  p_entry_ids uuid[],
  p_import_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_import public.bank_statement_imports%ROWTYPE;
  v_count  integer;
BEGIN
  SELECT * INTO v_import FROM public.bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_write(v_import.company_id);

  IF v_import.status = 'finalized' THEN
    RAISE EXCEPTION 'Este extrato já foi finalizado. Não é possível alterar as linhas.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_entries
     SET status = 'pending'
   WHERE id = ANY(p_entry_ids)
     AND import_id = p_import_id
     AND status = 'ignored';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'unignored_count', coalesce(v_count, 0),
    'requested_count', coalesce(array_length(p_entry_ids, 1), 0)
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_unignore_entries_batch(uuid[], uuid) IS
  'Devolve em lote para pending apenas as linhas ignored do import informado. Linhas pending/matched são puladas em silêncio.';

-- ===========================================================================
-- 22. RPC — DESFAZER
--     Desfaz o EFEITO, não só o vínculo. Se não puder desfazer com segurança,
--     RECUSA com mensagem em PT-BR em vez de deixar meio-feito (invariante 7).
-- ===========================================================================

DROP FUNCTION IF EXISTS public.reconcile_unmatch_entry(uuid);

CREATE FUNCTION public.reconcile_unmatch_entry(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_entry    public.bank_statement_entries%ROWTYPE;
  v_match    public.reconciliation_matches%ROWTYPE;
  v_snapshot jsonb;
  v_undone   text;
  v_deleted  integer := 0;
  v_revert   jsonb;
BEGIN
  v_entry := public._reconcile_lock_entry(p_entry_id, false);

  SELECT * INTO v_match
    FROM public.reconciliation_matches
   WHERE entry_id = p_entry_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Sem match: só normaliza o status (linha ignorada volta a pendente).
    UPDATE public.bank_statement_entries SET status = 'pending' WHERE id = p_entry_id;
    RETURN jsonb_build_object('entry_id', p_entry_id, 'status', 'pending', 'undone', 'none');
  END IF;

  -- Os caminhos que APAGAM lançamento financeiro exigem a mesma permissão que a
  -- política de DELETE de financial_transactions cobra. RPC DEFINER não passa
  -- por RLS: sem este gate, quem não pode excluir excluiria por aqui.
  IF v_match.match_type IN ('created', 'card_bill', 'employee_vale')
     OR (v_match.match_type = 'transfer' AND v_match.transfer_pair_created)
  THEN
    IF auth.uid() IS NOT NULL
       AND NOT (public.is_super_admin(auth.uid()) OR public.can_delete_finance(auth.uid()))
    THEN
      RAISE EXCEPTION 'Desfazer esta conciliação exclui um lançamento financeiro, e você não tem permissão para excluir lançamentos.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_match.match_type = 'existing' THEN
    -- Vínculo puro: nada foi criado nem alterado. Só solta.
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
    v_undone := 'link';

  ELSIF v_match.match_type = 'settled' THEN
    v_snapshot := v_match.undo_snapshot;

    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'Não é possível desfazer esta baixa com segurança: o estado anterior da conta não foi registrado. Ajuste o lançamento pela tela do Financeiro.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Restaura EXATAMENTE o que estava antes (inclusive account_id, que pode
    -- ter sido NULL ou outra conta). "Chutar NULL" perderia a conta planejada.
    UPDATE public.financial_transactions
       SET is_paid    = coalesce((v_snapshot->>'is_paid')::boolean, false),
           paid_date  = (v_snapshot->>'paid_date')::date,
           account_id = (v_snapshot->>'account_id')::uuid,
           updated_at = now()
     WHERE id = v_match.financial_transaction_id;

    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
    v_undone := 'settlement_reverted';

  ELSIF v_match.match_type = 'created' THEN
    -- Apaga o match ANTES: o trigger de guarda recusaria o DELETE do
    -- lançamento enquanto o vínculo existir (e a FK adiada estouraria no
    -- COMMIT).
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
    DELETE FROM public.financial_transactions WHERE id = v_match.financial_transaction_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_undone := 'transaction_deleted';

  ELSIF v_match.match_type = 'transfer' THEN
    IF v_match.transfer_pair_created THEN
      IF v_match.transfer_pair_id IS NULL THEN
        RAISE EXCEPTION 'Não é possível desfazer esta transferência com segurança: o par não está identificado. Ajuste pela tela do Financeiro.'
          USING ERRCODE = 'P0001';
      END IF;

      -- Cenário real: o usuário conciliou o extrato das DUAS contas, e a perna
      -- oposta foi casada com uma linha do outro extrato. Apagar o par aqui
      -- derrubaria aquela conciliação. Checado ANTES de soltar este vínculo,
      -- pra a mensagem apontar o lugar certo.
      IF EXISTS (
        SELECT 1
          FROM public.financial_transactions t
          JOIN public.reconciliation_matches rm2 ON rm2.financial_transaction_id = t.id
         WHERE t.transfer_pair_id = v_match.transfer_pair_id
           AND rm2.entry_id <> p_entry_id
      ) THEN
        RAISE EXCEPTION 'A outra perna desta transferência está conciliada no extrato da outra conta. Desfaça a conciliação lá primeiro.'
          USING ERRCODE = 'P0001';
      END IF;

      DELETE FROM public.reconciliation_matches WHERE id = v_match.id;

      -- As DUAS pernas saem juntas. Apagar só uma deixaria meia transferência
      -- no sistema (e o saldo da outra conta errado para sempre).
      DELETE FROM public.financial_transactions
       WHERE transfer_pair_id = v_match.transfer_pair_id
         AND company_id = v_entry.company_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_undone := 'transfer_pair_deleted';
    ELSE
      DELETE FROM public.reconciliation_matches WHERE id = v_match.id;
      -- Par preexistente (o extrato da outra conta foi conciliado antes): a
      -- transferência é fato do sistema, não desta conciliação. Só solta.
      v_undone := 'link';
    END IF;

  ELSIF v_match.match_type = 'card_bill' THEN
    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;

    -- Estorno pelo caminho que JÁ EXISTE: apaga as duas pernas pelo
    -- transfer_pair_id, recomputa amount_paid/status/paid_at da fatura por SUM
    -- e desquita as compras — simétrico ao pay_credit_card_bill.
    v_revert := public.revert_credit_card_bill_payment(v_match.financial_transaction_id);
    v_undone := 'card_bill_payment_reverted';

  ELSIF v_match.match_type = 'employee_vale' THEN
    IF v_match.employee_movement_id IS NULL THEN
      RAISE EXCEPTION 'Não é possível desfazer este vale com segurança: o movimento do funcionário não está identificado. Ajuste pela tela de Funcionários.'
        USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.reconciliation_matches WHERE id = v_match.id;

    -- delete_employee_vale remove o par RH↔Financeiro e recalcula o saldo do
    -- funcionário. Apagar só o lado financeiro deixaria o extrato do
    -- funcionário mentindo.
    PERFORM public.delete_employee_vale(v_match.employee_movement_id);
    v_undone := 'employee_vale_deleted';

  ELSE
    RAISE EXCEPTION 'Tipo de conciliação desconhecido (%). Não é possível desfazer automaticamente.', v_match.match_type
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.bank_statement_entries SET status = 'pending' WHERE id = p_entry_id;

  RETURN jsonb_build_object(
    'entry_id',        p_entry_id,
    'status',          'pending',
    'match_type',      v_match.match_type,
    'undone',          v_undone,
    'deleted_count',   coalesce(v_deleted, 0),
    'card_bill_revert', v_revert
  );
END;
$fn$;

COMMENT ON FUNCTION public.reconcile_unmatch_entry(uuid) IS
  'Desfaz a conciliação de uma linha DESFAZENDO O EFEITO: existing solta só o vínculo; settled restaura is_paid/paid_date/account_id do undo_snapshot; created apaga o lançamento criado; transfer apaga AS DUAS pernas quando o par foi criado aqui (e só solta o vínculo quando a perna era preexistente); card_bill estorna por revert_credit_card_bill_payment; employee_vale remove o par RH↔Financeiro por delete_employee_vale. Linha sem match apenas volta a pending. Quando não há como desfazer com segurança, RECUSA em PT-BR em vez de deixar meio-feito. Os caminhos destrutivos exigem a mesma permissão de exclusão do Financeiro.';

-- ===========================================================================
-- 23. RPC — FINALIZAR
-- ===========================================================================

DROP FUNCTION IF EXISTS public.finalize_bank_reconciliation(uuid);

CREATE FUNCTION public.finalize_bank_reconciliation(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_import     public.bank_statement_imports%ROWTYPE;
  v_reconciled numeric;
  v_difference numeric;
  v_pending    integer;
BEGIN
  SELECT * INTO v_import FROM public.bank_statement_imports WHERE id = p_import_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extrato não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM public._reconcile_assert_write(v_import.company_id);

  IF v_import.status = 'finalized' THEN
    RAISE EXCEPTION 'Este extrato já foi finalizado.' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(v_import.opening_balance, 0)
         + coalesce(SUM(e.effective_amount) FILTER (WHERE e.status <> 'ignored'), 0),
         count(*) FILTER (WHERE e.status = 'pending')
    INTO v_reconciled, v_pending
    FROM public.bank_statement_entries e
   WHERE e.import_id = p_import_id;

  v_difference := round(coalesce(v_import.ledger_balance, 0) - coalesce(v_reconciled, 0), 2);

  -- NUNCA criar lançamento-tampão pra forçar o zero. Se não fecha, não fecha:
  -- a diferença é informação, não obstáculo a ser contornado.
  IF coalesce(v_pending, 0) > 0 OR abs(v_difference) > 0.01 THEN
    RAISE EXCEPTION 'Conciliação incompleta: % linha(s) pendente(s) e diferença de R$ %.',
      coalesce(v_pending, 0), to_char(v_difference, 'FM999999990.00')
      USING ERRCODE = 'P0001',
            DETAIL  = format('pending=%s difference=%s', coalesce(v_pending, 0), v_difference);
  END IF;

  UPDATE public.bank_statement_imports
     SET status       = 'finalized',
         finalized_at = now(),
         finalized_by = auth.uid()
   WHERE id = p_import_id;

  RETURN jsonb_build_object(
    'import_id',          p_import_id,
    'status',             'finalized',
    'reconciled_balance', round(coalesce(v_reconciled, 0), 2),
    'difference',         v_difference,
    'finalized_at',       now()
  );
END;
$fn$;

COMMENT ON FUNCTION public.finalize_bank_reconciliation(uuid) IS
  'Fecha o extrato. Só aceita com ZERO linhas pendentes E diferença de no máximo R$ 0,01. Nunca oferece lançamento-tampão para forçar o zero: diferença é informação, não obstáculo. value_difference dos matches manuais NÃO entra nesta conta.';

-- ===========================================================================
-- 24. GRANTS
--     Internas (prefixo _ e _reconcile_tx_json) ficam SEM grant: são chamadas
--     de dentro de RPC DEFINER, que roda como o dono. Dar grant abriria
--     sondagem de entry_id/lançamento de outro tenant.
-- ===========================================================================

REVOKE ALL ON FUNCTION public._reconcile_tx_json(public.financial_transactions, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reconcile_lock_entry(uuid, boolean)                        FROM PUBLIC, anon, authenticated;

DO $grants$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.create_bank_statement_import(uuid, text, text, text, text, date, date, numeric, date, jsonb)',
    'public.get_statement_imports(uuid)',
    'public.get_bank_reconciliation_state(uuid)',
    'public.reconcile_search_candidates(uuid, text)',
    'public.reconcile_list_card_bills(uuid)',
    'public.reconcile_list_transfer_legs(uuid)',
    'public.reconcile_match_existing(uuid, uuid, text, boolean)',
    'public.reconcile_settle_transaction(uuid, uuid)',
    'public.reconcile_create_transaction(uuid, uuid, text, uuid, uuid, uuid, text)',
    'public.reconcile_create_transfer(uuid, uuid, text)',
    'public.reconcile_pay_card_bill(uuid, uuid, numeric, text)',
    'public.reconcile_create_employee_movement(uuid, uuid, text, uuid, text, uuid)',
    'public.reconcile_flip_sign(uuid[], boolean)',
    'public.reconcile_ignore_entry(uuid)',
    'public.reconcile_ignore_entries_batch(uuid[], uuid)',
    'public.reconcile_unignore_entries_batch(uuid[], uuid)',
    'public.reconcile_unmatch_entry(uuid)',
    'public.finalize_bank_reconciliation(uuid)'
  ]
  LOOP
    -- anon NUNCA executa conciliação. REVOKE explícito do default PUBLIC é o
    -- que impede o visitante da internet de nem chegar na guarda.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_sig);
  END LOOP;
END
$grants$;

COMMIT;

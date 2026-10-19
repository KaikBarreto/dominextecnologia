-- Competencia no fuso da empresa FORA DO PDV: folha e recebivel de cobranca
--
-- Continuacao direta da migration 20261019010000 (PDV). A regua estabelecida
-- la vale aqui, sem excecao e sem variante:
--
--   COMPETENCIA EM financial_transactions = public.company_today(company_id)
--   NUNCA CURRENT_DATE, NUNCA now()::date.
--
-- O banco roda em UTC (current_setting('TimeZone') = 'UTC', conferido no
-- servidor). UTC esta 3h adiante de Sao Paulo, entao a partir das 21h locais o
-- dia do servidor JA E O DIA SEGUINTE. Medicao do momento em que esta migration
-- foi escrita, no servidor de producao:
--
--     now()                                   = 2026-10-19 01:00:22 +00
--     now() AT TIME ZONE 'America/Sao_Paulo'  = 2026-10-18 22:00:22
--     CURRENT_DATE                            = 2026-10-19   <-- amanha
--     public.company_today(<empresa>)         = 2026-10-18   <-- hoje de verdade
--
-- TRES PONTOS CONSERTADOS, cada um medido ao vivo nessa janela, dentro de
-- BEGIN/ROLLBACK (zero residuo em producao):
--
-- 1) public.pay_payroll_transaction  -- paid_date (caixa)
--    ANTES: chamada real devolveu paid_date = 2026-10-19 com a empresa em 18/10.
--    Folha paga as 22h saia do caixa de um dia que ainda nao comecou.
--
-- 2) public.create_tenant_charge_receivable  -- transaction_date (competencia)
--    ANTES: recebivel nasceu com transaction_date = 2026-10-19 com a empresa em
--    18/10. Esta e a funcao que gravou as linhas tortas "Contrato: ..." achadas
--    em producao (ver bloco de backfill no fim deste arquivo). A grafia aqui era
--    `now()::date`, nao CURRENT_DATE -- o mesmo defeito com outro nome, razao
--    pela qual uma varredura que procurasse so por CURRENT_DATE o perderia.
--
-- 3) public.generate_payroll_for_employee(uuid,integer,date)  -- ancora da JANELA
--    Aqui o CURRENT_DATE nao carimbava transaction_date (esse vem de
--    p.due_date, calculado por compute_payroll_periods e NAO mexido aqui): ele
--    era o fallback da ancora de "hoje" que abre e fecha a janela de geracao.
--    Latente hoje, grave em dia de borda -- varrendo as noites de 18/10 a 17/12,
--    na noite de 2026-11-01 VINTE E DOIS dos 25 funcionarios ativos recebem um
--    conjunto de periodos diferente com a ancora errada (idem 09/11 e 03/12).
--    Hoje nenhum divergia, por isso nao ha dado torto de folha pra corrigir.
--
-- O QUE NAO FOI TOCADO, DE PROPOSITO:
--   - compute_payroll_periods: e quem decide mes/semana de competencia da folha.
--     Mes e mes calendario, e isso e regra de negocio de folha, nao ancora de
--     data. Fora do escopo desta migration.
--   - a sobrecarga generate_payroll_for_employee(uuid,integer): wrapper puro,
--     sem data propria. Nao recriada, grants intocados.
--   - public.heal_orphan_tenant_charge_receivables: tem um CURRENT_DATE real em
--     paid_date. E funcao de reparo manual e estava fora do escopo autorizado;
--     reportada ao Tech Lead em vez de alterada por conta propria.
--
-- IDEMPOTENTE: CREATE OR REPLACE nas tres funcoes, REVOKE/GRANT reafirmados, e
-- o backfill do fim tem guarda que o torna no-op na segunda execucao. Rodar
-- duas vezes nao quebra e nao subtrai um segundo dia.
--
-- ASSINATURAS INALTERADAS nas tres -> src/integrations/supabase/types.ts NAO
-- precisa de regen (conferido: nenhum parametro, nome ou tipo de retorno mudou).


-- ===========================================================================
-- 1. public.generate_payroll_for_employee(uuid, integer, date)
--    Recriada a partir de pg_get_functiondef da versao VIVA, por substituicao
--    pontual das duas ancoras. Nenhuma outra linha alterada.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.generate_payroll_for_employee(p_employee_id uuid, p_lookahead_days integer, p_today date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp record;
  p record;
  inserted_count int := 0;
  category_id uuid;
BEGIN
  SELECT id, company_id, name, salary, is_active
    INTO emp
    FROM public.employees
   WHERE id = p_employee_id;

  IF NOT FOUND OR emp.is_active = false OR emp.salary IS NULL OR emp.salary <= 0 THEN
    RETURN 0;
  END IF;

  -- Garante categoria "Folha de Pagamento" para a empresa
  SELECT id INTO category_id
    FROM public.financial_categories
   WHERE company_id = emp.company_id AND name = 'Folha de Pagamento'
   LIMIT 1;

  IF category_id IS NULL THEN
    INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system)
    VALUES (emp.company_id, 'Folha de Pagamento', 'saida', '#f59e0b', 'Users', 'opex', true)
    RETURNING id INTO category_id;
  END IF;

  FOR p IN
    -- p_today: dia ja resolvido no fuso da empresa pelo chamador. A edge
    -- `generate-payroll` (o cron) manda o dia local da empresa, e esse caminho
    -- NAO muda em nada aqui -- o COALESCE continua preferindo p_today.
    --
    -- O QUE MUDOU (2026-10-19): o FALLBACK. Era CURRENT_DATE, que e o dia do
    -- SERVIDOR, e o servidor roda em UTC (current_setting('TimeZone') = 'UTC',
    -- conferido). Depois das 21h de Sao Paulo CURRENT_DATE JA E AMANHA, e a
    -- janela de geracao da folha abria e fechava um dia adiantada.
    --
    -- NAO e teorico: varrendo as noites de 18/10 a 17/12 comparando a ancora
    -- certa (d) com a errada (d+1), na noite de 2026-11-01 VINTE E DOIS dos 25
    -- funcionarios ativos recebem um conjunto de periodos DIFERENTE. Nas noites
    -- de 09/11 e 03/12, idem. Hoje (18/10) nenhum divergia -- o estrago so
    -- aparece quando o +1 dia cruza a borda de um periodo, e aí ele e grande.
    --
    -- A ancora agora e public.company_today(company_id), a MESMA regua que o
    -- resto do Financeiro (pagamento em lote, baixa de recebivel, compra direta)
    -- e o PDV (migration 20261019010000) usam pra carimbar
    -- financial_transactions. Nao se inventa uma terceira ancora; brt_today()
    -- continua sendo a regua do painel Auctus e nao se mistura com isto.
    --
    -- Funcionario SEM empresa (orfao, que o cron chama pela sobrecarga de 2
    -- argumentos): company_today(NULL) nao acha company_settings e cai no
    -- fallback 'America/Sao_Paulo' -- medido, devolveu 2026-10-18 enquanto
    -- CURRENT_DATE devolvia 2026-10-19. Palpite melhor que UTC, nunca pior.
    SELECT * FROM public.compute_payroll_periods(
      emp.id,
      COALESCE(p_today, public.company_today(emp.company_id)),
      COALESCE(p_today, public.company_today(emp.company_id)) + p_lookahead_days
    )
  LOOP
    BEGIN
      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount,
        transaction_date, due_date, is_paid, category,
        employee_id, payroll_period, payroll_kind
      ) VALUES (
        emp.company_id, 'saida',
        'Folha ' || emp.name || ' — ' || p.period,
        ROUND((emp.salary * p.amount_factor)::numeric, 2),
        p.due_date, p.due_date, false,
        'Folha de Pagamento',
        emp.id, p.period, 'salary'
      );
      inserted_count := inserted_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Já existe folha não-cancelada para esse período: ignora (idempotente)
      NULL;
    END;
  END LOOP;

  RETURN inserted_count;
END
$function$;


-- ===========================================================================
-- 2. public.pay_payroll_transaction(...)
--    Recriada a partir de pg_get_functiondef da versao VIVA. Alem da troca da
--    ancora, a unica mudanca estrutural e `paid_d` sair do DECLARE pro corpo --
--    obrigatorio, porque company_today precisa do company_id da transacao.
--    A guarda de posse fail-closed e toda a semantica de pagamento ficam iguais.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.pay_payroll_transaction(p_transaction_id uuid, p_account_id uuid, p_paid_date date DEFAULT NULL::date, p_vale_discount numeric DEFAULT 0, p_net_amount numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_payment_method text DEFAULT 'pix'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  txn record;
  emp_company_id uuid;
  -- Resolvido no CORPO, nao aqui: a ancora de competencia depende de
  -- txn.company_id, que so existe depois do SELECT da transacao.
  paid_d date;
  effective_amount numeric;
  v_is_authorized boolean := false;
BEGIN
  SELECT id, company_id, employee_id, amount, payroll_kind, is_paid
    INTO txn
    FROM public.financial_transactions
   WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação não encontrada';
  END IF;

  IF txn.is_paid THEN
    RAISE EXCEPTION 'Transação já está paga';
  END IF;

  IF txn.employee_id IS NULL OR txn.payroll_kind IS NULL THEN
    RAISE EXCEPTION 'Transação não é de folha de pagamento';
  END IF;

  -- Guarda de posse (fail-closed): v_is_authorized nasce false, só vira true
  -- por condição explícita e nunca-NULL. A guarda anterior
  -- (`auth.uid() IS NOT NULL AND get_user_company_id(...) IS DISTINCT FROM
  -- txn.company_id`) era fail-open: com auth.uid() NULL a condição inteira
  -- vira FALSE e a guarda é pulada sem checar nada. Não explorável hoje
  -- (anon sem GRANT, authenticated sempre tem uid), mas latente. Mesma
  -- semântica de autorização de antes (service_role OU dono da mesma
  -- empresa da transação) — não amplia acesso, só fecha o caminho de NULL.
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
        AND public.get_user_company_id(auth.uid()) = txn.company_id THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Sem permissão para pagar esta transação';
  END IF;

  -- COMPETENCIA DE CAIXA NO FUSO DA EMPRESA (2026-10-19).
  --
  -- Era `paid_d date := COALESCE(p_paid_date, CURRENT_DATE)` no DECLARE.
  -- CURRENT_DATE e o dia do SERVIDOR e o servidor roda em UTC, entao depois
  -- das 21h de Sao Paulo ele JA E AMANHA. MEDIDO EM PRODUCAO em
  -- 2026-10-19 01:00 UTC (= 2026-10-18 22:00 em Sao Paulo), chamando esta
  -- propria funcao dentro de BEGIN/ROLLBACK: ela devolveu
  --     paid_date = 2026-10-19   com company_today = 2026-10-18
  -- isto e, a folha paga as 22h entrava no caixa do DIA SEGUINTE. Quem paga
  -- a folha no fim da noite via o dinheiro sair de um dia que ainda nao
  -- comecou, e o fechamento do dia nao batia.
  --
  -- A resolucao SAIU DO DECLARE de proposito: public.company_today precisa
  -- do company_id da transacao, que so e conhecido depois do SELECT acima.
  -- p_paid_date explicito continua tendo precedencia (retrodatar segue
  -- funcionando igual); so o FALLBACK mudou de UTC pro fuso da empresa.
  paid_d := COALESCE(p_paid_date, public.company_today(txn.company_id));

  effective_amount := COALESCE(p_net_amount, txn.amount);

  UPDATE public.financial_transactions
     SET is_paid = true,
         paid_date = paid_d,
         account_id = p_account_id,
         payment_method = COALESCE(p_payment_method, payment_method),
         amount = effective_amount,
         -- ÚNICA LINHA NOVA. Caixa (`amount`) = líquido pago; Competência
         -- (`accrual_amount`) = líquido + vales abatidos = bruto do ciclo. Com
         -- vale 0 os dois valores coincidem e a DRE não muda em nada — que é o
         -- caso de 100% da base hoje (zero vales).
         accrual_amount = effective_amount + COALESCE(p_vale_discount, 0),
         notes = COALESCE(p_notes, notes),
         updated_at = now()
   WHERE id = p_transaction_id;

  -- Registra movement de pagamento no extrato do funcionário
  INSERT INTO public.employee_movements (
    employee_id, type, amount, balance_after, description, payment_method, created_by
  ) VALUES (
    txn.employee_id, 'pagamento', effective_amount, 0,
    'Folha quitada via Contas a Pagar',
    p_account_id::text, auth.uid()
  );

  -- Reset cycle (mesmo padrão do handlePayment existente)
  INSERT INTO public.employee_movements (
    employee_id, type, amount, balance_after, description, created_by
  ) SELECT
    txn.employee_id, 'ajuste', e.salary, e.salary, 'Reset para salário base', auth.uid()
    FROM public.employees e WHERE e.id = txn.employee_id;

  RETURN jsonb_build_object(
    'transaction_id', txn.id,
    'employee_id', txn.employee_id,
    'amount', effective_amount,
    -- Chave ADITIVA (o único chamador ignora o payload, só checa `error`):
    -- serve de prova de QA sem precisar de um SELECT depois.
    'accrual_amount', effective_amount + COALESCE(p_vale_discount, 0),
    'paid_date', paid_d
  );
END
$function$;


-- ===========================================================================
-- 3. public.create_tenant_charge_receivable(...)
--    Recriada a partir de pg_get_functiondef da versao VIVA. Uma linha trocada:
--    now()::date -> public.company_today(p_company_id). As guardas de posse
--    (centro de custo, OS, cobranca) e a de dupla contagem de orcamento ficam
--    byte a byte como estavam.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.create_tenant_charge_receivable(p_company_id uuid, p_tenant_charge_id uuid, p_customer_id uuid, p_amount numeric, p_due_date date, p_description text, p_account_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_cost_center_id uuid DEFAULT NULL::uuid, p_service_order_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Posse da OS (2026-10-15, faturar-OS): mesmo raciocínio do centro de custo.
  -- `p_service_order_id` vem de fora (edge), e RLS não cobre SECURITY DEFINER.
  -- Sem este check, uma OS de outro tenant viraria FK cross-tenant silenciosa
  -- no recebível — e a OS alheia passaria a aparecer como "já faturada".
  IF p_service_order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_orders so
       WHERE so.id = p_service_order_id
         AND so.company_id = p_company_id
    ) THEN
      RAISE EXCEPTION '[create_tenant_charge_receivable] ordem de serviço não pertence à empresa informada'
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
  --
  -- `service_order_id` (2026-10-15): é O elo que faz os dois caminhos de
  -- faturamento se enxergarem. Com ele, `os_billing_state` e o
  -- `useOsRevenueSummary` que a tela da OS JÁ LÊ passam a contar o recebível
  -- nascido de cobrança como "OS já faturada". NULL pros 3 caminhos antigos.
  --
  -- NOTA: este INSERT passa pelo trigger `trg_block_os_manual_revenue_when_charged`
  -- (1.4 desta migration) e é LIBERADO por ele, porque `tenant_charge_id` vem
  -- preenchido. É exatamente a condição que impede a trava de bloquear o próprio
  -- recebível que a cobrança acabou de gerar.
  INSERT INTO public.financial_transactions (
    company_id,
    transaction_type,
    amount,
    description,
    customer_id,
    due_date,
    tenant_charge_id,
    service_order_id,
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
    p_service_order_id,
    false,
    -- COMPETENCIA NO FUSO DA EMPRESA (2026-10-19). Era `now()::date`, que e
    -- o mesmo defeito do CURRENT_DATE com outra grafia: now() e timestamptz
    -- e o ::date resolve no TimeZone da sessao, que no servidor e UTC.
    -- Depois das 21h de Sao Paulo isso JA E AMANHA.
    --
    -- ESTA LINHA E A CAUSA DAS 7 LINHAS TORTAS 'Contrato: ...' encontradas em
    -- producao (empresa eacad75e-...): todas criadas entre 21h21 e 22h35 no
    -- horario local e todas carimbadas com transaction_date exatamente +1 dia
    -- em relacao ao dia local da criacao. Reproduzido ao vivo em
    -- 2026-10-19 01:00 UTC dentro de BEGIN/ROLLBACK: o recebivel nasceu com
    -- transaction_date = 2026-10-19 com a empresa ainda em 2026-10-18.
    --
    -- p_company_id ja e obrigatorio (validado no topo) e ja teve a posse
    -- conferida contra tenant_charges, entao company_today(p_company_id) e
    -- a empresa certa, nao um palpite.
    public.company_today(p_company_id),
    p_account_id,
    p_category,
    p_cost_center_id,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;


-- ===========================================================================
-- PRIVILEGIO
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE preserva GRANT (so DROP perde), entao isto e reafirmacao.
-- Mesmo assim o REVOKE vem explicito e ANTES, e inclui `authenticated` junto de
-- PUBLIC e anon: revogar so de `anon` e insuficiente, e foi exatamente assim
-- que a pdv_assert_ref_company nasceu executavel por quem nao devia.
--
-- Os GRANTs abaixo REPRODUZEM O BASELINE MEDIDO ANTES da migration, via
-- has_function_privilege (nunca lendo proacl). Nenhum acesso e ampliado:
--   generate_payroll_for_employee(uuid,integer,date) -> service_role SO
--   pay_payroll_transaction(...)                     -> authenticated + service_role
--   create_tenant_charge_receivable(...)             -> service_role SO
-- ===========================================================================

-- Chamada apenas pela edge `generate-payroll` (cron, service_role). NAO volta
-- pra authenticated: o baseline nao tinha, e a folha nao e gerada do browser.
REVOKE ALL ON FUNCTION public.generate_payroll_for_employee(uuid, integer, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_payroll_for_employee(uuid, integer, date)
  TO service_role;

-- Chamada da tela de Contas a Pagar pelo usuario logado -> authenticated entra.
-- A funcao tem guarda de posse propria (service_role OU dono da mesma empresa).
REVOKE ALL ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text)
  TO authenticated, service_role;

-- Chamada so por edge (criacao de cobranca e webhook de assinatura). Recebe
-- p_company_id de fora, entao authenticated aqui seria um caminho pra gravar
-- receita em empresa alheia -- fica fora, como estava.
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid, uuid)
  TO service_role;


-- ===========================================================================
-- DOCUMENTACAO
-- ===========================================================================

COMMENT ON FUNCTION public.generate_payroll_for_employee(uuid, integer, date) IS
  'Gera as folhas futuras de um funcionario dentro da janela [hoje, hoje + p_lookahead_days]. p_today e o dia ja resolvido no fuso da empresa pelo chamador (a edge generate-payroll manda o dia local). Quando p_today e NULL o fallback e public.company_today(company_id), NUNCA CURRENT_DATE: o banco roda em UTC e depois das 21h de Sao Paulo CURRENT_DATE ja e amanha, o que deslocava a janela em um dia (na noite de 2026-11-01, 22 dos 25 funcionarios ativos pegariam periodos diferentes). O transaction_date de cada folha continua vindo de compute_payroll_periods (due_date do periodo), nao do dia da geracao.';

COMMENT ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text) IS
  'Quita uma folha lancada em financial_transactions: valida posse (fail-closed), baixa a transacao, separa caixa (amount) de competencia (accrual_amount = liquido + vales) e registra os movimentos no extrato do funcionario. O paid_date, quando nao informado, e public.company_today(company_id) e NUNCA CURRENT_DATE: o banco roda em UTC e a folha paga depois das 21h de Sao Paulo caia no caixa do dia seguinte (medido: paid_date 2026-10-19 com a empresa em 2026-10-18). p_paid_date explicito continua tendo precedencia.';

COMMENT ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text, uuid, uuid) IS
  'Cria o recebivel-mae de uma cobranca (tenant_charges) em financial_transactions, de forma idempotente e com guardas de posse por company_id (RLS nao cobre SECURITY DEFINER) e de dupla contagem de orcamento. A COMPETENCIA (transaction_date) e public.company_today(p_company_id), nunca now()::date nem CURRENT_DATE: o banco roda em UTC e depois das 21h de Sao Paulo o recebivel nascia com competencia de amanha -- foi o que torceu as linhas "Contrato: ..." criadas de madrugada (UTC) em outubro/2026.';


-- ===========================================================================
-- BACKFILL -- as 6 linhas "Contrato: ..." autorizadas pelo CEO
-- ---------------------------------------------------------------------------
-- ESCOPO FECHADO EM LISTA DE IDs, NAO EM PREDICADO. Isto e deliberado: existem
-- 678+ linhas de origin='geral' com competencia futura LEGITIMA, e um predicado
-- "parece torto" encostaria nelas. Aqui so entram os 6 ids cuja assinatura foi
-- provada individualmente:
--   (a) criados por create_tenant_charge_receivable (tenant_charge_id presente,
--       created_by NULL -- a funcao grava created_by NULL);
--   (b) criados entre 21h e 00h no horario LOCAL da empresa; e
--   (c) transaction_date exatamente +1 dia em relacao ao dia local da criacao.
--
-- ANTES -> DEPOIS (todos da empresa eacad75e-3da3-4df4-b19c-7351890f5148):
--   fb01115e  2026-10-18 -> 2026-10-17   (criada 17/10 21:21 local)
--   d7f0c1fb  2026-10-18 -> 2026-10-17   (criada 17/10 21:38 local)
--   6dbc4c6b  2026-10-18 -> 2026-10-17   (criada 17/10 21:59 local)
--   4d58379e  2026-10-18 -> 2026-10-17   (criada 17/10 22:07 local)
--   fceb9c84  2026-10-18 -> 2026-10-17   (criada 17/10 22:20 local)
--   8aec0996  2026-10-18 -> 2026-10-17   (criada 17/10 22:35 local)
--
-- FICARAM DE FORA, e por que:
--   db0851bc (criada 17/10 20:46 local, delta 0) -- antes das 21h, nunca torta.
--   ef4e1e11 (18/10 19:40, delta 0) e 59d1cbd6 (18/10 19:51, delta 0) -- idem.
--   b1b14691 (criada 18/10 21:59 local, transaction_date 2026-10-19, delta +1)
--     -- SETIMA linha, com a assinatura IDENTICA as 6, mas gravada DEPOIS do
--     relatorio que autorizou as 6. NAO entra aqui: a autorizacao foi para 6
--     linhas nominais e "estender por semelhanca" e exatamente o que foi
--     proibido. Reportada ao Tech Lead para autorizacao propria.
--
-- GUARDA DE IDEMPOTENCIA: o UPDATE exige transaction_date = valor torto
-- CONHECIDO. Depois de corrigida a linha nao casa mais, entao rodar de novo e
-- no-op e NUNCA subtrai um segundo dia.
--
-- COMO DESFAZER (todas as 6 de uma vez, exato):
--   UPDATE public.financial_transactions
--      SET transaction_date = transaction_date + 1
--    WHERE id IN ('fb01115e-32d2-4114-9489-9c0b83e63e5a',
--                 'd7f0c1fb-f7dc-4750-b224-b75ab13279ab',
--                 '6dbc4c6b-2dfe-465c-b333-4c85325d3490',
--                 '4d58379e-09a8-44b5-996b-3e4b7cbd97cd',
--                 'fceb9c84-ff57-43a7-a124-cfc872a5da76',
--                 '8aec0996-a95d-4384-990e-d664d05b7311')
--      AND transaction_date = DATE '2026-10-17';
-- ===========================================================================

DO $backfill$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.financial_transactions
     SET transaction_date = DATE '2026-10-17'
   WHERE id IN ('fb01115e-32d2-4114-9489-9c0b83e63e5a',
                'd7f0c1fb-f7dc-4750-b224-b75ab13279ab',
                '6dbc4c6b-2dfe-465c-b333-4c85325d3490',
                '4d58379e-09a8-44b5-996b-3e4b7cbd97cd',
                'fceb9c84-ff57-43a7-a124-cfc872a5da76',
                '8aec0996-a95d-4384-990e-d664d05b7311')
     -- Guarda: so corrige quem ainda esta com o valor torto conhecido.
     AND transaction_date = DATE '2026-10-18';

  -- GET DIAGNOSTICS no MESMO bloco PL/pgSQL do UPDATE. Fora dele leria 0.
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 6 THEN
    RAISE NOTICE '[backfill contrato] 6 linhas corrigidas de 2026-10-18 para 2026-10-17.';
  ELSIF v_rows = 0 THEN
    RAISE NOTICE '[backfill contrato] no-op: as 6 linhas ja estavam corrigidas (reexecucao).';
  ELSE
    RAISE NOTICE '[backfill contrato] ATENCAO: % linha(s) corrigida(s), esperado 6 ou 0. Conferir manualmente.', v_rows;
  END IF;
END
$backfill$;

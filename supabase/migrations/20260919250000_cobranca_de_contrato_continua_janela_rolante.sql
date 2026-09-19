-- ============================================================================
-- Cobrança de contrato "contínua" (sem data para terminar) — JANELA ROLANTE
-- ============================================================================
--
-- CONTEXTO / POR QUE ESTA MIGRATION EXISTE:
--   As parcelas de um contrato NÃO são um plano virtual: são linhas REAIS de
--   public.financial_transactions (transaction_type='entrada', contract_id
--   preenchido), criadas de uma vez na etapa "Financeiro" do
--   ContractFormDialog via useContracts.createContractInstallments. São as
--   MESMAS linhas que a aba Financeiro do contrato lista, que a DRE por
--   competência soma e que a cobrança online (tenant_charges, source_type=
--   'contract_installment') se LIGA — ver 20260919180000.
--
--   Por isso "contrato sem fim" NÃO pode ser resolvido materializando o teto
--   físico (MAX_REPETITION_COUNT = 120, em src/lib/finance-installments.ts):
--   num contrato de R$ 450/mês isso são R$ 54.000 de "a receber" fantasma
--   empurrados pra DRE de competência, e um reajuste anual viraria 108 linhas
--   pra corrigir à mão.
--
--   A solução é a MESMA que a recorrência de tarefa já usa em produção desde
--   20260916160000_tarefa_recorrencia_indeterminada.sql: JANELA ROLANTE. A
--   série nasce com um horizonte de segurança e um cron diário empurra esse
--   horizonte pra frente, sempre ancorado na ÚLTIMA parcela já materializada.
--
-- POR QUE 24 MESES (e não os 12 da recorrência de tarefa):
--   Em tarefa, "ocorrência" é uma visita na agenda. Em cobrança, ocorrência é
--   LINHA DE DINHEIRO, e a frequência de cobrança pode ser anual. Com 12
--   meses de horizonte um contrato ANUAL teria 1 (uma) parcela materializada
--   — a série pareceria não-contínua e qualquer atraso do cron deixaria o
--   cliente sem cobrança. Com 24 meses:
--     mensal (1)     → 24 parcelas  (R$ 450/mês = R$ 10.800 de a receber)
--     bimestral (2)  → 12 parcelas
--     trimestral (3) →  8 parcelas
--     semestral (6)  →  4 parcelas
--     anual (12)     →  2 parcelas
--   Compare com materializar 120: R$ 54.000 fantasma no mesmo contrato de
--   R$ 450. 24 meses é 1/5 disso e ainda cobre o pior caso (anual).
--
-- O TETO É REQUISITO, NÃO DETALHE (pedido explícito do CEO: "limite pra não
-- gerar inúmeras sem razão"). São TRÊS tetos independentes, todos abaixo:
--   (a) HORIZONTE  = hoje + 24 meses  → nenhuma parcela nasce além disso.
--   (b) LOTE       = 24 novas parcelas por contrato POR RODADA → mesmo que um
--       contrato fique dormente (cron fora do ar, contrato pausado por meses),
--       uma única rodada nunca despeja mais que 24 linhas. O resto vem na
--       rodada seguinte.
--   (c) GUARDA FÍSICA = 120 (MAX_REPETITION_COUNT). Se um contrato já tiver
--       120+ parcelas FUTURAS em aberto, o cron PULA e registra. Pelo desenho
--       isso é inalcançável (o máximo por desenho é 24 futuras); se acontecer,
--       é sinal de que alguma outra coisa está inserindo — e a guarda impede
--       que o cron piore a situação.
--   NOTA sobre o que NÃO virou teto (e por quê): a recorrência de tarefa capa
--   o TOTAL de ocorrências da série desde a origem (60). Isso tem um efeito
--   colateral que não quis repetir aqui: passados 60 meses a série mensal
--   PARA de ser estendida em silêncio (o cron gera o array a partir da origem
--   e o cap morde antes do horizonte). Em dinheiro isso seria o contrato
--   simplesmente deixar de faturar sem ninguém perceber. Aqui o teto (b) é
--   por RODADA, não desde a origem — uma série contínua de 10 anos continua
--   sendo estendida normalmente.
--
-- ============================================================================
-- CONTRATO FIXO COM O FRONT (não renomear — o dev de UI grava exatamente isto)
-- ============================================================================
--   contracts.finance_indeterminate   boolean NOT NULL DEFAULT false
--   contracts.finance_interval_months smallint NULL   (1..12)
--   contracts.finance_anchor_date     date     NULL
--
--   Ligar o interruptor "cobrança contínua" na etapa Financeiro grava os TRÊS
--   de uma vez (há CHECK que recusa a flag sem os outros dois):
--     finance_indeterminate   = true
--     finance_interval_months = meses entre parcelas (mensal=1, bimestral=2,
--                               trimestral=3, semestral=6, anual=12) — é a
--                               MESMA `intervalMonths` que o front já passa
--                               pra buildRepetitionPlan.
--     finance_anchor_date     = data do PRIMEIRO vencimento (finEffectiveFirstDue)
--   Desligar grava finance_indeterminate=false (os outros dois podem ficar).
--
-- ============================================================================
-- POR QUE ESTAS TRÊS COLUNAS, E POR QUE NENHUMA A MAIS
-- ============================================================================
-- Régua usada: **REGRA se guarda, ESTADO se deriva.** Uma regra é uma decisão
-- do usuário que não está escrita em lugar nenhum nos dados; inferi-la é o
-- erro que a migration 20260916160000 rejeitou por escrito (ela achou 40
-- tarefas legadas que "pareciam" sem fim e teria mudado o passado delas em
-- silêncio). Estado é observável e mudar junto com ele é exatamente o que
-- queremos.
--
-- GUARDADO (é regra, não está nos dados):
--   • finance_indeterminate — não existe nenhum jeito honesto de olhar as
--     parcelas de um contrato e saber se o gestor quis "sem fim". Hoje, em
--     produção, 8 contratos têm parcelas e TODOS foram gerados com contagem
--     fixa (72, 7 parcelas); qualquer inferência os converteria em contínuos.
--   • finance_interval_months — o passo é regra, não observação. Dá pra
--     "adivinhar" pela diferença entre as duas últimas parcelas, mas isso
--     quebra em dois casos reais: contrato com 1 parcela só (anual recém
--     criado depois que o gestor apaga uma), e vencimento editado à mão (o
--     gestor empurra uma parcela e o cron passaria a achar que o contrato
--     virou bimestral). Guardar custa 2 bytes e elimina a classe inteira.
--   • finance_anchor_date — é o que preserva o DIA do vencimento com clamp de
--     fim de mês. Ancorando em 31/01, a série é 31/01 → 28/02 → 31/03 →
--     30/04 (o `+ interval` do Postgres clampa e o passo é sempre medido
--     DESDE a âncora, nunca cumulativo). Se fosse derivado de MIN(due_date),
--     bastaria o gestor apagar a primeira parcela pra âncora virar 28/02 e
--     TODOS os vencimentos futuros caírem pro dia 28 sozinhos — o cliente
--     passaria a ser cobrado num dia que ninguém combinou, em silêncio.
--
-- DERIVADO (é estado, e queremos seguir o estado):
--   • "última parcela gerada" = MAX(due_date) das linhas do contrato. NÃO
--     virou coluna (`finance_last_generated_date`) de propósito: uma coluna
--     dessas é um cache do mesmo fato, e cache tem um jeito só de falhar —
--     dessincronizar. Se o gestor apagar ou adicionar uma parcela pela aba
--     Financeiro (caminho que existe e não passa por esta migration), a
--     coluna mentiria e o cron geraria em cima. MAX(due_date) não pode
--     mentir: é a resposta, não uma cópia dela. Custo zero — já existe
--     idx_financial_transactions_contract_id, e esta migration ainda
--     acrescenta um índice (contract_id, due_date DESC) que responde por
--     index-only scan.
--   • valor, categoria, conta, centro de custo, forma de pagamento, cliente,
--     descrição — TUDO herdado da última parcela não cancelada. É o que faz
--     REAJUSTE funcionar sem migration nova: o gestor corrige a última
--     parcela (ou o bloco futuro) e as próximas já nascem com o valor novo.
--     Guardar "o valor do contrato" numa coluna criaria uma segunda verdade
--     que brigaria com a parcela toda vez que alguém editasse uma das duas.
--
-- ============================================================================
-- BACKFILL: NENHUM. Zero contrato existente pode virar contínuo.
-- ============================================================================
--   DEFAULT false resolve. Medido em produção antes de escrever isto: 28
--   contratos (27 ativos), 8 deles com parcelas, 446 parcelas no total, todas
--   'entrada', nenhuma cancelada, nenhuma com parent_transaction_id. Nenhuma
--   linha é tocada por esta migration.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Colunas (contrato fixo com o front) + integridade
-- ----------------------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS finance_indeterminate boolean NOT NULL DEFAULT false;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS finance_interval_months smallint;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS finance_anchor_date date;

COMMENT ON COLUMN public.contracts.finance_indeterminate IS
  'COBRANÇA contínua: true = o contrato é faturado indefinidamente, e um cron diário (extend-contract-billing) mantém sempre ~24 meses de parcelas materializadas à frente em financial_transactions. NÃO é status do contrato (isso é contracts.status) e NÃO é fim de contrato (isso é start_date + horizon_months, que continua governando as VISITAS/OSs — as duas coisas são independentes: dá ter visitas por 12 meses e cobrança contínua, e vice-versa). Também NÃO é inferível dos dados: é decisão explícita do gestor no interruptor da etapa Financeiro. DEFAULT false preserva todo contrato existente.';

COMMENT ON COLUMN public.contracts.finance_interval_months IS
  'Meses entre uma parcela e a seguinte na cobrança contínua (mensal=1, bimestral=2, trimestral=3, semestral=6, anual=12). É a REGRA escolhida pelo gestor, não uma observação das parcelas — não derivar do intervalo entre linhas (contrato com 1 parcela e vencimento editado à mão quebram a derivação). Só é obrigatório quando finance_indeterminate=true (ver CHECK contracts_finance_indeterminate_requires_rule). Não confundir com frequency_type/frequency_value, que são a frequência das VISITAS.';

COMMENT ON COLUMN public.contracts.finance_anchor_date IS
  'Data do PRIMEIRO vencimento da cobrança contínua. É a âncora da grade de datas: toda parcela futura é anchor + (k * finance_interval_months) meses, sempre medido DESDE a âncora (nunca cumulativo), com clamp de fim de mês do Postgres (31/01 -> 28/02 -> 31/03 -> 30/04). Guardada, e não derivada de MIN(due_date), porque apagar a primeira parcela mudaria a âncora e moveria o dia de vencimento de todas as futuras em silêncio.';

DO $finance_rule_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contracts_finance_indeterminate_requires_rule'
  ) THEN
    -- Falha ALTA e cedo: marcar o contrato como contínuo sem dizer o passo e a
    -- âncora deixaria o cron sem regra e ele simplesmente não faria nada —
    -- silêncio é o pior desfecho possível quando o assunto é faturamento.
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_finance_indeterminate_requires_rule
      CHECK (
        finance_indeterminate = false
        OR (finance_interval_months IS NOT NULL AND finance_anchor_date IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contracts_finance_interval_months_check'
  ) THEN
    -- 1..12 cobre mensal..anual. O limite inferior de 1 também é a trava que
    -- impede laço infinito no gerador de datas (passo 0 nunca avança).
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_finance_interval_months_check
      CHECK (finance_interval_months IS NULL OR (finance_interval_months >= 1 AND finance_interval_months <= 12));
  END IF;
END
$finance_rule_check$;

-- Índice parcial: o cron precisa achar só os contratos contínuos ATIVOS.
-- Hoje seriam 0 linhas; o índice fica minúsculo e a varredura nunca toca a
-- tabela inteira.
CREATE INDEX IF NOT EXISTS idx_contracts_finance_indeterminate
  ON public.contracts (id)
  WHERE finance_indeterminate = true;

-- Responde MAX(due_date) e o NOT EXISTS por data sem tocar a heap.
-- idx_financial_transactions_contract_id (btree simples em contract_id) já
-- existe, mas obriga a ler todas as parcelas do contrato pra achar o máximo.
CREATE INDEX IF NOT EXISTS idx_ft_contract_due_date
  ON public.financial_transactions (contract_id, due_date DESC)
  WHERE contract_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2) extend_indeterminate_contract_billing() — o que o cron chama, 1x/dia.
-- ----------------------------------------------------------------------------
--
-- IDEMPOTÊNCIA (duas travas, não uma — duplicar parcela é duplicar dinheiro):
--   (i)  a grade de datas é determinística: anchor + k*interval. Toda parcela
--        já materializada está NESSA grade, e o k inicial é o primeiro cuja
--        data é ESTRITAMENTE maior que MAX(due_date) do contrato.
--   (ii) mesmo assim, cada candidata passa por uma checagem de PERÍODO
--        OCUPADO antes do INSERT: se já existe qualquer parcela do contrato
--        vencendo no intervalo (data anterior da grade, data candidata], o
--        período já foi cobrado e a candidata é descartada.
--   A trava (ii) é por PERÍODO e não por data exata de propósito. Se fosse
--   por data exata, bastaria o gestor empurrar o vencimento da ÚLTIMA parcela
--   alguns dias pra trás (de 31/10 pra 10/10, coisa que a aba Financeiro
--   permite) pra o MAX cair, a grade voltar a apontar 31/10 e o cron RECRIAR
--   outubro — duas cobranças do mesmo mês. Com a checagem por período, 10/10
--   ocupa outubro e o cron segue direto pra novembro.
--   Consequência: rodar a função 2x, 10x ou 100x no mesmo dia produz as
--   mesmas linhas da primeira vez. A 2ª chamada sai por `window_covered`.
--
-- LIMITAÇÃO CONHECIDA, DOCUMENTADA DE PROPÓSITO (não é bug silencioso):
--   O ponto de continuação é MAX(due_date) de TODAS as 'entrada' do contrato.
--   Se o gestor vincular ao contrato um lançamento avulso (ex.: taxa de
--   adesão) com vencimento ALÉM da última parcela, o cron continua a partir
--   dele e os meses no meio ficam sem parcela. Nenhuma duplicata é criada — é
--   falta, não sobra — e o mês seguinte volta ao normal. Alternativas
--   testadas e descartadas: varrer a grade de trás pra frente procurando a
--   última data "na grade" resolveria esse caso, mas pararia o faturamento
--   POR COMPLETO no caso muito mais provável de o gestor ter mudado o dia de
--   vencimento do cliente (nenhuma data continuaria na grade). Entre errar
--   por falta num caso raro e parar de faturar num caso comum, esta função
--   erra por falta.
--
-- MUDAR O DIA DE VENCIMENTO é mudar finance_anchor_date, não editar parcela:
--   editar o vencimento das parcelas já materializadas resolve as que existem;
--   as PRÓXIMAS voltam pro dia da âncora. A âncora é a regra.
--
-- ATRASO É RECUPERADO, PASSADO NÃO É REESCRITO:
--   As datas novas começam estritamente DEPOIS da última parcela existente —
--   inclusive quando essa última já ficou pra trás (cron fora do ar, contrato
--   pausado e reativado). Faturamento perdido em silêncio é pior que uma
--   linha com vencimento retroativo: a competência é o mês que a parcela
--   representa, e é isso que a DRE precisa ver. Nenhuma linha JÁ EXISTENTE é
--   alterada ou apagada por esta função — ela só INSERE.
--
-- CONTRATO CANCELADO/PAUSADO ENTRE UMA RODADA E OUTRA:
--   O filtro é `status = 'active'` (allowlist, não denylist). Pausar ou
--   encerrar o contrato interrompe a geração na rodada seguinte — sem tocar
--   nas parcelas que já existem (elas continuam devidas; quem decide cancelar
--   ou não é o gestor, na tela). Reativar retoma de onde parou, inclusive
--   gerando os meses que passaram no intervalo (parágrafo acima).
--
-- VALOR ALTERADO (reajuste):
--   Toda parcela nova é moldada na ÚLTIMA parcela NÃO CANCELADA do contrato
--   (valor, categoria, conta, centro de custo, forma de pagamento, cliente,
--   observação, e a descrição com o mês trocado). Então reajustar = editar a
--   última parcela (ou as futuras) e pronto: as próximas já nascem no valor
--   novo. NÃO existe "valor do contrato" em coluna justamente pra não haver
--   duas verdades brigando.
--
-- CONTRATO CONTÍNUO SEM NENHUMA PARCELA:
--   A função NÃO inventa a primeira. Quem cria a primeira leva é o front
--   (createContractInstallments), que é quem sabe descrição, conta, categoria
--   e valor. Sem molde, sair calado é a única opção honesta — reportado como
--   `no_installments` pra aparecer no log do cron.
--
-- MULTI-TENANT: nada é lido nem escrito cross-empresa. company_id vem do
--   PRÓPRIO contrato e o molde é buscado com company_id = o do contrato.
--   A função é SECURITY DEFINER e só service_role pode executar.
CREATE OR REPLACE FUNCTION public.extend_indeterminate_contract_billing()
RETURNS TABLE(contract_id uuid, contract_name text, inserted_count integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Teto (a): horizonte. Ver justificativa numérica no cabeçalho.
  v_horizon_months CONSTANT integer := 24;
  -- Teto (b): lote por contrato POR RODADA.
  v_max_new        CONSTANT integer := 24;
  -- Teto (c): guarda física = MAX_REPETITION_COUNT de src/lib/finance-installments.ts.
  v_open_guard     CONSTANT integer := 120;
  -- Abreviações de mês em pt-BR, IDÊNTICAS ao que o front grava hoje na
  -- descrição (date-fns format 'MMM/yyyy' com locale ptBR: minúsculas, sem
  -- ponto). Hardcoded, e não to_char(...,'TMMon'), porque to_char depende do
  -- lc_time da sessão — o banco roda em UTC/C e devolveria 'Sep'.
  v_month_abbr     CONSTANT text[] := ARRAY['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  v_today      date;
  v_horizon    date;
  v_contract   RECORD;
  v_last       date;
  v_open       integer;
  v_tpl        public.financial_transactions%ROWTYPE;
  v_base_desc  text;
  v_desc       text;
  v_k          integer;
  v_months     integer;
  v_candidate  date;
  v_prev       date;
  v_count      integer;
BEGIN
  -- Fuso do Brasil (mesma régua de close_due_credit_card_bills e
  -- extend_indeterminate_task_series): o banco roda em UTC, então
  -- current_date viraria o dia 3h antes do cliente.
  v_today   := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_horizon := (v_today + (v_horizon_months || ' months')::interval)::date;

  FOR v_contract IN
    SELECT c.id,
           c.company_id,
           c.name,
           c.customer_id,
           c.finance_anchor_date   AS anchor,
           c.finance_interval_months::integer AS step
      FROM public.contracts c
     WHERE c.finance_indeterminate = true
       AND c.status = 'active'
       AND c.finance_anchor_date IS NOT NULL
       AND c.finance_interval_months IS NOT NULL
       AND c.finance_interval_months >= 1
     ORDER BY c.id
  LOOP
    contract_id   := v_contract.id;
    contract_name := v_contract.name;
    inserted_count := 0;

    -- Última parcela já materializada. Inclui CANCELADA de propósito: a data
    -- está ocupada e reinserir nela criaria a duplicata que estamos evitando.
    SELECT max(ft.due_date)
      INTO v_last
      FROM public.financial_transactions ft
     WHERE ft.contract_id      = v_contract.id
       AND ft.company_id       = v_contract.company_id
       AND ft.transaction_type = 'entrada'
       AND ft.due_date IS NOT NULL;

    IF v_last IS NULL THEN
      reason := 'no_installments';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF v_last >= v_horizon THEN
      reason := 'window_covered';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Teto (c). Inalcançável pelo desenho; se disparar, é sinal de que algo
    -- fora daqui está inserindo — o cron para de piorar e deixa rastro.
    SELECT count(*)
      INTO v_open
      FROM public.financial_transactions ft
     WHERE ft.contract_id      = v_contract.id
       AND ft.company_id       = v_contract.company_id
       AND ft.transaction_type = 'entrada'
       AND ft.cancelled_at IS NULL
       AND COALESCE(ft.is_paid, false) = false
       AND ft.due_date > v_today;

    IF v_open >= v_open_guard THEN
      reason := 'open_guard';
      RAISE WARNING '[extend_indeterminate_contract_billing] contrato % tem % parcelas futuras em aberto (>= %), extensao abortada', v_contract.id, v_open, v_open_guard;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Molde = última parcela NÃO CANCELADA (é ela que carrega o valor vigente
    -- depois de um reajuste). Cancelada não serve de molde: o gestor a
    -- invalidou justamente pra ela não valer mais.
    SELECT *
      INTO v_tpl
      FROM public.financial_transactions ft
     WHERE ft.contract_id      = v_contract.id
       AND ft.company_id       = v_contract.company_id
       AND ft.transaction_type = 'entrada'
       AND ft.cancelled_at IS NULL
     ORDER BY ft.due_date DESC NULLS LAST, ft.created_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
      reason := 'no_template';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Base da descrição: tira o rótulo de mês e um eventual "(n/total)" —
    -- numerar sobre um total desconhecido é mentira, e é por isso que o front
    -- também não escreve "(n/total)" quando a cobrança é contínua.
    v_base_desc := btrim(COALESCE(v_tpl.description, ''));
    v_base_desc := btrim(regexp_replace(v_base_desc, '\s*\([0-9]+/[0-9]+\)\s*$', ''));
    v_base_desc := btrim(regexp_replace(v_base_desc, '\s+-\s+[A-Za-z]{3}\.?/[0-9]{4}\s*$', ''));
    IF v_base_desc = '' THEN
      v_base_desc := 'Mensalidade do contrato';
    END IF;

    -- k inicial: primeiro ponto da grade estritamente depois da última
    -- parcela. O chute por diferença de meses evita varrer a grade desde a
    -- âncora (contrato de 10 anos), e o laço curto corrige o chute.
    v_months := (EXTRACT(YEAR FROM v_last)::integer * 12 + EXTRACT(MONTH FROM v_last)::integer)
              - (EXTRACT(YEAR FROM v_contract.anchor)::integer * 12 + EXTRACT(MONTH FROM v_contract.anchor)::integer);
    v_k := GREATEST(0, (v_months / v_contract.step) - 1);
    LOOP
      v_candidate := (v_contract.anchor + ((v_k * v_contract.step) || ' months')::interval)::date;
      EXIT WHEN v_candidate > v_last;
      v_k := v_k + 1;
    END LOOP;

    v_count := 0;
    LOOP
      EXIT WHEN v_count >= v_max_new;
      v_candidate := (v_contract.anchor + ((v_k * v_contract.step) || ' months')::interval)::date;
      EXIT WHEN v_candidate > v_horizon;

      -- Segunda trava de idempotência: PERÍODO ocupado, não data exata
      -- (ver cabeçalho — é o que impede recriar o mês quando o gestor
      -- antecipa o vencimento da última parcela).
      v_prev := (v_contract.anchor + (((v_k - 1) * v_contract.step) || ' months')::interval)::date;
      IF NOT EXISTS (
        SELECT 1 FROM public.financial_transactions ft
         WHERE ft.contract_id      = v_contract.id
           AND ft.company_id       = v_contract.company_id
           AND ft.transaction_type = 'entrada'
           AND ft.due_date         >  v_prev
           AND ft.due_date         <= v_candidate
      ) THEN
        v_desc := v_base_desc
               || ' - ' || v_month_abbr[EXTRACT(MONTH FROM v_candidate)::integer]
               || '/'   || EXTRACT(YEAR FROM v_candidate)::integer::text;

        -- Lista de colunas EXPLÍCITA. Nada de INSERT ... SELECT * do molde:
        -- asaas_payment_id, tenant_charge_id, bill_id, installment_*,
        -- parent_transaction_id, paid_date, receipt_url, cancelled_at e
        -- credit_card_bill_date pertencem à parcela-molde e NÃO podem viajar
        -- pra uma parcela nova (id de gateway duplicado = baixa no lugar
        -- errado; e uq_financial_transactions_asaas_payment_id abortaria a
        -- rodada inteira).
        INSERT INTO public.financial_transactions (
          company_id, created_by, transaction_type, description, amount,
          transaction_date, due_date, is_paid,
          customer_id, contract_id, account_id, category, cost_center_id,
          payment_method, notes
        ) VALUES (
          v_contract.company_id, v_tpl.created_by, 'entrada', v_desc, v_tpl.amount,
          v_candidate, v_candidate, false,
          COALESCE(v_tpl.customer_id, v_contract.customer_id), v_contract.id,
          v_tpl.account_id, v_tpl.category, v_tpl.cost_center_id,
          v_tpl.payment_method, v_tpl.notes
        );

        v_count := v_count + 1;
      END IF;

      v_k := v_k + 1;
    END LOOP;

    inserted_count := v_count;
    reason := CASE WHEN v_count > 0 THEN 'extended' ELSE 'nothing_due' END;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.extend_indeterminate_contract_billing() IS
  'Janela rolante da COBRANÇA de contrato contínuo (contracts.finance_indeterminate=true). Roda 1x/dia via edge extend-contract-billing (CRON_SECRET do Vault). Para cada contrato contínuo ATIVO, insere em financial_transactions as parcelas que faltam da grade anchor + k*finance_interval_months até hoje+24 meses, no máximo 24 por rodada, moldando cada nova parcela na última parcela não cancelada do contrato (valor/conta/categoria/centro de custo/forma/cliente/observação, descrição com o mês trocado). Idempotente por duas travas: grade determinística ancorada em MAX(due_date) e checagem de PERÍODO ocupado (nenhuma parcela vencendo entre a data anterior da grade e a candidata). Nunca altera nem apaga linha existente. Contrato pausado/encerrado é pulado (status=active é allowlist) e retoma de onde parou ao ser reativado. Retorna (contract_id, contract_name, inserted_count, reason) por contrato avaliado; reason em extended|nothing_due|window_covered|no_installments|no_template|open_guard.';

-- Não é RPC de front: só o cron (via service_role) chama.
REVOKE EXECUTE ON FUNCTION public.extend_indeterminate_contract_billing() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_indeterminate_contract_billing() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.extend_indeterminate_contract_billing() TO service_role;

-- ----------------------------------------------------------------------------
-- 3) Agendamento (pg_cron + pg_net + Vault) — mesmo padrão de
--    extend-recurring-tasks-daily / close-credit-card-bills-daily.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('extend-contract-billing-daily')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extend-contract-billing-daily');

    -- 05:35 UTC = 02:35 em São Paulo. Depois de close-credit-card-bills-daily
    -- (05:10) e extend-recurring-tasks-daily (05:20), na mesma janela de baixo
    -- tráfego, e já com o dia virado no fuso que a função usa.
    PERFORM cron.schedule(
      'extend-contract-billing-daily',
      '35 5 * * *',
      $job$
      SELECT net.http_post(
        url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/extend-contract-billing',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
            ''
          )
        ),
        body := '{}'::jsonb
      );
      $job$
    );

    RAISE NOTICE 'cron extend-contract-billing-daily agendado (35 5 * * *)';
  ELSE
    RAISE NOTICE 'pg_cron ausente — funcao criada, agendamento pulado';
  END IF;
END
$cron$;

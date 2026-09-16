-- ============================================================================
-- Tarefa recorrente "sem data de fim" (recorrência indeterminada)
-- ============================================================================
--
-- CONTEXTO:
--   Hoje a recorrência de tarefa (service_orders.entry_type='tarefa') é 100%
--   materializada na hora da criação: generateRecurrenceDates
--   (src/lib/taskRecurrence.ts) expande TODAS as datas de uma vez, entre a
--   data inicial e `recurrence_end_date` (obrigatória — sem ela
--   findRecurrenceIssue bloqueia o salvamento). Não existe cron nem trigger
--   que reprocesse essas séries.
--
--   Pedido: permitir "nunca acabar" a recorrência. Materializar pra sempre
--   numa chamada só não é opção (laço infinito / trava a UI / gera milhares
--   de linhas de uma vez). A solução é o padrão de mercado: JANELA ROLANTE.
--   A série nasce com um horizonte de segurança (12 meses OU 60 ocorrências,
--   o que vier primeiro — RECURRENCE_INDETERMINATE_HORIZON_MONTHS /
--   RECURRENCE_INDETERMINATE_MAX_OCCURRENCES em src/lib/taskRecurrence.ts) e
--   um cron diário (extend-recurring-tasks) empurra esse horizonte pra
--   frente conforme os dias passam, sempre olhando pra ÚLTIMA ocorrência já
--   materializada da série.
--
-- CONTRATO FIXO com o front (não renomear):
--   service_orders.recurrence_indeterminate boolean NOT NULL DEFAULT false
--   true  = ignore recurrence_end_date, gere até o horizonte.
--   false = comportamento de hoje, sem qualquer mudança.
--
-- POR QUE UMA COLUNA BOOLEANA EXPLÍCITA (E NÃO recurrence_end_date IS NULL):
--   Investigado em produção antes de escrever esta migration: existem 40
--   linhas legadas em service_orders (entry_type='tarefa') com
--   recurrence_type preenchido ('yearly'/'monthly') e recurrence_end_date
--   NULL — todas da mesma empresa (478ee686-12dd-40a8-880a-a7375764a5a0),
--   cada uma seu PRÓPRIO recurrence_group_id (nenhuma é membro de uma série
--   de várias linhas: são registros isolados, criados antes da validação
--   atual de findRecurrenceIssue existir). Se "sem fim" fosse inferido de
--   recurrence_end_date IS NULL, o cron passaria a tratar essas 40 tarefas
--   antigas como séries "sem fim" e começaria a gerar até 60
--   ocorrências/12 meses pra cada uma — mudando o passado em silêncio.
--   DEFAULT false na coluna nova preserva exatamente essas 40 linhas.
--
-- COMO EVITEI DUPLICAR A MATEMÁTICA DE DATAS (a pedido do Tech Lead: "se
-- achar como não duplicar, proponha antes de portar"):
--   A conta de datas (passo ancorado na data inicial pra mensal/anual, com
--   clamp de fim de mês; varredura de dias da semana pra semanal/custom) foi
--   PROVADA equivalente em SQL ao `date + interval` do Postgres:
--     DATE '2024-01-31' + INTERVAL '1 month'  = 2024-02-29 (clampa, não
--     estoura pra 2024-03-02 como o `setMonth` nativo do JS faria).
--   Anexando SEMPRE a partir da DATA-ÂNCORA (não cumulativo), a sequência de
--   `date + (interval*k) * interval '1 month'/'1 year'` do Postgres bate
--   ocorrência a ocorrência com `date-fns.addMonths/addYears` usado em
--   taskRecurrence.ts. EXTRACT(DOW FROM date) do Postgres já usa a mesma
--   convenção 0=domingo..6=sábado do `Date.getDay()` do JS.
--   Por isso a função abaixo (`generate_recurrence_dates`) é uma
--   PORTAGEM 1:1 do algoritmo de src/lib/taskRecurrence.ts pra SQL, e o
--   `extend-recurring-tasks` (edge) chama só esta RPC — nenhuma matemática
--   de data mora em Deno. Os 18 casos de src/lib/taskRecurrence.test.ts
--   foram reproduzidos manualmente contra esta função (mesma entrada, mesma
--   saída, incluindo o `RAISE EXCEPTION` pra tipo não suportado) antes desta
--   migration ser escrita — nenhum deploy foi feito, é só a evidência de que
--   os dois motores concordam. Se `taskRecurrence.ts` mudar essa conta no
--   futuro, esta função tem que mudar junto (são ESPELHOS, documentados nos
--   dois lados).
--
-- EMENDA (mesmo dia, Tech Lead pediu de volta): `recurrence_weekdays` NUNCA
-- foi persistido como coluna — só existia como objeto de spec no front
-- (RecurrenceSpec / TaskFormData), usado na hora de gerar e descartado
-- depois. Isso tem dois efeitos, um que a emenda resolve e outro que
-- continua sendo bug de front (fora do meu domínio, registrado aqui só pra
-- rastro): (1) o cron desta migration não tinha de onde ler os dias
-- marcados de uma série 'weekly'/'custom' — daí a derivação por
-- EXTRACT(DOW...) da seção 4 abaixo; (2) TaskFormDialog.tsx:80 inicializa
-- `recurrenceWeekdays` como `[]` e nunca remonta a partir da tarefa em
-- edição, então editar uma série 'custom' perde os dias marcados na tela
-- (bug pré-existente, não introduzido por esta migration — corrigido pelo
-- dev do front em paralelo, fora deste arquivo, que eu não toco).
-- A emenda adiciona `service_orders.recurrence_weekdays` (coluna de
-- verdade, contrato fixo com o front — ver seção 1) e faz a função da seção
-- 4 PREFERIR a coluna, caindo pra derivação só quando ela estiver nula
-- (séries criadas antes desta emenda). Backfill medido e escopado na seção
-- 2 abaixo.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Coluna (contrato fixo com o front) + índice parcial pro cron
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS recurrence_indeterminate boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_orders.recurrence_indeterminate IS
  'true = série "Contínua" (sem data de fim): recurrence_end_date é ignorado, a série é materializada só até o horizonte de segurança (ver RECURRENCE_INDETERMINATE_HORIZON_MONTHS/MAX_OCCURRENCES em src/lib/taskRecurrence.ts) e um cron diário (extend-recurring-tasks) estica a janela conforme o tempo passa. false preserva o comportamento clássico (inclusive as 40 linhas legadas com recurrence_type preenchido e recurrence_end_date nulo — DEFAULT false não as reinterpreta).';

-- Índice parcial: o cron só precisa achar rapidamente quais GRUPOS têm
-- alguma linha marcada indeterminada, sem varrer a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_service_orders_recurrence_indeterminate
  ON public.service_orders (recurrence_group_id, scheduled_date DESC)
  WHERE recurrence_indeterminate = true;

-- ----------------------------------------------------------------------------
-- 1b) EMENDA: recurrence_weekdays como COLUNA de verdade (contrato fixo com
--     o front, coordenado com quem mexe em TaskFormDialog.tsx/useTaskSubmit.ts
--     em paralelo — eu não toco nesses arquivos).
-- ----------------------------------------------------------------------------
-- CONTRATO FIXO com o front (não renomear):
--   service_orders.recurrence_weekdays smallint[] NULL, sem default.
--   0=domingo..6=sábado (mesma convenção de Date.getDay() / EXTRACT(DOW...)
--   já usada em todo o resto desta migration). NULL = série que não usa dia
--   da semana (monthly/yearly/daily/biweekly, ou weekly-sem-dia-marcado) OU
--   série weekly/custom criada ANTES desta emenda (ver fallback na seção 4).
--
-- TIPO ESCOLHIDO: smallint[] (não jsonb). Motivos:
--   1) O domínio é um conjunto pequeno e fixo (0..6, no máximo 7 elementos) —
--      cabe em smallint com folga, e um array nativo é exatamente o shape
--      que `generate_recurrence_dates(p_weekdays integer[])` já espera (cast
--      trivial `::integer[]` no ponto de chamada), sem reconstruir array a
--      partir de jsonb toda vez que o cron roda.
--   2) Dá pra validar o domínio com um CHECK simples no array inteiro
--      (`<@ ARRAY[0..6]`); em jsonb a validação de "cada elemento é int entre
--      0 e 6" exigiria um CHECK com jsonb_array_elements ou um trigger — mais
--      código pra garantir a mesma coisa.
--   3) PostgREST devolve smallint[] como array de number pro client sem
--      transformação (bate 1:1 com `recurrence_weekdays?: number[]` do
--      TaskFormData) — jsonb chegaria tipado `Json` no types.ts, obrigando o
--      dev do front a fazer cast manual só pra remontar os dias marcados na
--      edição, que é exatamente o bug que estamos destravando.
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS recurrence_weekdays smallint[];

COMMENT ON COLUMN public.service_orders.recurrence_weekdays IS
  'Dias da semana marcados na recorrência (0=domingo..6=sábado), só relevante para recurrence_type IN (''weekly'',''custom''). NULL = não se aplica (monthly/yearly/daily/biweekly, ou weekly sem dia marcado) OU série weekly/custom criada antes desta coluna existir (nesse caso extend_indeterminate_task_series() deriva do DOW das ocorrências já materializadas — ver comentário da função). Gravado pelo front em TaskFormDialog/useTaskSubmit.ts a partir desta migration.';

DO $weekdays_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_orders_recurrence_weekdays_check'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_recurrence_weekdays_check
      CHECK (recurrence_weekdays IS NULL OR recurrence_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);
  END IF;
END
$weekdays_check$;

-- ----------------------------------------------------------------------------
-- 2) Backfill de recurrence_weekdays nas séries EXISTENTES — só onde o dia da
--    semana é uma REGRA DE VERDADE da recorrência (recurrence_type IN
--    ('weekly','custom')). NUNCA em monthly/yearly/daily/biweekly.
-- ----------------------------------------------------------------------------
--
-- MEDIÇÃO em produção (byqldosixshhuiuarszp), feita ANTES de escrever este
-- bloco (Management API, só leitura):
--   entry_type='tarefa': recurrence_type IN ('weekly','custom','daily',
--     'biweekly') → 0 linhas. As 411 tarefas recorrentes existentes hoje são
--     TODAS 'monthly' (368 linhas / 12 grupos) ou 'yearly' (43 linhas / 40
--     grupos) — bate com os "40 linhas legadas" já documentados na seção 1
--     original (39 yearly + 1 monthly sem recurrence_end_date).
--   entry_type='os':     recurrence_type='custom' → 114 linhas em 2 grupos,
--     cada grupo isolado numa única empresa (confirmado por
--     count(DISTINCT company_id)=1 por grupo): um grupo de 100 linhas com DOW
--     distintos {1,6} (segunda e sábado), outro de 14 linhas com DOW {3}
--     (quarta). 'weekly'/'daily'/'biweekly' → 0 linhas em 'os' também.
--
-- POR QUE BACKFILLAR 'weekly'/'custom' E NÃO 'monthly'/'yearly':
--   Em 'weekly'/'custom' o dia da semana É A REGRA da série: toda ocorrência
--   já materializada caiu exatamente nos dias marcados originalmente, então
--   agregar DISTINCT EXTRACT(DOW...) por grupo RECUPERA com exatidão o padrão
--   que já existia — é a mesma conta que a função da seção 4 usa como
--   fallback em tempo real, só que rodada uma vez agora pra preencher a
--   coluna. Em 'monthly'/'yearly' o dia da semana da data agendada é
--   INCIDENTAL (dia 15 de cada mês cai num dia da semana diferente a cada
--   ocorrência, dia 29/fev de ano bissexto idem) — gravar
--   `recurrence_weekdays` nessas séries inventaria uma regra "repete às
--   terças" que NUNCA existiu, mudando o passado em silêncio. Por isso
--   'monthly'/'yearly'/'daily'/'biweekly' ficam de fora do backfill (a coluna
--   permanece NULL nelas, que é exatamente o estado "não se aplica").
--
-- Escopo do UPDATE: entry_type IN ('tarefa','os') — hoje só 'os' tem linhas
-- que batem no filtro, mas 'tarefa' entra por completude (se um dia existir
-- uma tarefa legada 'weekly'/'custom' sem a coluna, este mesmo bloco cobre) e
-- por idempotência: filtra `recurrence_weekdays IS NULL`, então rodar de novo
-- não sobrescreve nada já preenchido nem duplica trabalho.
DO $backfill$
DECLARE
  v_group RECORD;
  v_weekdays smallint[];
  v_rows_updated integer;
  v_groups_updated integer := 0;
BEGIN
  FOR v_group IN
    SELECT DISTINCT recurrence_group_id
      FROM public.service_orders
     WHERE entry_type IN ('tarefa','os')
       AND recurrence_type IN ('weekly','custom')
       AND recurrence_group_id IS NOT NULL
       AND recurrence_weekdays IS NULL
  LOOP
    SELECT array_agg(DISTINCT EXTRACT(DOW FROM scheduled_date)::smallint
                      ORDER BY EXTRACT(DOW FROM scheduled_date)::smallint)
      INTO v_weekdays
      FROM public.service_orders
     WHERE recurrence_group_id = v_group.recurrence_group_id
       AND entry_type IN ('tarefa','os')
       AND scheduled_date IS NOT NULL;

    IF v_weekdays IS NULL THEN
      CONTINUE; -- grupo sem nenhuma data materializada (não deveria acontecer, mas não inventa nada)
    END IF;

    UPDATE public.service_orders
       SET recurrence_weekdays = v_weekdays
     WHERE recurrence_group_id = v_group.recurrence_group_id
       AND entry_type IN ('tarefa','os')
       AND recurrence_type IN ('weekly','custom');

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    v_groups_updated := v_groups_updated + 1;
    RAISE NOTICE 'backfill recurrence_weekdays: grupo % -> dias % (% linhas)', v_group.recurrence_group_id, v_weekdays, v_rows_updated;
  END LOOP;

  RAISE NOTICE 'backfill recurrence_weekdays concluido: % grupo(s) tocado(s)', v_groups_updated;
END
$backfill$;

-- ----------------------------------------------------------------------------
-- 3) Matemática de datas em SQL — espelho de generateRecurrenceDates
--    (src/lib/taskRecurrence.ts). Os dois têm que andar juntos: qualquer
--    mudança de regra lá tem que virar migration nova aqui.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_recurrence_dates(
  p_start_date date,
  p_type text,
  p_interval integer,
  p_end_date date,
  p_weekdays integer[] DEFAULT NULL,
  p_max_occurrences integer DEFAULT NULL
)
RETURNS date[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_interval integer := COALESCE(p_interval, 1);
  v_weekdays integer[] := COALESCE(p_weekdays, ARRAY[]::integer[]);
  v_dates date[] := ARRAY[p_start_date];
  v_start_week date;
  v_current date;
  v_week_of_current date;
  v_weeks_apart integer;
  v_week_interval integer;
  v_k integer;
  v_candidate date;
BEGIN
  IF p_type IS NULL THEN
    RETURN v_dates;
  END IF;

  IF p_type NOT IN ('daily','weekly','biweekly','monthly','yearly','custom') THEN
    RAISE EXCEPTION 'unsupported_recurrence_type: %', p_type;
  END IF;

  -- 'custom' = varredura em TODAS as semanas nos dias marcados (o "a cada N"
  -- é ignorado aqui de propósito — comportamento histórico, ver comentário
  -- equivalente em taskRecurrence.ts).
  IF p_type = 'custom' THEN
    IF array_length(v_weekdays, 1) IS NULL THEN
      RETURN v_dates; -- sem dia marcado, sem série (findRecurrenceIssue já bloqueia antes)
    END IF;
    v_week_interval := 1;
    v_start_week := p_start_date - EXTRACT(DOW FROM p_start_date)::integer;
    v_current := p_start_date + 1;
    WHILE v_current <= p_end_date AND (p_max_occurrences IS NULL OR array_length(v_dates,1) < p_max_occurrences) LOOP
      IF EXTRACT(DOW FROM v_current)::integer = ANY(v_weekdays) THEN
        v_week_of_current := v_current - EXTRACT(DOW FROM v_current)::integer;
        v_weeks_apart := (v_week_of_current - v_start_week) / 7;
        IF v_week_interval <= 1 OR v_weeks_apart % v_week_interval = 0 THEN
          v_dates := array_append(v_dates, v_current);
        END IF;
      END IF;
      v_current := v_current + 1;
    END LOOP;
    RETURN v_dates;
  END IF;

  -- 'weekly' COM dias marcados = a cada N semanas, em cada dia marcado.
  IF p_type = 'weekly' AND array_length(v_weekdays,1) IS NOT NULL THEN
    v_week_interval := GREATEST(v_interval, 1);
    v_start_week := p_start_date - EXTRACT(DOW FROM p_start_date)::integer;
    v_current := p_start_date + 1;
    WHILE v_current <= p_end_date AND (p_max_occurrences IS NULL OR array_length(v_dates,1) < p_max_occurrences) LOOP
      IF EXTRACT(DOW FROM v_current)::integer = ANY(v_weekdays) THEN
        v_week_of_current := v_current - EXTRACT(DOW FROM v_current)::integer;
        v_weeks_apart := (v_week_of_current - v_start_week) / 7;
        IF v_week_interval <= 1 OR v_weeks_apart % v_week_interval = 0 THEN
          v_dates := array_append(v_dates, v_current);
        END IF;
      END IF;
      v_current := v_current + 1;
    END LOOP;
    RETURN v_dates;
  END IF;

  -- daily / weekly-sem-dias-marcados / biweekly / monthly / yearly: passo
  -- SEMPRE ancorado na data inicial (p_start_date + interval*k), nunca
  -- cumulativo — é isso que evita o escorregão de fim de mês (31/jan fica
  -- preso em 28 pra sempre se for cumulativo; ancorado, 31/jan -> 28/fev ->
  -- 31/mar -> 30/abr -> 31/mai). Provado equivalente a date-fns.addMonths /
  -- addYears via `date + interval` do próprio Postgres, que também clampa.
  v_k := 1;
  LOOP
    EXIT WHEN p_max_occurrences IS NOT NULL AND array_length(v_dates,1) >= p_max_occurrences;
    CASE p_type
      WHEN 'daily'    THEN v_candidate := p_start_date + (v_interval * v_k);
      WHEN 'weekly'   THEN v_candidate := p_start_date + (v_interval * v_k * 7);
      WHEN 'biweekly' THEN v_candidate := p_start_date + (2 * v_interval * v_k * 7);
      WHEN 'monthly'  THEN v_candidate := (p_start_date + ((v_interval * v_k)::text || ' months')::interval)::date;
      WHEN 'yearly'   THEN v_candidate := (p_start_date + ((v_interval * v_k)::text || ' years')::interval)::date;
    END CASE;
    EXIT WHEN v_candidate > p_end_date;
    v_dates := array_append(v_dates, v_candidate);
    v_k := v_k + 1;
  END LOOP;

  RETURN v_dates;
END;
$function$;

COMMENT ON FUNCTION public.generate_recurrence_dates(date, text, integer, date, integer[], integer) IS
  'ESPELHO de generateRecurrenceDates em src/lib/taskRecurrence.ts. Os dois motores têm que produzir a MESMA sequência para os mesmos parâmetros — validado manualmente contra os 18 casos de src/lib/taskRecurrence.test.ts antes desta migration. Qualquer mudança na regra de recorrência do front tem que virar migration nova aqui. Usada só pelo cron extend-recurring-tasks (via extend_indeterminate_task_series) para estender séries "Contínua" — não é chamada pelo client.';

-- Não é RPC de front: só o cron (via extend_indeterminate_task_series, que
-- roda com privilégio de dono da função) precisa disso.
REVOKE EXECUTE ON FUNCTION public.generate_recurrence_dates(date, text, integer, date, integer[], integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_recurrence_dates(date, text, integer, date, integer[], integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurrence_dates(date, text, integer, date, integer[], integer) TO service_role;

-- ----------------------------------------------------------------------------
-- 4) extend_indeterminate_task_series() — o que o cron chama, 1x/dia.
-- ----------------------------------------------------------------------------
-- IDEMPOTÊNCIA: ancora sempre na ÚLTIMA data já materializada do grupo
-- (MAX(scheduled_date)) e só insere datas ESTRITAMENTE POSTERIORES a ela.
-- Rodar duas vezes no mesmo dia nunca duplica: se o horizonte já foi
-- alcançado na primeira chamada, a segunda não gera nenhuma linha nova
-- (early-continue por `last_date >= v_horizon`); se não foi (ex.: série
-- diária, cujo lote de 60 ocorrências não cobre os 12 meses de uma vez), a
-- segunda chamada apenas continua de onde a primeira parou — nunca reinsere
-- uma data que já existe.
--
-- MULTI-TENANT: cada linha nova herda company_id da PRÓPRIA linha-molde
-- (a última ocorrência já materializada daquele grupo). Nunca há leitura
-- cross-empresa: tudo é filtrado por recurrence_group_id, que pertence a
-- uma única empresa (é assim desde a criação da série).
--
-- SÉRIE ENCERRADA NÃO RESSUSCITA: o estado "indeterminada" é lido da ÚLTIMA
-- ocorrência do grupo (por scheduled_date), não de "qualquer linha já teve
-- indeterminate=true". Quando o usuário desativa "Contínua" na edição
-- ("esta e as futuras"), useTaskSubmit apaga as futuras não concluídas e
-- regenera com recurrence_indeterminate=false — a partir daí a última linha
-- do grupo tem indeterminate=false e o cron para de mexer nele, mesmo que
-- linhas passadas do mesmo grupo ainda tenham indeterminate=true no
-- histórico. Grupo inteiramente apagado simplesmente não aparece na
-- varredura (não há linha pra ler).
--
-- DIAS DA SEMANA (weekly-com-dias-marcados / custom) — DUAS PERNAS, NESTA
-- ORDEM:
--   PERNA 1 (principal, EMENDA): lê `recurrence_weekdays` (coluna smallint[]
--   — ver seção 1b) direto da ÚLTIMA ocorrência materializada do grupo. É o
--   caminho normal pra toda série criada/editada a partir desta migration
--   (o front grava o campo no insert e remonta na edição).
--   PERNA 2 (compatibilidade, comportamento ORIGINAL desta migration antes da
--   emenda): se a coluna vier NULL nessa última ocorrência (série
--   'weekly'/'custom' criada ANTES da coluna existir), os dias da semana são
--   RE-DERIVADOS a partir do dia-da-semana das datas já materializadas do
--   próprio grupo (EXTRACT(DOW ...) de cada scheduled_date, agregado com
--   DISTINCT). Isso é seguro porque o lote inicial (materializado na
--   criação, até 12 meses/60 ocorrências) sempre cobre pelo menos um ciclo
--   completo do padrão semanal, então todo dia marcado já apareceu pelo
--   menos uma vez. Limitação conhecida da perna 2 (só dela): se o usuário
--   apagar TODAS as ocorrências de um dos dias marcados antes do primeiro
--   ciclo completo (raro, requer ações manuais deliberadas), esse dia some
--   do padrão a partir da extensão seguinte — não é diferente do gap que já
--   existia antes desta emenda.
--   Medição em produção (feita ao escrever a emenda): 0 tarefas
--   'weekly'/'custom' existem hoje, então a perna 2 é caminho morto no
--   momento desta migration — mas fica viva pra qualquer série futura que
--   escape do backfill (ver seção 2) ou seja criada por algum caminho que
--   não grave a coluna.
CREATE OR REPLACE FUNCTION public.extend_indeterminate_task_series()
RETURNS TABLE(group_id uuid, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_horizon date;
  v_batch_cap CONSTANT integer := 60; -- mesmo teto do front (RECURRENCE_INDETERMINATE_MAX_OCCURRENCES)
  v_group RECORD;
  v_origin date;
  v_weekdays integer[];
  v_all_dates date[];
  v_new_dates date[];
  v_template public.service_orders%ROWTYPE;
  v_new_id uuid;
  v_date date;
  v_count integer;
BEGIN
  -- Fuso do Brasil (mesma régua usada em close_due_credit_card_bills e nas
  -- demais RPCs de data deste projeto): now() AT TIME ZONE resolve a virada
  -- do dia; current_date responderia em UTC.
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_horizon := (v_today + INTERVAL '12 months')::date;

  -- Passo 1: candidatos rápidos via índice parcial (qualquer linha do grupo
  -- já marcada indeterminada). Passo 2: para cada candidato, olha a ÚLTIMA
  -- ocorrência (por scheduled_date) pra decidir se o grupo continua "aberto"
  -- e de onde continuar.
  FOR v_group IN
    WITH candidate_groups AS (
      SELECT DISTINCT so.recurrence_group_id
      FROM public.service_orders so
      WHERE so.recurrence_indeterminate = true
        AND so.entry_type = 'tarefa'
        AND so.recurrence_group_id IS NOT NULL
    ),
    latest AS (
      SELECT DISTINCT ON (so.recurrence_group_id)
        so.recurrence_group_id,
        so.recurrence_type,
        so.recurrence_interval,
        so.scheduled_date AS last_date,
        so.recurrence_indeterminate AS latest_is_indeterminate
      FROM public.service_orders so
      JOIN candidate_groups cg ON cg.recurrence_group_id = so.recurrence_group_id
      WHERE so.entry_type = 'tarefa'
        AND so.scheduled_date IS NOT NULL
      ORDER BY so.recurrence_group_id, so.scheduled_date DESC, so.created_at DESC
    )
    SELECT * FROM latest WHERE latest_is_indeterminate
  LOOP
    -- Janela já cobre o horizonte: nada a fazer (idempotência do dia-a-dia).
    IF v_group.last_date >= v_horizon THEN
      CONTINUE;
    END IF;

    -- Âncora original da série (primeira data materializada) — preserva o
    -- clamp de fim de mês/ano exatamente como na criação.
    SELECT MIN(scheduled_date) INTO v_origin
      FROM public.service_orders
     WHERE recurrence_group_id = v_group.recurrence_group_id
       AND entry_type = 'tarefa';

    v_weekdays := NULL;
    IF v_group.recurrence_type IN ('weekly','custom') THEN
      -- PERNA 1 (principal): coluna persistida na ÚLTIMA ocorrência do grupo.
      SELECT recurrence_weekdays::integer[]
        INTO v_weekdays
        FROM public.service_orders
       WHERE recurrence_group_id = v_group.recurrence_group_id
         AND scheduled_date = v_group.last_date
         AND entry_type = 'tarefa'
       ORDER BY created_at DESC
       LIMIT 1;

      -- PERNA 2 (compatibilidade): coluna nula = série anterior à emenda.
      -- Re-deriva do DOW de tudo que já foi materializado no grupo.
      IF v_weekdays IS NULL THEN
        SELECT array_agg(DISTINCT EXTRACT(DOW FROM scheduled_date)::integer)
          INTO v_weekdays
          FROM public.service_orders
         WHERE recurrence_group_id = v_group.recurrence_group_id
           AND entry_type = 'tarefa';
      END IF;
    END IF;

    v_all_dates := public.generate_recurrence_dates(
      v_origin,
      v_group.recurrence_type,
      COALESCE(v_group.recurrence_interval, 1),
      v_horizon,
      v_weekdays,
      v_batch_cap
    );

    SELECT array_agg(d ORDER BY d) INTO v_new_dates
      FROM unnest(v_all_dates) AS d
     WHERE d > v_group.last_date;

    IF v_new_dates IS NULL OR array_length(v_new_dates, 1) IS NULL THEN
      CONTINUE; -- nada além da última data já materializada
    END IF;

    -- Molde = a última ocorrência já materializada (copia campos +
    -- responsáveis). É a mesma régua que "esta e as futuras" usa hoje pra
    -- decidir o estado corrente da série.
    SELECT * INTO v_template
      FROM public.service_orders
     WHERE recurrence_group_id = v_group.recurrence_group_id
       AND scheduled_date = v_group.last_date
       AND entry_type = 'tarefa'
     ORDER BY created_at DESC
     LIMIT 1;

    CONTINUE WHEN NOT FOUND;

    v_count := 0;
    FOREACH v_date IN ARRAY v_new_dates LOOP
      INSERT INTO public.service_orders (
        company_id, entry_type, task_title, task_type_id, service_type_id,
        customer_id, technician_id, team_id, scheduled_date, scheduled_time,
        duration_minutes, description, os_type, status,
        recurrence_type, recurrence_interval, recurrence_end_date,
        recurrence_group_id, recurrence_indeterminate, recurrence_weekdays
      ) VALUES (
        v_template.company_id, 'tarefa', v_template.task_title, v_template.task_type_id, v_template.service_type_id,
        v_template.customer_id, v_template.technician_id, v_template.team_id, v_date, v_template.scheduled_time,
        v_template.duration_minutes, v_template.description, v_template.os_type, 'pendente',
        v_template.recurrence_type, v_template.recurrence_interval, v_template.recurrence_end_date,
        v_template.recurrence_group_id, true, v_weekdays::smallint[]
      )
      RETURNING id INTO v_new_id;

      -- v_weekdays grava o valor RESOLVIDO (perna 1 ou perna 2) na linha
      -- nova, não `template.recurrence_weekdays` puro. Efeito colateral bom:
      -- toda linha nova nasce com a coluna preenchida, então a PRÓXIMA
      -- extensão de uma série legada (perna 2 hoje) já acha a coluna e cai na
      -- perna 1 — o backfill "se completa sozinho" a cada rodada do cron,
      -- sem precisar de uma segunda migration de dados.

      -- Replica os responsáveis da última ocorrência (mesma regra do
      -- insertTaskOccurrences em useTaskSubmit.ts — tarefa não pode nascer
      -- sem dono).
      INSERT INTO public.service_order_assignees (service_order_id, user_id)
      SELECT v_new_id, soa.user_id
        FROM public.service_order_assignees soa
       WHERE soa.service_order_id = v_template.id;

      v_count := v_count + 1;
    END LOOP;

    group_id := v_group.recurrence_group_id;
    inserted_count := v_count;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.extend_indeterminate_task_series() IS
  'Roda 1x/dia via extend-recurring-tasks (edge, CRON_SECRET do Vault). Para cada série de tarefa com recurrence_indeterminate=true na última ocorrência, gera as datas que faltam até o horizonte (hoje + 12 meses, lote máximo de 60 por chamada) e insere como novas linhas de service_orders + service_order_assignees, herdando os campos da última ocorrência (incluindo recurrence_weekdays: usa a coluna quando presente, deriva por EXTRACT(DOW...) quando nula — série anterior à emenda que adicionou a coluna). Idempotente: ancora em MAX(scheduled_date) do grupo, nunca reinsere data existente. Retorna (group_id, inserted_count) por série tocada.';

REVOKE EXECUTE ON FUNCTION public.extend_indeterminate_task_series() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_indeterminate_task_series() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_indeterminate_task_series() TO service_role;

-- ----------------------------------------------------------------------------
-- 5) Agendamento do cron (pg_cron + pg_net + Vault, mesmo padrão de
--    activate-scheduled-orders-daily / close-credit-card-bills-daily).
--    NÃO chama a função SQL diretamente por cron.schedule — passa pela edge
--    `extend-recurring-tasks` (autenticada por CRON_SECRET), que é quem o
--    Tech Lead pediu como superfície observável/testável por HTTP.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('extend-recurring-tasks-daily')
     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extend-recurring-tasks-daily');

    -- 05:20 UTC = 02:20 em São Paulo — logo após a virada do dia no fuso que
    -- a função usa, e na mesma janela de baixo tráfego dos outros crons
    -- diários deste projeto (close-credit-card-bills-daily roda 05:10 UTC).
    PERFORM cron.schedule(
      'extend-recurring-tasks-daily',
      '20 5 * * *',
      $job$
      SELECT net.http_post(
        url := 'https://byqldosixshhuiuarszp.supabase.co/functions/v1/extend-recurring-tasks',
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

    RAISE NOTICE 'cron extend-recurring-tasks-daily agendado (20 5 * * *)';
  ELSE
    RAISE NOTICE 'pg_cron ausente — funcoes criadas, agendamento pulado';
  END IF;
END
$cron$;

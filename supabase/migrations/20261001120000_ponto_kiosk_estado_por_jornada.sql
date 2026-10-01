-- Ponto Eletrônico / quiosque: estado da LISTA inteira pelo dia da JORNADA.
--
-- Fecha o último buraco da entrega de múltiplas jornadas
-- (20260930150000_ponto_multiplas_jornadas.sql + plano
-- docs/planos/2026-09-30-multiplas-jornadas-ponto.md).
--
-- O BUG QUE ISTO FECHA
-- A ação `get_kiosk` da edge `time-clock-portal` (o tablet da recepção) monta a
-- lista do time perguntando "quem bateu ponto HOJE?", onde "hoje" é o dia do
-- RELÓGIO (`todayInTz(fuso da empresa)`). A tela individual já foi corrigida e
-- pergunta pelo dia da JORNADA (`resolve_punch_day`). Resultado à 01:00 da
-- madrugada: quem está no meio de um plantão que virou a noite aparece no
-- tablet como "não bateu hoje" / botão Entrada, enquanto a própria tela dele
-- mostra "trabalhando desde 23:00". Duas superfícies do mesmo sistema contando
-- histórias diferentes sobre a mesma pessoa — e ponto é documento.
--
-- POR QUE UMA RPC DE LISTA, E NÃO UMA CHAMADA POR FUNCIONÁRIO
-- Corrigir chamando `resolve_punch_day` + `allowed_punch_actions` uma vez por
-- funcionário seriam 2N idas ao banco a cada refresh do tablet, com N = time
-- inteiro. Aqui é UMA chamada que devolve a lista resolvida.
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- Não toca na edge (outra onda, outro Dev), não cria índice (ver nota de
-- performance no fim do arquivo), não escreve nada em dado de cliente.

-- ---------------------------------------------------------------------------
-- kiosk_punch_states — estado de ponto de vários funcionários de uma vez
-- ---------------------------------------------------------------------------
-- Para cada funcionário pedido:
--   punch_date      -> resolve_punch_day(company, employee, now())
--                      o dia da JORNADA, que na madrugada pode ser ONTEM.
--   allowed_actions -> allowed_punch_actions(company, employee, punch_date)
--                      a MESMA máquina de estado da tela individual.
--   last_type       -> tipo da última batida válida daquele dia de jornada,
--                      NULL quando o dia ainda não tem batida.
--
-- CONCORDÂNCIA POR CONSTRUÇÃO (é o ponto do exercício)
-- `allowed_actions` NÃO é recalculado aqui: a função chama
-- `allowed_punch_actions`, a mesma que a tela individual usa. A máquina de
-- estado continua existindo UMA VEZ SÓ. Se alguém "otimizar" isto inlinando o
-- CASE aqui pra poupar uma varredura, o tablet e a tela individual voltam a
-- divergir no primeiro dia em que a regra mudar — foi exatamente assim que
-- nasceu a duplicação edge-vs-hook que este plano matou.
--
-- `last_type` é lido por uma subconsulta com o predicado e o desempate
-- IDÊNTICOS aos de `allowed_punch_actions` (`is_valid = true`, ORDER BY
-- recorded_at DESC, created_at DESC, id DESC). Empate de `recorded_at` é real
-- (duas batidas gravadas no mesmo instante) e sem o desempate estável as duas
-- leituras poderiam eleger "últimos" diferentes: o tablet mostraria um botão e
-- o status agregado diria outra coisa. Ambas rodam no mesmo snapshot da mesma
-- consulta, então concordam sempre.
--
-- GUARDA MULTI-TENANT
-- O JOIN é com `employees` filtrado por `company_id = p_company_id`: um
-- employee_id de OUTRA empresa passado no array simplesmente não aparece no
-- resultado. De propósito NÃO levanta erro — o chamador é a edge montando a
-- lista do tablet, e derrubar a lista inteira (tablet em branco na recepção)
-- por causa de um id ruim é pior do que omitir a linha. Nenhum dado de outro
-- tenant atravessa em nenhum caso.
--
-- SECURITY INVOKER de propósito: leitura pura, quem chama vê só o que a RLS de
-- `time_records`/`employees` já deixa ver. ATENÇÃO pra quem for consumir:
-- a policy de SELECT de `time_records` pra `authenticated` é
-- `user_id = auth.uid()`, e batida de quiosque grava `user_id = NULL` — logo
-- chamada DIRETA pelo app autenticado NÃO enxerga batida de quiosque. O
-- consumidor previsto é a edge `time-clock-portal` com service_role.

CREATE OR REPLACE FUNCTION public.kiosk_punch_states(
  p_company_id   uuid,
  p_employee_ids uuid[]
)
RETURNS TABLE (
  employee_id     uuid,
  punch_date      date,
  allowed_actions text[],
  last_type       text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.id                                                                AS employee_id,
    d.punch_date                                                        AS punch_date,
    public.allowed_punch_actions(p_company_id, e.id, d.punch_date)      AS allowed_actions,
    l.type                                                              AS last_type
  FROM public.employees e
  -- LATERAL, não loop em plpgsql: uma varredura de `employees` já filtrada por
  -- empresa, com a resolução do dia avaliada por linha.
  CROSS JOIN LATERAL (
    SELECT public.resolve_punch_day(p_company_id, e.id, now()) AS punch_date
  ) d
  LEFT JOIN LATERAL (
    SELECT tr.type
    FROM public.time_records tr
    WHERE tr.company_id  = p_company_id
      AND tr.employee_id = e.id
      AND tr.date        = d.punch_date
      AND tr.is_valid    = true
    ORDER BY tr.recorded_at DESC, tr.created_at DESC, tr.id DESC
    LIMIT 1
  ) l ON true
  WHERE e.company_id = p_company_id
    AND e.id = ANY (COALESCE(p_employee_ids, ARRAY[]::uuid[]));
$$;

COMMENT ON FUNCTION public.kiosk_punch_states(uuid, uuid[]) IS
  'Estado de ponto de varios funcionarios numa consulta so, pelo dia da JORNADA (resolve_punch_day), nao pelo dia do relogio. Usada pelo get_kiosk da edge time-clock-portal. Employee de outra empresa no array e omitido, sem erro.';

-- O ACL default do banco concede EXECUTE a anon em TODA função nova: revogar de
-- PUBLIC não basta, tem que revogar NOMINALMENTE de anon. Esta função devolve
-- quem trabalhou e quando — lista de presença do time — e nunca pode ficar
-- aberta a anônimo.
REVOKE ALL ON FUNCTION public.kiosk_punch_states(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kiosk_punch_states(uuid, uuid[]) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- NOTA DE PERFORMANCE (índice NÃO criado aqui, de propósito)
-- ---------------------------------------------------------------------------
-- `public.time_records` hoje só tem o índice de PRIMARY KEY (id). Toda leitura
-- por (company_id, employee_id, date) — que é o acesso desta função, de
-- `allowed_punch_actions`, de `resolve_punch_day` e de `recompute_time_sheet` —
-- é Seq Scan. Com ~132 linhas na base isso é irrelevante (o planner nem
-- consideraria índice), e por isso o índice não entra nesta migration: índice
-- em tabela minúscula é custo de escrita sem ganho de leitura.
--
-- Quando a tabela crescer (ordem de dezenas de milhares de batidas), o índice
-- indicado é:
--
--   CREATE INDEX IF NOT EXISTS idx_time_records_company_employee_date
--     ON public.time_records (company_id, employee_id, date, recorded_at DESC);
--
-- A quarta coluna serve o ORDER BY ... LIMIT 1 que as três funções usam.
-- Decisão de quando criar é do Tech Lead — este comentário existe pra que a
-- próxima pessoa não precise redescobrir qual é o índice certo.

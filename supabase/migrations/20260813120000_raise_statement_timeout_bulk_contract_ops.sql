-- =============================================================================
-- Sobe o statement_timeout dos roles do app (fix do erro 57014)
--
-- Sintoma em produção (contrato grande — ex.: Hotel Ibís): ao adicionar
-- equipamento/ambiente e salvar, aparecia o toast
--   "Operação demorou demais e foi cancelada. Tente novamente."
-- Esse texto é mapeado do SQLSTATE 57014 (query_canceled) em
-- src/utils/errorMessages.ts:41 — ou seja, foi o PRÓPRIO Postgres que cancelou
-- a query por ela passar do `statement_timeout` do role.
--
-- Causa: salvar um contrato REGENERA todas as OSs futuras no client
-- (useContracts.ts → updateContract → regenerateFutureVisits → persistContractVisit),
-- inserindo service_orders + service_order_equipment + service_order_assignees +
-- service_order_activities (lotes de 500) e depois apagando as antigas em
-- cascata (deleteRegenerableOrders). Num contrato grande (muitos ambientes ×
-- muitos equipamentos × até 120 visitas) um desses statements cruza o teto
-- baixo padrão do role `authenticated` (~8s no Supabase) e é cancelado (57014).
-- Contratos pequenos ficam abaixo do teto — por isso só quebrava nos grandes.
--
-- Correção: elevar o teto por-role para um valor que cobre com folga a operação
-- em lote legítima. É a mesma coisa que o botão "Statement timeout" do painel do
-- Supabase faz por baixo dos panos (ALTER ROLE ... SET statement_timeout). O
-- valor vale por-conexão quando o PostgREST faz SET ROLE, então pega nas
-- próximas requisições sem reiniciar nada.
--
-- Escopo:
--   - authenticated  → 60s  (requisições do app logado — onde o bug ocorre)
--   - anon           → 30s  (portais públicos; folga sem exagero)
--   - service_role   → 120s (jobs/edge functions com trabalho pesado)
--
-- NÃO é a solução arquitetural definitiva. A regeneração ainda roda no client
-- em N round-trips; o próximo passo (fora desta migration) é mover a regeneração
-- pra uma RPC/edge server-side, set-based, numa única transação. Enquanto isso,
-- este teto tira a cliente do erro. Se um contrato gigante ainda estourar 60s,
-- subir aqui é o alívio imediato — mas o sinal é pra priorizar o server-side.
-- =============================================================================

ALTER ROLE authenticated SET statement_timeout = '60s';
ALTER ROLE anon         SET statement_timeout = '30s';
ALTER ROLE service_role SET statement_timeout = '120s';

-- Recarrega a config pra valer nas conexões já abertas do pool (best-effort;
-- SET ROLE nas próximas requisições já aplicaria de qualquer forma).
SELECT pg_reload_conf();

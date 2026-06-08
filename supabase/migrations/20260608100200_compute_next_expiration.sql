-- ============================================================
-- Asaas — Bloco 2b: cálculo da próxima expiração da assinatura
-- Decisões: docs/decisoes/2026-06-04-asaas.md
--
-- Helper puro (IMMUTABLE não, por usar timezone do servidor de sessão; STABLE):
-- soma 1 mês (monthly) ou 1 ano (yearly) a uma expiração corrente, preservando
-- o dia-âncora em America/Sao_Paulo.
--
-- O dia-âncora é preservado pela aritmética de interval do Postgres: somar
-- '1 month' a 31/01 resulta em 28/02 (ou 29/02 em ano bissexto), e o ciclo
-- seguinte volta a tentar o dia 31 a partir do timestamp original — mas como
-- recebemos sempre a expiração corrente, o comportamento é o padrão do Postgres
-- (clamp pro último dia do mês quando o dia não existe). Para yearly, 29/02 vira
-- 28/02 no ano não-bissexto.
--
-- TZ: convertemos pra America/Sao_Paulo antes de somar, pra que a "virada de dia"
-- aconteça no fuso de Brasília e não em UTC. Cycle desconhecido → assume monthly.
--
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_next_expiration(
  p_current TIMESTAMPTZ,
  p_cycle TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT (
    (p_current AT TIME ZONE 'America/Sao_Paulo')
    + CASE
        WHEN lower(coalesce(p_cycle, '')) IN ('yearly', 'annual', 'anual', 'year')
          THEN interval '1 year'
        ELSE interval '1 month'
      END
  ) AT TIME ZONE 'America/Sao_Paulo';
$$;

GRANT EXECUTE ON FUNCTION public.compute_next_expiration(TIMESTAMPTZ, TEXT)
  TO service_role, authenticated;

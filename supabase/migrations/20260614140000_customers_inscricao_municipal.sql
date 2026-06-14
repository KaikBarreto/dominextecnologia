-- Notas Fiscais (NFS-e via Fisqal): aba "Fiscal" no cadastro do cliente (tomador).
-- A emissão de NFS-e pode exigir a Inscrição Municipal do tomador quando ele é
-- pessoa jurídica prestadora/contribuinte municipal.
--
-- Migration ADITIVA e NULLABLE: zero risco de regressão. Não toca campo existente,
-- não faz backfill, não adiciona NOT NULL.
--
-- Observado no schema real (prod) ANTES de escrever:
--   * `inscricao_municipal` NÃO existe em customers (information_schema => 0 rows).
-- IF NOT EXISTS pra ser idempotente (rodar 2x não quebra).

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS inscricao_municipal text;

COMMENT ON COLUMN public.customers.inscricao_municipal IS 'Inscrição Municipal do tomador (NFS-e Fisqal)';

-- Flag por funil para alternar KPIs financeiros e contagem de cards.
-- A tabela crm_pipelines já possui RLS e policies multiempresa.

ALTER TABLE public.crm_pipelines
  ADD COLUMN IF NOT EXISTS tracks_value boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.crm_pipelines.tracks_value IS
  'Define se o funil acompanha valores financeiros. true preserva os KPIs em R$; false permite apresentar contagem de cards.';

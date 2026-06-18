-- PMOC Seção 4 "Relação dos ambientes climatizados": campos legais da Planilha PMOC.
-- Aditivos/nullable em contracts — só fazem sentido com is_pmoc=true (regra é da UI; no banco ficam livres).
-- RLS: contracts já tem policies tenant que cobrem colunas novas — nada a criar/alterar aqui.

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pmoc_tipo_atividade text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pmoc_identificacao_ambiente text NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pmoc_area_climatizada_m2 numeric NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pmoc_ocupantes_fixos integer NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pmoc_ocupantes_flutuantes integer NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS pmoc_carga_termica_tr numeric NULL;

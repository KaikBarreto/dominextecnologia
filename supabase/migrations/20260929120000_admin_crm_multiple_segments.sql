-- Uma oportunidade do CRM Admin pode atender mais de um nicho/segmento.
-- `segment` continua existindo como espelho do primeiro valor para manter
-- compatibilidade com integrações e versões antigas do frontend.
ALTER TABLE public.admin_leads
  ADD COLUMN IF NOT EXISTS segments text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.admin_leads
SET segments = ARRAY[segment]
WHERE segment IS NOT NULL
  AND btrim(segment) <> ''
  AND cardinality(segments) = 0;

COMMENT ON COLUMN public.admin_leads.segments IS
  'Segmentos associados à oportunidade; segment preserva o primeiro valor por compatibilidade.';

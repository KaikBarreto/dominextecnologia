-- Destino configurável por webhook de captação do CRM.
-- As colunas permanecem nullable para preservar webhooks antigos; a edge
-- function aplica o destino padrão legado quando ambos estiverem nulos.
ALTER TABLE public.crm_webhooks
  ADD COLUMN IF NOT EXISTS pipeline_id uuid,
  ADD COLUMN IF NOT EXISTS stage_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_webhooks_pipeline_id_fkey'
  ) THEN
    ALTER TABLE public.crm_webhooks
      ADD CONSTRAINT crm_webhooks_pipeline_id_fkey
      FOREIGN KEY (pipeline_id) REFERENCES public.crm_pipelines(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_webhooks_stage_id_fkey'
  ) THEN
    ALTER TABLE public.crm_webhooks
      ADD CONSTRAINT crm_webhooks_stage_id_fkey
      FOREIGN KEY (stage_id) REFERENCES public.crm_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_webhooks_pipeline_id ON public.crm_webhooks(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_webhooks_stage_id ON public.crm_webhooks(stage_id);

CREATE OR REPLACE FUNCTION public.validate_crm_webhook_destination()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL AND NEW.pipeline_id IS NULL THEN
    RAISE EXCEPTION 'A etapa de destino exige um funil de destino'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.pipeline_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.crm_pipelines p
     WHERE p.id = NEW.pipeline_id
       AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'O funil de destino não pertence à empresa do webhook'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.crm_stages s
     WHERE s.id = NEW.stage_id
       AND s.pipeline_id = NEW.pipeline_id
       AND s.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'A etapa de destino não pertence ao funil selecionado'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_webhooks_validate_destination ON public.crm_webhooks;
CREATE TRIGGER crm_webhooks_validate_destination
BEFORE INSERT OR UPDATE OF company_id, pipeline_id, stage_id
ON public.crm_webhooks
FOR EACH ROW EXECUTE FUNCTION public.validate_crm_webhook_destination();

-- ============================================================================
-- Sincroniza o SEGMENTO admin (companies.segment) -> tenant (company_settings.segment)
-- ============================================================================
-- POR QUÊ:
--   O gating das "Ferramentas do Técnico" (menu/rota/FAB) lê
--   company_settings.segment no client. Mas o admin Auctus define o segmento
--   em companies.segment (CompanyFormModal). Só existia sync de mão única
--   (company_settings -> companies, migration 20260614200000). Resultado:
--   empresa marcada como "refrigeracao" PELO ADMIN ficava com
--   company_settings.segment desalinhado (NULL ou "outro") e as Ferramentas
--   NÃO apareciam. Ex.: ArcTech (demo@dominex.app) admin=refrigeracao /
--   settings=outro. Faltava a mão companies -> company_settings.
--
-- SOLUÇÃO:
--   Trigger SECURITY DEFINER em companies que espelha segment ->
--   company_settings, guardado por IS DISTINCT FROM (evita loop com o trigger
--   inverso: quando os valores convergem, o UPDATE afeta 0 linhas e não há
--   nova cascata). + backfill alinhando settings <- companies (admin manda).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_companies_segment_to_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.segment IS NOT NULL AND NEW.segment <> '' THEN
    UPDATE public.company_settings
    SET segment = NEW.segment
    WHERE company_id = NEW.id
      AND segment IS DISTINCT FROM NEW.segment;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_companies_segment_to_settings ON public.companies;

CREATE TRIGGER trg_sync_companies_segment_to_settings
  AFTER INSERT OR UPDATE OF segment ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_companies_segment_to_settings();

-- Backfill: alinhar o tenant ao que o admin já definiu (admin é a fonte de
-- verdade do segmento). Só toca onde companies.segment está preenchido e o
-- tenant difere — corrige os desalinhados (ArcTech/demo, Minha Empresa Tutorial).
DO $$
DECLARE v_count integer;
BEGIN
  UPDATE public.company_settings cs
  SET segment = c.segment
  FROM public.companies c
  WHERE cs.company_id = c.id
    AND c.segment IS NOT NULL AND c.segment <> ''
    AND cs.segment IS DISTINCT FROM c.segment;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill segmento companies->company_settings: % linhas alinhadas', v_count;
END $$;

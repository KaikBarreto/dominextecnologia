-- NFS-e: a rota de emissão também depende do regime tributário.
--
-- Desde 01/11/2026, ME/EPP optante pelo Simples usa obrigatoriamente a Sefin
-- Nacional mesmo quando o município mantém emissor próprio. Uma cobertura
-- confirmada nesse regime não pode sobreviver à troca para Lucro Presumido ou
-- Lucro Real; a nova consulta deve decidir novamente com os parâmetros oficiais.

CREATE OR REPLACE FUNCTION public.invalidate_nfse_coverage_on_city_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.municipio_ibge IS DISTINCT FROM OLD.municipio_ibge
     OR NEW.fiscal_ambiente IS DISTINCT FROM OLD.fiscal_ambiente
     OR NEW.regime_tributario IS DISTINCT FROM OLD.regime_tributario THEN
    NEW.pode_emitir := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_nfse_coverage_on_city_change
  ON public.company_fiscal_settings;

CREATE TRIGGER trg_invalidate_nfse_coverage_on_city_change
BEFORE UPDATE OF municipio_ibge, fiscal_ambiente, regime_tributario
ON public.company_fiscal_settings
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_nfse_coverage_on_city_change();

COMMENT ON FUNCTION public.invalidate_nfse_coverage_on_city_change() IS
  'Falha fechado: trocar municipio, ambiente ou regime tributario invalida imediatamente a cobertura NFS-e persistida.';

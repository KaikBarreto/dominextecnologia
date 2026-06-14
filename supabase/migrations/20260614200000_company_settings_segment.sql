-- ============================================================================
-- Segmento de Atuação no nível do tenant (company_settings) + espelho no admin
-- ============================================================================
-- POR QUÊ:
--   A coluna companies.segment já existe (lado admin; painel master seta no
--   cadastro da empresa). Faltava o tenant poder editar o próprio segmento na
--   aba Configurações -> Empresa (company_settings). Como o tenant não escreve
--   em companies (RLS bloqueia em silêncio), reaproveitamos o trigger
--   sync_company_settings_to_companies() (SECURITY DEFINER) pra espelhar o
--   segmento de company_settings -> companies de forma não-destrutiva.
-- ============================================================================

-- Parte 1 — Nova coluna no tenant ----------------------------------------------
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS segment text;

-- Parte 2 — Estende a função de sync (mantém todos os campos + segment) ---------
CREATE OR REPLACE FUNCTION public.sync_company_settings_to_companies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies c
  SET
    name           = COALESCE(NULLIF(NEW.name, ''),           c.name),
    cnpj           = COALESCE(NULLIF(NEW.document, ''),       c.cnpj),
    phone          = COALESCE(NULLIF(NEW.phone, ''),          c.phone),
    email          = COALESCE(NULLIF(NEW.email, ''),          c.email),
    logo_url       = COALESCE(NULLIF(NEW.logo_url, ''),       c.logo_url),
    address        = COALESCE(NULLIF(NEW.address, ''),        c.address),
    address_number = COALESCE(NULLIF(NEW.address_number, ''), c.address_number),
    neighborhood   = COALESCE(NULLIF(NEW.neighborhood, ''),   c.neighborhood),
    complement     = COALESCE(NULLIF(NEW.complement, ''),     c.complement),
    city           = COALESCE(NULLIF(NEW.city, ''),           c.city),
    state          = COALESCE(NULLIF(NEW.state, ''),          c.state),
    zip_code       = COALESCE(NULLIF(NEW.zip_code, ''),       c.zip_code),
    segment        = COALESCE(NULLIF(NEW.segment, ''),        c.segment)
  WHERE c.id = NEW.company_id;

  RETURN NEW;
END;
$$;

-- Trigger inalterado (AFTER INSERT OR UPDATE). Recriado por idempotência.
DROP TRIGGER IF EXISTS trg_sync_company_settings_to_companies ON public.company_settings;

CREATE TRIGGER trg_sync_company_settings_to_companies
  AFTER INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_company_settings_to_companies();

-- Parte 3 — Backfill reverso one-time ------------------------------------------
-- Copia o segmento que o admin já tinha em companies pra company_settings, pra
-- não sumir o valor existente quando o tenant abrir a tela.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.company_settings cs
  SET segment = c.segment
  FROM public.companies c
  WHERE cs.company_id = c.id
    AND (cs.segment IS NULL OR cs.segment = '')
    AND c.segment IS NOT NULL AND c.segment <> '';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill reverso segment companies -> company_settings: % linhas', v_count;
END $$;

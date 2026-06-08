-- ============================================================================
-- Sincroniza identidade do tenant (company_settings) -> tabela admin (companies)
-- ============================================================================
-- POR QUÊ:
--   O cliente (tenant) edita os dados da própria empresa em
--   public.company_settings (aba Configurações -> Empresa). O painel master
--   Auctus, porém, lê a identidade em public.companies. A tentativa antiga de
--   sync feita no client (useCompanySettings.ts -> supabase.from('companies')
--   .update(...)) é bloqueada em silêncio pelo RLS de UPDATE de companies, que
--   exige is_admin_user(auth.uid()). Tenant comum nunca passa, o update some no
--   try-catch e o admin vê "N/A".
--
-- SOLUÇÃO:
--   Trigger SECURITY DEFINER em company_settings que espelha os campos de
--   identidade para companies, rodando com privilégio elevado (ignora o RLS de
--   companies). COALESCE(NULLIF(NEW.x,''), companies.x) preserva valor que o
--   admin já tenha setado manualmente em companies (não sobrescreve com
--   null/vazio). Sem recursão: a trigger só escreve em companies, nunca de volta
--   em company_settings.
-- ============================================================================

-- Parte 1 — Função trigger SECURITY DEFINER -------------------------------------
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
    zip_code       = COALESCE(NULLIF(NEW.zip_code, ''),       c.zip_code)
  WHERE c.id = NEW.company_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_settings_to_companies ON public.company_settings;

CREATE TRIGGER trg_sync_company_settings_to_companies
  AFTER INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_company_settings_to_companies();

-- Parte 2 — Backfill one-time --------------------------------------------------
-- Espelha o que já existe em company_settings para companies, sem apagar valor
-- que o admin já tenha preenchido manualmente em companies.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.companies c
  SET
    name           = COALESCE(NULLIF(cs.name, ''),           c.name),
    cnpj           = COALESCE(NULLIF(cs.document, ''),       c.cnpj),
    phone          = COALESCE(NULLIF(cs.phone, ''),          c.phone),
    email          = COALESCE(NULLIF(cs.email, ''),          c.email),
    logo_url       = COALESCE(NULLIF(cs.logo_url, ''),       c.logo_url),
    address        = COALESCE(NULLIF(cs.address, ''),        c.address),
    address_number = COALESCE(NULLIF(cs.address_number, ''), c.address_number),
    neighborhood   = COALESCE(NULLIF(cs.neighborhood, ''),   c.neighborhood),
    complement     = COALESCE(NULLIF(cs.complement, ''),     c.complement),
    city           = COALESCE(NULLIF(cs.city, ''),           c.city),
    state          = COALESCE(NULLIF(cs.state, ''),          c.state),
    zip_code       = COALESCE(NULLIF(cs.zip_code, ''),       c.zip_code)
  FROM public.company_settings cs
  WHERE c.id = cs.company_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill sync_company_settings_to_companies: % empresas atualizadas', v_count;
END $$;

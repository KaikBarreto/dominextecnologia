-- =============================================================================
-- 2026-06-12 — company_settings: backfill + criação automática no INSERT de companies
--
-- Por quê: 13 das 17 empresas em `companies` NÃO tinham linha em
-- `company_settings`. A tela Configurações → Dados da Empresa só faz UPDATE
-- nessa linha; sem ela, o auto-save é no-op silencioso (cliente "salva" e
-- nada persiste). Empresas novas (admin Auctus e self-register) também não
-- ganhavam a linha na criação.
--
-- O que faz:
--   1. Dedup defensivo por company_id (mantém a mais recente) — hoje não há
--      duplicatas, mas garante o passo 2 em qualquer ambiente.
--   2. UNIQUE (company_id) — impede linha dupla e habilita ON CONFLICT.
--   3. Backfill: cria a linha pra toda company sem settings, espelhando
--      identidade de `companies` (name, cnpj→document, phone, email,
--      endereço, logo_url — mesmas colunas que o sync reverso
--      `sync_company_settings_to_companies` mapeia 1:1).
--   4. Trigger AFTER INSERT em `companies` criando a linha default.
--
-- Notas de segurança verificadas antes de escrever:
--   - `trg_sync_company_settings_to_companies` (settings→companies) dispara
--     em INSERT, mas usa COALESCE(NULLIF(...)) — valores NULL/'' do backfill
--     NÃO sobrescrevem `companies`. Espelhamento existente intocado.
--   - `tg_set_company_id_company_settings` só preenche company_id quando
--     vem NULL — aqui sempre enviamos explícito.
--   - Existe 1 linha legada com company_id NULL — UNIQUE permite NULLs,
--     linha preservada.
-- =============================================================================

-- 1) Dedup defensivo: mantém a linha mais recente por company_id
DO $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.company_settings cs
  USING public.company_settings newer
  WHERE cs.company_id IS NOT NULL
    AND newer.company_id = cs.company_id
    AND (newer.updated_at, newer.id) > (cs.updated_at, cs.id);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'company_settings: % linha(s) duplicada(s) removida(s)', v_deleted;
END $$;

-- 2) UNIQUE em company_id (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_settings'::regclass
      AND conname = 'company_settings_company_id_key'
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_company_id_key UNIQUE (company_id);
  END IF;
END $$;

-- 3) Backfill: linha pra toda company sem settings
DO $$
DECLARE
  v_inserted INT;
BEGIN
  INSERT INTO public.company_settings
    (company_id, name, document, phone, email, logo_url,
     address, address_number, neighborhood, complement, city, state, zip_code)
  SELECT
    c.id, c.name, c.cnpj, c.phone, c.email, c.logo_url,
    c.address, c.address_number, c.neighborhood, c.complement, c.city, c.state, c.zip_code
  FROM public.companies c
  LEFT JOIN public.company_settings cs ON cs.company_id = c.id
  WHERE cs.id IS NULL
  ON CONFLICT (company_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'company_settings: % linha(s) criada(s) no backfill', v_inserted;
END $$;

-- 4) Trigger AFTER INSERT em companies → cria a linha default de settings
CREATE OR REPLACE FUNCTION public.create_company_settings_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_settings
    (company_id, name, document, phone, email, logo_url,
     address, address_number, neighborhood, complement, city, state, zip_code)
  VALUES
    (NEW.id, NEW.name, NEW.cnpj, NEW.phone, NEW.email, NEW.logo_url,
     NEW.address, NEW.address_number, NEW.neighborhood, NEW.complement,
     NEW.city, NEW.state, NEW.zip_code)
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_company_settings_on_company_insert ON public.companies;
CREATE TRIGGER trg_create_company_settings_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.create_company_settings_on_company_insert();

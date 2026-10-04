-- =====================================================================
-- Normalização do histórico de companies.origin + trigger de rename
-- =====================================================================
-- Contexto: 30 de 56 empresas tinham origin com rótulos que não existem
-- em company_origins (lista hardcoded antiga do cadastro público), então
-- o painel master não achava cor/ícone e mostrava texto cru / "N/A".
--
-- Escopo deliberadamente restrito a public.companies. A tabela
-- public.leads é o CRM DOS CLIENTES (tem company_id) e NÃO usa
-- company_origins — não é tocada aqui. O CRM do painel Auctus é
-- public.admin_leads (coluna source) e já está consistente.
--
-- Triggers de UPDATE em companies verificados antes de rodar:
--   - update_companies_updated_at (BEFORE UPDATE, carimba updated_at)
--   - trg_sync_companies_segment_to_settings (UPDATE OF segment — não dispara)
-- Nenhum efeito colateral de notificação, auditoria ou assinatura.
-- =====================================================================

DO $$
DECLARE
  v_row RECORD;
  v_count INTEGER;
  v_total INTEGER := 0;
  v_orphans INTEGER;
BEGIN
  FOR v_row IN
    SELECT *
    FROM (VALUES
      ('instagram',           'Facebook/Instagram'),
      ('facebook',            'Facebook/Instagram'),
      ('google',              'Site/Google'),
      ('site',                'Site/Google'),
      ('chatgpt.com',         'ChatGPT/IAs'),
      ('indicação de amigo',  'Indicação'),
      ('outro',               'Outros')
    ) AS t(from_key, to_name)
  LOOP
    UPDATE public.companies AS c
    SET origin = v_row.to_name
    WHERE lower(trim(c.origin)) = v_row.from_key
      AND c.origin <> v_row.to_name;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total := v_total + v_count;
    RAISE NOTICE 'companies.origin: % -> % (% linhas)', v_row.from_key, v_row.to_name, v_count;
  END LOOP;

  RAISE NOTICE 'companies.origin: total de % linhas normalizadas', v_total;

  SELECT COUNT(*) INTO v_orphans
  FROM public.companies AS c
  WHERE c.origin IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.company_origins AS co WHERE co.name = c.origin
    );

  RAISE NOTICE 'companies.origin: % órfãs restantes', v_orphans;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Normalização incompleta — ainda há % empresas com origin fora do catálogo', v_orphans;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Trigger de rename — mantém o histórico amarrado ao novo nome
-- ---------------------------------------------------------------------
-- companies.origin e admin_leads.source guardam o NOME (não o id), então
-- renomear uma origem no painel desgarraria o histórico inteiro de novo.
CREATE OR REPLACE FUNCTION public.propagate_company_origin_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_companies INTEGER;
  v_leads INTEGER;
BEGIN
  UPDATE public.companies
  SET origin = NEW.name
  WHERE origin = OLD.name;
  GET DIAGNOSTICS v_companies = ROW_COUNT;

  UPDATE public.admin_leads
  SET source = NEW.name
  WHERE source = OLD.name;
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  RAISE NOTICE 'Origem "%" renomeada para "%": % empresas e % leads atualizados',
    OLD.name, NEW.name, v_companies, v_leads;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.propagate_company_origin_rename() IS
  'Propaga rename de company_origins.name para companies.origin e admin_leads.source (ambos guardam o nome, não o id).';

DROP TRIGGER IF EXISTS trg_propagate_company_origin_rename ON public.company_origins;

CREATE TRIGGER trg_propagate_company_origin_rename
  AFTER UPDATE OF name ON public.company_origins
  FOR EACH ROW
  WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.propagate_company_origin_rename();

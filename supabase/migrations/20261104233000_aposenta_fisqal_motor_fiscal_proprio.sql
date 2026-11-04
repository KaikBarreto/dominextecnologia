-- NFS-e: motor fiscal proprio como unico caminho de emissao.
--
-- Esta e a ETAPA 1 da aposentadoria do integrador legado. A esteira publica
-- migrations ANTES das Edge Functions, por isso as colunas e a RPC antigas
-- continuam fisicamente presentes durante uma janela curta de compatibilidade.
-- O runtime novo usa os nomes neutros abaixo; uma migration posterior, somente
-- depois do deploy e da verificacao das edges, remove os aliases antigos.

-- =============================================================================
-- 1. Preflight fail-closed: nunca confundir id remoto com objeto cifrado local
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.company_fiscal_settings
    WHERE nullif(btrim(fisqal_certificate_id), '') IS NOT NULL
      AND nullif(btrim(certificado_ref), '') IS NULL
  ) THEN
    RAISE EXCEPTION
      'Migracao fiscal interrompida: existe certificado legado sem custodia no motor proprio.';
  END IF;
END;
$$;

-- =============================================================================
-- 2. Um unico motor: Sefin Nacional / Portal Nacional da NFS-e
-- =============================================================================

-- A coluna permanece nesta etapa porque as edges publicadas antes deste deploy
-- ainda a leem. Todas as linhas e novas insercoes passam a apontar para o motor
-- proprio; o CHECK impede reintroduzir o integrador aposentado.
UPDATE public.company_fiscal_settings
SET provedor = 'sefin'
WHERE provedor IS DISTINCT FROM 'sefin';

ALTER TABLE public.company_fiscal_settings
  ALTER COLUMN provedor SET DEFAULT 'sefin';

ALTER TABLE public.company_fiscal_settings
  DROP CONSTRAINT IF EXISTS company_fiscal_settings_provedor_check;

ALTER TABLE public.company_fiscal_settings
  ADD CONSTRAINT company_fiscal_settings_provedor_check
  CHECK (provedor = 'sefin');

COMMENT ON COLUMN public.company_fiscal_settings.provedor IS
  'Compatibilidade temporaria da transicao. O unico valor aceito e sefin, motor proprio da Dominex conectado ao Portal Nacional da NFS-e. Remover na etapa 2.';

-- Cobertura pertence ao municipio. Qualquer troca de IBGE invalida a conclusao
-- anterior no mesmo UPDATE, mesmo se o client cair antes da nova consulta.
CREATE OR REPLACE FUNCTION public.invalidate_nfse_coverage_on_city_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.municipio_ibge IS DISTINCT FROM OLD.municipio_ibge THEN
    NEW.pode_emitir := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_nfse_coverage_on_city_change
  ON public.company_fiscal_settings;

CREATE TRIGGER trg_invalidate_nfse_coverage_on_city_change
BEFORE UPDATE OF municipio_ibge ON public.company_fiscal_settings
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_nfse_coverage_on_city_change();

COMMENT ON FUNCTION public.invalidate_nfse_coverage_on_city_change() IS
  'Falha fechado: trocar o municipio invalida imediatamente a cobertura NFS-e persistida.';

-- =============================================================================
-- 3. Referencias fiscais com nomes neutros
-- =============================================================================

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS referencia_fiscal text,
  ADD COLUMN IF NOT EXISTS requisicao_fiscal_id text;

COMMENT ON COLUMN public.nfse_emissions.referencia_fiscal IS
  'Referencia canonica do documento no ambiente fiscal. No motor proprio, normalmente e a chave de acesso da NFS-e.';

COMMENT ON COLUMN public.nfse_emissions.requisicao_fiscal_id IS
  'Correlacao tecnica de uma requisicao fiscal, quando existir. Mantida para preservar historico durante a aposentadoria do integrador legado.';

-- Preserva qualquer valor canonico ja gravado. Para o motor proprio, a chave de
-- acesso e a melhor referencia; o alias legado fica apenas como ultimo fallback.
UPDATE public.nfse_emissions
SET referencia_fiscal = coalesce(
  nullif(btrim(referencia_fiscal), ''),
  nullif(btrim(chave_acesso), ''),
  nullif(btrim(fisqal_dps_id), '')
)
WHERE nullif(btrim(referencia_fiscal), '') IS NULL
  AND (
    nullif(btrim(chave_acesso), '') IS NOT NULL
    OR nullif(btrim(fisqal_dps_id), '') IS NOT NULL
  );

UPDATE public.nfse_emissions
SET requisicao_fiscal_id = nullif(btrim(fisqal_fiscal_request_id), '')
WHERE nullif(btrim(requisicao_fiscal_id), '') IS NULL
  AND nullif(btrim(fisqal_fiscal_request_id), '') IS NOT NULL;

-- =============================================================================
-- 4. Sequencial DPS canonico e restrito ao backend
-- =============================================================================

CREATE OR REPLACE FUNCTION public.nfse_next_dps_number(p_company_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num bigint;
BEGIN
  UPDATE public.company_fiscal_settings
     SET ultimo_numero_dps = ultimo_numero_dps + 1
   WHERE company_id = p_company_id
   RETURNING ultimo_numero_dps INTO v_num;

  IF v_num IS NULL THEN
    RAISE EXCEPTION 'Configuracao fiscal nao encontrada.';
  END IF;

  RETURN v_num;
END;
$$;

COMMENT ON FUNCTION public.nfse_next_dps_number(uuid) IS
  'Reserva atomica do proximo numero de DPS de uma empresa. Uso exclusivo das Edge Functions com service_role.';

REVOKE ALL ON FUNCTION public.nfse_next_dps_number(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfse_next_dps_number(uuid) TO service_role;

-- Fecha a permissao indevida da RPC antiga sem quebra-la enquanto a edge
-- anterior ainda pode executa-la entre o push desta migration e o deploy novo.
-- A funcao e removida na etapa 2, junto das colunas fisqal_*.
REVOKE ALL ON FUNCTION public.fisqal_next_dps_number(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fisqal_next_dps_number(uuid) TO service_role;

-- NFS-e: ambiente fiscal canonico por documento e cobertura fail-closed.
--
-- Uma NFS-e pertence para sempre ao ambiente em que foi transmitida. Usar o
-- ambiente atual da empresa para consultar/cancelar uma nota antiga pode mandar
-- uma chave de homologacao para producao (ou o inverso). A coluna nasce nullable
-- porque ambiente de documento historico sem evidencia NAO pode ser inventado.

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS fiscal_ambiente text;

ALTER TABLE public.nfse_emissions
  DROP CONSTRAINT IF EXISTS nfse_emissions_fiscal_ambiente_check;

ALTER TABLE public.nfse_emissions
  ADD CONSTRAINT nfse_emissions_fiscal_ambiente_check
  CHECK (fiscal_ambiente IS NULL OR fiscal_ambiente IN ('homologacao', 'producao'));

COMMENT ON COLUMN public.nfse_emissions.fiscal_ambiente IS
  'Ambiente fiscal imutavel de origem do documento. NULL significa legado sem evidencia suficiente; operacoes fiscais devem falhar fechado.';

-- Backfill somente com evidencia gravada pelo motor. O payload de emissao e de
-- consulta traz `ambiente` na raiz; cancelamento historico pode trazê-lo dentro
-- de `response`. 1=producao, 2=homologacao.
WITH ambiente_comprovado AS (
  SELECT DISTINCT ON (ev.nfse_emission_id)
    ev.nfse_emission_id,
    CASE coalesce(
      ev.payload->>'ambiente',
      ev.payload#>>'{response,ambiente}'
    )
      WHEN '1' THEN 'producao'
      WHEN '2' THEN 'homologacao'
      ELSE NULL
    END AS fiscal_ambiente
  FROM public.nfse_events ev
  WHERE coalesce(
    ev.payload->>'ambiente',
    ev.payload#>>'{response,ambiente}'
  ) IN ('1', '2')
  ORDER BY ev.nfse_emission_id, ev.created_at DESC, ev.id DESC
)
UPDATE public.nfse_emissions n
SET fiscal_ambiente = a.fiscal_ambiente
FROM ambiente_comprovado a
WHERE n.id = a.nfse_emission_id
  AND n.fiscal_ambiente IS NULL
  AND a.fiscal_ambiente IS NOT NULL;

-- Rascunho ainda nao atravessou a fronteira fiscal; portanto o ambiente atual
-- da configuracao e a fonte correta e pode ser gravado sem inventar historico.
UPDATE public.nfse_emissions n
SET fiscal_ambiente = CASE
  WHEN f.fiscal_ambiente = 'producao' THEN 'producao'
  ELSE 'homologacao'
END
FROM public.company_fiscal_settings f
WHERE n.company_id = f.company_id
  AND n.status = 'rascunho'
  AND n.fiscal_ambiente IS NULL;

-- Chaves antigas NAO sao reescritas nesta migration. A esteira aplica schema
-- antes das Edge Functions; reescrever aqui abriria uma janela em que a edge
-- antiga nao encontraria a propria nota e poderia retransmiti-la. A edge nova
-- reconhece a chave legada somente quando `fiscal_ambiente` coincide e grava
-- namespace nas tentativas novas.

-- Cobertura pertence ao par (municipio, ambiente). Trocar qualquer lado
-- invalida a conclusao anterior no mesmo UPDATE, antes de nova chamada de rede.
CREATE OR REPLACE FUNCTION public.invalidate_nfse_coverage_on_city_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.municipio_ibge IS DISTINCT FROM OLD.municipio_ibge
     OR NEW.fiscal_ambiente IS DISTINCT FROM OLD.fiscal_ambiente THEN
    NEW.pode_emitir := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_nfse_coverage_on_city_change
  ON public.company_fiscal_settings;

CREATE TRIGGER trg_invalidate_nfse_coverage_on_city_change
BEFORE UPDATE OF municipio_ibge, fiscal_ambiente ON public.company_fiscal_settings
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_nfse_coverage_on_city_change();

COMMENT ON FUNCTION public.invalidate_nfse_coverage_on_city_change() IS
  'Falha fechado: trocar municipio ou ambiente invalida imediatamente a cobertura NFS-e persistida.';

-- Homologacao nao tem efeito fiscal e nao consome a franquia comercial. NULL
-- (legado sem ambiente comprovado) continua contando para nao reduzir uso real
-- por inferencia durante o backfill conservador.
CREATE OR REPLACE FUNCTION public.nfse_month_usage(p_company_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COUNT(*)::int
  FROM public.nfse_emissions e
  WHERE e.company_id = p_company_id
    AND date_trunc('month', e.created_at AT TIME ZONE 'America/Sao_Paulo')
        = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
    AND e.fiscal_ambiente IS DISTINCT FROM 'homologacao'
    AND lower(coalesce(e.status, '')) NOT IN
        ('rascunho', 'rejeitada', 'falhou', 'rejected', 'failed', 'error', 'erro');
$function$;

GRANT EXECUTE ON FUNCTION public.nfse_month_usage(uuid)
  TO authenticated, service_role;

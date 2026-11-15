-- Paridade aditiva da NFS-e Dominex com o contrato fiscal compartilhado.
-- Nenhuma coluna existente é alterada e nenhum dado histórico é reescrito.

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS valor_inss numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_irrf numeric(14,2),
  ADD COLUMN IF NOT EXISTS deducoes numeric(14,2),
  ADD COLUMN IF NOT EXISTS desconto_condicionado numeric(14,2),
  ADD COLUMN IF NOT EXISTS desconto_incondicionado numeric(14,2),
  ADD COLUMN IF NOT EXISTS documento_responsabilidade_tecnica text,
  ADD COLUMN IF NOT EXISTS documento_referencia text,
  ADD COLUMN IF NOT EXISTS informacoes_complementares text;

ALTER TABLE public.nfse_emissions
  DROP CONSTRAINT IF EXISTS nfse_emissions_valor_inss_nonnegative,
  ADD CONSTRAINT nfse_emissions_valor_inss_nonnegative
    CHECK (valor_inss IS NULL OR valor_inss >= 0),
  DROP CONSTRAINT IF EXISTS nfse_emissions_valor_irrf_nonnegative,
  ADD CONSTRAINT nfse_emissions_valor_irrf_nonnegative
    CHECK (valor_irrf IS NULL OR valor_irrf >= 0),
  DROP CONSTRAINT IF EXISTS nfse_emissions_deducoes_nonnegative,
  ADD CONSTRAINT nfse_emissions_deducoes_nonnegative
    CHECK (deducoes IS NULL OR deducoes >= 0),
  DROP CONSTRAINT IF EXISTS nfse_emissions_desconto_condicionado_nonnegative,
  ADD CONSTRAINT nfse_emissions_desconto_condicionado_nonnegative
    CHECK (desconto_condicionado IS NULL OR desconto_condicionado >= 0),
  DROP CONSTRAINT IF EXISTS nfse_emissions_desconto_incondicionado_nonnegative,
  ADD CONSTRAINT nfse_emissions_desconto_incondicionado_nonnegative
    CHECK (desconto_incondicionado IS NULL OR desconto_incondicionado >= 0);

COMMENT ON COLUMN public.nfse_emissions.valor_inss IS
  'Valor absoluto de INSS retido, em R$, enviado na DPS.';
COMMENT ON COLUMN public.nfse_emissions.valor_irrf IS
  'Valor absoluto de IRRF retido, em R$, enviado na DPS.';
COMMENT ON COLUMN public.nfse_emissions.deducoes IS
  'Valor absoluto de deduções/reduções da base, em R$, enviado em vDedRed/vDR.';
COMMENT ON COLUMN public.nfse_emissions.desconto_condicionado IS
  'Desconto condicionado em R$ enviado na DPS.';
COMMENT ON COLUMN public.nfse_emissions.desconto_incondicionado IS
  'Desconto incondicionado em R$ enviado na DPS e considerado na base do ISS.';
COMMENT ON COLUMN public.nfse_emissions.documento_responsabilidade_tecnica IS
  'Identificador do documento de responsabilidade técnica da prestação.';
COMMENT ON COLUMN public.nfse_emissions.documento_referencia IS
  'Documento fiscal ou contratual de referência da prestação.';
COMMENT ON COLUMN public.nfse_emissions.informacoes_complementares IS
  'Informações complementares enviadas no grupo de serviço da DPS.';

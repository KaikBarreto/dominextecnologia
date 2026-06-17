-- Modelo "fiscal por tipo de serviço": cada service_type do catálogo do tenant
-- carrega a classificação fiscal própria pra emissão de NFS-e.
-- Migration ADITIVA e nullable: zero regressão, não toca dado existente.

ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS codigo_servico text,        -- código de tributação nacional (cTribNac / LC116)
  ADD COLUMN IF NOT EXISTS codigo_nbs text,            -- Nomenclatura Brasileira de Serviços
  ADD COLUMN IF NOT EXISTS iss_aliquota numeric(5,2),  -- alíquota de ISS do serviço (%)
  ADD COLUMN IF NOT EXISTS item_lc116 text;            -- item da lista de serviços da LC 116

COMMENT ON COLUMN public.service_types.codigo_servico IS 'Código de tributação nacional do serviço (cTribNac/LC116) para NFS-e';
COMMENT ON COLUMN public.service_types.codigo_nbs IS 'Nomenclatura Brasileira de Serviços (NBS) para NFS-e';
COMMENT ON COLUMN public.service_types.iss_aliquota IS 'Alíquota de ISS do serviço em percentual';
COMMENT ON COLUMN public.service_types.item_lc116 IS 'Item da lista de serviços anexa à LC 116/2003';

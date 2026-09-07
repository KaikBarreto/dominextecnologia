-- company_fiscal_settings.percentual_trib_sn — default por empresa do percentual
-- total de tributos do Simples Nacional, usado na emissão de NFS-e.
--
-- POR QUE
-- Hoje o campo "Percentual de tributos do Simples Nacional (%)" é obrigatório em
-- TODA nota (ValoresStep.tsx / NovaNotaModal.tsx) e não existe em lugar nenhum da
-- configuração da empresa — o contador redigita o mesmo número em toda NFS-e.
-- O CEO decidiu: default salvo em Configurações fiscais > Tributação, ainda
-- editável por nota (a coluna aqui é só o valor de partida).
--
-- Mesma precisão de `nfse_emissions.percentual_trib_sn`
-- (20260825120000_nfse_valores_ricos_rascunho_e_paged.sql:21) — é o mesmo dado,
-- só que como default do tenant em vez de valor gravado por nota.
--
-- RLS: nada novo aqui. As policies de company_fiscal_settings
-- (20260614130000_nfse_emissions_core.sql) são row-level (por company_id via
-- get_user_company_id), sem lista de colunas — uma coluna nullable a mais não
-- muda nenhum predicado. Não recriar policy.
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS percentual_trib_sn numeric(7,4);

COMMENT ON COLUMN public.company_fiscal_settings.percentual_trib_sn IS
  'Default da empresa para o percentual total de tributos do Simples Nacional (mesmo dado de nfse_emissions.percentual_trib_sn). Usado como 3º nível de fallback na emissão/rascunho de NFS-e (body → rascunho → este default) — continua editável por nota. NULL = sem default; nesse caso a nota exige o valor manualmente quando a empresa é optante do Simples.';

-- NFS-e: cTribMun escolhível por nota (override do herdado de service_types).
-- Parte da tarefa B3 do plano docs/planos/2026-09-03-nfse-motor-proprio-sefin-nacional.md.
-- Complementa 20260903160000_nfse_provedor_e_custodia.sql (que trouxe o cTribMun em service_types).
-- Migration puramente aditiva.

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS codigo_tributacao_municipal text;

COMMENT ON COLUMN public.nfse_emissions.codigo_tributacao_municipal IS
  'cTribMun do layout nacional da NFS-e (3 dígitos). Complementa codigo_servico (cTribNac, 6 dígitos): o município registra o serviço como 14.01.01.001 = cTribNac(6)+cTribMun(3). Override por nota; quando nulo, herda de service_types.codigo_tributacao_municipal. Ausência causa rejeição E0312.';

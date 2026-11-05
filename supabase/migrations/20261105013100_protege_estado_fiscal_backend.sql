-- company_fiscal_settings: separa configuração editável do estado fiscal.
--
-- A RLS limita a linha ao tenant, mas não limita colunas. Sem estes privilégios
-- um gestor poderia chamar o PostgREST diretamente e forçar `pode_emitir=true`,
-- trocar o ponteiro do A1 ou manipular a numeração da DPS. A Edge usa
-- service_role e continua com acesso integral; authenticated recebe somente os
-- campos que a UI realmente permite configurar.

REVOKE INSERT, UPDATE ON public.company_fiscal_settings FROM authenticated;

GRANT INSERT (
  company_id,
  inscricao_municipal,
  inscricao_estadual,
  regime_tributario,
  codigo_servico_default,
  codigo_nbs_default,
  item_lc116,
  iss_aliquota,
  fiscal_ambiente,
  municipio_ibge,
  reg_ap_trib_sn,
  percentual_trib_sn,
  dfe_nfe_ativo,
  dfe_nfse_ativo
) ON public.company_fiscal_settings TO authenticated;

GRANT UPDATE (
  inscricao_municipal,
  inscricao_estadual,
  regime_tributario,
  codigo_servico_default,
  codigo_nbs_default,
  item_lc116,
  iss_aliquota,
  fiscal_ambiente,
  municipio_ibge,
  reg_ap_trib_sn,
  percentual_trib_sn,
  dfe_nfe_ativo,
  dfe_nfse_ativo
) ON public.company_fiscal_settings TO authenticated;

COMMENT ON TABLE public.company_fiscal_settings IS
  'Configuração fiscal tenant. authenticated edita apenas dados declaratórios/opt-ins; cobertura, certificado, provedor e numeração são estado exclusivo do backend.';

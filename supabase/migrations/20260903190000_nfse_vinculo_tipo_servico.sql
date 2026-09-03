-- NFS-e: vincula a emissão ao service_type escolhido no seletor da nota.
-- Problema: o passo Serviço da emissão preenche os códigos fiscais a partir de um
-- seletor de service_types, mas o rascunho só guardava os CÓDIGOS resultantes,
-- não a ESCOLHA em si. Ao reabrir um rascunho, os campos vinham preenchidos e o
-- seletor voltava vazio — parece defeito pro usuário.
-- Migration puramente aditiva.
--
-- ON DELETE SET NULL (não CASCADE): nota fiscal tem guarda legal de 5 anos.
-- Os códigos fiscais efetivamente usados na emissão (codigo_servico,
-- codigo_tributacao_municipal, codigo_nbs) já ficam congelados em colunas próprias
-- da nota — apagar o cadastro do service_type não pode apagar nem corromper a nota.
-- service_types tem soft-delete via is_active (sem deleted_at), mas também permite
-- DELETE físico (policy "Admin/gestor can delete service types"), daí o ON DELETE
-- SET NULL ser necessário de fato, não só teórico.

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.nfse_emissions.service_type_id IS
  'Tipo de serviço escolhido no seletor da nota. Guarda a ESCOLHA (os códigos fiscais efetivamente usados ficam em codigo_servico/codigo_tributacao_municipal/codigo_nbs, congelados no momento da emissão). ON DELETE SET NULL: apagar o cadastro do serviço não pode apagar nem corromper a nota fiscal.';

-- Adiciona coluna de ícone ao funil do CRM do painel master Auctus.
--
-- Paridade com `crm_stages.icon` (CRM do tenant): guarda o NOME de um ícone
-- lucide (ex.: 'Phone', 'Handshake') exibido no cabeçalho colorido de cada
-- coluna do funil. Sem essa coluna, o funil do admin (`admin_crm_stages`)
-- não tem como replicar o mesmo cabeçalho com ícone que o funil do tenant já tem.
--
-- Nullable, sem default: etapas existentes ficam sem ícone até o usuário
-- escolher um na UI. Não altera RLS/policy/grant/trigger/índice — tabela
-- já é super_admin only e essa é só uma coluna de apresentação opcional.

ALTER TABLE public.admin_crm_stages
  ADD COLUMN IF NOT EXISTS icon text;

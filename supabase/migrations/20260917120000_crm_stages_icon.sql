-- Adiciona coluna de ícone às colunas (estágios) do funil de CRM.
-- Nullable de propósito: null = estágio sem ícone (estado de TODAS as linhas
-- existentes hoje). Nenhuma empresa vê nada mudar por causa desta migration.
-- Guarda o NOME de um ícone Lucide (ex: 'Handshake'), espelhando o padrão
-- já usado em customer_origins.icon.
ALTER TABLE public.crm_stages ADD COLUMN IF NOT EXISTS icon text;

COMMENT ON COLUMN public.crm_stages.icon IS
  'Nome de um ícone Lucide (ex: Handshake) usado para representar o estágio no funil. Null = sem ícone.';

-- Nota (dev-database): não é necessário nenhum ajuste de RLS. As policies
-- existentes de crm_stages ("System managers can manage crm_stages" FOR ALL
-- e "Users view own company crm_stages" FOR SELECT) operam por linha
-- (company_id), não por coluna, e não há GRANT restrito por coluna nesta
-- tabela. A coluna nova fica automaticamente coberta pelo UPDATE já
-- permitido a quem gerencia o sistema da própria empresa.

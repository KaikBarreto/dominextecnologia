-- 20260609160000_profiles_is_active.sql
-- Por quê: hoje a única forma de liberar um slot de usuário da empresa é
-- HARD-DELETE via edge `manage-user` (destrói login, permissões e vínculos).
-- Queremos permitir DESATIVAR um usuário de forma reversível. Para isso a
-- tabela `profiles` precisa de um marcador de ativo/inativo, e a contagem de
-- usuários por empresa (hoje count(*) por company_id) passará a contar só os
-- ativos. Esta migration só adiciona a coluna + índice; NÃO desativa ninguém
-- (todos seguem ativos pelo DEFAULT) e NÃO altera RLS (profiles herda).

-- 1. Coluna de ativo. Idempotente. Os profiles existentes ficam true pelo DEFAULT.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.is_active IS
  'Usuário ativo na empresa. false = desativado (reversível), libera slot sem hard-delete. Contagem de usuários por company_id deve filtrar is_active = true.';

-- 2. Índice parcial para contagem rápida de usuários ativos por empresa.
--    Só indexa linhas ativas, que é o que a contagem de slots precisa varrer.
CREATE INDEX IF NOT EXISTS idx_profiles_company_active
  ON public.profiles(company_id)
  WHERE is_active = true;

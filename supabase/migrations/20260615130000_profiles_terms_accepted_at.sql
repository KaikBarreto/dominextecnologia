-- 20260615130000_profiles_terms_accepted_at.sql
-- Por quê: vamos exigir o aceite dos Termos de Uso do Dominex no primeiro acesso
-- do usuário. O front-end grava o timestamp do aceite na própria linha de
-- `profiles` (espelhando o padrão `profiles.terms_accepted_at` da EcoSistema).
-- NULL = ainda não aceitou (gate ativo); preenchido = aceitou.
--
-- RLS: NÃO precisa de policy nova. A policy "Users can update own profile"
-- (FOR UPDATE USING auth.uid() = user_id, criada na migration base
-- 20260131190034) já permite o usuário dar UPDATE na própria linha SEM
-- restrição de coluna, então a nova coluna é coberta automaticamente. O trigger
-- guard_profiles_is_active (20260609170000) só dispara quando is_active muda,
-- portanto não bloqueia o UPDATE de terms_accepted_at.

-- 1. Coluna do aceite. Idempotente. Profiles existentes ficam NULL (gate ativo
--    até o usuário aceitar no próximo acesso).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS
  'Timestamp do aceite dos Termos de Uso do Dominex no primeiro acesso (NULL = ainda não aceitou).';

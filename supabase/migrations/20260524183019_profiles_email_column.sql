-- ============================================================================
-- Migration: profiles.email column + sync trigger from auth.users
-- ============================================================================
-- Por quê:
--   UIs que mostram informação do criador/responsável (ex: tooltip de avatar
--   no kanban de OS) precisam exibir o email do usuário. Hoje o email vive só
--   em auth.users, que não é acessível pelo client. Espelhamos o email em
--   public.profiles e mantemos sincronizado por trigger.
--
-- Estratégia:
--   1. Adicionar coluna email (nullable, sem unique — espelho).
--   2. Backfill a partir de auth.users.email pra perfis existentes.
--   3. Trigger AFTER UPDATE OF email ON auth.users → propaga pra profiles.
--   4. Atualizar handle_new_user() pra popular email já no INSERT de perfis novos.
--
-- Idempotente: roda 2x sem quebrar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna email em profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.profiles.email IS
  'Espelho do auth.users.email. Mantido sincronizado por trigger trg_sync_profile_email_from_auth e pelo handle_new_user. Usado em UIs que precisam mostrar email do usuário sem chamar edge function privilegiada.';

-- Índice pra busca por email (útil em listagens admin / lookups)
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);

-- ----------------------------------------------------------------------------
-- 2. Backfill — copia email de auth.users pra profiles existentes
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.profiles p
  SET email = u.email,
      updated_at = NOW()
  FROM auth.users u
  WHERE p.user_id = u.id
    AND (p.email IS NULL OR p.email IS DISTINCT FROM u.email);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '[profiles_email_backfill] % perfis atualizados com email de auth.users', v_updated;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Função + trigger pra manter sincronizado em UPDATE de auth.users.email
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Só age se o email realmente mudou (defesa-em-profundidade; o WHEN do
  -- trigger já filtra, mas mantemos pra função ser segura se chamada
  -- diretamente).
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email = NEW.email,
        updated_at = NOW()
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_email_from_auth() IS
  'Trigger function: propaga UPDATE de auth.users.email pro espelho em public.profiles.email. SECURITY DEFINER porque o trigger roda no schema auth e precisa de permissão pra UPDATE em public.profiles.';

DROP TRIGGER IF EXISTS trg_sync_profile_email_from_auth ON auth.users;
CREATE TRIGGER trg_sync_profile_email_from_auth
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (NEW.email IS DISTINCT FROM OLD.email)
  EXECUTE FUNCTION public.sync_profile_email_from_auth();

-- ----------------------------------------------------------------------------
-- 4. Atualizar handle_new_user pra popular email no INSERT de profiles novos
-- ----------------------------------------------------------------------------
-- A função antiga inseria só (user_id, full_name). Agora também grava email.
-- O trigger on_auth_user_created (AFTER INSERT ON auth.users) que executa
-- essa função já existe e continua válido — só estamos trocando o corpo.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Cria public.profiles automaticamente em INSERT de auth.users. Popula full_name (preferindo raw_user_meta_data) e email (espelho de auth.users.email).';

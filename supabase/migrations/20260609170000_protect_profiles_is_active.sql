-- 20260609170000_protect_profiles_is_active.sql
-- Por quê: a coluna profiles.is_active controla o slot de usuário da empresa e
-- o bloqueio de login (false = desativado, libera slot, não consegue logar).
-- Ela deve mudar SOMENTE pela edge `manage-user` (service_role) ou por um
-- super_admin. Hoje a policy "Users can update own profile" permite qualquer
-- usuário autenticado dar UPDATE no próprio row SEM restrição de coluna — então
-- um usuário DESATIVADO que ainda tem JWT válido poderia se REATIVAR via API
-- (`update profiles set is_active = true where user_id = auth.uid()`),
-- burlando o bloqueio e o limite de slots. RLS por si só não consegue proteger
-- coluna específica numa policy de linha; por isso usamos um trigger BEFORE
-- UPDATE que rejeita qualquer mudança de is_active fora dos canais autorizados.
--
-- Detecção do canal autorizado:
--   - service_role: a edge manage-user usa SUPABASE_SERVICE_ROLE_KEY, cujo JWT
--     traz role=service_role, então auth.role() retorna 'service_role'.
--   - super_admin: public.is_super_admin(auth.uid()) (has_role super_admin).
--
-- NÃO bloqueia INSERT (handle_new_user cria com DEFAULT true).
-- NÃO bloqueia UPDATE que não mexe em is_active (editar nome/avatar passa).
-- NÃO bloqueia service_role nem super_admin.

CREATE OR REPLACE FUNCTION public.guard_profiles_is_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só age quando o valor de is_active realmente muda.
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    -- Permite apenas service_role (edge manage-user) ou super_admin.
    IF NOT (
      auth.role() = 'service_role'
      OR public.is_super_admin(auth.uid())
    ) THEN
      RAISE EXCEPTION 'is_active só pode ser alterado pela administração'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_profiles_is_active() IS
  'Trigger BEFORE UPDATE em profiles: impede que is_active seja alterado por '
  'qualquer sessão que não seja service_role (edge manage-user) ou super_admin. '
  'Protege contra auto-reativação de usuário desativado via a policy de '
  'UPDATE do próprio profile. SECURITY DEFINER para chamar is_super_admin com '
  'search_path fixo.';

-- Idempotente: derruba o trigger antes de recriar (evita handler duplicado).
DROP TRIGGER IF EXISTS guard_profiles_is_active ON public.profiles;

CREATE TRIGGER guard_profiles_is_active
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_is_active();

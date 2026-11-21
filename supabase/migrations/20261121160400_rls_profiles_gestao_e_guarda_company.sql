-- ============================================================================
-- RLS 21/11/2026, itens 5 e 6: profiles (gestão de usuários + guarda de empresa)
-- ============================================================================
-- Por quê:
--   - A edição de perfil alheio usava can_manage_system (fn:manage_settings),
--     enquanto a tela Usuários, user_roles, user_permissions e as edges usam
--     can_manage_users. Quem só tinha fn:manage_users via os botões mas não a
--     lista; quem só tinha fn:manage_settings editava perfil alheio pela API.
--   - Nada impedia, no banco, que um gestor mudasse e-mail, aceite de termos
--     ou preferência de um colega, nem que company_id fosse trocado de uma
--     empresa para outra.
--
-- O que faz:
--   Item 5:
--   - SELECT de perfis da empresa: can_manage_users OU can_manage_system (só amplia).
--   - UPDATE de perfil da empresa: can_manage_users (sai can_manage_system).
--   - Gatilho guard_profiles_identity, por coluna:
--       * gestor (JWT, não é o dono, não é super_admin): só full_name, phone,
--         avatar_url;
--       * dono (JWT): também navigation_style, deletion_requested_at,
--         terms_accepted_at; nunca email, user_id, id, created_at;
--       * sem JWT (Auth, migration) ou service_role: livre (salvo item 6);
--       * is_active segue com o guard_profiles_is_active de sempre.
--   Item 6 (mesmo gatilho):
--   - company_id valor -> outro valor ou -> NULL: erro para QUALQUER JWT
--     (inclusive service_role e super_admin); só sem JWT (manutenção).
--   - company_id NULL -> valor: só service_role (create-user, create-company,
--     self-register) ou sem JWT.
-- Idempotente: ALTER POLICY, CREATE OR REPLACE, DROP TRIGGER IF EXISTS.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- Item 5: políticas --------------------------------------------------------------
ALTER POLICY "User managers can view tenant profiles" ON public.profiles
  USING (
    ((SELECT public.can_manage_users(auth.uid())) OR (SELECT public.can_manage_system(auth.uid())))
    AND company_id = (SELECT public.get_user_company_id(auth.uid()))
  );

ALTER POLICY "User managers can update tenant profiles" ON public.profiles
  USING (
    (SELECT public.can_manage_users(auth.uid()))
    AND company_id = (SELECT public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    (SELECT public.can_manage_users(auth.uid()))
    AND company_id = (SELECT public.get_user_company_id(auth.uid()))
  );

-- Itens 5 e 6: gatilho -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profiles_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := auth.role();  -- NULL quando não há JWT (Auth, migration)
  v_uid  uuid := auth.uid();
  -- company_id e is_active têm regra própria (abaixo e em guard_profiles_is_active).
  v_owner_cols   constant text[] := ARRAY['full_name', 'phone', 'avatar_url', 'navigation_style',
                                          'deletion_requested_at', 'terms_accepted_at',
                                          'updated_at', 'is_active', 'company_id'];
  v_manager_cols constant text[] := ARRAY['full_name', 'phone', 'avatar_url',
                                          'updated_at', 'is_active', 'company_id'];
BEGIN
  -- Item 6: empresa do usuário.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF OLD.company_id IS NOT NULL THEN
      -- Valor -> outro valor ou -> NULL: nunca com JWT.
      IF v_role IS NOT NULL THEN
        RAISE EXCEPTION 'A empresa do usuário não pode ser alterada.' USING ERRCODE = '42501';
      END IF;
    ELSIF v_role IS NOT NULL AND v_role <> 'service_role' THEN
      -- NULL -> valor: só service_role (edges de cadastro) ou sem JWT.
      RAISE EXCEPTION 'A empresa do usuário não pode ser alterada.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Item 5: colunas.
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Dono da linha (vale também para super_admin no próprio perfil).
  IF v_uid IS NOT NULL AND OLD.user_id = v_uid THEN
    IF (to_jsonb(NEW) - v_owner_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_owner_cols) THEN
      RAISE EXCEPTION 'Você não pode alterar este dado do seu perfil.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL AND public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  -- Gestor de usuários (ou qualquer outro caminho com JWT) no perfil de um colega.
  IF (to_jsonb(NEW) - v_manager_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_manager_cols) THEN
    RAISE EXCEPTION 'Você só pode alterar nome, telefone e foto deste usuário.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_profiles_identity() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_profiles_identity ON public.profiles;
CREATE TRIGGER guard_profiles_identity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_identity();

COMMIT;

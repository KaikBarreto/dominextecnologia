-- Conflitos de agenda passam a ser uma politica da empresa, nao uma permissao
-- individual. O default false preserva o comportamento seguro: sem linha de
-- configuracao ou sem opt-in explicito, a sobreposicao continua bloqueada.

ALTER TABLE public.company_settings
  ADD COLUMN allow_schedule_conflicts boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.allow_schedule_conflicts IS
  'Permite que usuarios aptos a criar/editar OS autorizem conflitos de agenda com justificativa auditada. A API Publica permanece sem override.';

-- A chave deixa de aparecer e de produzir efeito em usuarios/cargos existentes.
-- O operador "- text" remove o valor tanto de arrays JSONB quanto de objetos.
UPDATE public.user_permissions
   SET permissions = permissions - 'fn:override_schedule_conflict'
 WHERE permissions ? 'fn:override_schedule_conflict';

UPDATE public.permission_presets
   SET permissions = permissions - 'fn:override_schedule_conflict'
 WHERE permissions ? 'fn:override_schedule_conflict';

-- Compatibilidade com as RPCs de agenda existentes: elas ainda chamam esta
-- funcao com a chave historica, mas a autorizacao agora vem exclusivamente da
-- configuracao da empresa. O chamador precisa ser o usuario autenticado e estar
-- ativo no mesmo tenant. service_role/API Publica nunca recebe esse override.
CREATE OR REPLACE FUNCTION public.has_explicit_public_api_permission(
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN p_permission = 'fn:override_schedule_conflict' THEN
      p_user_id IS NOT NULL
      AND p_user_id = (SELECT auth.uid())
      AND (SELECT auth.role()) = 'authenticated'
      AND EXISTS (
        SELECT 1
          FROM public.profiles p
          JOIN public.company_settings cs ON cs.company_id = p.company_id
         WHERE p.user_id = p_user_id
           AND p.is_active
           AND cs.allow_schedule_conflicts IS TRUE
      )
    WHEN p_permission = 'fn:manage_api_keys' THEN
      p_user_id IS NOT NULL
      AND ((SELECT auth.role()) = 'service_role' OR p_user_id = (SELECT auth.uid()))
      AND (
        public.is_super_admin(p_user_id)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = p_user_id AND ur.role::text = 'admin'
        )
        OR EXISTS (
          SELECT 1
            FROM public.user_permissions up
           WHERE up.user_id = p_user_id
             AND up.is_active
             AND (up.permissions ? '*' OR up.permissions ? p_permission)
        )
      )
    ELSE false
  END;
$function$;

REVOKE ALL ON FUNCTION public.has_explicit_public_api_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_explicit_public_api_permission(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_explicit_public_api_permission(uuid, text) IS
  'Valida fn:manage_api_keys por permissao explicita. A chave legada fn:override_schedule_conflict e um shim interno que consulta allow_schedule_conflicts da empresa e sempre nega service_role/API Publica.';

-- Por quê: o app passou a usar o curinga '*' no JSONB user_permissions.permissions
-- significando "acesso total dinâmico" (todas as permissões, inclusive futuras).
-- O client já interpreta '*', mas as funções server-side decidiam acesso por
-- contagem (>= 27) ou por chave literal ('fn:...'), e NÃO reconheciam '*'.
-- Um usuário com array ['*'] puro (sem chaves reais) seria barrado no servidor.
-- Esta migration torna '*' um curinga reconhecido server-side, de forma ADITIVA:
-- adiciona apenas um ramo que CONCEDE; nenhuma condição existente foi removida.
-- Idempotente (CREATE OR REPLACE). Assinatura, SECURITY DEFINER e search_path inalterados.

CREATE OR REPLACE FUNCTION public.has_full_permissions(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = _user_id
      AND is_active = true
      AND (
        permissions ? '*'                        -- curinga aditivo: acesso total dinâmico
        OR jsonb_array_length(permissions) >= 27 -- condição existente preservada
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_users(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND is_active = true
        AND (
          permissions ? '*'                              -- curinga aditivo
          OR permissions @> '"fn:manage_users"'::jsonb   -- condição existente preservada
        )
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_system(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND is_active = true
        AND (
          permissions ? '*'                                  -- curinga aditivo
          OR permissions @> '"fn:manage_settings"'::jsonb    -- condição existente preservada
        )
    )
  )
$function$;

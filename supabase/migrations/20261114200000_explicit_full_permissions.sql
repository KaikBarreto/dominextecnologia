-- Quantidade de permissões não é uma concessão de acesso total. O contrato
-- explícito '*' permanece; cargos e permissões nominais continuam sendo
-- avaliados pelos consumidores existentes. Não altera papéis nem registros.

CREATE OR REPLACE FUNCTION public.has_full_permissions(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_permissions permission
     WHERE permission.user_id = _user_id
       AND permission.is_active IS TRUE
       AND permission.permissions ? '*'
  )
$function$;

COMMENT ON FUNCTION public.has_full_permissions(uuid) IS
  'Acesso total requer curinga explícito em concessão ativa; contar permissões não amplia privilégios.';
;

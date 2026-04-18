-- Conceder acesso a 'screen:quotes' para usuários que já tem 'screen:crm' ou possuem acesso total (>=27 perms)
UPDATE public.user_permissions
SET permissions = (
  SELECT jsonb_agg(DISTINCT p)
  FROM jsonb_array_elements_text(permissions) p
) || '["screen:quotes"]'::jsonb
WHERE NOT (permissions ? 'screen:quotes')
  AND (permissions ? 'screen:crm' OR jsonb_array_length(permissions) >= 20);

-- Idem para presets de permissão
UPDATE public.permission_presets
SET permissions = (
  SELECT jsonb_agg(DISTINCT p)
  FROM jsonb_array_elements_text(permissions) p
) || '["screen:quotes"]'::jsonb
WHERE NOT (permissions ? 'screen:quotes')
  AND (permissions ? 'screen:crm' OR jsonb_array_length(permissions) >= 20);
-- Backfill: concede a permissão de tela "screen:tracking" (Mapa e Rastreamento)
-- para todo usuário/preset que HOJE já possui "screen:service_orders".
--
-- Motivo: estamos introduzindo a permissão canônica exata `screen:tracking`
-- para gatear a tela "Mapa e Rastreamento". Decisão do CEO: ninguém que já
-- enxergava as Ordens de Serviço pode perder o mapa na virada. Backfill único,
-- aplicado a TODAS as empresas (multi-tenant). — incidente Engetec.
--
-- Idempotente: só adiciona onde AINDA não contém `screen:tracking`
-- (guard "not already contains"), então rodar de novo é no-op.
-- Preserva a ordem/resto do array: append via `||`.
--
-- Colunas confirmadas como jsonb (array de strings) em ambas as tabelas:
--   public.user_permissions.permissions  jsonb
--   public.permission_presets.permissions jsonb
-- Portanto os operadores @> (contém) e || (concat/append) funcionam direto.

DO $$
DECLARE
  v_users_updated   integer;
  v_presets_updated integer;
BEGIN
  -- user_permissions: uma linha por usuário
  UPDATE public.user_permissions
     SET permissions = permissions || '["screen:tracking"]'::jsonb
   WHERE permissions @> '["screen:service_orders"]'::jsonb
     AND NOT (permissions @> '["screen:tracking"]'::jsonb);
  GET DIAGNOSTICS v_users_updated = ROW_COUNT;

  -- permission_presets: cargos reutilizáveis
  UPDATE public.permission_presets
     SET permissions = permissions || '["screen:tracking"]'::jsonb
   WHERE permissions @> '["screen:service_orders"]'::jsonb
     AND NOT (permissions @> '["screen:tracking"]'::jsonb);
  GET DIAGNOSTICS v_presets_updated = ROW_COUNT;

  RAISE NOTICE 'Backfill screen:tracking -> user_permissions: % linha(s) atualizada(s)', v_users_updated;
  RAISE NOTICE 'Backfill screen:tracking -> permission_presets: % linha(s) atualizada(s)', v_presets_updated;
END $$;

-- Backfill (2026-10-17): concede a permissão de tela "screen:projects" (Projetos/Obras)
-- para todo usuário/preset que HOJE já possui "screen:crm".
--
-- Motivo: a Onda 1 de Gestão de Projetos/Obras entrega a tela `/projetos`, gateada
-- pelo módulo `crm` (sem cobrança nova — decisão do CEO) + pela permissão de tela
-- nova `screen:projects`. O sistema resolve tela por LISTA EXPLÍCITA
-- (`src/contexts/AuthContext.tsx` → `hasScreenAccess`): quem tem `screen:crm`
-- concedida NÃO herda `screen:projects`. Sem este backfill, todo usuário não-admin
-- com permissão explícita que hoje enxerga o CRM abriria o sistema sem a tela
-- anunciada. Backfill único, aplicado a TODAS as empresas (multi-tenant).
--
-- Precedente seguido: `20260815130000_backfill_screen_tracking_permission.sql`
-- (mesma forma: UPDATE com append jsonb + guard "not already contains").
--
-- Diferença proposital em relação ao precedente: aqui EXCLUÍMOS quem tem o curinga
-- `'*'` ("Acesso Total"). Esse perfil já enxerga toda tela, inclusive futuras, pelo
-- curinga — criar linha extra só sujaria o cadastro. (Em 2026-10-17 não há interseção:
-- 12 registros com `'*'`, 0 deles com `screen:crm`.)
--
-- Escopo estrito: NÃO concede a quem não tem `screen:crm`.
--
-- Idempotente: só adiciona onde AINDA não contém `screen:projects`
-- (guard "not already contains"), então rodar de novo é no-op.
-- Preserva a ordem/resto do array: append via `||`.
--
-- Colunas confirmadas no prod (information_schema) como jsonb (array de strings):
--   public.user_permissions.permissions   jsonb NOT NULL DEFAULT '[]'  (1 linha por usuário, UNIQUE(user_id))
--   public.permission_presets.permissions jsonb NOT NULL DEFAULT '[]'  (cargos reutilizáveis)
-- Portanto os operadores @> (contém) e || (concat/append) funcionam direto.
--
-- Superfícies conferidas e DESCARTADAS de propósito:
--   public.admin_permissions — 1 linha por permissão (text), mas só guarda chaves do
--     painel master Auctus (`admin_crm`, `admin_empresas`, `admin_health_score`,
--     `admin_vendedores`). Nenhuma chave `screen:*`. Não entra no backfill.
--   public.profiles — não tem coluna de permissões.
--   Não existe `role_permissions` nem qualquer outra tabela `%permission%` no schema public.

DO $$
DECLARE
  v_users_updated   integer;
  v_presets_updated integer;
BEGIN
  -- user_permissions: uma linha por usuário
  UPDATE public.user_permissions
     SET permissions = permissions || '["screen:projects"]'::jsonb
   WHERE permissions @> '["screen:crm"]'::jsonb
     AND NOT (permissions @> '["screen:projects"]'::jsonb)
     AND NOT (permissions @> '["*"]'::jsonb);
  GET DIAGNOSTICS v_users_updated = ROW_COUNT;

  -- permission_presets: cargos reutilizáveis
  UPDATE public.permission_presets
     SET permissions = permissions || '["screen:projects"]'::jsonb
   WHERE permissions @> '["screen:crm"]'::jsonb
     AND NOT (permissions @> '["screen:projects"]'::jsonb)
     AND NOT (permissions @> '["*"]'::jsonb);
  GET DIAGNOSTICS v_presets_updated = ROW_COUNT;

  RAISE NOTICE 'Backfill screen:projects -> user_permissions: % linha(s) atualizada(s)', v_users_updated;
  RAISE NOTICE 'Backfill screen:projects -> permission_presets: % linha(s) atualizada(s)', v_presets_updated;
END $$;

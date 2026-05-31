-- =============================================================================
-- ⚠️ MIGRATION REVERTIDA — não aplicar (no-op).
-- =============================================================================
-- O CREATE POLICY original usava `has_role(auth.uid(), 'vendedor')`, mas
-- 'vendedor' não existe no enum `app_role` (definido em 20260131190034,
-- valores válidos: admin, gestor, tecnico, comercial, financeiro). A migration
-- nunca chegou a aplicar no remote — ERROR 22P02 (invalid input value for enum).
--
-- Marcada como `reverted` no histórico (`supabase_migrations.schema_migrations`)
-- via `supabase migration repair --status reverted 20260527110320 --linked`.
--
-- O fix correto está em 20260530210803_admin_users_read_usage_events.sql, que
-- usa `is_admin_user(auth.uid())` (padrão consolidado: super_admin OU entrada
-- em admin_permissions).
--
-- Mantemos o arquivo aqui pra não quebrar `supabase db push` em ambientes
-- limpos que apliquem o histórico inteiro do zero.
-- =============================================================================

DO $$ BEGIN
  RAISE NOTICE 'Migration 20260527110320 revertida — fix em 20260530210803.';
END $$;

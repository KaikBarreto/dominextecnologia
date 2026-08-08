-- ============================================================================
-- Notificação in-app com destinatário (target_user_id) — portado da EcoSistema.
-- Hoje admin_notifications é GLOBAL (todo admin vê tudo). Esta migration adiciona
-- um destinatário opcional:
--   target_user_id NULL     → notificação global (todos os admins veem — comportamento de hoje).
--   target_user_id = <uuid> → notificação dirigida (só aquele usuário vê/marca-lido).
--
-- Policies self-scope ADITIVAS (OR com as policies de admin existentes):
--   - SELECT: pode ler onde é o destinatário, OU (global AND é admin).
--   - UPDATE: pode marcar-lido onde é o destinatário, OU (global AND é admin).
-- As policies existentes ("Admin panel users view/update admin_notifications"
-- via is_admin_user) continuam valendo — não são tocadas.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DROP POLICY IF EXISTS.
-- ============================================================================

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS target_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_admin_notifications_target_user
  ON public.admin_notifications (target_user_id)
  WHERE target_user_id IS NOT NULL;

-- SELECT self-scope: destinatário direto OU global-visível-pra-admin.
DROP POLICY IF EXISTS "User reads own targeted notifications" ON public.admin_notifications;
CREATE POLICY "User reads own targeted notifications" ON public.admin_notifications
  FOR SELECT TO authenticated
  USING (
    target_user_id = auth.uid()
    OR (target_user_id IS NULL AND public.is_admin_user(auth.uid()))
  );

-- UPDATE self-scope: destinatário direto OU global-marcável-por-admin.
DROP POLICY IF EXISTS "User updates own targeted notifications" ON public.admin_notifications;
CREATE POLICY "User updates own targeted notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (
    target_user_id = auth.uid()
    OR (target_user_id IS NULL AND public.is_admin_user(auth.uid()))
  )
  WITH CHECK (
    target_user_id = auth.uid()
    OR (target_user_id IS NULL AND public.is_admin_user(auth.uid()))
  );

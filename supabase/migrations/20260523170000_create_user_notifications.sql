-- ============================================================
-- USER NOTIFICATIONS — Sistema de sino no header (clone EcoSistema)
-- Referência: docs/planos/2026-05-23-notification-bell-system.md
-- ============================================================
-- Notificações persistentes in-app por usuário.
-- Geração: triggers e edge functions (server-side, via service_role).
-- Leitura / mark-as-read / dismiss: usuário final pela RLS abaixo.
--
-- Escalabilidade:
--   * Index parcial em (user_id, created_at DESC) WHERE read_at IS NULL
--     mantém query do bell rápida mesmo com milhares de notifs antigas.
--   * Cleanup diário às 07:00 UTC (04:00 BRT) apaga >30d ou expired.
--   * Realtime: cliente filtra por user_id=eq.{uid} server-side (sem broadcast geral).
-- ============================================================

CREATE TABLE public.user_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,                    -- free string (ex: 'os_assigned', 'pmoc_due'), sem CHECK pra ficar extensível
  title       text NOT NULL,
  message     text,
  action_url  text,                              -- deep link interno (ex: '/os/abc-123')
  icon        text DEFAULT 'bell',               -- nome lucide (ex: 'package', 'check-circle')
  read_at     timestamptz,                       -- NULL = não lido
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz                        -- NULL = sem expiração; senão cleanup automático
);

-- Index parcial pro bell (queries "minhas não lidas")
CREATE INDEX idx_user_notif_user_unread
  ON public.user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Index pra histórico completo do usuário
CREATE INDEX idx_user_notif_user_all
  ON public.user_notifications (user_id, created_at DESC);

-- Index pro cron de cleanup encontrar notifs com expires_at definido
CREATE INDEX idx_user_notif_expires
  ON public.user_notifications (expires_at)
  WHERE expires_at IS NOT NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- service_role full access (triggers e edge functions inserem por aqui)
CREATE POLICY "service_role_full_user_notifications"
  ON public.user_notifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Usuário vê só as próprias
CREATE POLICY "users_select_own_notifications"
  ON public.user_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Usuário marca as próprias como lidas (UPDATE de read_at)
CREATE POLICY "users_update_own_notifications"
  ON public.user_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Usuário dispensa as próprias (DELETE)
CREATE POLICY "users_delete_own_notifications"
  ON public.user_notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- IMPORTANTE: SEM policy de INSERT pra authenticated.
-- INSERTs vêm SEMPRE de triggers/edge functions com service_role.

-- ============================================================
-- Realtime publication
-- ============================================================
-- Adiciona a tabela à publication supabase_realtime. Idempotente:
-- ignora erro se já estiver adicionada (re-run da migration não quebra).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'public.user_notifications já está na publication supabase_realtime, ignorando.';
END $$;

-- ============================================================
-- Cron de cleanup diário (07:00 UTC = 04:00 BRT)
-- ============================================================
-- Apaga notifs com >30 dias OU com expires_at no passado.
-- pg_cron já está habilitado no projeto (ver 20260228223345 e 20260426020000).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove agendamento prévio (idempotente)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'user-notifications-cleanup') THEN
      PERFORM cron.unschedule('user-notifications-cleanup');
    END IF;

    PERFORM cron.schedule(
      'user-notifications-cleanup',
      '0 7 * * *',
      $cleanup$DELETE FROM public.user_notifications
         WHERE (created_at < NOW() - INTERVAL '30 days')
            OR (expires_at IS NOT NULL AND expires_at < NOW())$cleanup$
    );

    RAISE NOTICE 'Cron user-notifications-cleanup agendado pra 07:00 UTC diariamente.';
  ELSE
    RAISE NOTICE 'pg_cron não habilitado. Cron de cleanup NÃO foi agendado. Habilite a extensão e re-rode o trecho cron.schedule manualmente.';
  END IF;
END $$;

COMMENT ON TABLE public.user_notifications IS
  'Notificações in-app por usuário (bell do header). Inserts apenas via service_role (triggers/edge functions). Cleanup automático >30 dias ou expires_at no passado (cron 04h BRT).';

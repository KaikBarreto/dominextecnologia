-- =============================================================================
-- admin_notifications: caixa de alertas internos do painel Auctus (admin-only)
-- =============================================================================
-- Por quê: precisamos de um canal pra avisar o admin de anomalias detectadas
-- automaticamente (ex.: pagamento Asaas órfão, renovação creditada em dobro).
-- `user_notifications` é do tenant (cliente final), NÃO serve. Não existia
-- tabela equivalente de admin — esta é nova.
--
-- RLS ESPELHA admin_financial_transactions (tabela admin já consolidada):
--   - SELECT/UPDATE: is_admin_user(auth.uid())  (admin lê e marca como lido)
--   - service_role FOR ALL: as edges (webhook Asaas) e o cron escrevem por aqui
-- Sem INSERT/DELETE pra authenticated: quem cria alerta é o sistema (service_role
-- ou função SECURITY DEFINER do cron), não a tela. Admin só lê e marca lido.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL,
  title      TEXT,
  message    TEXT,
  data       JSONB,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_type_created
  ON public.admin_notifications (type, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- service_role escreve livre (webhook Asaas + cron de reconciliação)
DROP POLICY IF EXISTS "service_role_full_access_admin_notifications" ON public.admin_notifications;
CREATE POLICY "service_role_full_access_admin_notifications"
  ON public.admin_notifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Admin do painel lê os alertas (espelha o SELECT de admin_financial_transactions)
DROP POLICY IF EXISTS "Admin panel users view admin_notifications" ON public.admin_notifications;
CREATE POLICY "Admin panel users view admin_notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

-- Admin marca como lido (espelha o UPDATE de admin_financial_transactions)
DROP POLICY IF EXISTS "Admin panel users update admin_notifications" ON public.admin_notifications;
CREATE POLICY "Admin panel users update admin_notifications"
  ON public.admin_notifications FOR UPDATE TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

COMMENT ON TABLE public.admin_notifications IS
  'Alertas internos do painel admin Auctus (ex.: reconciliação Asaas). Escrita por service_role/cron; admin só lê e marca como lido.';

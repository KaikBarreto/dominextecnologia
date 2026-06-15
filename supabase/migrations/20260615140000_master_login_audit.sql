-- Tabela de auditoria do recurso "Token de Acesso" (admin login-as-user)
CREATE TABLE public.master_login_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,            -- auth uid do usuário-alvo (= profiles.user_id)
  user_email TEXT,
  device_info TEXT,        -- também usado p/ rate-limit: 'rate_limit:<ip>'
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.master_login_audit ENABLE ROW LEVEL SECURITY;

-- Só super_admin (Auctus) lê a auditoria.
CREATE POLICY "Super admins can view master login audit"
  ON public.master_login_audit
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- SEM policy de INSERT: a edge function admin-token-login usa service role (bypassa RLS).

CREATE INDEX idx_master_login_audit_user_id ON public.master_login_audit(user_id);
CREATE INDEX idx_master_login_audit_created_at ON public.master_login_audit(created_at DESC);

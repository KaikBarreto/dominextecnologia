-- =============================================================================
-- Tabela de códigos de recuperação de senha (Resend custom flow)
-- =============================================================================
-- Substitui o fluxo nativo `auth.resetPasswordForEmail` (link mágico) por um
-- código numérico de 8 dígitos enviado via Resend com template HTML
-- personalizado.
--
-- Segurança:
-- - Tabela acessível APENAS pelo service_role (edge functions). Anon e
--   authenticated não têm acesso direto.
-- - Código expira em 60 minutos.
-- - Máximo de 5 tentativas de validação por código antes de invalidar.
-- - Rate limit: máximo 3 códigos por email a cada 15 minutos (validado na
--   edge function).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_active
  ON public.password_reset_codes(email, expires_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_cleanup
  ON public.password_reset_codes(expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

-- Sem policies = nenhum role com client-key tem acesso. Apenas service_role
-- (que bypassa RLS) das edge functions consegue ler/escrever.

-- Função helper: verifica se um email existe em auth.users (uso apenas pelas
-- edge functions com service_role, não exposto a clients)
CREATE OR REPLACE FUNCTION public.auth_user_exists_by_email(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email));
$$;

-- Bloqueia execução pública — apenas service_role tem acesso
REVOKE EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_user_exists_by_email(text) TO service_role;

-- Função helper: pega user_id por email
CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_id_by_email(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_user_id_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;

-- Limpeza automática de códigos expirados via cron (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-password-reset-codes') THEN
    PERFORM cron.unschedule('cleanup-password-reset-codes');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-password-reset-codes',
  '0 4 * * *',
  $cron$
  DELETE FROM public.password_reset_codes
   WHERE expires_at < now() - interval '1 day';
  $cron$
);

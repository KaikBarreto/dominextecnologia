-- =============================================================================
-- Rate limit persistente do cadastro publico (self-register)
-- =============================================================================
-- Guarda somente hashes SHA-256 estaveis de IP/e-mail. A edge continua sendo a
-- unica fronteira publica; a tabela e a RPC sao exclusivas de service_role.
-- O advisory lock torna a contagem + insercao atomica para requests concorrentes.
-- =============================================================================

BEGIN;

CREATE TABLE public.self_registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text,
  email_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT self_registration_attempts_ip_hash_format
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT self_registration_attempts_email_hash_format
    CHECK (email_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX self_registration_attempts_ip_created_idx
  ON public.self_registration_attempts (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE INDEX self_registration_attempts_email_created_idx
  ON public.self_registration_attempts (email_hash, created_at DESC);

ALTER TABLE public.self_registration_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_registration_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.self_registration_attempts
  FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, DELETE ON TABLE public.self_registration_attempts
  TO service_role;

CREATE OR REPLACE FUNCTION public.register_self_registration_attempt(
  p_ip_hash text,
  p_email_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ip_count integer := 0;
  v_email_count integer := 0;
BEGIN
  IF p_email_hash IS NULL OR p_email_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  IF p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  -- Sempre trava primeiro o e-mail e depois o IP. A ordem fixa evita deadlock;
  -- as duas dimensoes ficam atomicas mesmo com requests concorrentes vindos de
  -- IPs diferentes para o mesmo e-mail ou e-mails diferentes no mesmo IP.
  PERFORM pg_advisory_xact_lock(hashtextextended('email:' || p_email_hash, 0));
  IF p_ip_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ip:' || p_ip_hash, 0));
  END IF;

  IF p_ip_hash IS NOT NULL THEN
    SELECT count(*)::integer
      INTO v_ip_count
    FROM public.self_registration_attempts
    WHERE ip_hash = p_ip_hash
      AND created_at >= now() - interval '1 hour';
  END IF;

  SELECT count(*)::integer
    INTO v_email_count
  FROM public.self_registration_attempts
  WHERE email_hash = p_email_hash
    AND created_at >= now() - interval '1 hour';

  -- Ate 10 tentativas por IP/hora e 3 por e-mail/hora. O registro acontece
  -- antes das operacoes privilegiadas de criacao, inclusive para falhas.
  IF v_ip_count >= 10 OR v_email_count >= 3 THEN
    RETURN false;
  END IF;

  INSERT INTO public.self_registration_attempts (ip_hash, email_hash)
  VALUES (p_ip_hash, p_email_hash);

  RETURN true;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.register_self_registration_attempt(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_self_registration_attempt(text, text)
  TO service_role;

COMMENT ON TABLE public.self_registration_attempts IS
  'Log pseudonimizado e service-role-only do rate limit do self-register. Nao armazena IP ou e-mail em claro.';

COMMENT ON FUNCTION public.register_self_registration_attempt(text, text) IS
  'Registra atomicamente tentativa de self-register; retorna false apos 10/IP/h ou 3/e-mail/h. Apenas service_role.';

DO $cron$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'cleanup-self-registration-attempts'
  ) THEN
    PERFORM cron.unschedule('cleanup-self-registration-attempts');
  END IF;
END
$cron$;

SELECT cron.schedule(
  'cleanup-self-registration-attempts',
  '23 4 * * *',
  $cleanup$
    DELETE FROM public.self_registration_attempts
    WHERE created_at < now() - interval '2 days';
  $cleanup$
);

DO $audit$
BEGIN
  IF has_table_privilege('anon', 'public.self_registration_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.self_registration_attempts', 'SELECT')
  THEN
    RAISE EXCEPTION 'self_registration_attempts exposta a client role';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.register_self_registration_attempt(text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.register_self_registration_attempt(text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'register_self_registration_attempt exposta a client role';
  END IF;
END
$audit$;

COMMIT;

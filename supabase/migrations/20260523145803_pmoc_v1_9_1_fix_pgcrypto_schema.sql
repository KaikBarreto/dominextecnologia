-- =============================================================================
-- PMOC v1.9.1 hotfix — qualificar gen_random_bytes() com schema extensions
-- =============================================================================
-- Plano: docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md
--
-- Contexto: a extensão pgcrypto vive em schema "extensions" (não em public).
-- A função generate_pmoc_token() definida em 20260523144134 usa
-- SET search_path = public, então não enxerga gen_random_bytes() e o trigger
-- BEFORE INSERT falha com "function gen_random_bytes(integer) does not exist".
--
-- Correção: incluir "extensions" no search_path. Mantém SECURITY DEFINER e
-- continua retornando 32 chars hex (128 bits de entropia), conforme RLS rules §2.2.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_pmoc_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$;

COMMENT ON FUNCTION public.generate_pmoc_token() IS
  'Gera token público estável de 32 chars hex (128 bits) via pgcrypto.gen_random_bytes. '
  'search_path inclui extensions porque pgcrypto vive lá. '
  'Usado pelo trigger ensure_pmoc_token e pela RPC regenerate_pmoc_token.';

COMMIT;

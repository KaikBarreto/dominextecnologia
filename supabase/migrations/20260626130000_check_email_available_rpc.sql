-- check_email_available: validação anon-safe de e-mail no cadastro (blur, antes do submit).
-- Espelha a checagem do edge self-register, que considera duplicado quando existe um
-- auth.users com o mesmo e-mail (case-insensitive). Retorna SOMENTE um boolean:
--   true  = e-mail DISPONÍVEL (não existe)
--   false = e-mail JÁ EM USO
-- Não vaza nenhum dado do usuário/empresa além do existe/não-existe — mesmo sinal que o
-- próprio cadastro já expõe ao tentar registrar. E-mail vazio/sem formato é não-bloqueante
-- (validação de formato é responsabilidade do front) e retorna true (disponível).

CREATE OR REPLACE FUNCTION public.check_email_available(_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  _normalized text;
BEGIN
  _normalized := lower(trim(coalesce(_email, '')));

  -- Vazio ou sem cara de e-mail: não-bloqueante (o front valida formato).
  IF _normalized = '' OR _normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN true;
  END IF;

  -- Mesma fonte que o self-register considera duplicado: auth.users.email (case-insensitive).
  IF EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(u.email) = _normalized
  ) THEN
    RETURN false; -- já em uso
  END IF;

  RETURN true; -- disponível
END;
$$;

REVOKE ALL ON FUNCTION public.check_email_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_available(text) TO anon, authenticated;

COMMENT ON FUNCTION public.check_email_available(text) IS
  'Anon-safe: true se o e-mail está disponível, false se já cadastrado (espelha auth.users.email do self-register). Não retorna dados além do boolean.';

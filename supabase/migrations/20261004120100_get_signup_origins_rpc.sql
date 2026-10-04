-- =====================================================================
-- RPC pública get_signup_origins() — origens visíveis no cadastro
-- =====================================================================
-- Por que RPC e não policy anon em company_origins: abrir SELECT pra anon
-- exporia o catálogo comercial interno (BNI, Prospecção Ativa, Parceiro)
-- na página pública de cadastro. A RPC devolve só o subconjunto marcado
-- com show_in_signup = true, e só as colunas que a UI precisa.
--
-- As policies atuais da tabela ("Authenticated view company_origins" e
-- "Super admins can manage origins") permanecem inalteradas.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_signup_origins()
RETURNS TABLE(name text, icon text, color text, description text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT co.name, co.icon, co.color, co.description
  FROM public.company_origins AS co
  WHERE co.show_in_signup = true
  ORDER BY co.sort_order, co.name;
$fn$;

COMMENT ON FUNCTION public.get_signup_origins() IS
  'Origens de captação exibidas no cadastro público. Não expõe o catálogo comercial interno.';

REVOKE ALL ON FUNCTION public.get_signup_origins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_signup_origins() TO anon, authenticated;

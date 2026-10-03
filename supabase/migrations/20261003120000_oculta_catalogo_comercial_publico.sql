-- Catálogo comercial não deve ser legível por visitantes/crawlers anônimos.
-- Usuários autenticados continuam usando as telas internas de proposta, plano e
-- checkout. O cadastro público recebe apenas código/nome dos módulos enviados
-- em links comerciais, sem preço ou demais campos do catálogo.

DROP POLICY IF EXISTS "Anyone can view active plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Anyone can view active modules" ON public.subscription_modules;

CREATE POLICY "Authenticated users can view active plans"
  ON public.subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Authenticated users can view active modules"
  ON public.subscription_modules
  FOR SELECT
  TO authenticated
  USING (is_active = true);

REVOKE SELECT ON TABLE public.subscription_plans FROM anon;
REVOKE SELECT ON TABLE public.subscription_modules FROM anon;
GRANT SELECT ON TABLE public.subscription_plans TO authenticated;
GRANT SELECT ON TABLE public.subscription_modules TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_registration_modules(p_codes text[])
RETURNS TABLE(code text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT sm.code, sm.name
  FROM public.subscription_modules AS sm
  WHERE sm.is_active = true
    AND sm.code = ANY(COALESCE(p_codes, ARRAY[]::text[]))
  ORDER BY sm.sort_order, sm.name;
$fn$;

REVOKE ALL ON FUNCTION public.get_public_registration_modules(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_registration_modules(text[]) TO anon, authenticated;

-- A landing não usa mais rodízio. Impede que a RPC antiga revele os telefones
-- de vendedores mesmo que um cliente antigo tente chamá-la diretamente.
REVOKE ALL ON FUNCTION public.get_landing_whatsapp_numbers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_landing_whatsapp_numbers() FROM anon, authenticated;

-- O PDF antigo do guia continha condições comerciais. Tirar o link do site não
-- basta para URLs já conhecidas por crawlers: o bucket também deixa de ser
-- público. O objeto é preservado para eventual revisão/republicação interna.
UPDATE storage.buckets
SET public = false
WHERE id = 'guia-tecnico';

DROP POLICY IF EXISTS "guia_tecnico_leitura_publica" ON storage.objects;

BEGIN;
SET LOCAL lock_timeout='10s';
-- Retirar um plano da venda não revoga os direitos de contratos existentes.
-- Esta policy não abre catálogo: cada ator ativo lê somente o código já
-- persistido na própria empresa. Anon e outras empresas não ganham acesso.
CREATE POLICY company_reads_current_subscription_plan_v1
 ON public.subscription_plans FOR SELECT TO authenticated
 USING (
  EXISTS (
   SELECT 1 FROM public.profiles actor
   JOIN public.companies company ON company.id=actor.company_id
   WHERE actor.user_id=(SELECT auth.uid()) AND actor.is_active IS TRUE
    AND actor.company_id=(SELECT public.get_user_company_id(auth.uid()))
    AND company.subscription_plan=subscription_plans.code
  )
 );
COMMIT;

-- Fix: policy criada em 20260527110320 usava has_role(_, 'vendedor'), mas
-- 'vendedor' nao existe no enum app_role (admin, gestor, tecnico, comercial,
-- financeiro). Resultado: has_role(_, 'vendedor') sempre retorna FALSE e a
-- policy nunca permite SELECT pra ninguem. Super_admin ainda ve via outra
-- policy; admin users com entrada em admin_permissions (ex: maicon@dominex.app)
-- ficavam sem cobertura -> aba Atividade aparecia zerada.
--
-- Substituir por is_admin_user(auth.uid()), padrao consolidado (ja usado em
-- salespeople, salesperson_sales), que cobre super_admin + qualquer user
-- listado em admin_permissions.

DROP POLICY IF EXISTS "vendedor reads usage_events" ON public.usage_events;

CREATE POLICY "admin users read usage_events"
ON public.usage_events
FOR SELECT
TO authenticated
USING (public.is_admin_user(auth.uid()));

-- Vendedores Auctus precisam ler usage_events pra ver a aba Atividade no painel
-- Admin → Empresas. Antes, só super_admin tinha policy de SELECT — vendedor via
-- tudo zerado. Frontend já filtra por company_id; RLS aqui é só gate de acesso.
-- Fix v1.9.24.

CREATE POLICY "vendedor reads usage_events"
ON public.usage_events FOR SELECT
USING (has_role(auth.uid(), 'vendedor'));

-- Permite que o vendedor Maicon edite empresas no painel master sem receber
-- privilegios de super_admin. O gate da Edge Function e as policies de
-- companies/company_modules usam a mesma permissao granular admin_empresas.
-- Em ambientes onde a conta nao existe, o seed e deliberadamente um no-op.
INSERT INTO public.admin_permissions (user_id, permission)
SELECT u.id, 'admin_empresas'
  FROM auth.users u
 WHERE lower(u.email) = 'maicon@dominex.app'
ON CONFLICT (user_id, permission) DO NOTHING;

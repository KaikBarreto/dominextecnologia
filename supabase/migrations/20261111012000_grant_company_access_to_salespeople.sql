-- Vendedores ativos podem listar usuários e gerar link de redefinição somente
-- para empresas da própria carteira. O recorte é repetido na edge
-- admin-company-access; esta seed concede apenas a ação granular da interface.

INSERT INTO public.admin_permissions (user_id, permission)
SELECT s.user_id, 'admin_empresas_acesso'
  FROM public.salespeople s
 WHERE s.user_id IS NOT NULL
   AND s.is_active = true
ON CONFLICT (user_id, permission) DO NOTHING;

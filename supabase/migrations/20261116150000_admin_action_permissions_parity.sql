-- Permissões granulares do painel admin: ações explícitas para Empresas e CRM.
-- O backfill preserva o alcance de quem já possuía a tela antes da migração;
-- depois disso, retirar uma ação passa a ter efeito no servidor, não só na UI.

BEGIN;

INSERT INTO public.admin_permissions (user_id, permission)
SELECT DISTINCT ap.user_id, action.permission
FROM public.admin_permissions ap
CROSS JOIN LATERAL (
  VALUES
    ('admin_empresas_criar'),
    ('admin_empresas_editar'),
    ('admin_empresas_pagamento')
) AS action(permission)
WHERE ap.permission = 'admin_empresas'
ON CONFLICT DO NOTHING;

-- Gestão operacional da equipe não pode criar nem trocar vínculo com uma
-- conta admin. Isso continua sendo responsabilidade exclusiva do master.
CREATE OR REPLACE FUNCTION public.guard_salespeople_admin_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $guard$
BEGIN
  -- Migrações, cron e service role não carregam necessariamente um JWT; RLS
  -- já não se aplica a esses atores confiáveis.
  IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Outros fluxos legítimos já autorizados pela RLS (por exemplo, eventual
  -- edição do próprio perfil) preservam seu comportamento. Esta trava existe
  -- só para quem recebeu a ação nova de gestão de equipe.
  IF NOT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'vinculo_de_usuario_requer_master';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'vinculo_de_usuario_requer_master';
  END IF;

  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_salespeople_admin_link ON public.salespeople;
CREATE TRIGGER guard_salespeople_admin_link
  BEFORE INSERT OR UPDATE ON public.salespeople
  FOR EACH ROW EXECUTE FUNCTION public.guard_salespeople_admin_link();

ALTER POLICY "Super admins can insert salespeople" ON public.salespeople
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
  );

ALTER POLICY "Super admins can update salespeople" ON public.salespeople
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
  )
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
  );

ALTER POLICY "Super admins can delete salespeople" ON public.salespeople
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
  );

-- Foto faz parte do cadastro da equipe. Mantemos a escrita restrita a este
-- bucket e à mesma ação, sem abrir Storage administrativo em geral.
ALTER POLICY "Super admins can upload salesperson avatars" ON storage.objects
  WITH CHECK (
    bucket_id = 'salesperson-avatars'
    AND (
      (SELECT public.is_super_admin(auth.uid()))
      OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
    )
  );

ALTER POLICY "Super admins can update salesperson avatars" ON storage.objects
  USING (
    bucket_id = 'salesperson-avatars'
    AND (
      (SELECT public.is_super_admin(auth.uid()))
      OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
    )
  )
  WITH CHECK (
    bucket_id = 'salesperson-avatars'
    AND (
      (SELECT public.is_super_admin(auth.uid()))
      OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
    )
  );

ALTER POLICY "Super admins can delete salesperson avatars" ON storage.objects
  USING (
    bucket_id = 'salesperson-avatars'
    AND (
      (SELECT public.is_super_admin(auth.uid()))
      OR (SELECT public.has_admin_permission(auth.uid(), 'admin_vendedores_gerenciar'))
    )
  );

-- A RPC é SECURITY DEFINER e a definição viva pode conter regras comerciais
-- novas. Alteramos apenas a autorização que hoje aceita a permissão genérica.
DO $rewrite_payment$
DECLARE
  v_definition text;
  v_guard text := 'OR public.has_admin_permission(auth.uid(), ''admin_empresas'')';
BEGIN
  SELECT pg_get_functiondef(
    'public.register_manual_company_payment(uuid,numeric,date,text,text,text,text,uuid,uuid)'::regprocedure
  ) INTO v_definition;
  IF position(v_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'register_manual_company_payment guard mudou; revisar antes de aplicar a ação granular';
  END IF;
  v_definition := replace(
    v_definition,
    v_guard,
    'OR public.has_admin_permission(auth.uid(), ''admin_empresas_pagamento'')'
  );
  EXECUTE v_definition;
END;
$rewrite_payment$;

ALTER POLICY "Company admins can update companies" ON public.companies
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas_editar')
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas_editar')
  );

ALTER POLICY "Super admins can delete companies" ON public.companies
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas_excluir')
  );

ALTER POLICY "Admin CRM users can insert admin_leads" ON public.admin_leads
  WITH CHECK (
    (SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role))
    OR public.has_admin_permission(auth.uid(), 'admin_crm_criar_lead')
  );

ALTER POLICY "Admin CRM users can delete admin_leads" ON public.admin_leads
  USING (
    (SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role))
    OR public.has_admin_permission(auth.uid(), 'admin_crm_excluir_lead')
  );

INSERT INTO public.admin_permissions (user_id, permission)
SELECT DISTINCT ap.user_id, action.permission
FROM public.admin_permissions ap
CROSS JOIN LATERAL (
  VALUES ('admin_crm_criar_lead'), ('admin_crm_excluir_lead')
) AS action(permission)
WHERE ap.permission = 'admin_crm'
ON CONFLICT DO NOTHING;

-- A função é longa e inclui limpeza de PDV. Reescrevemos somente o seu guard
-- atual em runtime, preservando o corpo publicado mais recente.
DO $rewrite$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.admin_delete_company(uuid)'::regprocedure)
    INTO v_definition;
  IF position('IF NOT public.has_role(auth.uid(), ''super_admin''::public.app_role) THEN' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'admin_delete_company guard mudou; revisar antes de aplicar a ação granular';
  END IF;
  v_definition := replace(
    v_definition,
    'IF NOT public.has_role(auth.uid(), ''super_admin''::public.app_role) THEN',
    'IF NOT (public.has_role(auth.uid(), ''super_admin''::public.app_role) OR public.has_admin_permission(auth.uid(), ''admin_empresas_excluir'')) THEN'
  );
  EXECUTE v_definition;
END;
$rewrite$;

REVOKE ALL ON FUNCTION public.admin_delete_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid) TO authenticated, service_role;

COMMIT;

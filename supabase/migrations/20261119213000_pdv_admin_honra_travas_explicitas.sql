-- PDV: admin da empresa = Acesso Total também nas travas explícitas do servidor.
--
-- Por quê: as travas "explícitas" do PDV olhavam SÓ user_permissions (curinga
-- '*' ou a chave nominal) e ignoravam o papel admin de user_roles. Medido em
-- produção (19/11/2026): dos 14 admins de empresas com módulo pdv, 9 não
-- enxergavam o caixa aberto por outro operador. No front, AuthContext trata
-- admin como Acesso Total, então a tela prometia o que o servidor negava.
-- Regra aprovada pelo CEO em 19/11/2026: admin da empresa passa nessas travas.
--
-- O que muda:
--   1) pdv_has_explicit_action_permission_v2 ganha um ramo ADITIVO: admin
--      (has_role 'admin') com profile ativo e vinculado a empresa. ~47 funções
--      chamam essa função central, inclusive pdv_can_operate_other_cash_v2.
--   2) pdv_current_actor_has_explicit_permission_v3 tinha a mesma checagem
--      inline; passa a delegar para a função central (mesmo resultado para
--      não-admin).
--
-- O que NÃO muda:
--   - gestor/tecnico/qualquer não-admin: só '*' ou a chave nominal, como antes.
--     Nada de default-allow para quem não tem linha em user_permissions.
--   - super_admin: segue pelos ramos is_super_admin já existentes.
--   - Escopo de empresa: continua nas funções chamadoras (get_user_company_id).
--     Este ramo diz só "pode a ação", nunca "em qual empresa".
--
-- CREATE OR REPLACE preserva owner, GRANTs/ACL, volatilidade e search_path.
-- Nenhuma assinatura muda; nenhuma função nova (nada nasce com anon=X).

CREATE OR REPLACE FUNCTION public.pdv_has_explicit_action_permission_v2(p_user uuid, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM public.user_permissions up
    WHERE up.user_id=p_user AND up.is_active IS TRUE
      AND (up.permissions ? '*' OR up.permissions ? p_key)
  )
  -- Admin da empresa = Acesso Total (regra CEO 19/11/2026). Exige profile
  -- ativo e com empresa, como as demais travas do PDV (is_active IS TRUE).
  OR (
    public.has_role(p_user, 'admin'::public.app_role)
    AND EXISTS(
      SELECT 1 FROM public.profiles pr
      WHERE pr.user_id=p_user AND pr.is_active IS TRUE AND pr.company_id IS NOT NULL
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.pdv_current_actor_has_explicit_permission_v3(p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- Delegado à função central para herdar o ramo de admin (regra CEO
  -- 19/11/2026). Para não-admin o resultado é idêntico à checagem inline
  -- anterior ('*' ou chave nominal em user_permissions ativo).
  SELECT public.is_super_admin(auth.uid())
    OR public.pdv_has_explicit_action_permission_v2(auth.uid(), p_permission);
$function$;

-- Guarda: nenhuma das funções tocadas pode ficar executável por anon.
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_has_explicit_action_permission_v2(uuid,text)'::regprocedure,
    'public.pdv_current_actor_has_explicit_permission_v3(text)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Função % ficou executável por anon.', v_fn;
    END IF;
  END LOOP;
END
$$;

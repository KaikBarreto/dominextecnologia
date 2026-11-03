-- A ficha administrativa de Empresas expõe a aba "Sucesso" para quem tem a
-- permissão granular admin_empresas. A RPC de leitura ainda exigia role
-- super_admin/admin e, por isso, recusava vendedores administrativos como o
-- Maicon mesmo quando eles podiam abrir e editar a empresa.
--
-- Não ampliamos `_domiflix_assert_admin()`: ele representa gestão do catálogo
-- DomiFlix. A exceção fica restrita a `cs_domiflix_usuarios`, que devolve apenas
-- o acompanhamento de onboarding da empresa escolhida.

BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_old_guard constant text := 'PERFORM public._domiflix_assert_admin();';
  v_new_guard constant text := $guard$IF auth.role() IS DISTINCT FROM 'service_role' AND (
    auth.uid() IS NULL OR NOT (
      public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_admin_permission(auth.uid(), 'admin_empresas')
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;$guard$;
BEGIN
  SELECT pg_get_functiondef('public.cs_domiflix_usuarios(uuid)'::regprocedure)
    INTO v_definition;

  IF position(v_old_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Contrato de acesso de cs_domiflix_usuarios mudou; revise a migration';
  END IF;

  EXECUTE replace(v_definition, v_old_guard, v_new_guard);
END;
$migration$;

DO $audit$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.cs_domiflix_usuarios(uuid)'::regprocedure)
    INTO v_definition;

  IF v_definition NOT LIKE '%has_admin_permission(auth.uid(), ''admin_empresas''%'
     OR v_definition LIKE '%PERFORM public._domiflix_assert_admin();%'
  THEN
    RAISE EXCEPTION 'cs_domiflix_usuarios não recebeu o gate granular de admin_empresas';
  END IF;
END;
$audit$;

COMMIT;

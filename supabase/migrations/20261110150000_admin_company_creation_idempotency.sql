-- Impede cadastros duplicados quando a criacao administrativa de empresa e
-- reenviada por clique duplo, retry do navegador ou timeout da edge.
--
-- A chave nasce no cliente e e persistida na propria empresa. O indice UNIQUE
-- e a barreira concorrente real: duas requisicoes com a mesma chave nunca
-- conseguem criar dois tenants.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS creation_idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS creation_requested_by uuid,
  ADD COLUMN IF NOT EXISTS creation_completed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS companies_creation_idempotency_key_uidx
  ON public.companies (creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.companies.creation_idempotency_key IS
  'Chave opaca do formulario administrativo; retries devolvem a mesma empresa em vez de criar outro tenant.';
COMMENT ON COLUMN public.companies.creation_requested_by IS
  'Usuario administrativo que iniciou a criacao idempotente.';
COMMENT ON COLUMN public.companies.creation_completed_at IS
  'Preenchido somente depois que tenant, administrador, permissoes e seeds obrigatorios foram concluidos.';

-- A exclusao normal de estoque principal/ultimo estoque continua proibida. O
-- bypass so existe no escopo transacional do rollback interno abaixo.
CREATE OR REPLACE FUNCTION public.prevent_delete_protected_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count int;
BEGIN
  IF current_setting('app.rollback_admin_company_creation', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF OLD.is_default THEN
    RAISE EXCEPTION 'não é possível excluir o estoque principal; defina outro como principal antes'
      USING ERRCODE = 'raise_exception';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.stocks
   WHERE company_id = OLD.company_id;
  IF v_count <= 1 THEN
    RAISE EXCEPTION 'não é possível excluir o último estoque da empresa'
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN OLD;
END;
$$;

-- Rollback estreito para a edge create-company. Ele so aceita uma empresa
-- ainda incompleta, exige a chave exata e nao fica disponivel a usuarios do
-- app. A limpeza principal continua centralizada em admin_delete_company.
CREATE OR REPLACE FUNCTION public.rollback_admin_company_creation(
  p_company_id uuid,
  p_idempotency_key uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_requested_by uuid;
  v_cleanup_actor uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT creation_requested_by
    INTO v_requested_by
    FROM public.companies
   WHERE id = p_company_id
     AND creation_idempotency_key = p_idempotency_key
     AND creation_completed_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_requested_by IS NULL OR NOT (
    public.has_role(v_requested_by, 'super_admin'::public.app_role)
    OR public.has_admin_permission(v_requested_by, 'admin_empresas')
  ) THEN
    RAISE EXCEPTION 'creation requester is no longer authorized' USING ERRCODE = '42501';
  END IF;

  -- admin_delete_company e anterior ao uso direto por service_role e exige um
  -- auth.uid super_admin. O helper interno resolve um ator valido somente para
  -- reutilizar essa limpeza atomica; nenhum token ou sessao e criado.
  SELECT user_id
    INTO v_cleanup_actor
    FROM public.user_roles
   WHERE role = 'super_admin'::public.app_role
   ORDER BY created_at
   LIMIT 1;

  IF v_cleanup_actor IS NULL THEN
    RAISE EXCEPTION 'super admin unavailable for rollback' USING ERRCODE = '42501';
  END IF;

  -- Tabelas criadas depois da RPC historica: tarefas usam SET NULL e estoques
  -- nao possuem FK para companies, por isso precisam ser limpos antes.
  DELETE FROM public.admin_tasks WHERE company_id = p_company_id;
  PERFORM set_config('app.rollback_admin_company_creation', 'on', true);
  DELETE FROM public.stocks WHERE company_id = p_company_id;

  PERFORM set_config('request.jwt.claim.sub', v_cleanup_actor::text, true);
  PERFORM public.admin_delete_company(p_company_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_admin_company_creation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_admin_company_creation(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.rollback_admin_company_creation(uuid, uuid) IS
  'service_role: desfaz de forma atomica uma criacao administrativa ainda incompleta, validada pela chave idempotente.';

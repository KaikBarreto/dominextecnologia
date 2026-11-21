-- ============================================================================
-- RLS 21/11/2026, item 1: cargos (permission_presets) passam a ser da EMPRESA
-- ============================================================================
-- Por quê:
--   A tabela não tinha company_id e as políticas eram "qualquer autenticado lê"
--   e "quem gerencia usuários escreve tudo". Resultado: um admin da empresa A
--   lia, editava e apagava os cargos criados pela empresa B (caso real: a
--   Maqfrio editou o "Técnico em Campo" criado pela G-Tech em 16/11).
--
-- O que faz:
--   1. Coluna company_id (FK companies, ON DELETE CASCADE).
--   2. Backfill determinístico (SPEC 1.4):
--      - donos fixos dos 4 cargos conhecidos;
--      - cargo novo: dono = empresa com o user_permissions.updated_at mais antigo;
--      - toda OUTRA empresa que usa o cargo recebe uma CÓPIA (mesmo nome,
--        descrição, permissões e datas) e os usuários dela são repontados;
--      - cargo sem uso e sem dono identificável ABORTA a migration.
--   3. NOT NULL + DEFAULT (empresa do chamador) + índice.
--   4. Gatilho: INSERT sem company_id herda a empresa do chamador (mantém o
--      createPreset do front sem mudança); UPDATE não troca de empresa para
--      quem chega com JWT.
--   5. Políticas por empresa (leitura: qualquer usuário da empresa; escrita:
--      quem gerencia usuários da própria empresa; super_admin tudo).
--   6. Guarda em user_permissions.preset_id: cargo de outra empresa vira NULL
--      (fecha o caminho do create-user, que roda com service_role).
-- Idempotente: pode rodar 2x.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- 1. Coluna -------------------------------------------------------------------
ALTER TABLE public.permission_presets
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Backfill -----------------------------------------------------------------
-- O backfill não deve mexer no updated_at original dos cargos.
ALTER TABLE public.permission_presets DISABLE TRIGGER update_permission_presets_updated_at;

DO $$
DECLARE
  -- Donos definidos no SPEC 1.4 (evidência: ordem de criação x primeiro uso).
  v_owner_override constant jsonb := jsonb_build_object(
    'c44855ed-8b11-4450-834b-0df635371a0a', '6510e8af-c249-4494-86b7-ed9e24cb0d91', -- Técnico em Campo -> G-Tech
    '3d98cd72-4d7a-4d25-955a-e867edaae359', 'e9d06e16-aa0c-4ab1-98a2-5748bff40eaf', -- Escritório / ADM -> Carlos & Arruda
    'b7b4df4d-b9af-4420-a74e-116bf149e3a0', '808e1322-c7f7-4e6e-be58-f9c9440632c9', -- Auxiliar -> Tiklear
    '20b10454-29f4-499c-b823-e7e16d3ffc83', '808e1322-c7f7-4e6e-be58-f9c9440632c9'  -- Meio oficial (sem uso) -> Tiklear
  );
  r          record;
  c          record;
  v_owner    uuid;
  v_copy_id  uuid;
  v_orphans  text;
  v_n        int;
  v_nulled   int := 0;
  v_owned    int := 0;
  v_copies   int := 0;
  v_repoint  int := 0;
BEGIN
  -- Usuário sem empresa apontando para cargo: não há a quem o rótulo pertença.
  UPDATE public.user_permissions up
     SET preset_id = NULL
   WHERE up.preset_id IS NOT NULL
     AND public.get_profile_company_id(up.user_id) IS NULL;
  GET DIAGNOSTICS v_nulled = ROW_COUNT;

  -- Cargo sem dono fixo e sem nenhum uso por empresa: decisão do Tech Lead.
  SELECT string_agg(format('%s (%s, criado %s)', pp.id, pp.name, pp.created_at), '; ' ORDER BY pp.created_at)
    INTO v_orphans
    FROM public.permission_presets pp
   WHERE pp.company_id IS NULL
     AND NOT (v_owner_override ? pp.id::text)
     AND NOT EXISTS (
       SELECT 1
         FROM public.user_permissions up
         JOIN public.profiles pr ON pr.user_id = up.user_id
        WHERE up.preset_id = pp.id
          AND pr.company_id IS NOT NULL
     );
  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Cargo(s) sem uso e sem dono identificável, devolver ao Tech Lead: %', v_orphans;
  END IF;

  FOR r IN
    SELECT * FROM public.permission_presets WHERE company_id IS NULL ORDER BY created_at, id
  LOOP
    v_owner := COALESCE(
      (v_owner_override ->> r.id::text)::uuid,
      (SELECT pr.company_id
         FROM public.user_permissions up
         JOIN public.profiles pr ON pr.user_id = up.user_id
        WHERE up.preset_id = r.id
          AND pr.company_id IS NOT NULL
        ORDER BY up.updated_at, up.created_at, up.id
        LIMIT 1)
    );
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Cargo % (%) ficou sem dono', r.id, r.name;
    END IF;

    UPDATE public.permission_presets SET company_id = v_owner WHERE id = r.id;
    v_owned := v_owned + 1;
    RAISE NOTICE 'Cargo "%" (%) -> empresa %', r.name, r.id, v_owner;

    FOR c IN
      SELECT DISTINCT pr.company_id
        FROM public.user_permissions up
        JOIN public.profiles pr ON pr.user_id = up.user_id
       WHERE up.preset_id = r.id
         AND pr.company_id IS NOT NULL
         AND pr.company_id <> v_owner
    LOOP
      INSERT INTO public.permission_presets
        (name, description, permissions, created_at, updated_at, company_id)
      VALUES
        (r.name, r.description, r.permissions, r.created_at, r.updated_at, c.company_id)
      RETURNING id INTO v_copy_id;
      v_copies := v_copies + 1;

      UPDATE public.user_permissions up
         SET preset_id = v_copy_id
        FROM public.profiles pr
       WHERE pr.user_id = up.user_id
         AND up.preset_id = r.id
         AND pr.company_id = c.company_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_repoint := v_repoint + v_n;
      RAISE NOTICE '  cópia % para empresa % (% usuário(s) repontado(s))', v_copy_id, c.company_id, v_n;
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.permission_presets WHERE company_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill incompleto: ainda há cargo sem empresa';
  END IF;

  SELECT count(*) INTO v_n
    FROM public.user_permissions up
    JOIN public.permission_presets pp ON pp.id = up.preset_id
   WHERE pp.company_id IS DISTINCT FROM public.get_profile_company_id(up.user_id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % vínculo(s) de cargo com empresa divergente', v_n;
  END IF;

  RAISE NOTICE 'permission_presets: % cargo(s) com dono, % cópia(s), % usuário(s) repontado(s), % preset_id anulado(s) (usuário sem empresa)',
    v_owned, v_copies, v_repoint, v_nulled;
END $$;

ALTER TABLE public.permission_presets ENABLE TRIGGER update_permission_presets_updated_at;

-- 3. NOT NULL + índice ---------------------------------------------------------
ALTER TABLE public.permission_presets ALTER COLUMN company_id SET NOT NULL;
-- Default além do gatilho: o gerador de types.ts deixa company_id OPCIONAL no
-- Insert, então o createPreset do front segue compilando sem enviar a coluna.
ALTER TABLE public.permission_presets
  ALTER COLUMN company_id SET DEFAULT public.get_user_company_id(auth.uid());
CREATE INDEX IF NOT EXISTS idx_permission_presets_company_id
  ON public.permission_presets (company_id);

-- 4. Gatilho de empresa ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permission_presets_company_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Front (createPreset) não envia company_id: herda a empresa do chamador.
    -- Se continuar nulo (ex.: super_admin sem empresa), o NOT NULL barra.
    IF NEW.company_id IS NULL THEN
      NEW.company_id := public.get_user_company_id(auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  -- Cargo não muda de empresa por quem chega com JWT (inclusive service_role).
  -- Só manutenção sem JWT (migration) pode.
  IF NEW.company_id IS DISTINCT FROM OLD.company_id AND auth.role() IS NOT NULL THEN
    RAISE EXCEPTION 'O cargo não pode mudar de empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.permission_presets_company_guard() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_permission_presets_company_guard ON public.permission_presets;
CREATE TRIGGER trg_permission_presets_company_guard
  BEFORE INSERT OR UPDATE ON public.permission_presets
  FOR EACH ROW EXECUTE FUNCTION public.permission_presets_company_guard();

-- 5. Políticas -------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated view permission_presets" ON public.permission_presets;
DROP POLICY IF EXISTS "Managers can manage permission_presets" ON public.permission_presets;
DROP POLICY IF EXISTS "permission_presets_select_own_company" ON public.permission_presets;
DROP POLICY IF EXISTS "permission_presets_insert_user_managers" ON public.permission_presets;
DROP POLICY IF EXISTS "permission_presets_update_user_managers" ON public.permission_presets;
DROP POLICY IF EXISTS "permission_presets_delete_user_managers" ON public.permission_presets;

-- Leitura: qualquer usuário da própria empresa (PermissionsEditor e
-- UserFormDialog listam os cargos no cadastro).
CREATE POLICY "permission_presets_select_own_company"
  ON public.permission_presets FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "permission_presets_insert_user_managers"
  ON public.permission_presets FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (SELECT public.can_manage_users(auth.uid())))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "permission_presets_update_user_managers"
  ON public.permission_presets FOR UPDATE TO authenticated
  USING (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (SELECT public.can_manage_users(auth.uid())))
    OR (SELECT public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (SELECT public.can_manage_users(auth.uid())))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY "permission_presets_delete_user_managers"
  ON public.permission_presets FOR DELETE TO authenticated
  USING (
    (company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND (SELECT public.can_manage_users(auth.uid())))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

-- 6. Guarda em user_permissions.preset_id ----------------------------------------
-- preset_id é só rótulo (as permissões são copiadas). Cargo de outra empresa
-- vira NULL em vez de erro, para não derrubar cadastro feito pelo create-user.
CREATE OR REPLACE FUNCTION public.guard_user_permissions_preset_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.preset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.permission_presets pp
     WHERE pp.id = NEW.preset_id
       AND pp.company_id = public.get_profile_company_id(NEW.user_id)
  ) THEN
    NEW.preset_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_user_permissions_preset_company() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_user_permissions_preset_company ON public.user_permissions;
CREATE TRIGGER trg_guard_user_permissions_preset_company
  BEFORE INSERT OR UPDATE OF preset_id ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_permissions_preset_company();

COMMIT;

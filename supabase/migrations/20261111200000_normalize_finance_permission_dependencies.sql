-- Impede combinações de permissões que abrem um fluxo financeiro sem liberar
-- a seleção da conta necessária para concluí-lo. O cliente também normaliza o
-- conjunto, mas o banco permanece como garantia canônica para qualquer outra
-- porta de escrita (RPC, integração ou versão antiga do app).

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_finance_permission_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.permissions IS NULL OR jsonb_typeof(NEW.permissions) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- O curinga já inclui permissões presentes e futuras.
  IF NEW.permissions ? '*' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.permissions ? 'fn:manage_finance'
    OR NEW.permissions ? 'fn:manage_bank_accounts'
  ) AND NOT (NEW.permissions ? 'fn:use_bank_accounts') THEN
    NEW.permissions := NEW.permissions || '["fn:use_bank_accounts"]'::jsonb;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.normalize_finance_permission_dependencies()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_normalize_finance_permissions_user
  ON public.user_permissions;
CREATE TRIGGER trg_normalize_finance_permissions_user
  BEFORE INSERT OR UPDATE OF permissions ON public.user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_finance_permission_dependencies();

DROP TRIGGER IF EXISTS trg_normalize_finance_permissions_preset
  ON public.permission_presets;
CREATE TRIGGER trg_normalize_finance_permissions_preset
  BEFORE INSERT OR UPDATE OF permissions ON public.permission_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_finance_permission_dependencies();

UPDATE public.user_permissions
   SET permissions = permissions || '["fn:use_bank_accounts"]'::jsonb
 WHERE NOT (permissions ? '*')
   AND NOT (permissions ? 'fn:use_bank_accounts')
   AND (
     permissions ? 'fn:manage_finance'
     OR permissions ? 'fn:manage_bank_accounts'
   );

UPDATE public.permission_presets
   SET permissions = permissions || '["fn:use_bank_accounts"]'::jsonb
 WHERE NOT (permissions ? '*')
   AND NOT (permissions ? 'fn:use_bank_accounts')
   AND (
     permissions ? 'fn:manage_finance'
     OR permissions ? 'fn:manage_bank_accounts'
   );

COMMIT;

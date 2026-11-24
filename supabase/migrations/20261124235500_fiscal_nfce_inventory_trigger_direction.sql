-- O mesmo gatilho atende NF-e e NFC-e, mas só NF-e possui direction.
-- Acesso estrutural via JSON evita resolver um campo inexistente no record.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $fix$
DECLARE
  definition text;
  old_guard text := $old$CASE WHEN TG_TABLE_NAME = 'nfe_documents' THEN NEW.direction ELSE 'saida' END$old$;
  new_guard text := $new$CASE WHEN TG_TABLE_NAME = 'nfe_documents' THEN to_jsonb(NEW)->>'direction' ELSE 'saida' END$new$;
  old_acl aclitem[]; old_owner oid; old_config text[];
  signature regprocedure := 'public.fiscal_inventory_document_status_trigger()'::regprocedure;
BEGIN
  SELECT pg_get_functiondef(p.oid),p.proacl,p.proowner,p.proconfig
    INTO definition,old_acl,old_owner,old_config FROM pg_proc p WHERE p.oid=signature;
  IF position(new_guard IN definition)>0 THEN RETURN; END IF;
  IF (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1 THEN
    RAISE EXCEPTION 'Gatilho fiscal mudou; revisar antes de aplicar.';
  END IF;
  EXECUTE replace(definition,old_guard,new_guard);
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=signature AND p.prosecdef
    AND p.proacl IS NOT DISTINCT FROM old_acl AND p.proowner=old_owner
    AND p.proconfig IS NOT DISTINCT FROM old_config) THEN
    RAISE EXCEPTION 'Contrato de segurança do gatilho fiscal alterado.';
  END IF;
END $fix$;
COMMIT;

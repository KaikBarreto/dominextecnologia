-- Ao excluir uma SUBCATEGORIA financeira, os lançamentos que guardam o nome
-- dela precisam subir para a categoria principal antes do DELETE. A coluna
-- financial_transactions.category é texto (não FK); apagar só a categoria
-- deixa o histórico órfão e faz as antigas filhas aparecerem como categorias
-- soltas na DRE.
--
-- O gatilho roda no mesmo statement do DELETE: ou reclassificação + exclusão
-- confirmam juntas, ou tudo sofre rollback. SECURITY INVOKER preserva RLS e os
-- grants do chamador. Colocar a regra no banco também protege exclusões feitas
-- por outro cliente além desta tela.

CREATE OR REPLACE FUNCTION public.reclassify_deleted_financial_subcategory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_parent_name text;
BEGIN
  -- A cláusula WHEN do trigger já corta raízes; a guarda mantém a função
  -- segura caso ela seja reaproveitada em outro trigger no futuro.
  IF OLD.parent_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT name
    INTO v_parent_name
    FROM public.financial_categories
   WHERE id = OLD.parent_id
     AND company_id = OLD.company_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A categoria principal da subcategoria não foi encontrada.'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.financial_transactions
     SET category = v_parent_name
   WHERE company_id = OLD.company_id
     AND category = OLD.name;

  -- Preserva também os defaults de lançamentos automáticos. Sem isso, uma
  -- cobrança futura poderia recriar o nome da subcategoria já excluída.
  UPDATE public.tenant_payment_accounts
     SET default_fee_category = CASE
           WHEN default_fee_category = OLD.name THEN v_parent_name
           ELSE default_fee_category
         END,
         default_income_category = CASE
           WHEN default_income_category = OLD.name THEN v_parent_name
           ELSE default_income_category
         END
   WHERE company_id = OLD.company_id
     AND (
       default_fee_category = OLD.name
       OR default_income_category = OLD.name
     );

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.reclassify_deleted_financial_subcategory() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_reclassify_deleted_financial_subcategory
  ON public.financial_categories;

CREATE TRIGGER trg_reclassify_deleted_financial_subcategory
  BEFORE DELETE ON public.financial_categories
  FOR EACH ROW
  WHEN (OLD.parent_id IS NOT NULL)
  EXECUTE FUNCTION public.reclassify_deleted_financial_subcategory();

COMMENT ON FUNCTION public.reclassify_deleted_financial_subcategory() IS
  'Antes de excluir uma subcategoria financeira, reclassifica lançamentos e '
  'defaults para a categoria principal no mesmo statement.';

-- Repara integrações legadas que gravaram o UUID da categoria na coluna textual
-- financial_transactions.category. O vínculo por company_id é obrigatório:
-- categorias e lançamentos de empresas diferentes nunca podem se cruzar.
--
-- O contrato atual continua sendo o nome copiado da categoria (não existe
-- category_id em financial_transactions). A UI também mantém fallback de
-- leitura para caches ou linhas ainda não alcançadas pela migration.
UPDATE public.financial_transactions AS transaction
   SET category = category.name
  FROM public.financial_categories AS category
 WHERE transaction.company_id = category.company_id
   AND transaction.category = category.id::text
   AND transaction.category IS DISTINCT FROM category.name;

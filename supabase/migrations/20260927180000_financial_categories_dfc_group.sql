-- Classificacao gerencial da categoria no DFC pelo metodo direto.
--
-- A coluna e nullable de proposito: categorias existentes nao devem receber
-- classificacao presumida durante o deploy. O consumidor aplica um fallback
-- explicito enquanto a empresa nao classifica seu plano de categorias.
ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS dfc_group text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.financial_categories'::regclass
       AND conname = 'financial_categories_dfc_group_check'
  ) THEN
    ALTER TABLE public.financial_categories
      ADD CONSTRAINT financial_categories_dfc_group_check
      CHECK (
        dfc_group IS NULL
        OR dfc_group IN ('operacional', 'investimento', 'financiamento')
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.financial_categories.dfc_group IS
  'Grupo gerencial da categoria no DFC direto: operacional, investimento ou financiamento. NULL usa o fallback explicito do consumidor.';

-- Fonte única para o DRE administrativo da Dominex. Não altera lançamentos.
BEGIN;
ALTER TABLE public.admin_financial_categories
  ADD COLUMN IF NOT EXISTS affects_result boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dre_bucket text;
ALTER TABLE public.admin_financial_categories
  DROP CONSTRAINT IF EXISTS admin_financial_categories_dre_bucket_check;
ALTER TABLE public.admin_financial_categories
  ADD CONSTRAINT admin_financial_categories_dre_bucket_check
  CHECK (dre_bucket IS NULL OR dre_bucket IN ('revenue','revenue_reduction','tax','cpv','opex','non_operating'));

UPDATE public.admin_financial_categories
   SET dre_bucket = CASE
     WHEN type = 'income' THEN 'revenue'
     WHEN name IN ('estorno','chargeback') THEN 'revenue_reduction'
     WHEN name IN ('asaas_fee','tarifa_asaas','tax','impostos') THEN 'tax'
     WHEN name IN ('infrastructure','infraestrutura') THEN 'cpv'
     WHEN name = 'distribuicao_de_lucros' THEN 'non_operating'
     ELSE 'opex'
   END,
   affects_result = true,
   updated_at = now()
 WHERE dre_bucket IS NULL;

INSERT INTO public.admin_financial_categories
  (name, label, type, color, icon, is_system, is_active, sort_order, dre_bucket, affects_result)
VALUES ('distribuicao_de_lucros', 'Distribuição de lucros', 'expense', '#7c3aed', 'landmark', true, true, 999, 'non_operating', true)
ON CONFLICT (name) DO UPDATE
  SET dre_bucket = 'non_operating', affects_result = true, updated_at = now();
COMMIT;

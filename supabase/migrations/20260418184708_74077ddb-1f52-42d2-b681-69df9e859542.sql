-- Remove "Venda Nova" duplicate (first_sale) and rename Taxa Asaas to Tarifas/Taxas Bancárias
DELETE FROM public.admin_financial_categories WHERE name = 'first_sale';
UPDATE public.admin_financial_categories
  SET label = 'Tarifas/Taxas Bancárias'
  WHERE name = 'asaas_fee';
UPDATE public.admin_financial_transactions SET category = 'sale' WHERE category = 'first_sale';
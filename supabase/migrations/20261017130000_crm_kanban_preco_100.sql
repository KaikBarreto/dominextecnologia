-- CRM/Kanban: R$ 50 -> R$ 100/mês no catálogo comercial.
-- Mensalidades atuais permanecem congeladas; apenas novas composições usam o novo preço.

DO $$
DECLARE
  v_old_price numeric;
BEGIN
  SELECT price
    INTO v_old_price
    FROM public.subscription_modules
   WHERE code = 'crm'
   FOR UPDATE;

  IF NOT FOUND OR v_old_price IS NULL THEN
    RAISE EXCEPTION 'Módulo crm ausente ou sem preço no catálogo.';
  END IF;

  IF v_old_price NOT IN (50, 100) THEN
    RAISE EXCEPTION
      'Preço inesperado do módulo crm: R$ %. Esperado R$ 50 ou R$ 100.',
      v_old_price;
  END IF;

  UPDATE public.subscription_modules
     SET price = 100
   WHERE code = 'crm';

  IF NOT EXISTS (
    SELECT 1
      FROM public.subscription_modules
     WHERE code = 'crm'
       AND price = 100
  ) THEN
    RAISE EXCEPTION 'Falha ao fixar o módulo crm em R$ 100.';
  END IF;

  RAISE NOTICE
    'CRM/Kanban: catálogo de R$ % para R$ 100. Mensalidades atuais congeladas.',
    v_old_price;
END $$;

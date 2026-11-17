BEGIN;

-- Uma empresa gera uma única comissão de primeira venda. As funções atuais já
-- verificam isso, mas o índice fecha a janela de corrida entre dois callers.
CREATE UNIQUE INDEX IF NOT EXISTS uq_salesperson_sales_company
  ON public.salesperson_sales (company_id)
  WHERE company_id IS NOT NULL;

-- Fonte final da verdade para qualquer INSERT vinculado a uma empresa:
-- enquanto houver preço negociado ativo, a base e a comissão usam esse valor,
-- não o preço de catálogo guardado em subscription_value.
CREATE OR REPLACE FUNCTION public.enforce_salesperson_sale_effective_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_subscription_value numeric;
  v_custom_price numeric;
  v_custom_price_months integer;
  v_custom_price_payments_made integer;
  v_custom_price_permanent boolean;
  v_effective_value numeric;
  v_total_commission numeric;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    c.subscription_value,
    c.custom_price,
    c.custom_price_months,
    c.custom_price_payments_made,
    c.custom_price_permanent
  INTO
    v_subscription_value,
    v_custom_price,
    v_custom_price_months,
    v_custom_price_payments_made,
    v_custom_price_permanent
  FROM public.companies c
  WHERE c.id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_sale_company_not_found';
  END IF;

  v_effective_value := CASE
    WHEN COALESCE(v_custom_price, 0) > 0
      AND (
        v_custom_price_permanent IS TRUE
        OR COALESCE(v_custom_price_months, 0) > COALESCE(v_custom_price_payments_made, 0)
      )
      THEN v_custom_price
    ELSE v_subscription_value
  END;

  -- Registro legado sem preço contratado continua usando o valor informado.
  v_effective_value := COALESCE(NULLIF(v_effective_value, 0), NULLIF(NEW.amount, 0), NEW.paid_amount, 0);
  v_total_commission := round(
    v_effective_value * CASE
      WHEN lower(COALESCE(NEW.billing_cycle, '')) IN ('yearly', 'annual', 'anual', 'year') THEN 0.20
      ELSE 1.00
    END,
    2
  );

  NEW.amount := v_effective_value;
  NEW.paid_amount := v_effective_value;
  NEW.commission_amount := v_total_commission;

  IF NEW.sdr_id IS NOT NULL THEN
    NEW.closer_commission := round(v_total_commission * 0.8, 2);
    NEW.sdr_commission := round(v_total_commission - NEW.closer_commission, 2);
  ELSE
    NEW.closer_commission := v_total_commission;
    NEW.sdr_commission := 0;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_salesperson_sale_effective_price() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_salesperson_sale_effective_price ON public.salesperson_sales;
CREATE TRIGGER trg_salesperson_sale_effective_price
  BEFORE INSERT ON public.salesperson_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_salesperson_sale_effective_price();

-- Corrige somente as duas vendas de novembro auditadas. Aborta integralmente
-- se o fechamento do Maicon já tiver sido pago ou se qualquer premissa mudou.
DO $correction$
DECLARE
  v_maicon_id uuid := '8b584853-5842-48a2-bca6-4dce892ece17';
  v_target_count integer;
  v_updated integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.salesperson_payments p
    WHERE p.salesperson_id = v_maicon_id
      AND p.reference_month = date '2026-11-01'
  ) THEN
    RAISE EXCEPTION 'maicon_november_commission_already_paid';
  END IF;

  SELECT count(*)
  INTO v_target_count
  FROM public.salesperson_sales ss
  WHERE ss.salesperson_id = v_maicon_id
    AND ss.sdr_id IS NULL
    AND ss.billing_cycle = 'monthly'
    AND ss.status = 'confirmed'
    AND ss.created_at >= timestamptz '2026-11-01 00:00:00-03'
    AND ss.created_at < timestamptz '2026-12-01 00:00:00-03'
    AND (
      (ss.id = '1a85cdc4-a1fc-434f-9571-3dcd2ccac9a0' AND ss.company_id = 'b099a862-71ba-4883-b25b-f3ff9403becf'
        AND ss.amount = 597 AND ss.paid_amount = 597 AND ss.commission_amount = 597 AND ss.closer_commission = 597)
      OR
      (ss.id = '499ac3cb-0bfb-4491-aecb-7c809e110fd3' AND ss.company_id = 'e9d06e16-aa0c-4ab1-98a2-5748bff40eaf'
        AND ss.amount = 297 AND ss.paid_amount = 297 AND ss.commission_amount = 297 AND ss.closer_commission = 297)
    );

  IF v_target_count <> 2 THEN
    RAISE EXCEPTION 'maicon_target_sales_changed: expected 2, found %', v_target_count;
  END IF;

  UPDATE public.salesperson_sales ss
  SET amount = CASE ss.id
        WHEN '1a85cdc4-a1fc-434f-9571-3dcd2ccac9a0' THEN 400
        WHEN '499ac3cb-0bfb-4491-aecb-7c809e110fd3' THEN 150
      END,
      paid_amount = CASE ss.id
        WHEN '1a85cdc4-a1fc-434f-9571-3dcd2ccac9a0' THEN 400
        WHEN '499ac3cb-0bfb-4491-aecb-7c809e110fd3' THEN 150
      END,
      commission_amount = CASE ss.id
        WHEN '1a85cdc4-a1fc-434f-9571-3dcd2ccac9a0' THEN 400
        WHEN '499ac3cb-0bfb-4491-aecb-7c809e110fd3' THEN 150
      END,
      closer_commission = CASE ss.id
        WHEN '1a85cdc4-a1fc-434f-9571-3dcd2ccac9a0' THEN 400
        WHEN '499ac3cb-0bfb-4491-aecb-7c809e110fd3' THEN 150
      END,
      sdr_commission = 0
  WHERE ss.id IN (
    '1a85cdc4-a1fc-434f-9571-3dcd2ccac9a0',
    '499ac3cb-0bfb-4491-aecb-7c809e110fd3'
  );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN
    RAISE EXCEPTION 'maicon_target_update_failed: expected 2, updated %', v_updated;
  END IF;
END
$correction$;

COMMIT;

-- Rollback da blindagem:
--   DROP TRIGGER trg_salesperson_sale_effective_price ON public.salesperson_sales;
--   DROP FUNCTION public.enforce_salesperson_sale_effective_price();
--   DROP INDEX public.uq_salesperson_sales_company;
-- Rollback dos dois dados: restaurar respectivamente 597 e 297 nos campos
-- amount, paid_amount, commission_amount e closer_commission (sdr = 0).

-- =====================================================================
-- Pagamento parcial em conta a receber (recorrência única)
-- =====================================================================
-- Permite que uma conta a receber (transaction_type='entrada',
-- installment_total NULL ou 1) seja marcada como recebida parcialmente,
-- gerando rows filhas com category='Recebimento parcial' que somam em
-- `amount_received` na mãe via trigger.
--
-- Modelo: reusa parent_transaction_id (mesma coluna já usada por
-- tarifas de máquina, que são 'saida' + 'Tarifas e Taxas'). Distinção
-- por category + transaction_type.
--
-- Compat: contas sem filhas têm amount_received=0 (DEFAULT) → zero
-- regressão no comportamento atual de "marcar como pago".
-- =====================================================================

-- 1) Coluna nova
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS amount_received DECIMAL(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.financial_transactions.amount_received
  IS 'Soma das filhas com category=''Recebimento parcial'' (entrada). Recalculado por trigger trg_recalc_amount_received. Sempre 0 em filhas.';


-- 2) Função de recálculo
--    Recalcula amount_received da mãe a partir das filhas e ajusta
--    is_paid / paid_date conforme cobertura do valor total.
CREATE OR REPLACE FUNCTION public.recalc_amount_received(p_parent_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total DECIMAL(10,2);
  v_amount DECIMAL(10,2);
  v_last_paid DATE;
BEGIN
  IF p_parent_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(paid_date)
    INTO v_total, v_last_paid
  FROM public.financial_transactions
  WHERE parent_transaction_id = p_parent_id
    AND category = 'Recebimento parcial'
    AND transaction_type = 'entrada';

  SELECT amount INTO v_amount
  FROM public.financial_transactions
  WHERE id = p_parent_id;

  IF v_amount IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.financial_transactions
  SET
    amount_received = v_total,
    is_paid = CASE WHEN v_total >= v_amount THEN true ELSE false END,
    paid_date = CASE WHEN v_total >= v_amount THEN v_last_paid ELSE NULL END
  WHERE id = p_parent_id;
END;
$$;


-- 3) Trigger
--    Só atua quando a row alterada é filha de recebimento parcial.
--    Updates na mãe (feitos pela própria função acima) NÃO disparam ação
--    porque a mãe não tem parent_transaction_id nem category de parcial.
--    Evita recursão.
CREATE OR REPLACE FUNCTION public.trg_recalc_amount_received_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.parent_transaction_id IS NOT NULL
       AND OLD.category = 'Recebimento parcial'
       AND OLD.transaction_type = 'entrada' THEN
      PERFORM public.recalc_amount_received(OLD.parent_transaction_id);
    END IF;
    RETURN OLD;
  ELSE
    -- INSERT ou UPDATE
    IF NEW.parent_transaction_id IS NOT NULL
       AND NEW.category = 'Recebimento parcial'
       AND NEW.transaction_type = 'entrada' THEN
      PERFORM public.recalc_amount_received(NEW.parent_transaction_id);
    END IF;

    -- Se UPDATE mudou parent (mover filha entre mães), recalcular a antiga também
    IF TG_OP = 'UPDATE'
       AND OLD.parent_transaction_id IS NOT NULL
       AND OLD.parent_transaction_id IS DISTINCT FROM NEW.parent_transaction_id
       AND OLD.category = 'Recebimento parcial' THEN
      PERFORM public.recalc_amount_received(OLD.parent_transaction_id);
    END IF;

    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_amount_received ON public.financial_transactions;
CREATE TRIGGER trg_recalc_amount_received
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recalc_amount_received_fn();


-- 4) Backfill defensivo
--    Caso já existam filhas de "Recebimento parcial" criadas
--    manualmente antes desta migration (improvável, mas seguro),
--    recalcula amount_received de cada mãe afetada.
DO $$
DECLARE
  r RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT parent_transaction_id
    FROM public.financial_transactions
    WHERE parent_transaction_id IS NOT NULL
      AND category = 'Recebimento parcial'
      AND transaction_type = 'entrada'
  LOOP
    PERFORM public.recalc_amount_received(r.parent_transaction_id);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Backfill amount_received: % mãe(s) recalculada(s)', v_count;
END $$;

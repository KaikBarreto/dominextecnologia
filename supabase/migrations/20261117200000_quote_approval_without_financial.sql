-- Permite aprovar um orçamento interno sem antecipar receita/conta a receber e
-- reconcilia lançamentos já gerados com a OS criada a partir do orçamento.

BEGIN;

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_quote_approval_revenue_mode_check;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_quote_approval_revenue_mode_check
  CHECK (quote_approval_revenue_mode IN ('apenas_aprovar', 'a_receber', 'recebido'));

ALTER TABLE public.company_settings
  ALTER COLUMN quote_approval_revenue_mode SET DEFAULT 'apenas_aprovar';

COMMENT ON COLUMN public.company_settings.quote_approval_revenue_mode IS
  'Opção pré-marcada na aprovação interna do orçamento: apenas_aprovar não cria financeiro; a_receber cria pendência; recebido lança no caixa. O operador pode trocar por orçamento.';

CREATE OR REPLACE FUNCTION public.link_quote_financial_entries_to_service_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_installment_group_id uuid;
BEGIN
  IF NEW.converted_to_os_id IS NULL OR NEW.financial_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A OS precisa ser exatamente a conversão deste orçamento e permanecer no
  -- mesmo tenant. Uma referência inconsistente nunca pode ampliar o vínculo.
  IF NOT EXISTS (
    SELECT 1
      FROM public.service_orders so
     WHERE so.id = NEW.converted_to_os_id
       AND so.quote_id = NEW.id
       AND so.company_id = NEW.company_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT ft.installment_group_id
    INTO v_installment_group_id
    FROM public.financial_transactions ft
   WHERE ft.id = NEW.financial_transaction_id
     AND ft.company_id = NEW.company_id
     AND ft.transaction_type = 'entrada';

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.financial_transactions ft
     SET service_order_id = NEW.converted_to_os_id
   WHERE ft.company_id = NEW.company_id
     AND ft.transaction_type = 'entrada'
     AND ft.cancelled_at IS NULL
     AND ft.service_order_id IS NULL
     AND (
       ft.id = NEW.financial_transaction_id
       OR (
         v_installment_group_id IS NOT NULL
         AND ft.installment_group_id = v_installment_group_id
       )
     );

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.link_quote_financial_entries_to_service_order() IS
  'Vincula à OS as receitas já geradas pelo orçamento convertido, sem cruzar tenant nem sobrescrever vínculo existente.';

REVOKE ALL ON FUNCTION public.link_quote_financial_entries_to_service_order()
  FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_link_quote_financial_entries_to_service_order
  ON public.quotes;
CREATE TRIGGER trg_link_quote_financial_entries_to_service_order
  AFTER UPDATE OF converted_to_os_id, financial_transaction_id
  ON public.quotes
  FOR EACH ROW
  WHEN (NEW.converted_to_os_id IS NOT NULL AND NEW.financial_transaction_id IS NOT NULL)
  EXECUTE FUNCTION public.link_quote_financial_entries_to_service_order();

-- Corrige conversões anteriores. Só preenche vínculos vazios e somente quando
-- a OS comprova, por quote_id e company_id, que nasceu daquele orçamento.
WITH quote_links AS (
  SELECT
    q.company_id,
    q.converted_to_os_id AS service_order_id,
    q.financial_transaction_id,
    anchor.installment_group_id
  FROM public.quotes q
  JOIN public.service_orders so
    ON so.id = q.converted_to_os_id
   AND so.quote_id = q.id
   AND so.company_id = q.company_id
  JOIN public.financial_transactions anchor
    ON anchor.id = q.financial_transaction_id
   AND anchor.company_id = q.company_id
   AND anchor.transaction_type = 'entrada'
  WHERE q.converted_to_os_id IS NOT NULL
    AND q.financial_transaction_id IS NOT NULL
)
UPDATE public.financial_transactions ft
   SET service_order_id = links.service_order_id
  FROM quote_links links
 WHERE ft.company_id = links.company_id
   AND ft.transaction_type = 'entrada'
   AND ft.cancelled_at IS NULL
   AND ft.service_order_id IS NULL
   AND (
     ft.id = links.financial_transaction_id
     OR (
       links.installment_group_id IS NOT NULL
       AND ft.installment_group_id = links.installment_group_id
     )
   );

COMMIT;

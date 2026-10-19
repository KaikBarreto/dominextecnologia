-- Edição segura de venda no PDV
--
-- Venda paga não é atualizada in loco: `pdv_cancel_order` estorna estoque,
-- financeiro, fiado e gaveta, e o operador conclui um novo pedido. Esta FK
-- preserva a cadeia de auditoria entre a venda substituta e a original.

BEGIN;

ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS replaces_order_id uuid
    REFERENCES public.pdv_orders(id) ON DELETE SET NULL;

ALTER TABLE public.pdv_orders
  DROP CONSTRAINT IF EXISTS pdv_orders_replacement_not_self;
ALTER TABLE public.pdv_orders
  ADD CONSTRAINT pdv_orders_replacement_not_self
  CHECK (replaces_order_id IS NULL OR replaces_order_id <> id);

CREATE INDEX IF NOT EXISTS idx_pdv_orders_replaces_order
  ON public.pdv_orders (replaces_order_id)
  WHERE replaces_order_id IS NOT NULL;

COMMENT ON COLUMN public.pdv_orders.replaces_order_id IS
  'Venda cancelada que originou este novo pedido pelo fluxo Editar. Preserva auditoria: a venda paga nunca é alterada in loco.';

-- A FK simples garante existência, mas não garante tenant. O mesmo guard dos
-- demais vínculos do PDV é reutilizado aqui, além de exigir que a origem já
-- tenha sido cancelada pela RPC canônica antes de nascer a substituta.
CREATE OR REPLACE FUNCTION public.pdv_assert_order_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_source_status text;
BEGIN
  IF NEW.replaces_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.pdv_assert_ref_company(
    'public.pdv_orders',
    NEW.replaces_order_id,
    NEW.company_id,
    'O pedido substituído'
  );

  SELECT o.status
    INTO v_source_status
    FROM public.pdv_orders o
   WHERE o.id = NEW.replaces_order_id
     AND o.company_id = NEW.company_id;

  IF v_source_status IS DISTINCT FROM 'cancelado' THEN
    RAISE EXCEPTION 'A venda original precisa ser cancelada antes de criar o pedido substituto.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.pdv_assert_order_replacement() IS
  'Impede vínculo cross-tenant e só permite pedido substituto para uma venda já cancelada pelo fluxo auditável do PDV.';

REVOKE ALL ON FUNCTION public.pdv_assert_order_replacement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_assert_order_replacement() FROM anon;
REVOKE ALL ON FUNCTION public.pdv_assert_order_replacement() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_assert_order_replacement() TO service_role;

DROP TRIGGER IF EXISTS tg_zzz_pdv_order_replacement ON public.pdv_orders;
CREATE TRIGGER tg_zzz_pdv_order_replacement
  BEFORE INSERT OR UPDATE OF replaces_order_id ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_order_replacement();

COMMIT;

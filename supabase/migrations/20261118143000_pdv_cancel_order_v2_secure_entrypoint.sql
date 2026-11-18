-- Publica o cancelamento para o cliente autenticado sem reabrir o core legado.
-- O wrapper aplica primeiro a custódia do caixa; o core permanece atômico e
-- responsável pelos estornos de estoque, financeiro e fiado.
CREATE OR REPLACE FUNCTION public.pdv_cancel_order_v2(
  p_order_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id, auth.uid());
  RETURN public.pdv_cancel_order(p_order_id, p_reason);
END
$fn$;

COMMENT ON FUNCTION public.pdv_cancel_order_v2(uuid, text) IS
  'Cancela atomicamente um pedido acessível ao caixa do ator. Mantém o core pdv_cancel_order fechado e preserva estoque, financeiro e auditoria.';

REVOKE ALL ON FUNCTION public.pdv_cancel_order_v2(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_cancel_order_v2(uuid, text) TO authenticated, service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pdv_cancel_order_v2(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon nao pode executar pdv_cancel_order_v2';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.pdv_cancel_order_v2(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa executar pdv_cancel_order_v2';
  END IF;
  IF has_function_privilege('authenticated', 'public.pdv_cancel_order(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'core pdv_cancel_order deve continuar fechado para authenticated';
  END IF;
END
$check$;

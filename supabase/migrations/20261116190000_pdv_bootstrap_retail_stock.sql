-- O primeiro caixa deve usar um local que o catálogo da Loja disponibiliza.
-- A classificação PDV é a mesma do cadastro explícito de terminal: não muda
-- identidade/default/cliente, mercadorias, quantidades nem autorização de OS.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $bootstrap_stock$
DECLARE definition text; anchor text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_bootstrap_company(uuid)'::regprocedure) INTO definition;
 anchor:=$anchor$  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.company_id = p_company_id
  ) THEN$anchor$;
 replacement:=$replacement$  -- Mantém a ordem estoque -> terminal do cadastro explícito de caixa.
  PERFORM stock.id FROM public.stocks stock
   WHERE stock.company_id=p_company_id AND stock.customer_id IS NULL
     AND (stock.id=v_stock_id OR EXISTS(SELECT 1 FROM public.pdv_terminals terminal
       WHERE terminal.company_id=p_company_id AND terminal.stock_id=stock.id AND terminal.is_active IS TRUE))
   ORDER BY stock.id FOR UPDATE OF stock;

  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.company_id = p_company_id
  ) THEN$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
  RAISE EXCEPTION 'A preparação dos terminais mudou; revise antes de alinhar o estoque da loja';END IF;
 definition:=replace(definition,anchor,replacement);
 anchor:=$anchor$  RETURN jsonb_build_object(
    'configured', true,
    'cash_account_created', v_account_created,
    'cash_account_deferred', v_cash_account_deferred,
    'needs_cash_close', false,
    'stock_promoted', v_stock_promoted,$anchor$;
 replacement:=$replacement$  -- PDV_BOOTSTRAP_RETAIL_STOCK_V1: somente locais gerais realmente usados.
  UPDATE public.stocks stock SET purpose='pdv'
   WHERE stock.company_id=p_company_id AND stock.customer_id IS NULL
     AND stock.purpose IS DISTINCT FROM 'pdv'
     AND EXISTS(SELECT 1 FROM public.pdv_terminals terminal
       WHERE terminal.company_id=p_company_id AND terminal.stock_id=stock.id AND terminal.is_active IS TRUE);

  RETURN jsonb_build_object(
    'configured', true,
    'cash_account_created', v_account_created,
    'cash_account_deferred', v_cash_account_deferred,
    'needs_cash_close', false,
    'stock_promoted', v_stock_promoted,$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
   OR position('pdv_company_access_entitled_internal' IN definition)=0
   OR position('company_has_module' IN definition)=0 THEN
  RAISE EXCEPTION 'O contrato da preparação do PDV mudou; revise a classificação dos locais';END IF;
 EXECUTE replace(definition,anchor,replacement);
END $bootstrap_stock$;

-- Empresas já configuradas não passam pelo setup ao abrir uma gaveta. Repara
-- somente metadados comprovados pelo terminal ativo e pelo acesso vigente ao
-- módulo. O helper owner-only já espelha a vigência canônica sem depender de
-- JWT (a função pública de vigência restringe a sondagem ao tenant da sessão).
-- Não há criação de local, movimentação ou reclassificação de cliente.
DO $configured_retail_stocks$
BEGIN
 PERFORM stock.id FROM public.stocks stock
  WHERE stock.customer_id IS NULL AND stock.purpose IS DISTINCT FROM 'pdv'
    AND public.pdv_company_access_entitled_internal(stock.company_id) IS TRUE
    AND public.company_has_module(stock.company_id,'pdv') IS TRUE
    AND EXISTS(SELECT 1 FROM public.pdv_terminals terminal
      WHERE terminal.company_id=stock.company_id AND terminal.stock_id=stock.id AND terminal.is_active IS TRUE)
  ORDER BY stock.company_id,stock.id FOR UPDATE OF stock;
 UPDATE public.stocks stock SET purpose='pdv'
  WHERE stock.customer_id IS NULL AND stock.purpose IS DISTINCT FROM 'pdv'
    AND public.pdv_company_access_entitled_internal(stock.company_id) IS TRUE
    AND public.company_has_module(stock.company_id,'pdv') IS TRUE
    AND EXISTS(SELECT 1 FROM public.pdv_terminals terminal
      WHERE terminal.company_id=stock.company_id AND terminal.stock_id=stock.id AND terminal.is_active IS TRUE);
END $configured_retail_stocks$;
COMMIT;

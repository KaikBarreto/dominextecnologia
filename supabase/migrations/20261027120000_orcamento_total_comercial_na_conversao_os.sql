BEGIN;

-- `quotes.total_price` e a sugestao interna calculada por custo/BDI. O valor
-- aceito pelo cliente e persistido em `total_value`; portanto e ele que deve
-- seguir para a OS. A troca e cirurgica para preservar integralmente a
-- assinatura, validacoes multi-tenant, idempotencia, grants e demais copias de
-- escopo da funcao vigente.
DO $migration$
DECLARE
  v_signature regprocedure := to_regprocedure('public.generate_service_order_from_quote(uuid,jsonb)');
  v_definition text;
  v_old_assignment constant text :=
    'v_final_total := COALESCE(v_quote.total_price, v_quote.total_value, v_items_total, 0);';
  v_new_assignment constant text :=
    'v_final_total := COALESCE(v_quote.total_value, v_quote.total_price, v_items_total, 0);';
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'Funcao generate_service_order_from_quote(uuid,jsonb) nao encontrada.';
  END IF;

  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF position(v_old_assignment IN v_definition) = 0 THEN
    RAISE EXCEPTION 'A implementacao vigente da conversao de orcamento mudou; revise a migration antes de aplicar.';
  END IF;

  EXECUTE replace(v_definition, v_old_assignment, v_new_assignment);
END;
$migration$;

COMMENT ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) IS
  'Gera OS idempotente do orcamento, usa total_value como valor comercial canonico, distribui servicos por equipamento e aplica checklists ativos vinculados.';

COMMIT;

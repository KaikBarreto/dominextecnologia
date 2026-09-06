-- ESTOQUE: novo tipo de movimento 'consumo' (material gasto dentro de uma OS)
--
-- POR QUE:
--   A feature "Consumo de estoque dentro da OS" (v1.22.0) precisa que a baixa de
--   material feita ao FINALIZAR uma Ordem de Serviço apareça no Kardex com origem
--   própria — distinta de 'saida' (baixa manual/avulsa) e de 'ajuste' (correção de
--   inventário). Sem um tipo próprio, o histórico do material não diferencia
--   "gastei numa OS" de "tirei do estoque na mão", e o relatório de custo por OS
--   fica impossível de reconstruir.
--
-- SÃO DUAS BARREIRAS INDEPENDENTES — as duas precisam aceitar 'consumo':
--   (1) o CHECK inventory_movements_movement_type_check na tabela;
--   (2) a lista repetida DENTRO do corpo de register_inventory_movement
--       (IF p_movement_type NOT IN (...)), que roda ANTES do INSERT.
--   Mexer só numa delas deixa a outra barrando a gravação.
--
-- SOBRE O OVERLOAD LEGADO register_inventory_movement/8 (sem p_stock_id):
--   Ele ainda existe no banco (criado em 20260619160000, nunca dropado) e tem a
--   mesma lista de tipos no corpo. NÃO foi tocado aqui de propósito: aquela versão
--   escreve direto em inventory.quantity (modelo pré-multi-estoque) e faz INSERT em
--   inventory_movements SEM stock_id — coluna que virou NOT NULL na 20260721160000.
--   Ou seja: qualquer chamada dela hoje falha com not_null_violation antes mesmo de
--   gravar. É código morto por construção. Ampliar a lista dela só manteria viva uma
--   função que não consegue mais funcionar. Recomendação registrada pro Tech Lead:
--   DROP FUNCTION do overload/8 em migration própria, com OK do CEO (dropar função
--   é irreversível e some do types.ts — por isso não foi feito aqui de forma unilateral).
--
-- IDEMPOTENTE: DROP CONSTRAINT IF EXISTS antes do ADD; CREATE OR REPLACE na função.

------------------------------------------------------------
-- 1. CHECK da tabela passa a aceitar 'consumo'
------------------------------------------------------------

ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('entrada','saida','ajuste','transferencia','estorno','consumo'));

COMMENT ON COLUMN public.inventory_movements.movement_type IS
  'entrada | saida | ajuste | transferencia | estorno | consumo. "consumo" = material baixado pela finalização de uma OS (sempre com service_order_id preenchido); o par de correção dele é "estorno".';

------------------------------------------------------------
-- 2. register_inventory_movement (9 args) — mesma função da 20260814225028,
--    byte-a-byte a partir da definição VIVA, com 'consumo' somado à lista de tipos.
--    Nenhuma outra linha do corpo foi alterada.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_inventory_movement(
  p_inventory_id       uuid,
  p_movement_type      text,
  p_quantity           numeric,
  p_supplier_id        uuid    DEFAULT NULL,
  p_unit_cost          numeric DEFAULT NULL,
  p_notes              text    DEFAULT NULL,
  p_service_order_id   uuid    DEFAULT NULL,
  p_related_movement_id uuid   DEFAULT NULL,
  p_stock_id           uuid    DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_stock_id     uuid;
  v_stock_before numeric;
  v_stock_after  numeric;
  v_row          public.inventory_movements;
BEGIN
  IF p_movement_type NOT IN ('entrada','saida','ajuste','transferencia','estorno','consumo') THEN
    RAISE EXCEPTION 'Tipo de movimento invalido: %', p_movement_type USING ERRCODE = 'check_violation';
  END IF;

  -- empresa dona do item
  SELECT company_id INTO v_company_id FROM public.inventory WHERE id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- resolve estoque alvo: parametro ou default da empresa
  v_stock_id := p_stock_id;
  IF v_stock_id IS NULL THEN
    SELECT id INTO v_stock_id FROM public.stocks
     WHERE company_id = v_company_id AND is_default LIMIT 1;
    IF v_stock_id IS NULL THEN
      RAISE EXCEPTION 'Empresa % nao tem estoque principal definido', v_company_id USING ERRCODE = 'no_data_found';
    END IF;
  ELSE
    -- valida que o stock informado é da mesma empresa
    PERFORM 1 FROM public.stocks WHERE id = v_stock_id AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estoque de outra empresa: %', v_stock_id USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ACL: usuário restrito não pode movimentar local que não acessa
  IF NOT public.can_access_stock(auth.uid(), v_stock_id) THEN
    RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
  END IF;

  -- trava o level (cria com saldo 0 se ainda não existe) e lê saldo.
  -- movimento neste local = item passa a existir ali: is_present=true.
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  VALUES (v_company_id, p_inventory_id, v_stock_id, 0, true)
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = true;

  SELECT quantity INTO v_stock_before
    FROM public.inventory_stock_levels
   WHERE inventory_id = p_inventory_id AND stock_id = v_stock_id
   FOR UPDATE;

  v_stock_after := COALESCE(v_stock_before, 0) + p_quantity;

  UPDATE public.inventory_stock_levels
     SET quantity = v_stock_after
   WHERE inventory_id = p_inventory_id AND stock_id = v_stock_id;

  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, supplier_id, unit_cost,
    notes, service_order_id, related_movement_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, v_stock_id, p_movement_type, p_quantity,
    v_stock_before, v_stock_after, p_supplier_id, p_unit_cost,
    p_notes, p_service_order_id, p_related_movement_id, auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO authenticated, service_role;

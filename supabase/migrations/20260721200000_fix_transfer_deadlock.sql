-- Fix: deadlock em transferências reversas simultâneas na RPC transfer_stock_between
--
-- Problema: os dois SELECT ... FOR UPDATE eram feitos em queries separadas, na ordem
-- (p_from_stock, p_to_stock). Dois callers com direções opostas (A→B e B→A)
-- travavam cada um o seu lado e ficavam esperando o outro — deadlock. O Postgres
-- abortava uma das transações com erro 40P01.
--
-- Correção: adquirir os dois locks em uma ÚNICA query
--   WHERE inventory_id = p_inventory_id AND stock_id IN (p_from_stock, p_to_stock)
--   ORDER BY stock_id FOR UPDATE
-- Isso garante ordem estável por UUID, independente de qual é origem e qual é destino.
-- Sem regressão: toda a lógica de negócio, validações e gravações preservadas.
--
-- Melhoria adicional: retorno do caminho de idempotência agora devolve os DOIS
-- movimentos do par (o que tem client_request_id + o linkado por related_movement_id),
-- usando JOIN por related_movement_id.

CREATE OR REPLACE FUNCTION public.transfer_stock_between(
  p_inventory_id      uuid,
  p_from_stock        uuid,
  p_to_stock          uuid,
  p_qty               numeric,
  p_notes             text DEFAULT NULL,
  p_client_request_id text DEFAULT NULL
)
RETURNS SETOF public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id    uuid;
  v_user_company  uuid;
  v_from_before   numeric;
  v_to_before     numeric;
  v_from_after    numeric;
  v_to_after      numeric;
  v_mov_from      public.inventory_movements;
  v_mov_to        public.inventory_movements;
  -- lock em ordem estável por stock_id
  v_level         RECORD;
BEGIN
  -- Validações básicas -------------------------------------------------------
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade da transferencia deve ser positiva'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_from_stock = p_to_stock THEN
    RAISE EXCEPTION 'Estoque de origem e destino devem ser diferentes'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Empresa dona do item -----------------------------------------------------
  SELECT company_id INTO v_company_id
    FROM public.inventory
   WHERE id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotência: retorna o PAR se este client_request_id já foi processado ----
  -- Retorna o movimento que carrega o client_request_id E o seu par linkado
  -- por related_movement_id (bidirecional — qualquer um dos dois serve de âncora).
  IF p_client_request_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements
       WHERE company_id = v_company_id
         AND client_request_id = p_client_request_id
    ) THEN
      RETURN QUERY
        SELECT m.*
          FROM public.inventory_movements m
         WHERE m.company_id = v_company_id
           AND (
             m.client_request_id = p_client_request_id
             OR m.id = (
               SELECT related_movement_id
                 FROM public.inventory_movements
                WHERE company_id = v_company_id
                  AND client_request_id = p_client_request_id
                LIMIT 1
             )
           )
         ORDER BY m.quantity;  -- negativo (origem) antes do positivo (destino)
      RETURN;
    END IF;
  END IF;

  -- Valida que ambos os estoques são da empresa --------------------------------
  PERFORM 1 FROM public.stocks
   WHERE id = p_from_stock AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque de origem invalido/de outra empresa: %', p_from_stock
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.stocks
   WHERE id = p_to_stock AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque de destino invalido/de outra empresa: %', p_to_stock
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Garante que ambos os levels existem (cria com qty 0 se não existirem) -----
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity)
  VALUES (v_company_id, p_inventory_id, p_from_stock, 0)
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity)
  VALUES (v_company_id, p_inventory_id, p_to_stock, 0)
  ON CONFLICT (inventory_id, stock_id) DO NOTHING;

  -- LOCK ESTÁVEL: trava os dois levels em ÚNICA query ordenada por stock_id ----
  -- Independente de qual é from e qual é to, a ordem de aquisição dos locks
  -- é sempre a mesma (menor UUID primeiro), eliminando o deadlock circular.
  FOR v_level IN
    SELECT stock_id, quantity
      FROM public.inventory_stock_levels
     WHERE inventory_id = p_inventory_id
       AND stock_id IN (p_from_stock, p_to_stock)
     ORDER BY stock_id        -- ordem estável e determinística
     FOR UPDATE
  LOOP
    IF v_level.stock_id = p_from_stock THEN
      v_from_before := v_level.quantity;
    ELSE
      v_to_before := v_level.quantity;
    END IF;
  END LOOP;

  -- Valida saldo suficiente na origem ------------------------------------------
  IF COALESCE(v_from_before, 0) < p_qty THEN
    RAISE EXCEPTION 'Saldo insuficiente no estoque de origem: disponivel %, solicitado %',
      COALESCE(v_from_before, 0), p_qty
      USING ERRCODE = 'check_violation';
  END IF;

  v_from_after := v_from_before - p_qty;
  v_to_after   := COALESCE(v_to_before, 0) + p_qty;

  -- Atualiza os saldos ---------------------------------------------------------
  UPDATE public.inventory_stock_levels
     SET quantity = v_from_after
   WHERE inventory_id = p_inventory_id AND stock_id = p_from_stock;

  UPDATE public.inventory_stock_levels
     SET quantity = v_to_after
   WHERE inventory_id = p_inventory_id AND stock_id = p_to_stock;

  -- Movimento negativo na ORIGEM -----------------------------------------------
  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, notes, client_request_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, p_from_stock, 'transferencia', -p_qty,
    v_from_before, v_from_after, p_notes, p_client_request_id, auth.uid()
  )
  RETURNING * INTO v_mov_from;

  -- Movimento positivo no DESTINO, linkado ao de origem -----------------------
  -- client_request_id vai só no primeiro (unique parcial impede dois iguais);
  -- o segundo se liga por related_movement_id.
  INSERT INTO public.inventory_movements (
    inventory_id, company_id, stock_id, movement_type, quantity,
    stock_before, stock_after, notes, related_movement_id, created_by
  ) VALUES (
    p_inventory_id, v_company_id, p_to_stock, 'transferencia', p_qty,
    v_to_before, v_to_after, p_notes, v_mov_from.id, auth.uid()
  )
  RETURNING * INTO v_mov_to;

  -- Fecha o link bidirecional --------------------------------------------------
  UPDATE public.inventory_movements
     SET related_movement_id = v_mov_to.id
   WHERE id = v_mov_from.id;
  v_mov_from.related_movement_id := v_mov_to.id;

  RETURN NEXT v_mov_from;
  RETURN NEXT v_mov_to;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.transfer_stock_between(uuid, uuid, uuid, numeric, text, text)
  IS 'Transfere p_qty de um material entre dois estoques da mesma empresa, atomico e idempotente (p_client_request_id). Locks adquiridos em ordem estavel por stock_id (ORDER BY stock_id FOR UPDATE numa unica query) para evitar deadlock em transferencias reversas simultaneas. Grava par de movimentos transferencia (- na origem, + no destino) linkados por related_movement_id.';

GRANT EXECUTE ON FUNCTION public.transfer_stock_between(uuid, uuid, uuid, numeric, text, text)
  TO authenticated, service_role;

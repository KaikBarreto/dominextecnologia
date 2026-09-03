-- OS: consumo de materiais (rascunho na OS + baixa atômica na finalização)
--
-- POR QUE:
--   Hoje o técnico não tem onde registrar o que gastou na Ordem de Serviço. Quem
--   dá baixa é o escritório, na mão, no Estoque — sem elo com a OS. Resultado:
--   estoque sempre defasado e custo por OS impossível de apurar.
--
--   O fluxo aprovado (v1.22.0) separa em dois tempos:
--     (1) RASCUNHO — enquanto preenche a OS, o técnico lança os materiais em
--         service_order_materials. NÃO mexe no estoque. Pode errar, apagar, repetir.
--     (2) COMMIT — ao FINALIZAR, ele vê o resumo editável, corrige e confirma.
--         Só aí commit_os_material_consumption movimenta o estoque, gravando
--         movimento 'consumo' no Kardex já amarrado à OS.
--
--   A âncora que separa os dois tempos é a coluna committed_quantity: quanto
--   daquela linha JÁ foi para o estoque. Toda movimentação é o DELTA entre a
--   quantidade desejada e a já efetivada. É isso que torna o commit idempotente
--   (chamar duas vezes não duplica) e permite reabrir a OS, corrigir e reconfirmar
--   sem contar em dobro — o mesmo problema que já nos mordeu no PMOC (v1.19.2)
--   quando "substituir filhos" era delete-all + insert pelo client.
--
-- DECISÕES EXPLÍCITAS DO CEO GRAVADAS AQUI:
--   * Saldo negativo NÃO bloqueia. A OS nunca trava por causa de estoque: a RPC
--     devolve warnings[] e deixa passar (espelha register_inventory_movement, que
--     também não valida saldo).
--   * Feature entra DESLIGADA por empresa (company_settings.os_stock_consumption_enabled
--     default false): quem não pediu não ganha passo novo no fluxo do técnico.
--
-- IDEMPOTENTE: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS,
--   CREATE OR REPLACE FUNCTION, ADD COLUMN IF NOT EXISTS.

------------------------------------------------------------
-- 1. Tabela service_order_materials (rascunho de consumo por OS)
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_order_materials (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL,
  service_order_id   uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  inventory_id       uuid NOT NULL REFERENCES public.inventory(id)      ON DELETE RESTRICT,
  stock_id           uuid NOT NULL REFERENCES public.stocks(id)         ON DELETE RESTRICT,
  quantity           numeric NOT NULL CHECK (quantity > 0),
  committed_quantity numeric NOT NULL DEFAULT 0,
  unit_cost          numeric,
  notes              text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.service_order_materials IS
  'Materiais consumidos numa OS. Enquanto committed_quantity=0 é só rascunho (não mexeu no estoque). A baixa real acontece em commit_os_material_consumption, chamada na finalização da OS.';
COMMENT ON COLUMN public.service_order_materials.committed_quantity IS
  'Quanto desta linha JÁ foi efetivamente movimentado no estoque. Âncora de idempotência: movimento = quantity - committed_quantity. Reabrir e refinalizar a OS não conta em dobro.';
COMMENT ON COLUMN public.service_order_materials.unit_cost IS
  'Custo unitário congelado no PRIMEIRO commit da linha (cópia de inventory.cost_price daquele momento). Reusado nos commits seguintes, inclusive no estorno, para que devolução valorize igual ao consumo.';
COMMENT ON COLUMN public.service_order_materials.stock_id IS
  'Local de estoque de onde o material saiu. Se mudar entre um commit e outro, a RPC estorna no local antigo e consome no novo.';

-- SEM UNIQUE (service_order_id, inventory_id, stock_id): o mesmo material pode
-- aparecer em duas linhas de propósito (ex.: dois trechos do serviço, observações
-- diferentes). Agrupar é decisão de UI, não do banco.

CREATE INDEX IF NOT EXISTS idx_som_service_order ON public.service_order_materials(service_order_id);
CREATE INDEX IF NOT EXISTS idx_som_company       ON public.service_order_materials(company_id);
-- inventory_id indexado por causa do ON DELETE RESTRICT: sem índice, apagar um
-- material varre a tabela inteira para checar a FK.
CREATE INDEX IF NOT EXISTS idx_som_inventory     ON public.service_order_materials(inventory_id);

-- updated_at pela convenção do repo (update_updated_at_column)
DROP TRIGGER IF EXISTS set_service_order_materials_updated_at ON public.service_order_materials;
CREATE TRIGGER set_service_order_materials_updated_at
  BEFORE UPDATE ON public.service_order_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

------------------------------------------------------------
-- 2. RLS
--    SELECT: qualquer usuário da mesma empresa (o escritório precisa ver o que
--            o técnico lançou, mesmo não sendo o dono da OS).
--    INSERT/UPDATE/DELETE: mesma empresa E dono da OS (técnico, criador ou gestor)
--            — espelha a policy "Users can create movements for their OS" de
--            inventory_movements.
--
--    REGRA-LEI DE PERFORMANCE: toda chamada de função de auth nasce embrulhada em
--    (SELECT ...) para virar InitPlan (avaliada 1x por query em vez de por linha).
------------------------------------------------------------

ALTER TABLE public.service_order_materials ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_materials TO authenticated;
GRANT ALL ON public.service_order_materials TO service_role;

DROP POLICY IF EXISTS "service_order_materials_select_own_company" ON public.service_order_materials;
CREATE POLICY "service_order_materials_select_own_company" ON public.service_order_materials
  FOR SELECT TO authenticated
  USING (
    ( SELECT public.is_super_admin(auth.uid()) )
    OR company_id = ( SELECT public.get_user_company_id(auth.uid()) )
  );

DROP POLICY IF EXISTS "service_order_materials_insert_os_owner" ON public.service_order_materials;
CREATE POLICY "service_order_materials_insert_os_owner" ON public.service_order_materials
  FOR INSERT TO authenticated
  WITH CHECK (
    ( SELECT public.is_super_admin(auth.uid()) )
    OR (
      company_id = ( SELECT public.get_user_company_id(auth.uid()) )
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = service_order_materials.service_order_id
           AND (
             so.technician_id = ( SELECT auth.uid() )
             OR so.created_by = ( SELECT auth.uid() )
             OR ( SELECT public.can_manage_system(auth.uid()) )
           )
      )
    )
  );

DROP POLICY IF EXISTS "service_order_materials_update_os_owner" ON public.service_order_materials;
CREATE POLICY "service_order_materials_update_os_owner" ON public.service_order_materials
  FOR UPDATE TO authenticated
  USING (
    ( SELECT public.is_super_admin(auth.uid()) )
    OR (
      company_id = ( SELECT public.get_user_company_id(auth.uid()) )
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = service_order_materials.service_order_id
           AND (
             so.technician_id = ( SELECT auth.uid() )
             OR so.created_by = ( SELECT auth.uid() )
             OR ( SELECT public.can_manage_system(auth.uid()) )
           )
      )
    )
  )
  WITH CHECK (
    ( SELECT public.is_super_admin(auth.uid()) )
    OR (
      company_id = ( SELECT public.get_user_company_id(auth.uid()) )
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = service_order_materials.service_order_id
           AND (
             so.technician_id = ( SELECT auth.uid() )
             OR so.created_by = ( SELECT auth.uid() )
             OR ( SELECT public.can_manage_system(auth.uid()) )
           )
      )
    )
  );

DROP POLICY IF EXISTS "service_order_materials_delete_os_owner" ON public.service_order_materials;
CREATE POLICY "service_order_materials_delete_os_owner" ON public.service_order_materials
  FOR DELETE TO authenticated
  USING (
    ( SELECT public.is_super_admin(auth.uid()) )
    OR (
      company_id = ( SELECT public.get_user_company_id(auth.uid()) )
      AND EXISTS (
        SELECT 1 FROM public.service_orders so
         WHERE so.id = service_order_materials.service_order_id
           AND (
             so.technician_id = ( SELECT auth.uid() )
             OR so.created_by = ( SELECT auth.uid() )
             OR ( SELECT public.can_manage_system(auth.uid()) )
           )
      )
    )
  );

------------------------------------------------------------
-- 3. RPC commit_os_material_consumption(p_service_order_id, p_lines)
--    Sincroniza o rascunho com o payload da tela de finalização E movimenta o
--    estoque, tudo numa transação só.
--
--    SECURITY DEFINER: a RPC precisa gravar em service_order_materials e chamar
--    register_inventory_movement de forma atômica. Como SECURITY DEFINER NÃO é
--    coberto por RLS (lição da v1.19.9), TODOS os predicados são reaplicados no
--    corpo: empresa da OS, posse da OS, empresa do material/local e can_access_stock.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_os_material_consumption(
  p_service_order_id uuid,
  p_lines            jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_is_super     boolean;
  v_can_manage   boolean;
  v_user_company uuid;
  v_so           record;

  v_line         jsonb;
  v_op           jsonb;
  v_ops          jsonb := '[]'::jsonb;
  v_keep         uuid[] := ARRAY[]::uuid[];

  v_line_id      uuid;
  v_inv          uuid;
  v_stock        uuid;
  v_stock_name   text;
  v_qty          numeric;
  v_notes        text;
  v_inv_changed  boolean;

  v_row          public.service_order_materials%ROWTYPE;
  v_row_id       uuid;
  v_target       numeric;
  v_delta        numeric;
  v_cost         numeric;
  v_type         text;
  v_mov_notes    text;
  v_mov          public.inventory_movements;

  v_committed    jsonb := '[]'::jsonb;
  v_warnings     jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente para registrar o consumo de materiais.'
      USING ERRCODE = '42501';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Lista de materiais inválida.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_is_super     := public.is_super_admin(v_uid);
  v_can_manage   := public.can_manage_system(v_uid);
  v_user_company := public.get_user_company_id(v_uid);

  -- Mutex por OS: duplo clique / duas abas esperam a primeira terminar.
  -- Advisory lock (e não FOR UPDATE na OS) para não travar quem só está editando a OS.
  PERFORM pg_advisory_xact_lock(hashtext('commit_os_material_consumption:' || p_service_order_id::text));

  SELECT so.id, so.company_id, so.technician_id, so.created_by, so.order_number
    INTO v_so
    FROM public.service_orders so
   WHERE so.id = p_service_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem de serviço não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Guard 1: isolamento por empresa
  IF NOT (v_is_super OR v_so.company_id = v_user_company) THEN
    RAISE EXCEPTION 'Acesso negado: esta ordem de serviço é de outra empresa.'
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: posse da OS (espelha a policy de inventory_movements)
  IF NOT (v_is_super OR v_can_manage OR v_so.technician_id = v_uid OR v_so.created_by = v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: apenas o técnico responsável, quem criou a ordem de serviço ou um gestor pode registrar o consumo de materiais.'
      USING ERRCODE = '42501';
  END IF;

  -- Trava as linhas já existentes desta OS (protege contra chamada concorrente).
  PERFORM 1 FROM public.service_order_materials
   WHERE service_order_id = p_service_order_id
   FOR UPDATE;

  ----------------------------------------------------------
  -- PASSO A — valida o payload inteiro ANTES de mexer em qualquer coisa.
  ----------------------------------------------------------
  FOR v_line IN SELECT elem FROM jsonb_array_elements(p_lines) AS elem LOOP
    IF jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'Lista de materiais inválida.' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_line_id := NULLIF(v_line->>'id', '')::uuid;
    v_inv     := NULLIF(v_line->>'inventory_id', '')::uuid;
    v_stock   := NULLIF(v_line->>'stock_id', '')::uuid;
    v_qty     := NULLIF(v_line->>'quantity', '')::numeric;

    IF v_inv IS NULL OR v_stock IS NULL THEN
      RAISE EXCEPTION 'Informe o material e o local de estoque de cada item.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'A quantidade de cada material precisa ser maior que zero.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_line_id IS NOT NULL AND v_line_id = ANY(v_keep) THEN
      RAISE EXCEPTION 'O mesmo item de material foi enviado duas vezes.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- material da MESMA empresa da OS
    PERFORM 1 FROM public.inventory i
      WHERE i.id = v_inv AND i.company_id = v_so.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Material não encontrado no estoque desta empresa.'
        USING ERRCODE = '42501';
    END IF;

    -- local da MESMA empresa da OS
    SELECT s.name INTO v_stock_name
      FROM public.stocks s
     WHERE s.id = v_stock AND s.company_id = v_so.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Local de estoque não encontrado nesta empresa.'
        USING ERRCODE = '42501';
    END IF;

    -- ACL por local (a mesma de can_access_stock; RLS não cobre SECURITY DEFINER)
    IF NOT public.can_access_stock(v_uid, v_stock) THEN
      RAISE EXCEPTION 'Acesso negado: você não tem permissão no local de estoque "%".', v_stock_name
        USING ERRCODE = '42501';
    END IF;

    -- linha existente precisa ser DESTA OS
    IF v_line_id IS NOT NULL THEN
      PERFORM 1 FROM public.service_order_materials m
        WHERE m.id = v_line_id AND m.service_order_id = p_service_order_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Um dos itens não pertence a esta ordem de serviço.'
          USING ERRCODE = '42501';
      END IF;
      v_keep := v_keep || v_line_id;
    END IF;
  END LOOP;

  ----------------------------------------------------------
  -- PASSO B — sincroniza o rascunho e monta a fila de operações de estoque.
  --   Cada operação = (linha, material, local, quantidade ALVO). O movimento real
  --   sai do delta contra committed_quantity no momento da execução.
  ----------------------------------------------------------

  -- B1. linha que existe no banco e não veio no payload = removida → alvo 0 e apaga
  FOR v_row IN
    SELECT * FROM public.service_order_materials
     WHERE service_order_id = p_service_order_id
       AND NOT (id = ANY(v_keep))
     ORDER BY created_at
  LOOP
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'row_id',       v_row.id,
      'inventory_id', v_row.inventory_id,
      'stock_id',     v_row.stock_id,
      'target',       0::numeric,
      'unit_cost',    v_row.unit_cost,
      'notes',        v_row.notes,
      'delete_after', true
    ));
  END LOOP;

  -- B2. linhas do payload (novas e existentes)
  FOR v_line IN SELECT elem FROM jsonb_array_elements(p_lines) AS elem LOOP
    v_line_id := NULLIF(v_line->>'id', '')::uuid;
    v_inv     := NULLIF(v_line->>'inventory_id', '')::uuid;
    v_stock   := NULLIF(v_line->>'stock_id', '')::uuid;
    v_qty     := NULLIF(v_line->>'quantity', '')::numeric;
    v_notes   := NULLIF(btrim(COALESCE(v_line->>'notes', '')), '');

    IF v_line_id IS NULL THEN
      -- linha nova criada direto no resumo de finalização
      INSERT INTO public.service_order_materials (
        company_id, service_order_id, inventory_id, stock_id,
        quantity, committed_quantity, notes, created_by
      ) VALUES (
        v_so.company_id, p_service_order_id, v_inv, v_stock,
        v_qty, 0, v_notes, v_uid
      )
      RETURNING * INTO v_row;
    ELSE
      SELECT * INTO v_row FROM public.service_order_materials
       WHERE id = v_line_id FOR UPDATE;

      -- Trocou de material ou de local com quantidade já movimentada?
      -- Estorna TUDO no par antigo antes de reapontar a linha — senão o saldo
      -- voltaria no lugar errado.
      IF v_row.inventory_id IS DISTINCT FROM v_inv OR v_row.stock_id IS DISTINCT FROM v_stock THEN
        v_inv_changed := (v_row.inventory_id IS DISTINCT FROM v_inv);

        IF v_row.committed_quantity <> 0 THEN
          v_ops := v_ops || jsonb_build_array(jsonb_build_object(
            'row_id',       v_row.id,
            'inventory_id', v_row.inventory_id,
            'stock_id',     v_row.stock_id,
            'target',       0::numeric,
            'unit_cost',    v_row.unit_cost,
            'notes',        v_row.notes,
            'delete_after', false
          ));
        END IF;

        UPDATE public.service_order_materials
           SET inventory_id = v_inv,
               stock_id     = v_stock,
               -- material novo = custo tem que reancorar no cost_price dele
               unit_cost    = CASE WHEN v_inv_changed THEN NULL ELSE unit_cost END
         WHERE id = v_row.id
        RETURNING * INTO v_row;
      END IF;

      UPDATE public.service_order_materials
         SET quantity = v_qty,
             notes    = v_notes
       WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;

    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'row_id',       v_row.id,
      'inventory_id', v_inv,
      'stock_id',     v_stock,
      'target',       v_qty,
      'unit_cost',    NULL,           -- null = usa o unit_cost já gravado na linha
      'notes',        v_notes,
      'delete_after', false
    ));
  END LOOP;

  ----------------------------------------------------------
  -- PASSO C — executa a fila: delta → movimento → atualiza a âncora.
  ----------------------------------------------------------
  FOR v_op IN SELECT elem FROM jsonb_array_elements(v_ops) AS elem LOOP
    v_row_id := (v_op->>'row_id')::uuid;
    v_inv    := (v_op->>'inventory_id')::uuid;
    v_stock  := (v_op->>'stock_id')::uuid;
    v_target := (v_op->>'target')::numeric;

    SELECT * INTO v_row FROM public.service_order_materials WHERE id = v_row_id FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE; -- defensivo: linha sumiu no meio do caminho
    END IF;

    v_delta := v_target - COALESCE(v_row.committed_quantity, 0);

    IF v_delta <> 0 THEN
      -- Custo: congela no PRIMEIRO commit e reusa depois (inclusive no estorno),
      -- para devolução valorizar exatamente igual ao consumo.
      v_cost := COALESCE((v_op->>'unit_cost')::numeric, v_row.unit_cost);
      IF v_cost IS NULL THEN
        SELECT i.cost_price INTO v_cost FROM public.inventory i WHERE i.id = v_inv;
        UPDATE public.service_order_materials
           SET unit_cost = v_cost
         WHERE id = v_row_id AND unit_cost IS NULL;
      END IF;

      v_type := CASE WHEN v_delta > 0 THEN 'consumo' ELSE 'estorno' END;

      v_mov_notes := CASE WHEN v_delta > 0
                          THEN 'Consumo na OS #'
                          ELSE 'Estorno de consumo na OS #'
                     END
                     || v_so.order_number::text
                     || COALESCE(' — ' || NULLIF(btrim(COALESCE(v_op->>'notes', '')), ''), '');

      SELECT * INTO v_mov FROM public.register_inventory_movement(
        p_inventory_id        => v_inv,
        p_movement_type       => v_type,
        -- consumo sai do estoque (delta negativo); estorno devolve (positivo)
        p_quantity            => CASE WHEN v_delta > 0 THEN -v_delta ELSE abs(v_delta) END,
        p_supplier_id         => NULL,
        p_unit_cost           => v_cost,
        p_notes               => v_mov_notes,
        p_service_order_id    => p_service_order_id,
        p_related_movement_id => NULL,
        p_stock_id            => v_stock
      );

      v_committed := v_committed || jsonb_build_array(jsonb_build_object(
        'line_id',       v_row_id,
        'inventory_id',  v_inv,
        'stock_id',      v_stock,
        'movement_id',   v_mov.id,
        'movement_type', v_type,
        'quantity',      abs(v_delta),
        'stock_after',   v_mov.stock_after
      ));

      -- Saldo negativo NÃO é erro (decisão do CEO): avisa e segue.
      IF v_mov.stock_after < 0 THEN
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'line_id',            v_row_id,
          'inventory_id',       v_inv,
          'stock_id',           v_stock,
          'resulting_quantity', v_mov.stock_after,
          'reason',             'saldo_negativo'
        ));
      END IF;
    END IF;

    UPDATE public.service_order_materials
       SET committed_quantity = v_target
     WHERE id = v_row_id;

    IF COALESCE((v_op->>'delete_after')::boolean, false) THEN
      DELETE FROM public.service_order_materials WHERE id = v_row_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('committed', v_committed, 'warnings', v_warnings);
END;
$$;

COMMENT ON FUNCTION public.commit_os_material_consumption(uuid, jsonb) IS
  'Confirma o consumo de materiais de uma OS: sincroniza service_order_materials com o payload e movimenta o estoque pelo DELTA contra committed_quantity (consumo/estorno via register_inventory_movement, sempre com service_order_id). Idempotente: mesmo payload duas vezes não gera movimento na segunda. Saldo negativo passa e volta em warnings[].';

-- Default privilege do schema public deste projeto concede EXECUTE a anon/authenticated:
-- REVOKE de PUBLIC sozinho NÃO basta, o de anon precisa ser explícito.
REVOKE ALL ON FUNCTION public.commit_os_material_consumption(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_os_material_consumption(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_os_material_consumption(uuid, jsonb) TO authenticated, service_role;

------------------------------------------------------------
-- 4. Toggle por empresa (feature nasce desligada)
------------------------------------------------------------

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS os_stock_consumption_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.os_stock_consumption_enabled IS
  'Liga o passo de consumo de materiais dentro da OS (lançamento pelo técnico + baixa na finalização). Default false: quem não pediu a feature não ganha passo novo no fluxo.';

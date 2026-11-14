-- Cadastro seguro dos caixas da loja.
--
-- Antes desta migration, a demo funcionava porque ja possuia linhas em
-- pdv_terminals, mas uma empresa nova ficava sem caminho para cadastrar o
-- primeiro caixa. A tabela tambem aceitava escrita direta de qualquer usuario
-- autenticado do tenant. A partir daqui, a manutencao passa exclusivamente por
-- RPC com permissao explicita de Configuracoes do PDV.
BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_list_cash_terminals_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', terminal.id,
        'name', terminal.name,
        'stock_id', terminal.stock_id
      )
      ORDER BY terminal.sort_order, terminal.name, terminal.id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.pdv_terminals terminal
  WHERE terminal.company_id = v_context.company_id
    AND terminal.is_active IS TRUE
    AND terminal.stock_id IS NOT NULL;

  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_list_cash_terminals_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_cash_terminals_v2() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_list_cash_terminal_settings_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2(
      'screen:pdv_settings',
      NULL,
      false
    );

  RETURN jsonb_build_object(
    'terminals', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', terminal.id,
            'name', terminal.name,
            'stock_id', terminal.stock_id,
            'is_active', terminal.is_active,
            'sort_order', terminal.sort_order
          )
          ORDER BY terminal.sort_order, terminal.name, terminal.id
        ),
        '[]'::jsonb
      )
      FROM public.pdv_terminals terminal
      WHERE terminal.company_id = v_context.company_id
    ),
    'stocks', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', stock.id,
            'name', stock.name,
            'purpose', stock.purpose,
            'is_default', stock.is_default
          )
          ORDER BY stock.is_default DESC, stock.sort_order, stock.name, stock.id
        ),
        '[]'::jsonb
      )
      FROM public.stocks stock
      WHERE stock.company_id = v_context.company_id
        AND stock.customer_id IS NULL
    )
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_list_cash_terminal_settings_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_cash_terminal_settings_v2() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_save_cash_terminal_v2(
  p_terminal_id uuid,
  p_name text,
  p_stock_id uuid,
  p_is_active boolean,
  p_sort_order integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_terminal public.pdv_terminals%ROWTYPE;
  v_name text := btrim(COALESCE(p_name, ''));
  v_sort_order integer;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2(
      'screen:pdv_settings',
      'fn:manage_pdv_settings',
      false
    );

  IF char_length(v_name) < 2 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'Informe um nome de caixa entre 2 e 80 caracteres.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_terminal_name_invalid';
  END IF;
  IF p_stock_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o local de estoque deste caixa.'
      USING ERRCODE = '23502', DETAIL = 'code=pdv_terminal_stock_required';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Informe se o caixa esta ativo.'
      USING ERRCODE = '23502', DETAIL = 'code=pdv_terminal_active_required';
  END IF;
  IF p_sort_order IS NOT NULL AND (p_sort_order < 0 OR p_sort_order > 100000) THEN
    RAISE EXCEPTION 'A ordem do caixa e invalida.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_terminal_sort_order_invalid';
  END IF;

  -- O lock impede que o local mude de empresa/finalidade entre a validacao e
  -- a gravacao do terminal. Estoque de cliente nunca pode abastecer o PDV.
  PERFORM 1
    FROM public.stocks stock
   WHERE stock.id = p_stock_id
     AND stock.company_id = v_context.company_id
     AND stock.customer_id IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O local de estoque selecionado nao esta disponivel nesta empresa.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_terminal_stock_not_found';
  END IF;

  -- Escolher um local para o caixa e a confirmacao explicita de que ele passa
  -- a operar como estoque de loja. Isso preserva os saldos existentes e evita
  -- criar um deposito vazio so para destravar a abertura.
  UPDATE public.stocks
     SET purpose = 'pdv'
   WHERE id = p_stock_id
     AND company_id = v_context.company_id
     AND purpose IS DISTINCT FROM 'pdv';

  IF p_terminal_id IS NULL THEN
    SELECT COALESCE(p_sort_order, COALESCE(MAX(terminal.sort_order), 0) + 1)
      INTO v_sort_order
      FROM public.pdv_terminals terminal
     WHERE terminal.company_id = v_context.company_id;
  ELSE
    SELECT terminal.* INTO v_terminal
      FROM public.pdv_terminals terminal
     WHERE terminal.id = p_terminal_id
       AND terminal.company_id = v_context.company_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O caixa selecionado nao foi encontrado nesta empresa.'
        USING ERRCODE = 'P0002', DETAIL = 'code=pdv_terminal_not_found';
    END IF;
    v_sort_order := COALESCE(p_sort_order, v_terminal.sort_order);
  END IF;

  IF p_is_active AND EXISTS (
    SELECT 1
      FROM public.pdv_terminals terminal
     WHERE terminal.company_id = v_context.company_id
       AND terminal.id IS DISTINCT FROM p_terminal_id
       AND terminal.is_active IS TRUE
       AND lower(btrim(terminal.name)) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'Ja existe um caixa ativo com este nome.'
      USING ERRCODE = '23505', DETAIL = 'code=pdv_terminal_name_conflict';
  END IF;

  IF p_terminal_id IS NOT NULL
     AND (NOT p_is_active OR v_terminal.stock_id IS DISTINCT FROM p_stock_id)
     AND EXISTS (
       SELECT 1
         FROM public.pdv_cash_sessions session
        WHERE session.company_id = v_context.company_id
          AND session.terminal_id = p_terminal_id
          AND session.status = 'aberta'
     ) THEN
    RAISE EXCEPTION 'Feche o caixa antes de trocar o local de estoque ou desativa-lo.'
      USING ERRCODE = '23514', DETAIL = 'code=pdv_terminal_open_session';
  END IF;

  IF p_terminal_id IS NULL THEN
    INSERT INTO public.pdv_terminals (
      company_id,
      name,
      stock_id,
      is_active,
      sort_order
    ) VALUES (
      v_context.company_id,
      v_name,
      p_stock_id,
      p_is_active,
      v_sort_order
    )
    RETURNING * INTO v_terminal;
  ELSE
    UPDATE public.pdv_terminals terminal
       SET name = v_name,
           stock_id = p_stock_id,
           is_active = p_is_active,
           sort_order = v_sort_order
     WHERE terminal.id = p_terminal_id
       AND terminal.company_id = v_context.company_id
    RETURNING terminal.* INTO v_terminal;
  END IF;

  RETURN jsonb_build_object(
    'id', v_terminal.id,
    'name', v_terminal.name,
    'stock_id', v_terminal.stock_id,
    'is_active', v_terminal.is_active,
    'sort_order', v_terminal.sort_order
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_save_cash_terminal_v2(uuid, text, uuid, boolean, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_save_cash_terminal_v2(uuid, text, uuid, boolean, integer)
  TO authenticated, service_role;

-- A posse por tenant continua protegendo SELECT para o hook legado. Escrita de
-- caixa agora e somente pelas RPCs acima, que tambem exigem assinatura, modulo,
-- tela e acao explicita.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pdv_terminals FROM authenticated;
GRANT SELECT ON TABLE public.pdv_terminals TO authenticated;

COMMENT ON FUNCTION public.pdv_list_cash_terminal_settings_v2() IS
  'Lista caixas e locais gerais da empresa para Configuracoes do PDV, exigindo permissao explicita de gestao.';
COMMENT ON FUNCTION public.pdv_save_cash_terminal_v2(uuid, text, uuid, boolean, integer) IS
  'Cria, edita ou desativa caixa da propria empresa; valida permissao, local geral e sessao aberta.';

COMMIT;

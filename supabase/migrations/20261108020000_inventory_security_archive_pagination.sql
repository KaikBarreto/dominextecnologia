-- Fechamento P0 do estoque: permissao funcional, escrita por wrappers e
-- arquivamento auditavel. As primitivas antigas continuam disponiveis para
-- funcoes SECURITY DEFINER internas, mas deixam de ser chamaveis diretamente
-- pela role authenticated.
BEGIN;

CREATE OR REPLACE FUNCTION public.inventory_user_can_read_v3(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT p_user IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM public.profiles profile
       WHERE profile.user_id=p_user AND profile.is_active IS TRUE
         AND public.tenant_subscription_allows_access(profile.company_id) IS TRUE
    )
    AND (
      public.is_admin_or_gestor(p_user)
      OR public.is_super_admin(p_user)
      OR public.has_full_permissions(p_user)
      OR public.user_has_permission(p_user,'screen:inventory')
      OR public.user_has_permission(p_user,'screen:service_orders')
      OR public.user_has_permission(p_user,'screen:customers')
      OR (
        public.company_has_module(public.get_user_company_id(p_user),'pdv') IS TRUE
        AND (
          public.user_has_permission(p_user,'screen:pdv')
          OR public.user_has_permission(p_user,'screen:pdv_orders')
          OR public.user_has_permission(p_user,'screen:pdv_dispatch')
        )
      )
    );
$fn$;

CREATE OR REPLACE FUNCTION public.inventory_user_can_manage_v3(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  SELECT public.inventory_user_can_read_v3(p_user)
    AND (
      public.is_admin_or_gestor(p_user)
      OR public.is_super_admin(p_user)
      OR public.has_full_permissions(p_user)
      OR (
        public.user_has_permission(p_user,'screen:inventory')
        AND public.user_has_permission(p_user,'fn:manage_inventory')
      )
    );
$fn$;

REVOKE ALL ON FUNCTION public.inventory_user_can_read_v3(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.inventory_user_can_manage_v3(uuid) FROM PUBLIC,anon;
-- A role autenticada precisa executar os predicados usados pelas policies.
-- SECURITY DEFINER impede que ela ganhe leitura direta de profiles/permissoes.
GRANT EXECUTE ON FUNCTION public.inventory_user_can_read_v3(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.inventory_user_can_manage_v3(uuid) TO authenticated,service_role;

-- A policy antiga era FOR ALL por tenant. Separamos leitura e escrita e
-- removemos DELETE da superficie autenticada: material operacional se arquiva.
DO $policies$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
     WHERE schemaname='public' AND tablename='inventory'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory',policy_row.policyname);
  END LOOP;
END
$policies$;

CREATE POLICY inventory_read_authorized_v3 ON public.inventory
  FOR SELECT TO authenticated
  USING (
    public.inventory_user_can_read_v3(auth.uid())
    AND (company_id=public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY inventory_insert_authorized_v3 ON public.inventory
  FOR INSERT TO authenticated
  WITH CHECK (
    public.inventory_user_can_manage_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
  );

CREATE POLICY inventory_update_authorized_v3 ON public.inventory
  FOR UPDATE TO authenticated
  USING (
    public.inventory_user_can_manage_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    public.inventory_user_can_manage_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
  );

REVOKE DELETE ON public.inventory FROM authenticated;

-- Saldos/minimos continuam legiveis somente nos locais autorizados. Escrita
-- direta fica limitada a gestores de estoque; os guards existentes impedem
-- alterar quantidade fora das primitivas canonicas.
DO $policies$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
     WHERE schemaname='public' AND tablename='inventory_stock_levels'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_stock_levels',policy_row.policyname);
  END LOOP;
END
$policies$;

CREATE POLICY inventory_stock_levels_read_authorized_v3 ON public.inventory_stock_levels
  FOR SELECT TO authenticated
  USING (
    public.inventory_user_can_read_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
    AND public.can_access_stock(auth.uid(),stock_id)
  );

CREATE POLICY inventory_stock_levels_insert_authorized_v3 ON public.inventory_stock_levels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.inventory_user_can_manage_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
    AND public.can_access_stock(auth.uid(),stock_id)
  );

CREATE POLICY inventory_stock_levels_update_authorized_v3 ON public.inventory_stock_levels
  FOR UPDATE TO authenticated
  USING (
    public.inventory_user_can_manage_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
    AND public.can_access_stock(auth.uid(),stock_id)
  )
  WITH CHECK (
    public.inventory_user_can_manage_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
    AND public.can_access_stock(auth.uid(),stock_id)
  );

REVOKE DELETE ON public.inventory_stock_levels FROM authenticated;

-- Kardex e imutavel pela API. Funcoes internas proprietarias continuam
-- inserindo apos validar o contexto comercial/OS correspondente.
DO $policies$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname FROM pg_policies
     WHERE schemaname='public' AND tablename='inventory_movements'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inventory_movements',policy_row.policyname);
  END LOOP;
END
$policies$;

CREATE POLICY inventory_movements_read_authorized_v3 ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (
    public.inventory_user_can_read_v3(auth.uid())
    AND company_id=public.get_user_company_id(auth.uid())
    AND public.can_access_stock(auth.uid(),stock_id)
  );

REVOKE INSERT,UPDATE,DELETE ON public.inventory_movements FROM authenticated;

-- Wrapper unico para movimentacao manual do navegador. A primitiva antiga
-- permanece executavel pelo owner/service_role para PDV, OS, devolucao e O.C.
CREATE OR REPLACE FUNCTION public.inventory_register_manual_movement_v3(
  p_inventory_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_supplier_id uuid DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_service_order_id uuid DEFAULT NULL,
  p_related_movement_id uuid DEFAULT NULL,
  p_stock_id uuid DEFAULT NULL
)
RETURNS public.inventory_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE
  v_user uuid:=auth.uid();
  v_company uuid;
  v_inventory_company uuid;
  v_stock uuid;
  v_stock_company uuid;
  v_stock_customer uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=inventory_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O acesso ao estoque desta empresa está indisponível.'
      USING ERRCODE='42501',DETAIL='code=inventory_company_denied';
  END IF;
  IF public.inventory_user_can_manage_v3(v_user) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para movimentar o estoque.'
      USING ERRCODE='42501',DETAIL='code=inventory_manage_denied';
  END IF;
  SELECT inventory.company_id INTO v_inventory_company
    FROM public.inventory inventory
   WHERE inventory.id=p_inventory_id AND inventory.customer_id IS NULL;
  IF v_inventory_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'O material não pertence a esta empresa.'
      USING ERRCODE='42501',DETAIL='code=inventory_tenant_denied';
  END IF;
  v_stock:=p_stock_id;
  IF v_stock IS NULL THEN
    SELECT stock.id INTO v_stock FROM public.stocks stock
     WHERE stock.company_id=v_company AND stock.customer_id IS NULL AND stock.is_default
     ORDER BY stock.id LIMIT 1;
  END IF;
  SELECT stock.company_id,stock.customer_id INTO v_stock_company,v_stock_customer
    FROM public.stocks stock WHERE stock.id=v_stock;
  IF v_stock IS NULL
     OR v_stock_company IS DISTINCT FROM v_company
     OR v_stock_customer IS NOT NULL
     OR public.can_access_stock(v_user,v_stock) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de estoque informado.'
      USING ERRCODE='42501',DETAIL='code=inventory_stock_denied';
  END IF;
  RETURN public.register_inventory_movement(
    p_inventory_id,p_movement_type,p_quantity,p_supplier_id,p_unit_cost,p_notes,
    p_service_order_id,p_related_movement_id,v_stock
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.inventory_register_manual_movement_v3(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_register_manual_movement_v3(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)
  TO authenticated,service_role;

-- Recebimento de O.C. ganha um wrapper com permissao e ACL do local antes de
-- chamar a implementacao atomica legada. Chamadas internas continuam pelo owner.
CREATE OR REPLACE FUNCTION public.inventory_receive_purchase_order_v3(
  p_ordem_id uuid,
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE
  v_user uuid:=auth.uid();
  v_company uuid;
  v_order_company uuid;
  v_stock uuid;
  v_stock_company uuid;
  v_stock_customer uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=inventory_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE
     OR public.inventory_user_can_manage_v3(v_user) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para receber esta ordem de compra.'
      USING ERRCODE='42501',DETAIL='code=inventory_purchase_receipt_denied';
  END IF;
  SELECT purchase_order.company_id,purchase.stock_id
    INTO v_order_company,v_stock
    FROM public.compra_ordens purchase_order
    JOIN public.compras purchase ON purchase.id=purchase_order.compra_id
   WHERE purchase_order.id=p_ordem_id;
  IF v_order_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'A ordem de compra não pertence a esta empresa.'
      USING ERRCODE='42501',DETAIL='code=inventory_purchase_tenant_denied';
  END IF;
  IF v_stock IS NULL THEN
    SELECT stock.id INTO v_stock FROM public.stocks stock
     WHERE stock.company_id=v_company AND stock.customer_id IS NULL AND stock.is_default
     ORDER BY stock.id LIMIT 1;
  END IF;
  SELECT stock.company_id,stock.customer_id INTO v_stock_company,v_stock_customer
    FROM public.stocks stock WHERE stock.id=v_stock;
  IF v_stock IS NULL
     OR v_stock_company IS DISTINCT FROM v_company
     OR v_stock_customer IS NOT NULL
     OR public.can_access_stock(v_user,v_stock) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de recebimento.'
      USING ERRCODE='42501',DETAIL='code=inventory_purchase_stock_denied';
  END IF;
  RETURN public.receber_ordem_compra(p_ordem_id,p_itens);
END
$fn$;

REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.inventory_receive_purchase_order_v3(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_receive_purchase_order_v3(uuid,jsonb) TO authenticated,service_role;

-- Arquivamento preserva cadastro, custos e Kardex. Materiais com saldo,
-- reserva, orcamento ativo ou recebimento pendente precisam ser resolvidos antes.
CREATE OR REPLACE FUNCTION public.inventory_set_archived_v3(
  p_inventory_id uuid,
  p_archived boolean
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_user uuid:=auth.uid();
  v_company uuid;
  v_item public.inventory%ROWTYPE;
  v_archived_at timestamptz;
BEGIN
  IF v_user IS NULL OR public.inventory_user_can_manage_v3(v_user) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para arquivar materiais.'
      USING ERRCODE='42501',DETAIL='code=inventory_archive_denied';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  SELECT * INTO v_item FROM public.inventory inventory
   WHERE inventory.id=p_inventory_id AND inventory.company_id=v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado.'
      USING ERRCODE='P0002',DETAIL='code=inventory_not_found';
  END IF;
  IF p_archived IS TRUE THEN
    IF EXISTS(SELECT 1 FROM public.inventory_stock_levels level
      WHERE level.inventory_id=p_inventory_id AND level.quantity<>0) THEN
      RAISE EXCEPTION 'Zere ou transfira o saldo antes de arquivar este material.'
        USING ERRCODE='23514',DETAIL='code=inventory_archive_has_balance';
    END IF;
    IF EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items reservation
      WHERE reservation.inventory_id=p_inventory_id AND reservation.state IN('guaranteed','conflict')) THEN
      RAISE EXCEPTION 'Este material possui uma reserva ativa e não pode ser arquivado.'
        USING ERRCODE='23514',DETAIL='code=inventory_archive_has_reservation';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.pdv_preorder_items item
      JOIN public.pdv_preorders preorder ON preorder.id=item.preorder_id
      WHERE item.inventory_id=p_inventory_id AND preorder.status IN('edicao','encaminhado')
    ) THEN
      RAISE EXCEPTION 'Este material está em um orçamento ativo e não pode ser arquivado.'
        USING ERRCODE='23514',DETAIL='code=inventory_archive_has_preorder';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.compra_ordem_itens item
      JOIN public.compra_ordens purchase_order ON purchase_order.id=item.ordem_id
      WHERE item.inventory_id=p_inventory_id
        AND purchase_order.status IN('rascunho','enviada','recebida_parcial')
        AND item.quantity_received<item.quantity_ordered
    ) THEN
      RAISE EXCEPTION 'Este material possui recebimento de compra pendente.'
        USING ERRCODE='23514',DETAIL='code=inventory_archive_has_purchase';
    END IF;
    v_archived_at:=COALESCE(v_item.archived_at,now());
  ELSE
    v_archived_at:=NULL;
  END IF;
  UPDATE public.inventory SET archived_at=v_archived_at WHERE id=p_inventory_id;
  RETURN v_archived_at;
END
$fn$;

REVOKE ALL ON FUNCTION public.inventory_set_archived_v3(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_set_archived_v3(uuid,boolean) TO authenticated,service_role;

-- archived_at nunca pode ser escrito diretamente pelo navegador, pois isso
-- contornaria as validacoes de saldo/reserva/compra da RPC acima.
CREATE OR REPLACE FUNCTION public.inventory_guard_archive_write_v3()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF current_user NOT IN ('postgres','service_role')
     AND OLD.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Material arquivado não pode ser alterado. Desarquive antes de editar.'
      USING ERRCODE='23514',DETAIL='code=inventory_archived_read_only';
  END IF;
  IF current_user NOT IN ('postgres','service_role')
     AND NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    RAISE EXCEPTION 'Registre uma movimentação para alterar o saldo.'
      USING ERRCODE='42501',DETAIL='code=inventory_quantity_rpc_required';
  END IF;
  IF current_user NOT IN ('postgres','service_role')
     AND NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
    RAISE EXCEPTION 'Use a ação de arquivar ou desarquivar material.'
      USING ERRCODE='42501',DETAIL='code=inventory_archive_rpc_required';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_inventory_guard_archive_write_v3 ON public.inventory;
CREATE TRIGGER trg_inventory_guard_archive_write_v3
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_archive_write_v3();
REVOKE ALL ON FUNCTION public.inventory_guard_archive_write_v3() FROM PUBLIC,anon,authenticated,service_role;

-- Rede de seguranca para caminhos privilegiados antigos: um material com
-- historico operacional nao pode ser apagado fisicamente por acidente.
CREATE OR REPLACE FUNCTION public.inventory_guard_physical_delete_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM public.inventory_stock_levels level
      WHERE level.inventory_id=OLD.id AND level.quantity<>0)
    OR EXISTS(SELECT 1 FROM public.inventory_movements movement WHERE movement.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items reservation WHERE reservation.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.pdv_preorder_items item WHERE item.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.compra_materiais item WHERE item.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.compra_ordem_itens item WHERE item.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.inventory_count_items item WHERE item.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.service_order_materials item WHERE item.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.service_materials item WHERE item.stock_item_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.quote_items item WHERE item.inventory_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.pdv_order_items item WHERE item.inventory_id=OLD.id)
  THEN
    RAISE EXCEPTION 'Material com histórico operacional deve ser arquivado, não excluído.'
      USING ERRCODE='23503',DETAIL='code=inventory_delete_requires_archive';
  END IF;
  RETURN OLD;
END
$fn$;

DROP TRIGGER IF EXISTS trg_inventory_guard_physical_delete_v3 ON public.inventory;
CREATE TRIGGER trg_inventory_guard_physical_delete_v3
  BEFORE DELETE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.inventory_guard_physical_delete_v3();
REVOKE ALL ON FUNCTION public.inventory_guard_physical_delete_v3() FROM PUBLIC,anon,authenticated,service_role;

CREATE INDEX IF NOT EXISTS idx_inventory_active_company_name_v3
  ON public.inventory(company_id,name,id) WHERE archived_at IS NULL AND customer_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_created_v3
  ON public.inventory_movements(company_id,created_at DESC,id DESC) WHERE customer_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_stock_levels_company_inventory_v3
  ON public.inventory_stock_levels(company_id,inventory_id,stock_id);

COMMIT;

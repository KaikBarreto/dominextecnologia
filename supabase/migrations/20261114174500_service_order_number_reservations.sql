-- Numeração definitiva antecipada da OS sem criar uma OS comercial vazia.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.service_order_number_reservations (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number integer NOT NULL UNIQUE CHECK (order_number > 0),
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT service_order_number_consumption CHECK (
    (consumed_at IS NULL AND service_order_id IS NULL) OR consumed_at IS NOT NULL
  )
);
COMMENT ON TABLE public.service_order_number_reservations IS 'Ledger pessoal de numeração de OS. UUID reservado será o id da primeira OS. Sem dados de cliente; números abandonados não são reciclados. Consumo permanece mesmo após excluir a OS.';
CREATE INDEX service_order_number_reservations_owner_idx
 ON public.service_order_number_reservations(company_id,user_id);
CREATE INDEX service_order_number_reservations_order_idx
 ON public.service_order_number_reservations(service_order_id) WHERE service_order_id IS NOT NULL;
ALTER TABLE public.service_order_number_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_order_number_reservations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.service_order_number_reservations TO authenticated;
CREATE POLICY "Read own service order number reservations"
 ON public.service_order_number_reservations FOR SELECT TO authenticated USING (
   user_id = (SELECT auth.uid())
   AND company_id = (SELECT public.get_user_company_id(auth.uid()))
   AND public.tenant_subscription_allows_access(company_id)
   AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()
     AND p.company_id=service_order_number_reservations.company_id AND p.is_active IS TRUE)
 );

CREATE FUNCTION public.reserve_service_order_number(p_company_id uuid,p_user_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_row public.service_order_number_reservations; v_number integer;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id
    OR p_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
    OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM true
    OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()
      AND p.company_id=p_company_id AND p.is_active IS TRUE)
    OR NOT (public.is_admin_or_gestor(auth.uid()) OR EXISTS(
      SELECT 1 FROM public.user_permissions up WHERE up.user_id=auth.uid() AND up.is_active
      AND (up.permissions ? '*' OR up.permissions ? 'fn:create_os')
    ))
 THEN RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN
   RAISE EXCEPTION 'Solicitação de numeração inválida.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-order-number-id:'||p_request_id::text,0));
 SELECT * INTO v_row FROM public.service_order_number_reservations WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
   IF v_row.company_id IS DISTINCT FROM p_company_id OR v_row.user_id IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501';
   END IF;
   IF v_row.consumed_at IS NOT NULL THEN
     RAISE EXCEPTION 'Este número já pertence a uma OS salva.' USING ERRCODE='OSN03';
   END IF;
   IF v_row.expires_at<=clock_timestamp() THEN
     RAISE EXCEPTION 'A reserva do número expirou.' USING ERRCODE='OSN02';
   END IF;
 ELSE
   IF EXISTS(SELECT 1 FROM public.service_orders WHERE id=p_request_id) THEN
     RAISE EXCEPTION 'Este preenchimento já pertence a uma OS salva.' USING ERRCODE='OSN03';
   END IF;
   LOOP
     v_number:=nextval('public.service_orders_order_number_seq'::regclass);
     PERFORM pg_advisory_xact_lock(hashtextextended('service-order-number-value:'||v_number::text,0));
     EXIT WHEN NOT EXISTS(SELECT 1 FROM public.service_orders WHERE order_number=v_number)
       AND NOT EXISTS(SELECT 1 FROM public.service_order_number_reservations WHERE order_number=v_number);
   END LOOP;
   INSERT INTO public.service_order_number_reservations(id,company_id,user_id,order_number)
   VALUES(p_request_id,p_company_id,auth.uid(),v_number) RETURNING * INTO v_row;
 END IF;
 RETURN jsonb_build_object('reservation_id',v_row.id,'order_number',v_row.order_number,'expires_at',v_row.expires_at);
END $fn$;
REVOKE ALL ON FUNCTION public.reserve_service_order_number(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_service_order_number(uuid,uuid,uuid) TO authenticated;

-- A própria inserção continua sujeita às RLS e aos triggers de agenda existentes.
-- Nenhuma RPC genérica SECURITY DEFINER passa a inserir OS em nome do usuário.
CREATE FUNCTION public.guard_service_order_number_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_res public.service_order_number_reservations; v_owner_fk_cleanup boolean:=false;
BEGIN
 IF TG_OP='UPDATE' THEN
   SELECT * INTO v_res FROM public.service_order_number_reservations WHERE service_order_id=OLD.id;
   -- A FK created_by usa ON DELETE SET NULL. Depois de excluir auth.users,
   -- preserva a OS e permite somente essa limpeza; usuário vivo não pode apagar a origem.
   IF FOUND THEN
     v_owner_fk_cleanup:=NEW.created_by IS NULL AND OLD.created_by=v_res.user_id
       AND NEW.id=OLD.id AND NEW.company_id=OLD.company_id AND NEW.order_number=OLD.order_number
       AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_res.user_id);
   END IF;
   IF FOUND AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.order_number IS DISTINCT FROM v_res.order_number
      OR NEW.company_id IS DISTINCT FROM v_res.company_id
      OR (NEW.created_by IS DISTINCT FROM v_res.user_id AND NOT v_owner_fk_cleanup)) THEN
     RAISE EXCEPTION 'A numeração e a origem da OS salva não podem ser alteradas.' USING ERRCODE='42501';
   END IF;
 ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended('service-order-number-id:'||NEW.id::text,0));
   SELECT * INTO v_res FROM public.service_order_number_reservations WHERE id=NEW.id FOR UPDATE;
   IF FOUND THEN
     IF auth.uid() IS NULL OR v_res.user_id IS DISTINCT FROM auth.uid()
        OR NEW.company_id IS DISTINCT FROM v_res.company_id
        OR COALESCE(NEW.created_by,auth.uid()) IS DISTINCT FROM v_res.user_id
        OR public.tenant_subscription_allows_access(v_res.company_id) IS DISTINCT FROM true
        OR NEW.entry_type IS DISTINCT FROM 'os' THEN
       RAISE EXCEPTION 'Não foi possível usar a numeração nesta sessão.' USING ERRCODE='42501';
     END IF;
     IF v_res.consumed_at IS NOT NULL THEN
       RAISE EXCEPTION 'Este número já pertence a uma OS salva.' USING ERRCODE='OSN03';
     END IF;
     IF v_res.expires_at<=clock_timestamp() THEN
       RAISE EXCEPTION 'A reserva do número expirou.' USING ERRCODE='OSN02';
     END IF;
     -- Permissão/perfil podem ter mudado desde que o modal foi aberto.
     PERFORM public.reserve_service_order_number(v_res.company_id,v_res.user_id,v_res.id);
     NEW.created_by:=v_res.user_id;
     NEW.order_number:=v_res.order_number;
     UPDATE public.service_order_number_reservations
       SET service_order_id=NEW.id,consumed_at=clock_timestamp() WHERE id=v_res.id;
   END IF;
 END IF;
 -- Bloqueia apropriação manual de qualquer número reservado, inclusive expirado.
 PERFORM pg_advisory_xact_lock(hashtextextended('service-order-number-value:'||NEW.order_number::text,0));
 SELECT * INTO v_res FROM public.service_order_number_reservations WHERE order_number=NEW.order_number;
 IF FOUND AND (v_res.service_order_id IS DISTINCT FROM NEW.id OR v_res.consumed_at IS NULL
   OR v_res.company_id IS DISTINCT FROM NEW.company_id
   OR (v_res.user_id IS DISTINCT FROM NEW.created_by AND NOT v_owner_fk_cleanup)) THEN
   RAISE EXCEPTION 'Este número pertence a uma reserva de OS.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_service_order_number_reservation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_service_order_number_reservation
 BEFORE INSERT OR UPDATE OF id,order_number,company_id,created_by ON public.service_orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_service_order_number_reservation();

-- A RPC de override já faz autorização, conflitos e referências de tenant.
-- Acrescenta somente o transporte da reserva, preservando integralmente esse corpo.
DO $migration$
DECLARE v_definition text; v_original text;
BEGIN
 SELECT pg_get_functiondef('public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[])'::regprocedure)
 INTO v_original;
 v_definition:=replace(v_original,
   '''customer_id'',''equipment_id'',''technician_id'',''team_id'',''os_type'',''service_type_id'',''status'',',
   '''number_reservation_id'',''customer_id'',''equipment_id'',''technician_id'',''team_id'',''os_type'',''service_type_id'',''status'',');
 IF v_definition=v_original THEN RAISE EXCEPTION 'Unexpected schedule override payload definition'; END IF;
 v_original:=v_definition;
 v_definition:=replace(v_definition,
   'INSERT INTO public.service_orders ('||chr(10)||'    company_id, customer_id,',
   'INSERT INTO public.service_orders ('||chr(10)||'    id, order_number, company_id, customer_id,');
 IF v_definition=v_original THEN RAISE EXCEPTION 'Unexpected schedule override insert definition'; END IF;
 v_original:=v_definition;
 v_definition:=replace(v_definition,
   ') VALUES ('||chr(10)||'    v_company_id, (p_order->>''customer_id'')::uuid,',
   ') VALUES ('||chr(10)||'    COALESCE(NULLIF(p_order->>''number_reservation_id'','''')::uuid,gen_random_uuid()),'||chr(10)||
   '    CASE WHEN NULLIF(p_order->>''number_reservation_id'','''') IS NOT NULL THEN'||chr(10)||
   '      (SELECT (public.reserve_service_order_number(v_company_id,v_user_id,(p_order->>''number_reservation_id'')::uuid)->>''order_number'')::integer)'||chr(10)||
   '    ELSE nextval(''public.service_orders_order_number_seq''::regclass) END,'||chr(10)||
   '    v_company_id, (p_order->>''customer_id'')::uuid,');
 IF v_definition=v_original THEN RAISE EXCEPTION 'Unexpected schedule override values definition'; END IF;
 EXECUTE v_definition;
END $migration$;
-- Não revogar USAGE de anon na sequence: o portal continua criando chamados.
COMMIT;

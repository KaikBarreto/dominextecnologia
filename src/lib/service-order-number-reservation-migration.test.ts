import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261114174500_service_order_number_reservations.sql', 'utf8');
const reserve = sql.split('CREATE FUNCTION public.reserve_service_order_number')[1].split('REVOKE ALL ON FUNCTION public.reserve_service_order_number')[0];

describe('reserva de número de OS — contrato de segurança', () => {
  it('reserva na sequência canônica sem criar uma OS ou estimar MAX+1', () => {
    expect(reserve).toContain("nextval('public.service_orders_order_number_seq'::regclass)");
    expect(reserve).not.toMatch(/INSERT INTO public.service_orders\b/);
    expect(sql).not.toMatch(/MAX\s*\(|setval\s*\(/i);
    expect(reserve).toContain('WHERE id=p_request_id FOR UPDATE');
  });
  it('isola empresa e usuário e exige permissão de criação e assinatura ativa', () => {
    for (const assertion of ['auth.uid() IS DISTINCT FROM p_user_id', 'p_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())', 'p.is_active IS TRUE', "up.permissions ? 'fn:create_os'", 'tenant_subscription_allows_access(p_company_id)']) expect(reserve).toContain(assertion);
    expect(sql).toContain('PERFORM public.reserve_service_order_number(v_res.company_id,v_res.user_id,v_res.id)');
  });
  it('mantém RLS/ledger privado e não altera grants da sequência ou INSERT legado', () => {
    expect(sql).toContain('ALTER TABLE public.service_order_number_reservations ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.service_order_number_reservations FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).not.toMatch(/(?:REVOKE|GRANT).*ON SEQUENCE/i);
    expect(sql).not.toMatch(/DROP POLICY.*service_orders|DISABLE ROW LEVEL SECURITY/i);
  });
  it('consome a reserva na transação do INSERT e conserva o consumo após exclusão', () => {
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(sql).toContain('WHERE id=NEW.id FOR UPDATE');
    expect(sql).toContain('NEW.order_number:=v_res.order_number');
    expect(sql).toContain('SET service_order_id=NEW.id,consumed_at=clock_timestamp()');
    expect(sql).toContain("ERRCODE='OSN03'");
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).not.toMatch(/DELETE FROM public.service_order_number_reservations/i);
  });
  it('impede apropriação manual e alteração posterior do número/origem', () => {
    expect(sql).toContain('NEW.order_number IS DISTINCT FROM v_res.order_number');
    expect(sql).toContain('v_res.service_order_id IS DISTINCT FROM NEW.id');
    expect(sql).toContain('NEW.created_by IS DISTINCT FROM v_res.user_id');
    expect(sql).toContain('BEFORE INSERT OR UPDATE OF id,order_number,company_id,created_by');
  });
  it('permite a limpeza FK da origem apenas depois da exclusão do usuário, sem renumerar a OS', () => {
    expect(sql).toContain('v_owner_fk_cleanup:=NEW.created_by IS NULL AND OLD.created_by=v_res.user_id');
    expect(sql).toContain('NEW.id=OLD.id AND NEW.company_id=OLD.company_id AND NEW.order_number=OLD.order_number');
    expect(sql).toContain('NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_res.user_id)');
    expect(sql.match(/AND NOT v_owner_fk_cleanup/g)).toHaveLength(2);
  });
  it('estende a RPC de agenda com reserva mantendo o corpo vigente e falha em mudança inesperada', () => {
    expect(sql).toContain("pg_get_functiondef('public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[])'::regprocedure)");
    expect(sql).toContain("number_reservation_id");
    expect(sql).toContain('IF v_definition=v_original THEN RAISE EXCEPTION');
    expect(sql).not.toMatch(/CREATE.*FUNCTION public\.schedule_create_service_order_with_override/);
  });
});

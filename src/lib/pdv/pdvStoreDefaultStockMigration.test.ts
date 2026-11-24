import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8');
const source = read('supabase/migrations/20261116191000_pdv_store_default_stock.sql');
const fn = (name: string) => source.split(`CREATE FUNCTION public.${name}(`)[1].split('END $fn$;')[0];

describe('estoque padrão da Loja com vínculo persistido', () => {
  it('separa o padrão operacional e preserva todos os caixas existentes como específicos', () => {
    expect(source).toContain('ADD COLUMN pdv_default_stock_id uuid');
    expect(source).toContain("stock_binding_mode text NOT NULL DEFAULT 'specific'");
    expect(source).not.toMatch(/UPDATE public\.pdv_terminals SET stock_binding_mode='store_default'/);
    expect(source).not.toContain("SET is_default = false");
    expect(source).toContain('pdv_stock_settings_revision bigint NOT NULL DEFAULT 0');
  });
  it('usa CAS com revisão do servidor e nega limpar o padrão antes de qualquer revisão alternativa', () => {
    expect(fn('pdv_set_store_stock_v1')).toContain('p_expected_revision IS DISTINCT FROM revision');
    const guard=fn('pdv_guard_store_default_stock_v1');
    expect(guard).toContain('OLD.pdv_stock_settings_revision+1');
    expect(guard).toContain("TG_OP='INSERT' AND NEW.pdv_default_stock_id IS NULL");
    expect(guard.indexOf('pdv_assert_store_stock_manager_internal_v1')).toBeLessThan(guard.indexOf("DETAIL='code=pdv_store_stock_required'"));
    expect(guard).toContain('st.company_id=NEW.company_id AND st.customer_id IS NULL');
  });
  it('gestão não depende do fallback legado e aceita basic ou PDV standalone', () => {
    const helper=source.split('CREATE FUNCTION public.pdv_can_manage_stock_v3(')[1].split('$fn$;')[0];
    expect(helper).toContain("company_has_module(p_company_id,'basic')");
    expect(helper).toContain("company_has_module(p_company_id,'pdv')");
    expect(helper).toContain("p.permissions ? 'fn:manage_inventory'");
    expect(helper).toContain('p.is_active IS TRUE');
    expect(helper).not.toContain('user_has_permission');
    expect(fn('pdv_create_store_stock_v1')).toContain('pdv_can_manage_stock_v3');
    expect(fn('pdv_assert_store_stock_manager_internal_v1')).toContain('pdv_has_explicit_action_permission_v2');
  });
  it('bloqueia somente trabalho com origem vinculada e deixa encerrar sem novo binding', () => {
    const idle=fn('pdv_assert_terminal_stock_idle_internal_v1');
    expect(idle).toContain("p.status IN('edicao','encaminhado')");
    expect(idle).toContain('d.terminal_id=p_terminal_id AND d.deleted_at IS NULL');
    expect(idle).toContain("r.state IN('guaranteed','conflict')");
    const work=fn('pdv_guard_stock_bound_work_v1');
    expect(work.indexOf('pdv_lock_stock_settings_internal_v1')).toBeLessThan(work.indexOf("NEW.status IN('cancelado','convertido')"));
    expect(work).toContain('NEW.target_terminal_id IS NOT DISTINCT FROM OLD.target_terminal_id');
    expect(work).toContain('NEW.stock_id IS NOT DISTINCT FROM OLD.stock_id');
    expect(source).toContain('DO $serialize_terminal_custody$');
  });
  it('serializa abertura, configuração e assignment sem remapear payloads antigos', () => {
    expect(source).toContain("hashtextextended('pdv-treasury-company:'||p_company_id::text,0)");
    expect(fn('pdv_guard_open_session_stock_v1')).toContain('pdv_lock_stock_settings_internal_v1');
    expect(fn('pdv_guard_stock_bound_work_v1')).toContain('t.stock_id=stock');
    expect(source).toContain('BEFORE INSERT ON public.pdv_cash_sessions');
    expect(source).toContain('BEFORE INSERT OR UPDATE OF target_terminal_id,stock_id,status');
    expect(source).not.toMatch(/UPDATE public\.(pdv_orders|pdv_preorders|pdv_order_drafts|pdv_stock_reservation_items) SET/);
  });
  it('isola a preparação de campos NEW/OLD por tabela e operação, sem depender de short-circuit SQL', () => {
    const custody=source.split('DO $serialize_terminal_custody$')[1].split('END $serialize_terminal_custody$;')[0];
    expect(custody).toMatch(/IF TG_TABLE_NAME='pdv_orders' THEN\s+IF TG_OP='UPDATE' THEN\s+IF OLD\.status/);
    expect(custody).toMatch(/IF TG_TABLE_NAME='pdv_preorders' THEN\s+IF TG_OP='UPDATE' THEN\s+IF NEW\.status/);
    expect(custody).not.toMatch(/IF TG_TABLE_NAME=[^\n]+ AND/);
    const work=fn('pdv_guard_stock_bound_work_v1');
    expect(work).toMatch(/IF TG_TABLE_NAME='pdv_preorders' THEN\s+IF TG_OP='UPDATE' THEN\s+IF NEW\.status/);
    expect(work).not.toMatch(/IF TG_TABLE_NAME=[^\n]+ AND/);
  });
  it('bootstrap só resolve vínculo unívoco ou único local e não desconfigura caixas existentes na ambiguidade', () => {
    const patch=source.split('DO $bootstrap_store_default$')[1].split('END $bootstrap_store_default$;')[0];
    expect(patch).toContain('count(DISTINCT stock.id)=1');
    expect(patch).toContain('IF v_general_count=0 THEN');
    expect(patch).toContain("'needs_stock',false,'needs_store_stock_choice',true");
    expect(patch).toContain("v_stock_id, true, 0, 'store_default'");
    expect(patch).not.toContain('ORDER BY stock.is_default');
    expect(source).toContain("pdv_save_cash_terminal_v3(p_terminal_id,p_name,p_stock_id,p_is_active,p_sort_order,'specific')");
  });
});

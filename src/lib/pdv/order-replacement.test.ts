import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const cashScreen = read('src/pages/PdvCaixa.tsx');
const saleScreen = read('src/pages/Pdv.tsx');
const saleHook = read('src/hooks/usePdvSale.ts');
const migration = read('supabase/migrations/20261019190000_pdv_edicao_atomica.sql');

describe('contrato da edição segura de venda do PDV', () => {
  it('abrir o editor não cancela nem altera a venda original', () => {
    const prepareFlow = cashScreen.slice(
      cashScreen.indexOf('function confirmSaleEdit()'),
      cashScreen.indexOf('function handleLedgerDelete'),
    );

    expect(prepareFlow).toContain('savePdvSaleEditDraft(draft)');
    expect(prepareFlow).not.toContain('cancelOrder.mutateAsync');
    expect(prepareFlow).not.toContain('createOrder.mutateAsync');
  });

  it('a finalização da edição chama uma única RPC de substituição', () => {
    const finalizeStart = saleScreen.indexOf('async function handleFinalizeSale');
    const editStart = saleScreen.indexOf('if (saleEditDraft) {', finalizeStart);
    const editBranch = saleScreen.slice(
      editStart,
      saleScreen.indexOf('} else {', editStart),
    );

    expect(editBranch).toContain('replaceOrder.mutateAsync');
    expect(editBranch).not.toContain('cancelOrder.mutateAsync');
    expect(editBranch).not.toContain('createOrder.mutateAsync');
    expect(saleHook).toContain("supabase.rpc('pdv_replace_order'");
  });

  it('o banco protege tenant, permissão, retry e concorrência', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.pdv_replace_order');
    expect(migration).toContain("company_has_module(v_company, 'pdv')");
    expect(migration).toContain("up.permissions ? 'fn:edit_pdv_sales'");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_orders_replaces_order');
    expect(migration).toContain("'pdv-replace-request:'");
    expect(migration).toContain("'pdv-cash-session:'");
    expect(migration).toContain('v_replacement.client_request_id = v_request_id');
    expect(migration).toContain('REVOKE UPDATE ON public.pdv_orders FROM authenticated');
    expect(migration).toContain("has_any_column_privilege('authenticated', 'public.pdv_orders', 'UPDATE')");
  });

  it('falha fechado para estados financeiros que exigem estorno próprio', () => {
    expect(migration).toContain('reconciliation_matches');
    expect(migration).toContain('tenant_charge_id IS NOT NULL');
    expect(migration).toContain('parent.is_paid IS TRUE');
    expect(migration).toContain('COALESCE(parent.amount_received, 0) > 0');
    expect(migration).toContain("child.category = 'Recebimento parcial'");
    expect(migration).toContain('CREATE TRIGGER tg_pdv_orders_guard_cancellation');
  });

  it('recalcula itens, exige pagamento exato e mantém a trilha de auditoria', () => {
    expect(migration).toContain('GREATEST(v_quantity * v_unit_price - v_item_discount, 0)');
    expect(migration).toContain('v_sum_payments IS DISTINCT FROM v_expected_total');
    expect(migration).toContain('public.can_use_bank_accounts(v_uid)');
    expect(migration).toContain('replaces_order_id');
    expect(migration).toContain('INSERT INTO public.pdv_order_attachments');
    expect(migration).not.toContain('pdv_fmt_brl');
  });
});

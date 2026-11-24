import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const read = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');
const stored = read('20261113130000_pdv_stored_value_installments.sql');
const due = read('20261116020500_pdv_explicit_fiado_due_date.sql');
const multi = read('20261116021500_pdv_multiple_vouchers_atomic.sql');
const purchase = read('20261116022000_pdv_supplier_credit_partial_purchase.sql');

// Executa as substituições literais das migrations sobre seus corpos de origem.
// Detecta âncora ausente antes do deploy, sem precisar de uma conexão ao banco.
function statements(source: string): string[] {
  const result: string[] = []; let start = 0; let quote = ''; let dollar = '';
  for (let i = 0; i < source.length; i++) {
    if (dollar) { if (source.startsWith(dollar, i)) { i += dollar.length - 1; dollar = ''; } continue; }
    if (quote) { if (source[i] === "'") { if (source[i + 1] === "'") i++; else quote = ''; } continue; }
    if (source[i] === "'") { quote = "'"; continue; }
    const tag = /^\$[a-z_]*\$/i.exec(source.slice(i));
    if (tag) { dollar = tag[0]; i += dollar.length - 1; continue; }
    if (source[i] === ';') { result.push(source.slice(start, i)); start = i + 1; }
  }
  return result;
}
function applyPatches(body: string, source: string) {
  let old = '', next = '';
  function evaluate(expression: string): string {
    const dollar = /^\$(anchor|patch)\$([\s\S]*)\$\1\$(\s*\|\|v_old)?$/.exec(expression.trim());
    if (dollar) return dollar[2] + (dollar[3] ? old : '');
    const tokens = expression.match(/'(?:''|[^'])*'|chr\(10\)|v_old|v_new|\|\|/g) ?? [];
    return tokens.filter(token => token !== '||').map(token => token === 'v_old' ? old : token === 'v_new' ? next
      : token === 'chr(10)' ? '\n' : token.slice(1, -1).replace(/''/g, "'")).join('');
  }
  for (const statement of statements(source)) {
    const assignment = /v_(old|new|src):=([\s\S]*)$/m.exec(statement);
    if (!assignment) continue;
    if (assignment[1] === 'old') old = evaluate(assignment[2]);
    else if (assignment[1] === 'new') next = evaluate(assignment[2]);
    else if (assignment[2].startsWith('replace(v_src,v_old,')) {
      const replacement = evaluate(assignment[2].slice('replace(v_src,v_old,'.length, -1));
      expect(old.length).toBeGreaterThan(0); expect(body, old).toContain(old);
      body = body.split(old).join(replacement);
    }
  }
  return body;
}
const block = (source: string, label: string) => source.split(`DO $${label}$`)[1].split(`END $${label}$`)[0];

describe('migrations de vencimento explícito, vouchers e compra parcial', () => {
  it.each([
    ['20261107134000_pdv_direct_sale_v2.sql', 'patch_direct_sale', 'direct_due', 'direct_vouchers'],
    ['20261107137000_pdv_counter_dispatch_v2.sql', 'patch_counter_order', 'counter_due', 'counter_vouchers'],
  ])('aplica todas as âncoras em %s e conserva os writers canônicos', (file, storedLabel, dueLabel, multiLabel) => {
    let body = applyPatches(read(file), block(stored, storedLabel));
    body = applyPatches(body, block(due, dueLabel)); body = applyPatches(body, block(multi, multiLabel));
    expect(body).toContain('PDV_EXPLICIT_DUE_DATE_V4'); expect(body).toContain('PDV_MULTIPLE_VOUCHERS_V4');
    expect(body).toContain('pdv_validate_fiado_dates_v4(p_payments)');
    expect(body).toContain('public.pdv_resolve_fiado_due_date_v4(v_payment,');
    expect(body).toContain("CASE WHEN payment->>'method'='voucher' THEN payment->>'reference_id' END");
    expect(body).toContain('ORDER BY voucher.id FOR UPDATE');
    expect(body).toContain('pdv_voucher_balance_internal_v2(v_reference_id)');
    expect(body).toContain('v_voucher.customer_id IS DISTINCT FROM');
    expect(body).toContain('p_return_id=>v_voucher.source_commercial_return_id');
  });
  it('usa a assinatura de texto no legado e preserva o prazo por omissão', () => {
    const body = applyPatches(read('20261019010000_pdv_competencia_no_fuso_da_empresa.sql'), block(due, 'legacy_due'));
    expect(due).toContain('pdv_settle_order(uuid,jsonb,text,date)');
    expect(body).toContain("pdv_resolve_fiado_due_date_v4(v_pay,(v_eff_date + interval '1 month')::date)");
    expect(due).toContain("CASE WHEN payment->>'due_date_mode'='none' THEN jsonb_build_object('due_date_mode','none') ELSE '{}'::jsonb END");
  });
  it('troca somente unicidade por operação sem eliminar o controle de estornos', () => {
    expect(multi).toContain("v_columns IS DISTINCT FROM ARRAY['operation_request_id']::text[]");
    expect(multi).toContain('UNIQUE(operation_request_id,voucher_id)');
    expect(multi).not.toContain('DROP TRIGGER'); expect(multi).not.toContain('reversal_of_id_key');
  });
  it('fecha a compra com saldo mais complemento e mantém apenas o complemento na DFC', () => {
    expect(purchase).toContain('v_credit+v_money=amount');
    expect(purchase).toContain('pdv_supplier_obligation'); expect(purchase).toContain('pdv_supplier_payment');
    expect(purchase).toContain("'application',-v_credit");
    expect(purchase).toContain("'cash_payment',-v_money");
    expect(purchase).toContain('public.registrar_compra_material_direta_core_019');
    expect(purchase).toContain('public.pdv_recalc_supplier_purchase_v4(v_financial)');
    expect(purchase).not.toContain('EXCEPTION WHEN');
    const projection = read('20261107132000_pdv_dre_dfc_v2.sql');
    expect(projection).toContain("'pdv_refund','pdv_supplier_payment'");
  });
});

it('aplica o delta de tesouraria somente ao pagamento da compra comprovado e exige o par de custódia', () => {
  const treasury = applyPatches(read('20261115130000_pdv_paid_residual_disposition.sql'), block(purchase, 'supplier_treasury'));
  expect(treasury).toContain('PDV_SUPPLIER_PURCHASE_CUSTODY_SOURCE_V4');
  expect(treasury).toContain("request.operation_type='purchase.supplier_credit.v4' AND request.status='pending'");
  expect(treasury).toContain('purchase.client_request_id::text=request.idempotency_key');
  expect(treasury).toContain('v_planned_custody_delta:=-NEW.amount');
  expect(purchase).toContain('DEFERRABLE INITIALLY DEFERRED');
  expect(purchase).toContain('oc.financial_transaction_id=NEW.parent_transaction_id');
  expect(purchase).toContain("request.resource_id=purchase.id AND request.resource_type='direct_purchase'");
});

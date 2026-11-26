import { describe, expect, it } from 'vitest';
import { getOsBillingTotals, osBillingError, osCommercialError, osCommercialLineTotal, osFieldDraftKey, selectReceiptPayment, type OsReceipt } from './osCommercial';
import { paymentMethodLabel } from '@/utils/osReceiptPdf';
describe('documentos comerciais da OS', () => {
  it('calcula linhas em centavos, inclusive quantidades fracionárias', () => {
    expect(osCommercialLineTotal({ item_type: 'material', description: 'Peça', quantity: 2.5, unit_price: 19.99 })).toBe(49.98);
  });
  it('isola o backup por empresa, pessoa e OS', () => {
    expect(osFieldDraftKey('a','u','os')).not.toBe(osFieldDraftKey('b','u','os'));
    expect(osFieldDraftKey('a','u','os')).not.toBe(osFieldDraftKey('a','v','os'));
  });
  it.each(['OSC01','OSC02','OSC03','42501','23514','22003'])('mapeia %s para orientação sem código interno', code => {
    const text = osCommercialError({ code, message: 'constraint private_backend_name' });
    expect(text).not.toContain(code); expect(text).not.toContain('private_backend_name'); expect(text.length).toBeGreaterThan(30);
  });
  it('não imprime identificadores internos como forma de pagamento', () => {
    expect(paymentMethodLabel('PIX')).toBe('Pix');
    expect(paymentMethodLabel('INTERNAL_PAYMENT_CODE')).toBe('Pagamento confirmado');
  });
});

describe('recibo por pagamento', () => {
  const receipt: OsReceipt = { order_number: 1, received: 3300, received_total: 3300, remaining: 0, source_total: 3300,
    company: { name: 'Empresa fictícia' }, customer: { name: 'Cliente fictício' },
    payments: [{ reference: 'a', amount: 2600, paid_date: '2026-11-26' }, { reference: 'b', amount: 700, paid_date: '2026-11-27' }] };
  it('mantém consolidado sem duplicar conta mãe', () => { expect(selectReceiptPayment(receipt, 'all')).toBe(receipt); });
  it('último parcial permanece parcial mesmo com saldo atual zerado', () => {
    expect(selectReceiptPayment(receipt, 'b')).toMatchObject({ scope: 'payment', received: 700, remaining: 0, is_partial: true, payments: [receipt.payments[1]] });
  });
  it('não substitui um pagamento estornado pelo consolidado', () => { expect(() => selectReceiptPayment({ ...receipt, payments: [] }, 'b')).toThrow(); });
  it('mantém parcial com total contratado oculto', () => { expect(selectReceiptPayment({ ...receipt, source_total: null, received: 700, is_partial: true, payments: [receipt.payments[1]] }, 'b').is_partial).toBe(true); });
});

describe('total da OS e faturamento legado', () => {
  const row={id:'a',amount:2600,amount_received:0,is_paid:true,due_date:null};
  it('não confunde conta de entrada quitada com quitação de toda a OS',()=>{
    expect(getOsBillingTotals(3300,[row])).toMatchObject({billed:2600,received:2600,open:0,unbilled:700,remaining:700});
  });
  it('distingue o saldo de uma conta parcial da diferença ainda não faturada',()=>{
    expect(getOsBillingTotals(3300,[{...row,is_paid:false,amount_received:2000}])).toMatchObject({open:600,unbilled:700,remaining:1300});
  });
  it('soma complementos sem contar a entrada antiga novamente',()=>{
    expect(getOsBillingTotals(3300,[row,{...row,id:'b',amount:700,is_paid:false}])).toMatchObject({billed:3300,received:2600,open:700,unbilled:0});
  });
  it('compara valores em centavos, sem diferença fantasma de ponto flutuante',()=>{
    expect(getOsBillingTotals(0.3,[{...row,amount:0.1},{...row,id:'b',amount:0.2}])).toMatchObject({unbilled:0,overbilled:0,remaining:0});
  });
  it('orienta a revisão de vínculo bloqueado sem expor código técnico',()=>{
    expect(osBillingError({code:'OSC04',message:'private_table'})).toContain('Financeiro');
    expect(osBillingError({code:'OSC04',message:'private_table'})).not.toMatch(/OSC04|private_table/);
  });
});

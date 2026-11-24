import { describe, expect, it } from "vitest";
import { PDV_RECEIPT_PREVIEW_FIXTURE } from "./fixture";
import { getPdvReceiptApproval, receiptFilename } from "./model";

describe("nome do PDF por etapa", () => {
  it.each(["58mm", "80mm", "a4"] as const)("identifica orçamento sem chamar de venda em %s", (format) => {
    expect(receiptFilename({ ...PDV_RECEIPT_PREVIEW_FIXTURE, documentKind: "budget" }, format))
      .toBe("Orçamento 1042 - Cliente exemplo");
    expect(receiptFilename(PDV_RECEIPT_PREVIEW_FIXTURE, format))
      .toBe("Comprovante de Venda 1042 - Cliente exemplo");
  });
  it('identifica pedido de retirada e comprovante de entrega como documentos distintos', () => {
    expect(receiptFilename({ ...PDV_RECEIPT_PREVIEW_FIXTURE, documentKind: 'pickup' }, '80mm'))
      .toBe('Pedido para Retirada 1042 - Cliente exemplo');
    expect(receiptFilename({ ...PDV_RECEIPT_PREVIEW_FIXTURE, documentKind: 'delivery' }, '80mm'))
      .toBe('Comprovante de Retirada 1042 - Cliente exemplo');
  });

  it.each([
    {paidAmount:185,approvedCreditAmount:0,total:185,expected:'PAGO'},
    {paidAmount:0,approvedCreditAmount:185,total:185,expected:'FIADO APROVADO'},
    {paidAmount:100,approvedCreditAmount:85,total:185,expected:'APROVADO'},
    {paidAmount:100,approvedCreditAmount:0,total:185,expected:null},
    {paidAmount:Number.NaN,approvedCreditAmount:185,total:185,expected:null},
  ])('carimbo respeita cobertura: $expected', ({total,expected,...coverage}) => {
    expect(getPdvReceiptApproval({...PDV_RECEIPT_PREVIEW_FIXTURE,documentKind:'pickup',coverage,totals:{subtotal:total,discount:0,total}})).toBe(expected);
  });

  it('carimba venda direta paga com a mesma cobertura sem carimbar orçamento ou retirada', () => {
    const snapshot={...PDV_RECEIPT_PREVIEW_FIXTURE,coverage:{paidAmount:185,approvedCreditAmount:0}};
    expect(getPdvReceiptApproval(snapshot)).toBe('PAGO');
    expect(getPdvReceiptApproval({...snapshot,documentKind:'sale'})).toBe('PAGO');
    expect(getPdvReceiptApproval({...snapshot,documentKind:'budget'})).toBeNull();
    expect(getPdvReceiptApproval({...snapshot,documentKind:'delivery'})).toBeNull();
  });

});

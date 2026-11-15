import { describe, expect, it } from "vitest";
import { PDV_RECEIPT_PREVIEW_FIXTURE } from "./fixture";
import {
  buildPdvReceiptLines,
  getPdvReceiptPaymentRows,
  stackPdvReceiptItemColumns,
  buildPdvReceiptItemBlocks,
  fitPdvReceiptLogo,
  getPdvReceiptLogoPlacement,
  measurePdvReceiptHeight,
} from "./layout";
import { formatReceiptMoney, toReceiptCents } from "./model";

describe("comprovante não fiscal", () => {
  it("arredonda valores em centavos sem erro binário", () => {
    expect(toReceiptCents(10.005)).toBe(1001);
    expect(formatReceiptMoney(0.1 + 0.2)).toContain("0,30");
  });

  it.each(["a4", "58mm", "80mm"] as const)(
    "mantém pedido e pagamento misto sem subtítulo em %s",
    (format) => {
      const text = buildPdvReceiptLines(PDV_RECEIPT_PREVIEW_FIXTURE, format)
        .map((line) => line.text)
        .join("\n");
      expect(text).toContain("PEDIDO Nº 1042");
      expect(text).not.toContain("NÃO FISCAL");
      expect(text).not.toContain("Reimpressão não altera");
      expect(text).toContain("Pix: R$ 100,00");
      expect(text).toContain("Fiado: R$ 85,00");
      expect(text).toContain("07/12/2026");
    },
  );

  it("mede altura térmica a partir do conteúdo", () => {
    const short = buildPdvReceiptLines(
      { ...PDV_RECEIPT_PREVIEW_FIXTURE, items: [] },
      "58mm",
    );
    const long = buildPdvReceiptLines(PDV_RECEIPT_PREVIEW_FIXTURE, "58mm");
    expect(measurePdvReceiptHeight(long)).toBeGreaterThan(
      measurePdvReceiptHeight(short),
    );
    expect(measurePdvReceiptHeight(long, 28)).toBe(
      measurePdvReceiptHeight(long) + 28,
    );
  });

  it("gera orçamento sem pagamentos e deixa preço pendente explícito", () => {
    const budget = {
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      documentKind: "budget" as const,
      items: [
        {
          ...PDV_RECEIPT_PREVIEW_FIXTURE.items[0],
          unitPrice: 0,
          total: 0,
          pricePending: true,
        },
      ],
      payments: [],
    };
    const text = buildPdvReceiptLines(budget, "a4")
      .map((line) => line.text)
      .join("\n");

    expect(text).toContain("ORÇAMENTO");
    expect(text).toContain("ORÇAMENTO Nº");
    expect(text).toContain("preço a definir");
    expect(text).toContain("TOTAL A DEFINIR");
    expect(text).not.toContain("Pagamentos");
  });

  it("posiciona e dimensiona logos sem distorcer", () => {
    expect(getPdvReceiptLogoPlacement(600, 100)).toBe("stacked");
    expect(getPdvReceiptLogoPlacement(100, 100)).toBe("inline");
    expect(getPdvReceiptLogoPlacement(80, 200)).toBe("inline");
    const fitted = fitPdvReceiptLogo(600, 100, 60, 20);
    expect(fitted).toEqual({ width: 60, height: 10 });
    expect(fitted.width / fitted.height).toBe(6);
  });
  it('preserva cada forma, traduz códigos conhecidos e omite pagamentos nas etapas sem recebimento', () => {
    const snapshot = {...PDV_RECEIPT_PREVIEW_FIXTURE, payments:[{method:'pix',amount:100},{method:'credito',amount:60},{method:'fiado',amount:25}]};
    const rows = getPdvReceiptPaymentRows(snapshot);
    expect(rows.map(row=>row.label)).toEqual(['Pix','Cartão de crédito','Fiado']);
    expect(rows.map(row=>row.amount)).toEqual([100,60,25]);
    expect(rows[2].due).toBe('Sem vencimento');
    expect(getPdvReceiptPaymentRows({...snapshot,documentKind:'budget'})).toEqual([]);
    expect(getPdvReceiptPaymentRows({...snapshot,documentKind:'delivery'})).toEqual([]);
    expect(buildPdvReceiptLines(snapshot,'80mm').find(line=>line.text==='Formas de Pagamento:')).toMatchObject({bold:true,align:'left'});
  });

  it('reflui valores e quantidades extensos no térmico sem reduzir a fonte do A4', () => {
    const snapshot={...PDV_RECEIPT_PREVIEW_FIXTURE,items:[{description:'Serpentina de refrigeração',unit:'m',quantity:12.375,unitPrice:99999.99,discount:0,total:1237499.88}]};
    const block=buildPdvReceiptItemBlocks(snapshot)[0];
    expect(stackPdvReceiptItemColumns('58mm',block)).toBe(true);
    expect(stackPdvReceiptItemColumns('a4',block)).toBe(false);
    expect(block.columns[2].value).toBe(formatReceiptMoney(1237499.88));
    expect(block.columns[0].value).toBe('12,375 m');
  });

});

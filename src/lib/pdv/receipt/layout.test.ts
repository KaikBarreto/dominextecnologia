import { describe, expect, it } from "vitest";
import { PDV_RECEIPT_PREVIEW_FIXTURE } from "./fixture";
import {
  buildPdvReceiptLines,
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
    "mantém aviso e pagamento misto em %s",
    (format) => {
      const text = buildPdvReceiptLines(PDV_RECEIPT_PREVIEW_FIXTURE, format)
        .map((line) => line.text)
        .join("\n");
      expect(text).toContain("COMPROVANTE NÃO FISCAL");
      expect(text).toContain("não substitui nota fiscal");
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

    expect(text).toContain("ORÇAMENTO DO BALCÃO");
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
});

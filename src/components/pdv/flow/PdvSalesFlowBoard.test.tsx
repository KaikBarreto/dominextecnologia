import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdvSalesFlowBoard } from "./PdvSalesFlowBoard";
import type { PdvSalesFlowCardModel } from "@/hooks/usePdvSalesFlow";

const draft: PdvSalesFlowCardModel = {
  flowId: "preorder:1",
  preorderId: "pre-1",
  preorderNumber: 1,
  orderId: null,
  orderNumber: null,
  stage: "draft",
  customerName: null,
  stockName: "Loja",
  total: 10,
  itemCount: 1,
  remainingItems: 1,
  updatedAt: "2026-11-08T10:00:00Z",
  canSeeAmount: true,
  fulfillmentMode: "dispatch",
};

describe("PdvSalesFlowBoard", () => {
  it("mostra cinco etapas quando a retirada é separada", () => {
    render(
      <PdvSalesFlowBoard
        cards={[]}
        fulfillmentMode="dispatch"
        onOpen={() => undefined}
        formatMoney={String}
      />,
    );
    for (const label of ["Orçamento", "No caixa", "Aguardando retirada", "Retirada parcial", "Entregue"]) {
      expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
    }
  });

  it("remove retirada e parcial quando a entrega acontece no caixa", () => {
    render(
      <PdvSalesFlowBoard
        cards={[]}
        fulfillmentMode="cashier"
        onOpen={() => undefined}
        formatMoney={String}
      />,
    );
    expect(screen.getAllByText(/Orçamento/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No caixa/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Concluído/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Aguardando retirada/)).toBeNull();
    expect(screen.queryByText(/Retirada parcial/)).toBeNull();
  });

  it("renderiza o card sem oferecer arrastar", () => {
    render(
      <PdvSalesFlowBoard
        cards={[draft]}
        fulfillmentMode="dispatch"
        onOpen={() => undefined}
        formatMoney={(value) => String(value)}
      />,
    );
    const board = screen.getByRole("region", { name: "Fluxo do balcão" });
    expect(within(board).getAllByText("Orçamento #1").length).toBeGreaterThan(0);
    expect(board.querySelector("[draggable='true']")).toBeNull();
  });
});

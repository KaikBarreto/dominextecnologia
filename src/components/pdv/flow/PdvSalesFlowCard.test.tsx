import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PdvSalesFlowCard } from "./PdvSalesFlowCard";
import type { PdvSalesFlowCardModel } from "@/hooks/usePdvSalesFlow";

const card: PdvSalesFlowCardModel = {
  flowId: "preorder:1042",
  preorderId: "pre-1042",
  preorderNumber: 1042,
  orderId: "order-531",
  orderNumber: 531,
  stage: "cash",
  customerName: "Construtora Horizonte",
  stockName: "Loja",
  total: 1450,
  itemCount: 3,
  remainingItems: 3,
  updatedAt: "2026-11-08T10:00:00Z",
  canSeeAmount: true,
  fulfillmentMode: "dispatch",
};

describe("PdvSalesFlowCard", () => {
  it("preserva a linhagem e o valor completo", () => {
    render(
      <PdvSalesFlowCard
        card={card}
        onOpen={() => undefined}
        formatMoney={(value) => `R$ ${value.toFixed(2)}`}
      />,
    );

    expect(
      screen.getByText("Orçamento #1042 → Pedido #531"),
    ).toBeInTheDocument();
    expect(screen.getByText("R$ 1450.00")).toHaveClass("whitespace-nowrap");
  });

  it("abre pelo card e usa foco interno sem ring externo", () => {
    const onOpen = vi.fn();
    render(<PdvSalesFlowCard card={card} onOpen={onOpen} />);
    const button = screen.getByRole("button", { name: /abrir orçamento/i });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(card);
    expect(button.className).toContain("shadow-[inset");
    expect(button.className).not.toContain("ring-2");
  });

  it("oferece o menu de ações no padrão do kanban", () => {
    render(<PdvSalesFlowCard card={card} onOpen={() => undefined} />);
    expect(screen.getByRole("button", { name: /ações de orçamento/i })).toHaveTextContent("Ações");
  });
});

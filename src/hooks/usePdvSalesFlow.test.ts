import { describe, expect, it } from "vitest";
import {
  projectPdvSalesFlow,
  resolvePdvSalesFlowMode,
} from "@/hooks/usePdvSalesFlow";

describe("usePdvSalesFlow", () => {
  it("mantém a mesma identidade entre orçamento e pedido", () => {
    const cards = projectPdvSalesFlow([
      {
        flow_id: "preorder:pre-1042",
        preorder_id: "pre-1042",
        preorder_number: 1042,
        order_id: "order-531",
        order_number: 531,
        stage: "cash",
        customer_name: "Construtora Horizonte",
        stock_name: "Loja",
        total: 1450,
        item_count: 3,
        remaining_items: 3,
        updated_at: "2026-11-08T10:00:00Z",
        can_see_amount: true,
        fulfillment_mode: "dispatch",
      },
    ]);

    expect(cards[0]).toMatchObject({
      flowId: "preorder:pre-1042",
      preorderId: "pre-1042",
      orderId: "order-531",
      total: 1450,
      stage: "cash",
    });
  });

  it("não projeta valor quando o servidor não autorizou", () => {
    const cards = projectPdvSalesFlow([
      {
        flow_id: "order:1",
        order_id: "order-1",
        order_number: 1,
        stage: "pickup",
        total: 999,
        can_see_amount: false,
        fulfillment_mode: "dispatch",
      },
    ]);

    expect(cards[0].total).toBeNull();
    expect(cards[0].canSeeAmount).toBe(false);
  });

  it("descarta linhas incompletas e resolve o modo do fluxo", () => {
    const cards = projectPdvSalesFlow([
      { flow_id: "inválido", stage: "draft" },
      {
        flow_id: "preorder:2",
        preorder_id: "pre-2",
        stage: "draft",
        fulfillment_mode: "cashier",
      },
    ]);

    expect(cards).toHaveLength(1);
    expect(resolvePdvSalesFlowMode(cards)).toBe("cashier");
    expect(resolvePdvSalesFlowMode([], "dispatch")).toBe("dispatch");
  });
});

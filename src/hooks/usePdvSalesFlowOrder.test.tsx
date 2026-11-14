import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { company_id: "company-1" },
    permissions: ["screen:pdv"],
    roles: ["comercial"],
    hasPermissionRecord: true,
    profileLoading: false,
  }),
}));

import { usePdvSalesFlowOrder } from "@/hooks/usePdvSalesFlow";

describe("usePdvSalesFlowOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("abre somente o detalhe seguro do pedido concluído no caixa", async () => {
    rpc.mockResolvedValue({
      data: {
        order: {
          id: "order-1",
          number: 531,
          status: "entregue",
          customer: { id: "customer-1", name: "Cliente" },
          stock: { id: "stock-1", name: "Loja" },
        },
        items: [
          {
            id: "item-1",
            description: "Cimento",
            item_type: "material",
            unit: "sc",
            ordered_quantity: 2,
            delivered_quantity: 2,
            remaining_quantity: 0,
            reservations: [],
          },
        ],
      },
      error: null,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => usePdvSalesFlowOrder("order-1"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith("pdv_get_sales_flow_order_v2", {
      p_order_id: "order-1",
    });
    expect(result.current.data?.order).toMatchObject({
      id: "order-1",
      number: 531,
      status: "entregue",
    });
    expect(result.current.data?.order).not.toHaveProperty("total");
  });

  it("não consulta sem pedido selecionado", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePdvSalesFlowOrder(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(rpc).not.toHaveBeenCalled();
  });
});

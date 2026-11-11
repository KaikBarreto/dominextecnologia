import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import {
  projectPdvPreorderCatalog,
  usePdvPreorderCatalog,
} from "@/hooks/usePdvPreorderCatalog";

describe("usePdvPreorderCatalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consulta somente a RPC projetada do pré-pedido", async () => {
    rpc.mockResolvedValue({
      data: {
        materials: [
          {
            id: "mat-1",
            name: "Cimento",
            sku: "CI-1",
            barcode: "7890001",
            unit: "sc",
            sale_price: 42,
            image_url: "materials/cimento.webp",
            archived_at: null,
            group: {
              id: "group-1",
              name: "Obra",
              color: "#111111",
              company_id: "nao-projetar",
            },
            available_by_stock: [
              {
                stock_id: "sto-1",
                available_quantity: 7,
                physical_quantity: 10,
              },
              { stock_id: null, available_quantity: 999 },
            ],
          },
        ],
        customers: [{ id: "cus-1", name: "Cliente" }],
        stocks: [{ id: "sto-1", name: "Loja" }],
      },
      error: null,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => usePdvPreorderCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith("pdv_get_preorder_catalog_v2");
    expect(result.current.data?.materials[0]).toEqual({
      id: "mat-1",
      name: "Cimento",
      sku: "CI-1",
      barcode: "7890001",
      unit: "sc",
      sale_price: 42,
      image_url: "materials/cimento.webp",
      archived_at: null,
      group: { id: "group-1", name: "Obra", color: "#111111" },
      available_by_stock: [{ stock_id: "sto-1", available_quantity: 7 }],
    });
  });

  it("descarta custo, limite, dados fiscais e contato mesmo se vierem no payload", () => {
    const projected = projectPdvPreorderCatalog({
      materials: [
        {
          id: "mat-1",
          name: "Cimento",
          sku: null,
          barcode: null,
          unit: "sc",
          sale_price: 42,
          image_url: null,
          archived_at: null,
          group: null,
          available_by_stock: [],
          cost_price: 10,
          fiscal_ncm: "00000000",
          supplier: "Fornecedor",
        },
      ],
      customers: [
        {
          id: "cus-1",
          name: "Cliente",
          credit_limit: 1000,
          document: "000",
          email: "privado@example.invalid",
          phone: "11999999999",
          inscricao_estadual: "123",
        },
      ],
      stocks: [
        { id: "sto-1", name: "Loja", company_id: "tenant", is_default: true },
      ],
    });

    expect(projected.materials[0]).not.toHaveProperty("cost_price");
    expect(projected.materials[0]).not.toHaveProperty("fiscal_ncm");
    expect(projected.materials[0]).toEqual({
      id: "mat-1",
      name: "Cimento",
      sku: null,
      barcode: null,
      unit: "sc",
      sale_price: 42,
      image_url: null,
      archived_at: null,
      group: null,
      available_by_stock: [],
    });
    expect(projected.customers[0]).not.toHaveProperty("credit_limit");
    expect(projected.customers[0]).not.toHaveProperty("email");
    expect(projected.customers[0]).not.toHaveProperty("phone");
    expect(projected.customers[0]).not.toHaveProperty("inscricao_estadual");
    expect(projected.stocks[0]).toEqual({ id: "sto-1", name: "Loja" });
  });

  it("não consulta catálogo quando o perfil não usa o espaço comercial", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => usePdvPreorderCatalog(false), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(rpc).not.toHaveBeenCalled();
  });
});

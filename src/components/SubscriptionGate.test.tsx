import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionBlockResult } from "@/hooks/useSubscriptionBlock";

const { hookResult, signOut } = vi.hoisted(() => ({
  hookResult: { current: null as SubscriptionBlockResult | null },
  signOut: vi.fn(),
}));

vi.mock("@/hooks/useSubscriptionBlock", () => ({
  useSubscriptionBlock: () => hookResult.current,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signOut }),
}));

vi.mock("@/components/ui/page-loading", () => ({
  PageLoading: () => <div>Validando assinatura</div>,
}));

import { SubscriptionGate } from "./SubscriptionGate";

function result(overrides: Partial<SubscriptionBlockResult>): SubscriptionBlockResult {
  return {
    blocked: false,
    screen: null,
    status: "allowed",
    retry: vi.fn(),
    ...overrides,
  };
}

function renderGate(initialEntry = "/produto") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/produto"
          element={
            <SubscriptionGate>
              <div>Produto sensível</div>
            </SubscriptionGate>
          }
        />
        <Route path="/checkout" element={<div>Checkout liberado</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SubscriptionGate", () => {
  beforeEach(() => {
    signOut.mockReset();
    hookResult.current = result({});
  });

  it("não monta o produto enquanto valida", () => {
    hookResult.current = result({ blocked: true, status: "checking" });
    renderGate();
    expect(screen.getByText("Validando assinatura")).toBeInTheDocument();
    expect(screen.queryByText("Produto sensível")).not.toBeInTheDocument();
  });

  it("falha fechado no erro e permite tentar novamente ou sair", () => {
    const retry = vi.fn();
    hookResult.current = result({ blocked: true, status: "unavailable", retry });
    renderGate();

    expect(screen.queryByText("Produto sensível")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("envia pagamento pendente ao checkout", () => {
    hookResult.current = result({ blocked: true, status: "payment_required" });
    renderGate();
    expect(screen.getByText("Checkout liberado")).toBeInTheDocument();
    expect(screen.queryByText("Produto sensível")).not.toBeInTheDocument();
  });

  it("monta o produto somente quando a assinatura está liberada", () => {
    renderGate();
    expect(screen.getByText("Produto sensível")).toBeInTheDocument();
  });
});

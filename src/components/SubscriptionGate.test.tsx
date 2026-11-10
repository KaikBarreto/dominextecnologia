import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/hooks/useWhiteLabel", () => ({
  useWhiteLabel: () => ({ enabled: true, primaryColor: "#00C597" }),
}));

vi.mock("@/components/ui/DarkVeilPage", () => ({
  DarkVeilPage: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("@/components/ui/page-loading", () => ({
  PageLoading: () => <div>Validando assinatura</div>,
}));

import { SubscriptionGate } from "./SubscriptionGate";

function result(
  overrides: Partial<SubscriptionBlockResult>,
): SubscriptionBlockResult {
  return {
    blocked: false,
    screen: null,
    status: "allowed",
    retry: vi.fn().mockResolvedValue(undefined),
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

  it("falha fechado no erro e permite tentar novamente ou sair", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    hookResult.current = result({
      blocked: true,
      status: "unavailable",
      retry,
    });
    renderGate();

    expect(screen.queryByText("Produto sensível")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
  });

  it("usa texto branco no botão verde saturado", () => {
    hookResult.current = result({ blocked: true, status: "unavailable" });
    renderGate();

    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toHaveStyle({
      backgroundColor: "#00C597",
      color: "#ffffff",
    });
  });

  it("bloqueia as ações e mostra progresso durante uma nova tentativa", async () => {
    let resolveRetry: (() => void) | undefined;
    const retry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );
    hookResult.current = result({
      blocked: true,
      status: "unavailable",
      retry,
    });
    renderGate();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sair" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toHaveAttribute("aria-busy", "true");

    resolveRetry?.();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Tentar novamente" }),
      ).toBeEnabled(),
    );
  });

  it("mantém o gate fechado e orienta quando a nova tentativa falha", async () => {
    const retry = vi.fn().mockRejectedValue(new Error("falha interna"));
    hookResult.current = result({
      blocked: true,
      status: "unavailable",
      retry,
    });
    renderGate();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByText(/validação continua indisponível/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Produto sensível")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
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

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageRecoveryBoundary } from "./PageRecoveryBoundary";

vi.mock("@/lib/pwa", () => ({
  autoHealStaleBundleIfNeeded: vi.fn(() => false),
}));

function RecoverableContent(): React.ReactNode {
  throw new Error("falha interna de renderização");
}

describe("PageRecoveryBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usa uma recuperação otimista sem expor detalhes internos", () => {
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <PageRecoveryBoundary homePath="/dashboard" resetKey="/agenda">
          <RecoverableContent />
        </PageRecoveryBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText("Vamos retomar daqui")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText(/falha interna/i)).not.toBeInTheDocument();
  });

  it("leva ao início sem derrubar o shell", () => {
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <Routes>
          <Route
            path="/agenda"
            element={
              <PageRecoveryBoundary homePath="/dashboard" resetKey="/agenda">
                <RecoverableContent />
              </PageRecoveryBoundary>
            }
          />
          <Route path="/dashboard" element={<div>Início carregado</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ir para o início" }));
    expect(screen.getByText("Início carregado")).toBeInTheDocument();
  });
});

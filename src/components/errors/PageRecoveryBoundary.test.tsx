import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageRecoveryBoundary } from "./PageRecoveryBoundary";
import { clearCachesAndReload } from "@/lib/pwa";

vi.mock("@/lib/pwa", () => ({
  autoHealStaleBundleIfNeeded: vi.fn(() => false),
  clearCachesAndReload: vi.fn(async () => undefined),
  isStaleBundleError: (message: string) => /reading 'default'|dynamically imported module/.test(message),
}));

function RecoverableContent(): React.ReactNode {
  throw new Error("falha interna de renderização");
}

describe("PageRecoveryBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("tenta recuperar automaticamente antes de exibir o aviso", async () => {
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <PageRecoveryBoundary homePath="/dashboard" resetKey="/agenda">
          <RecoverableContent />
        </PageRecoveryBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText("Recuperando esta tela…")).toBeInTheDocument();
    expect(screen.queryByText("Vamos retomar daqui")).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(300);
    expect(screen.queryByText("Vamos retomar daqui")).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(900);
    expect(screen.queryByText("Vamos retomar daqui")).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(1_800);

    expect(screen.getByText("Vamos retomar daqui")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText(/falha interna/i)).not.toBeInTheDocument();
  });

  it("retoma sem mostrar aviso quando a falha era transitória", async () => {
    const availableAfter = Date.now() + 1_000;
    function TransientContent() {
      if (Date.now() < availableAfter) throw new Error("contexto ainda carregando");
      return <div>Conteúdo recuperado</div>;
    }

    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <PageRecoveryBoundary homePath="/dashboard" resetKey="/clientes">
          <TransientContent />
        </PageRecoveryBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText("Recuperando esta tela…")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(300);
    expect(screen.getByText("Recuperando esta tela…")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(900);

    expect(screen.getByText("Conteúdo recuperado")).toBeInTheDocument();
    expect(screen.queryByText("Vamos retomar daqui")).not.toBeInTheDocument();
  });

  it("leva ao início sem derrubar o shell", async () => {
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

    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(900);
    await vi.advanceTimersByTimeAsync(1_800);
    fireEvent.click(screen.getByRole("button", { name: "Ir para o início" }));
    expect(screen.getByText("Início carregado")).toBeInTheDocument();
  });

  it("bundle antigo: 'Tentar novamente' atualiza o aplicativo em vez de só redesenhar", async () => {
    // React.lazy guarda para sempre o resultado de um chunk que não veio;
    // redesenhar a mesma tela repete o mesmo erro. Só buscar a versão nova resolve.
    function StaleBundleContent(): React.ReactNode {
      throw new TypeError("Cannot read properties of undefined (reading 'default')");
    }

    render(
      <MemoryRouter initialEntries={["/orcamentos"]}>
        <PageRecoveryBoundary homePath="/dashboard" resetKey="/orcamentos">
          <StaleBundleContent />
        </PageRecoveryBoundary>
      </MemoryRouter>,
    );

    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(900);
    await vi.advanceTimersByTimeAsync(1_800);
    expect(clearCachesAndReload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(clearCachesAndReload).toHaveBeenCalledTimes(1);
  });

  it("erro comum: 'Tentar novamente' continua só redesenhando a tela", async () => {
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <PageRecoveryBoundary homePath="/dashboard" resetKey="/agenda">
          <RecoverableContent />
        </PageRecoveryBoundary>
      </MemoryRouter>,
    );

    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(900);
    await vi.advanceTimersByTimeAsync(1_800);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(clearCachesAndReload).not.toHaveBeenCalled();
  });
});

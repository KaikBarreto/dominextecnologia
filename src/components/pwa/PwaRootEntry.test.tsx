import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { isInstalledPwa } from "@/lib/pwaStandalone";
import { PwaRootEntry } from "./PwaRootEntry";

const originalMatchMedia = window.matchMedia;
const originalStandalone = (navigator as Navigator & { standalone?: boolean })
  .standalone;

function mockStandaloneMode(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

function mockIosStandalone(value: boolean) {
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: originalStandalone,
  });
  vi.restoreAllMocks();
});

describe("isInstalledPwa", () => {
  it("reconhece o display-mode standalone", () => {
    expect(isInstalledPwa(true, false)).toBe(true);
  });

  it("reconhece o modo standalone legado do Safari no iOS", () => {
    expect(isInstalledPwa(false, true)).toBe(true);
  });

  it("não confunde uma aba comum do navegador com a PWA", () => {
    expect(isInstalledPwa(false, false)).toBe(false);
  });
});

describe("PwaRootEntry", () => {
  it("leva a raiz instalada para o sistema", async () => {
    mockStandaloneMode(true);
    mockIosStandalone(false);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <PwaRootEntry>
                <p>Site institucional</p>
              </PwaRootEntry>
            }
          />
          <Route path="/dashboard" element={<p>Sistema Dominex</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Sistema Dominex")).toBeInTheDocument();
    expect(screen.queryByText("Site institucional")).not.toBeInTheDocument();
  });

  it("preserva o site institucional na navegação comum", () => {
    mockStandaloneMode(false);
    mockIosStandalone(false);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <PwaRootEntry>
          <p>Site institucional</p>
        </PwaRootEntry>
      </MemoryRouter>,
    );

    expect(screen.getByText("Site institucional")).toBeInTheDocument();
  });
});

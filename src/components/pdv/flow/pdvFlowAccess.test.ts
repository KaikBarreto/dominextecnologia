import { describe, expect, it } from "vitest";
import { canLoadPdvPreorderWorkspace } from "./pdvFlowAccess";

describe("acesso ao workspace comercial no fluxo", () => {
  it("mantém catálogo e fila comercial desligados para perfil puro de expedição", () => {
    expect(
      canLoadPdvPreorderWorkspace({
        adminOrManager: false,
        hasPdvScreen: false,
        hasPdvOrdersScreen: false,
      }),
    ).toBe(false);
  });

  it("libera o workspace somente para caixa, pedidos ou gestão", () => {
    expect(
      canLoadPdvPreorderWorkspace({
        adminOrManager: false,
        hasPdvScreen: true,
        hasPdvOrdersScreen: false,
      }),
    ).toBe(true);
  });
});

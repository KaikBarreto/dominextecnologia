import { describe, expect, it } from "vitest";
import pageSource from "./PdvPreorders.tsx?raw";

describe("ações da lista de orçamentos", () => {
  it("usa menu de três pontos com nome acessível e comprovante dentro", () => {
    expect(pageSource).toContain("aria-label={`Ações do orçamento ${preorder.number}`}");
    expect(pageSource).toContain('<MoreHorizontal className="h-4 w-4" />');
    expect(pageSource).toContain("<DropdownMenuLabel>Ações</DropdownMenuLabel>");
    expect(pageSource).toContain('appearance="menu-item"');
    expect(pageSource).not.toContain("<PdvPreorderReceiptButton\n                preorderId");
  });
});

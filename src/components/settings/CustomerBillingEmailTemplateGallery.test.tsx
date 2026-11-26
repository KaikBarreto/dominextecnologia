import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerBillingEmailTemplateGallery } from "./CustomerBillingEmailTemplateGallery";

vi.mock("@/hooks/use-mobile", () => ({ useIsCompact: () => false }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("CustomerBillingEmailTemplateGallery", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("mostra os quatro modelos e permite selecionar outro", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <CustomerBillingEmailTemplateGallery
          value="classic_light"
          onChange={onChange}
        />,
      );
    });

    expect(container.textContent).toContain("Clássico claro");
    expect(container.textContent).toContain("(padrão)");
    expect(container.textContent).toContain("Marca clara");
    expect(container.textContent).toContain("Premium escuro");
    expect(container.textContent).toContain("Bento grafite");
    expect(container.firstElementChild?.className).toContain("[--primary:0_0%_10%]");
    expect(container.firstElementChild?.className).toContain("[--primary-foreground:0_0%_100%]");

    const radios = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    expect(radios).toHaveLength(4);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");

    act(() => radios[3]?.click());
    expect(onChange).toHaveBeenCalledWith("bento_gray");
  });

  it("mostra checkout como acao principal e boleto como acao secundaria na previa", () => {
    act(() => {
      root.render(
        <CustomerBillingEmailTemplateGallery
          value="classic_light"
          onChange={() => undefined}
        />,
      );
    });

    const previewButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Ver prévia"));
    act(() => previewButton?.click());

    expect(document.body.textContent).toContain("Pagar agora");
    expect(document.body.textContent).toContain("Abrir boleto");
    expect(document.body.querySelector(".lucide-credit-card")).not.toBeNull();
    expect(document.body.querySelector(".lucide-receipt-text")).not.toBeNull();
    expect(document.body.querySelector(".lucide-copy")).not.toBeNull();
    expect(document.body.querySelector('img[alt="Dominex"]')).not.toBeNull();
  });

  it("desabilita a escolha quando a configuração não pode ser alterada", () => {
    act(() => {
      root.render(
        <CustomerBillingEmailTemplateGallery
          value="brand_light"
          onChange={() => undefined}
          disabled
        />,
      );
    });

    const radios = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    expect(radios.every((radio) => radio.disabled)).toBe(true);
  });
});

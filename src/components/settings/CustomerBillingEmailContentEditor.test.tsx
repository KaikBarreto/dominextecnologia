import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CustomerBillingEmailContentOverrides } from "@/hooks/useCustomerBillingEmails";
import { CustomerBillingEmailContentEditor } from "./CustomerBillingEmailContentEditor";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function ControlledEditor({
  initial = {},
}: {
  initial?: CustomerBillingEmailContentOverrides;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CustomerBillingEmailContentEditor value={value} onChange={setValue} />
  );
}

describe("CustomerBillingEmailContentEditor", () => {
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

  it("edita o conteúdo por evento e mostra a prévia interpolada", () => {
    act(() => root.render(<ControlledEditor />));

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    expect(tabs).toHaveLength(5);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");

    const title = container.querySelector<HTMLInputElement>(
      "#customer-email-content-charge_created-title",
    );
    act(() => {
      if (title)
        fireEvent.change(title, { target: { value: "Olá, {{cliente}}" } });
    });

    expect(container.textContent).toContain("Personalizado");
    expect(container.textContent).toContain("Olá, Maria Oliveira");
  });

  it("insere variáveis no campo focado e restaura o padrão do evento", async () => {
    act(() =>
      root.render(
        <ControlledEditor
          initial={{ charge_created: { title: "Cobrança especial" } }}
        />,
      ),
    );

    const subject = container.querySelector<HTMLInputElement>(
      "#customer-email-content-charge_created-subject",
    );
    act(() => subject?.focus());
    const variableButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Valor");
    act(() => variableButton?.click());

    expect(subject?.value).toContain("{{valor}}");

    const restore = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Restaurar padrão"));
    act(() => restore?.click());
    expect(container.textContent).not.toContain("Personalizado");
    expect(
      container.querySelector<HTMLInputElement>(
        "#customer-email-content-charge_created-title",
      )?.value,
    ).toBe("Sua cobrança foi gerada");
  });

  it("insere link HTTPS na mensagem e o mostra na prévia", () => {
    act(() => root.render(<ControlledEditor />));

    const addLink = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Adicionar link"));
    act(() => addLink?.click());

    const label = document.querySelector<HTMLInputElement>(
      "#customer-email-link-label",
    );
    const url = document.querySelector<HTMLInputElement>(
      "#customer-email-link-url",
    );
    act(() => {
      if (label) fireEvent.change(label, { target: { value: "Portal KGIE" } });
      if (url)
        fireEvent.change(url, {
          target: { value: "https://kgie.example.com/portal" },
        });
    });

    const insert = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Inserir link");
    act(() => insert?.click());

    const message = container.querySelector<HTMLTextAreaElement>(
      "#customer-email-content-charge_created-intro",
    );
    expect(message?.value).toContain(
      "[Portal KGIE](https://kgie.example.com/portal)",
    );
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="https://kgie.example.com/portal"]',
      )?.textContent,
    ).toBe("Portal KGIE");
  });
});

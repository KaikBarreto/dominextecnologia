import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PdvPreorderDetail } from "./PdvPreorderDetail";
import detailSource from "./PdvPreorderDetail.tsx?raw";
import type { PdvPreorderDetail as Detail } from "@/hooks/usePdvPreorders";

vi.mock("@/components/customers/CustomerSelectField", () => ({
  CustomerSelectField: ({
    value,
    onValueChange,
    disabled,
  }: {
    value?: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label="Cliente"
      value={value ?? "_none"}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="_none">Venda sem cliente</option>
    </select>
  ),
}));

vi.mock("@/hooks/useCompanySettings", () => ({
  useCompanySettings: () => ({ settings: { name: "Empresa Teste" } }),
}));

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const detail: Detail = {
  preorder: {
    id: "pre-1",
    company_id: "company-1",
    number: 42,
    customer_id: null,
    stock_id: "stock-1",
    target_terminal_id: null,
    status: "encaminhado",
    operation_mode: "counter",
    revision: 2,
    subtotal: null,
    discount_amount: 0,
    total: null,
    notes: null,
    created_by: "user-1",
    assigned_to: null,
    forwarded_at: "2026-11-07T10:00:00Z",
    converted_order_id: null,
    converted_at: null,
    cancelled_at: null,
    created_at: "2026-11-07T09:00:00Z",
    updated_at: "2026-11-07T10:00:00Z",
  },
  items: [
    {
      id: "item-pending",
      company_id: "company-1",
      preorder_id: "pre-1",
      inventory_id: "material-1",
      item_type: "material",
      description: "Cimento",
      quantity: 2,
      unit_price: null,
      discount_amount: 0,
      unit_factor_snapshot: 1,
      sort_order: 0,
      created_at: "2026-11-07T09:00:00Z",
      updated_at: "2026-11-07T09:00:00Z",
    },
    {
      id: "item-zero",
      company_id: "company-1",
      preorder_id: "pre-1",
      inventory_id: null,
      item_type: "service",
      description: "Cortesia",
      quantity: 1,
      unit_price: 0,
      discount_amount: 0,
      unit_factor_snapshot: 1,
      sort_order: 1,
      created_at: "2026-11-07T09:00:00Z",
      updated_at: "2026-11-07T09:00:00Z",
    },
  ],
};

const baseProps = {
  detail,
  inventory: [],
  customers: [],
  stocks: [{ id: "stock-1", name: "Loja" }],
  terminals: [],
  canConvert: true,
  canCancel: true,
  onReload: vi.fn(),
  onSave: vi.fn(),
  onValue: vi.fn(),
  onForward: vi.fn(),
  onCancel: vi.fn(),
  onConvert: vi.fn(),
};

describe("PdvPreorderDetail", () => {
  it("mostra preço ausente distinto de zero e bloqueia conversão incompleta", () => {
    render(<PdvPreorderDetail {...baseProps} canValue={false} />);

    expect(screen.getAllByText("Preço pendente").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s*0,00/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Criar pedido" })).toBeDisabled();
    expect(screen.getByText("Faltam preços")).toBeInTheDocument();
  });

  it("oferece edição de preço somente a quem pode valorizar", () => {
    render(<PdvPreorderDetail {...baseProps} canValue />);

    expect(
      screen.getByRole("button", { name: "Salvar preços" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Preço unitário")).toHaveLength(2);
    expect(screen.queryByText("Faltam preços")).not.toBeInTheDocument();
  });

  it("reutiliza catálogo em cards e carrinho lateral da venda ao criar orçamento", () => {
    const { container } = render(
      <PdvPreorderDetail
        {...baseProps}
        detail={null}
        draftId="draft-1"
        canValue={false}
        inventory={[
          {
            id: "material-1",
            name: "Cimento CP II",
            sku: "CIM-001",
            unit: "sc",
            salePrice: 39.9,
            imageUrl: null,
            barcode: "789000000001",
            groupId: "obra",
            groupName: "Obra",
          },
        ]}
      />,
    );

    expect(
      screen.getByTestId("pdv-preorder-sale-workspace"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("pdv-preorder-catalog-controls"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("pdv-preorder-product-grid")).toBeInTheDocument();
    expect(screen.getByTestId("pdv-preorder-cart-panel")).toBeInTheDocument();

    fireEvent.click(
      container.querySelector(
        '[data-pdv-product-id="material-1"]',
      ) as HTMLElement,
    );
    expect(screen.getAllByText("Cimento CP II").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Salvar orçamento" }),
    ).toBeEnabled();
  });

  it("navega visualmente pelos cards e devolve o foco à busca ao adicionar", async () => {
    const inventory = ["A", "B", "C", "D"].map((suffix, index) => ({
      id: `material-${suffix.toLowerCase()}`,
      name: `Material ${suffix}`,
      sku: `MAT-${index + 1}`,
      unit: "un",
      salePrice: 10 + index,
      availableQuantity: 10,
    }));
    const { container } = render(
      <PdvPreorderDetail
        {...baseProps}
        detail={null}
        draftId="draft-keyboard"
        canValue={false}
        inventory={inventory}
      />,
    );

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-pdv-product-id]"),
    );
    const positions = [
      { left: 0, top: 0 },
      { left: 112, top: 0 },
      { left: 0, top: 132 },
      { left: 112, top: 132 },
    ];
    buttons.forEach((button, index) => {
      const { left, top } = positions[index];
      button.getBoundingClientRect = () =>
        ({
          left,
          top,
          right: left + 100,
          bottom: top + 120,
          width: 100,
          height: 120,
          x: left,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
    });

    const search = screen.getByRole("searchbox");
    expect(search).toHaveAttribute("type", "search");
    expect(search).toHaveAttribute("autocomplete", "off");
    expect(search).toHaveAttribute("data-form-type", "other");
    fireEvent.change(search, { target: { value: "Material" } });
    search.focus();

    fireEvent.keyDown(search, { key: "ArrowRight" });
    expect(search).toHaveFocus();

    fireEvent.keyDown(search, { key: "ArrowDown" });
    await waitFor(() => expect(buttons[2]).toHaveFocus());
    expect(buttons[2]).toHaveClass(
      "outline-none",
      "shadow-[inset_0_0_0_2px_hsl(var(--primary))]",
    );
    expect(buttons[2].className).not.toContain("ring-");

    fireEvent.keyDown(buttons[2], { key: "ArrowRight" });
    await waitFor(() => expect(buttons[3]).toHaveFocus());
    fireEvent.keyDown(buttons[3], { key: "ArrowRight" });
    await waitFor(() => expect(buttons[0]).toHaveFocus());

    fireEvent.keyDown(buttons[0], { key: "Enter" });
    await waitFor(() => expect(search).toHaveFocus());
    expect(search).toHaveValue("");
    expect(
      within(screen.getByTestId("pdv-preorder-cart-panel")).getByText(
        "Material A",
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "ArrowRight" });
    await waitFor(() => expect(buttons[1]).toHaveFocus());
    fireEvent.keyDown(buttons[1], { key: " " });
    await waitFor(() => expect(search).toHaveFocus());
    expect(
      within(screen.getByTestId("pdv-preorder-cart-panel")).getByText(
        "Material B",
      ),
    ).toBeInTheDocument();
  });

  it("aceita os atalhos de mercado para busca e ajuda", async () => {
    render(
      <PdvPreorderDetail
        {...baseProps}
        detail={null}
        draftId="draft-shortcuts"
        canValue={false}
        inventory={[]}
      />,
    );

    const search = screen.getByRole("searchbox");
    search.blur();
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    await waitFor(() => expect(search).toHaveFocus());

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      await screen.findByRole("heading", { name: "Atalhos do orçamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Adicionar material e voltar à busca")).toBeInTheDocument();
  });

  it("agrupa comprovante e atalhos no menu de ações sem esconder o fluxo principal", async () => {
    render(<PdvPreorderDetail {...baseProps} canValue />);

    expect(screen.getByRole("button", { name: "Ações do orçamento" })).toHaveAttribute("aria-haspopup", "menu");
    expect(detailSource).toContain("<DropdownMenuLabel>Ações</DropdownMenuLabel>");
    expect(detailSource).toContain("Atalhos do orçamento");
    expect(detailSource).toContain('label="Gerar comprovante"');
    expect(screen.getByRole("button", { name: "Salvar preços" })).toBeInTheDocument();
  });
});

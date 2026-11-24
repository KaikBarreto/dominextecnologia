vi.mock('@/hooks/usePdvDomiLinkWorkspace', () => ({ usePdvDomiLinkWorkspace: () => ({ scannerControl: null, weighControl: undefined, capture: () => () => true }) }));
vi.mock('@/components/pdv/coupons/PdvCouponControl', () => ({ PdvCouponControl: () => null }));
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PdvPreorderDetail, projectPdvPreorderEditorSnapshot, type PdvPreorderEditorSnapshot } from "./PdvPreorderDetail";
import detailSource from "./PdvPreorderDetail.tsx?raw";
import { PdvPreorderDomainError, type PdvPreorderDetail as Detail } from "@/hooks/usePdvPreorders";

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

vi.mock("@/hooks/usePdvReceiptCompany", () => ({ usePdvReceiptCompany: () => null, PDV_RECEIPT_COMPANY_PENDING: "Aguarde a identificação da empresa." }));

vi.mock("@/hooks/useCompanySettings", () => ({
  useCompanySettings: () => ({ settings: { name: "Empresa Teste" } }),
}));

vi.mock("@/hooks/useInventoryIdentifiers", () => ({
  useInventoryIdentifiers: () => ({ resolve: { mutateAsync: vi.fn(), isPending: false } }),
}));

vi.mock("@/components/inventory/identifiers/InventoryIdentifierCameraScanner", () => ({
  InventoryIdentifierCameraScanner: () => null,
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
    expect(screen.getByRole("button", { name: "Gerar pedido" })).toBeDisabled();
    expect(screen.getByText("Faltam preços")).toBeInTheDocument();
  });

  it("oferece edição de preço somente a quem pode valorizar", () => {
    render(<PdvPreorderDetail {...baseProps} canValue />);

    expect(screen.getByRole("button", { name: "Gerar pedido" })).toBeDisabled();
    expect(screen.queryByTestId("pdv-preorder-line-editor")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Preço unitário")).toHaveLength(2);
    expect(screen.queryByText("Faltam preços")).not.toBeInTheDocument();
  });

  it("mantém Gerar pedido exclusivo da conversão e preços bloqueados para esse perfil", async () => {
    const onConvert = vi.fn().mockResolvedValue({});
    const onValue = vi.fn();
    render(<PdvPreorderDetail {...baseProps} detail={{ ...detail, items: detail.items.map(item => ({ ...item, unit_price: 10 })) }} canValue={false} canConvert onConvert={onConvert} onValue={onValue} />);
    expect(screen.queryByLabelText('Preço unitário')).not.toBeInTheDocument();
    const action = screen.getByRole('button', { name: 'Gerar pedido' });
    expect(action).toBeEnabled(); fireEvent.click(action);
    await waitFor(() => expect(onConvert).toHaveBeenCalledOnce());
    expect(onValue).not.toHaveBeenCalled();
  });

  it("permite salvar preços alterados no rodapé antes de converter o orçamento", async () => {
    const onValue = vi.fn().mockResolvedValue({});
    const onConvert = vi.fn();
    render(<PdvPreorderDetail {...baseProps} canValue canConvert onValue={onValue} onConvert={onConvert} />);
    expect(screen.getByRole('button', {name:'Gerar pedido'})).toBeDisabled();
    fireEvent.change(screen.getAllByLabelText('Preço unitário')[0], {target:{value:'25,00'}});
    const saveActions = screen.getAllByRole('button', {name:'Salvar preços'});
    expect(saveActions).toHaveLength(1);
    saveActions.forEach(button => expect(button).toBeEnabled());
    fireEvent.click(saveActions[saveActions.length - 1]);
    await waitFor(() => expect(onValue).toHaveBeenCalledOnce());
    expect(onConvert).not.toHaveBeenCalled();
  });

  it("quem só valoriza pode editar preços sem receber ação Gerar pedido", () => {
    render(<PdvPreorderDetail {...baseProps} canValue canConvert={false} />);
    expect(screen.getAllByLabelText('Preço unitário')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Gerar pedido' })).not.toBeInTheDocument();
  });

  it("sem as duas permissões não oferece edição de preços nem conversão", () => {
    render(<PdvPreorderDetail {...baseProps} canValue={false} canConvert={false} />);
    expect(screen.queryByLabelText('Preço unitário')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar pedido' })).not.toBeInTheDocument();
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
    expect(screen.getByRole("tab", { name: "Busca rápida" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Catálogo" })).toBeInTheDocument();
    expect(screen.getByTestId("pdv-cart-workspace")).toBeInTheDocument();

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

    const search = screen.getByRole("combobox", { name: "Buscar material por nome ou código" });
    expect(search).toHaveAttribute("type", "search");
    expect(search).toHaveAttribute("autocomplete", "off");
    expect(search).toHaveAttribute("data-form-type", "other");
    fireEvent.change(search, { target: { value: "Material" } });
    search.focus();

    fireEvent.keyDown(search, { key: "ArrowRight" });
    expect(search).toHaveFocus();

    fireEvent.keyDown(search, { key: "ArrowDown" });
    await waitFor(() => expect(search).toHaveAttribute("aria-activedescendant", buttons[2].id));
    expect(buttons[2]).toHaveClass("keyboard-active");
    expect(container.querySelectorAll(".keyboard-active")).toHaveLength(1);
    expect(buttons[2].className).not.toContain("ring-");

    fireEvent.keyDown(buttons[2], { key: "ArrowRight" });
    await waitFor(() => expect(search).toHaveAttribute("aria-activedescendant", buttons[3].id));
    fireEvent.keyDown(buttons[3], { key: "ArrowRight" });
    await waitFor(() => expect(search).toHaveAttribute("aria-activedescendant", buttons[0].id));

    fireEvent.keyDown(buttons[0], { key: "Enter" });
    await waitFor(() => expect(search).toHaveFocus());
    expect(search).toHaveValue("");
    expect(
      within(screen.getByTestId("pdv-cart-workspace")).getByText(
        "Material A",
      ),
    ).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "ArrowRight" });
    await waitFor(() => expect(search).toHaveAttribute("aria-activedescendant", buttons[0].id));
    fireEvent.keyDown(search, { key: "ArrowRight" });
    await waitFor(() => expect(search).toHaveAttribute("aria-activedescendant", buttons[1].id));
    fireEvent.keyDown(buttons[1], { key: " " });
    await waitFor(() => expect(search).toHaveFocus());
    expect(
      within(screen.getByTestId("pdv-cart-workspace")).getByText(
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

    const search = screen.getByRole("combobox", { name: "Buscar material por nome ou código" });
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

    fireEvent.click(screen.getByRole("button", { name: "Observações e detalhes" }));
    expect(await screen.findByRole("button", { name: "Ações do orçamento" })).toHaveAttribute("aria-haspopup", "menu");
    expect(detailSource).toContain("<DropdownMenuLabel>Ações</DropdownMenuLabel>");
    expect(detailSource).toContain("Atalhos do orçamento");
    expect(detailSource).toContain('label="Gerar comprovante"');
    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
  });
  it("mantém conteúdo e revisão base quando uma consulta atualiza o orçamento durante edição", async () => {
    const onEditorSnapshotChange = vi.fn();
    const {rerender} = render(<PdvPreorderDetail {...baseProps} canValue onEditorSnapshotChange={onEditorSnapshotChange} />);
    fireEvent.change(screen.getAllByLabelText("Preço unitário")[0], {target:{value:"25"}});
    rerender(<PdvPreorderDetail {...baseProps} detail={{...detail, preorder:{...detail.preorder,revision:8},items:detail.items.map(item=>({...item,unit_price:99}))}} canValue onEditorSnapshotChange={onEditorSnapshotChange} />);
    expect(screen.getAllByLabelText("Preço unitário")[0]).toHaveValue("25");
    await waitFor(()=>expect(onEditorSnapshotChange).toHaveBeenLastCalledWith(expect.objectContaining({dirty:true,sourceRevision:2}), expect.objectContaining({total:50,hasMissingPrices:false})));
  });

  it("aceita revisão autorizada mais nova ao reabrir um backup limpo e mantém a nova base ao valorizar", async () => {
    let latest: PdvPreorderEditorSnapshot | undefined;
    let revisionAtValue: number | null | undefined;
    const onEditorSnapshotChange=vi.fn((snapshot:PdvPreorderEditorSnapshot)=>{latest=snapshot;});
    const onValue=vi.fn().mockImplementation(async()=>{revisionAtValue=latest?.sourceRevision;return {revision:4};});
    const cleanBackup:PdvPreorderEditorSnapshot={customerId:"none",stockId:"stock-1",targetTerminalId:"none",notes:"Backup anterior",orderDiscount:"0",coupon:null,dirty:false,sourceRevision:2,lines:[{id:"item-pending",inventoryId:"material-1",itemType:"material",description:"Cimento",quantity:"2",unitPrice:"25",discountAmount:"0",unitFactor:1,sortOrder:0}]};
    const server={...detail,preorder:{...detail.preorder,revision:3,notes:"Revisão encaminhada"},items:[{...detail.items[0],unit_price:25}]};
    render(<PdvPreorderDetail {...baseProps} detail={server} editorSnapshot={cleanBackup} canValue onValue={onValue} onEditorSnapshotChange={onEditorSnapshotChange} />);
    await waitFor(()=>expect(latest).toEqual(expect.objectContaining({dirty:false,sourceRevision:3,notes:"Revisão encaminhada"})));
    fireEvent.change(screen.getByLabelText("Preço unitário"),{target:{value:"26"}});
    expect(latest).toEqual(expect.objectContaining({dirty:true,sourceRevision:3}));
    fireEvent.click(screen.getByRole("button",{name:"Salvar preços"}));
    await waitFor(()=>expect(onValue).toHaveBeenCalledWith(expect.objectContaining({items:[expect.objectContaining({unit_price:26})]})));
    expect(revisionAtValue).toBe(3);
  });

  it("uma consulta mais recente substitui o backup limpo sem exigir alteração ou atualização manual", async () => {
    const onEditorSnapshotChange=vi.fn();
    const cleanBackup:PdvPreorderEditorSnapshot={customerId:"none",stockId:"stock-1",targetTerminalId:"none",notes:"Anterior",orderDiscount:"0",coupon:null,dirty:false,sourceRevision:2,lines:[{id:"item-pending",inventoryId:"material-1",itemType:"material",description:"Cimento",quantity:"2",unitPrice:"25",discountAmount:"0",unitFactor:1,sortOrder:0}]};
    const original={...detail,preorder:{...detail.preorder,revision:2},items:[{...detail.items[0],unit_price:25}]};
    const {rerender}=render(<PdvPreorderDetail {...baseProps} detail={original} editorSnapshot={cleanBackup} canValue onEditorSnapshotChange={onEditorSnapshotChange} />);
    const latest={...original,preorder:{...original.preorder,revision:3,notes:"Atualizado na conta"},items:[{...original.items[0],unit_price:27}]};
    rerender(<PdvPreorderDetail {...baseProps} detail={latest} editorSnapshot={cleanBackup} canValue onEditorSnapshotChange={onEditorSnapshotChange} />);
    await waitFor(()=>expect(screen.getByLabelText("Preço unitário")).toHaveValue("27"));
    expect(onEditorSnapshotChange).toHaveBeenLastCalledWith(expect.objectContaining({dirty:false,sourceRevision:3,notes:"Atualizado na conta"}),expect.objectContaining({total:54,hasMissingPrices:false}));
  });

  it.each([[1,'cash-b'],[2,'none']] as const)('inicia novo orçamento com estoque autorizado e escolhe destino somente com %s caixa(s)',async(count,expectedTerminal)=>{
    const emit=vi.fn();const terminals=[{id:'cash-b',name:'Caixa B',stockId:'stock-b'},...(count===2?[{id:'cash-c',name:'Caixa C',stockId:'stock-b'}]:[])];
    render(<PdvPreorderDetail {...baseProps} detail={null} draftId="fresh" preferredStockId="stock-b" stocks={[{id:'stock-a',name:'OS A'},{id:'stock-b',name:'Loja B'}]} terminals={terminals} canValue onEditorSnapshotChange={emit}/>);
    await waitFor(()=>expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({stockId:'stock-b',targetTerminalId:expectedTerminal,dirty:false}),expect.any(Object)));
  });
  it('não aplica local inacessível e não muda o local inicial ao chegar outra preferência',async()=>{
    const emit=vi.fn();const props={...baseProps,detail:null,draftId:'fresh',stocks:[{id:'stock-b',name:'Loja B'}],canValue:true,onEditorSnapshotChange:emit};
    const app=render(<PdvPreorderDetail {...props} preferredStockId="stock-hidden"/>);
    await waitFor(()=>expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({stockId:'none',targetTerminalId:'none'}),expect.any(Object)));
    app.rerender(<PdvPreorderDetail {...props} preferredStockId="stock-b"/>);
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({stockId:'none',targetTerminalId:'none'}),expect.any(Object));
  });
  it('não substitui o estoque de snapshot recuperado nem de documento existente',async()=>{
    const emit=vi.fn();const snapshot:PdvPreorderEditorSnapshot={customerId:'none',stockId:'chosen-stock',targetTerminalId:'chosen-cash',notes:'Local escolhido pelo usuário',orderDiscount:'0',lines:[],coupon:null,dirty:true,sourceRevision:null};
    const app=render(<PdvPreorderDetail {...baseProps} detail={null} draftId="restored" editorSnapshot={snapshot} preferredStockId="stock-b" stocks={[{id:'stock-b',name:'Loja B'}]} canValue onEditorSnapshotChange={emit}/>);
    await waitFor(()=>expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({stockId:'chosen-stock',targetTerminalId:'chosen-cash',dirty:true}),expect.any(Object)));app.unmount();
    render(<PdvPreorderDetail {...baseProps} preferredStockId="stock-b" stocks={[{id:'stock-b',name:'Loja B'}]} terminals={[{id:'cash-b',name:'Caixa B',stockId:'stock-b'}]} canValue onEditorSnapshotChange={emit}/>);
    await waitFor(()=>expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({stockId:'stock-1',targetTerminalId:'none',sourceRevision:2}),expect.any(Object)));
  });

  it("Atualizar aplica a revisão já presente no cache mesmo quando o refetch mantém o mesmo objeto", async () => {
    const onReload=vi.fn();
    const onValue=vi.fn().mockRejectedValue(new PdvPreorderDomainError("Este orçamento foi alterado. Atualize para continuar.","conflict"));
    const onEditorSnapshotChange=vi.fn();
    const {rerender}=render(<PdvPreorderDetail {...baseProps} canValue onReload={onReload} onValue={onValue} onEditorSnapshotChange={onEditorSnapshotChange} />);
    fireEvent.change(screen.getAllByLabelText("Preço unitário")[0],{target:{value:"25"}});
    const cachedDetail={...detail,preorder:{...detail.preorder,revision:8},items:detail.items.map(item=>({...item,unit_price:99}))};
    rerender(<PdvPreorderDetail {...baseProps} detail={cachedDetail} canValue onReload={onReload} onValue={onValue} onEditorSnapshotChange={onEditorSnapshotChange} />);
    expect(screen.getAllByLabelText("Preço unitário")[0]).toHaveValue("25");
    fireEvent.click(screen.getByRole("button",{name:"Salvar preços"}));
    fireEvent.click(await screen.findByRole("button",{name:"Atualizar"}));
    // structuralSharing: a consulta devolve exatamente a referência já autorizada.
    rerender(<PdvPreorderDetail {...baseProps} detail={cachedDetail} canValue onReload={onReload} onValue={onValue} onEditorSnapshotChange={onEditorSnapshotChange} />);
    expect(onReload).toHaveBeenCalledOnce();
    await waitFor(()=>expect(screen.getAllByLabelText("Preço unitário")[0]).toHaveValue("99"));
    expect(onEditorSnapshotChange).toHaveBeenLastCalledWith(expect.objectContaining({dirty:false,sourceRevision:8}),expect.objectContaining({hasMissingPrices:false}));
  });

  it("restaura a aba local sem transformar seu conteúdo em venda financeira", () => {
    render(<PdvPreorderDetail {...baseProps} detail={null} draftId="aba-1" canValue editorSnapshot={{customerId:"none",stockId:"stock-1",targetTerminalId:"none",notes:"Anotação local",orderDiscount:"0",coupon:null,dirty:true,sourceRevision:null,lines:[{id:"linha-local",inventoryId:"material-1",itemType:"material",description:"Cobre local",quantity:"3",unitPrice:"20",discountAmount:"0",unitFactor:1,sortOrder:0}]}} workspaceHeader={<div>Abas do orçamento</div>} />);
    expect(screen.getByText("Abas do orçamento")).toBeInTheDocument();
    expect(screen.getByText("Cobre local")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Salvar orçamento"})).toBeEnabled();
  });

  it("preserva o conteúdo local de atendimento novo mesmo quando o backup está marcado limpo", () => {
    render(<PdvPreorderDetail {...baseProps} detail={null} draftId="novo-local" canValue editorSnapshot={{customerId:"none",stockId:"stock-1",targetTerminalId:"none",notes:"Ainda não existe na conta",orderDiscount:"0",coupon:null,dirty:false,sourceRevision:null,lines:[{id:"linha-local",inventoryId:"material-1",itemType:"material",description:"Cobre local preservado",quantity:"3",unitPrice:"20",discountAmount:"0",unitFactor:1,sortOrder:0}]}} />);
    expect(screen.getByText("Cobre local preservado")).toBeInTheDocument();
    expect(screen.getByLabelText("Preço unitário")).toHaveValue("20");
    expect(screen.getByRole("button",{name:"Salvar orçamento"})).toBeEnabled();
  });

  it("traz o preço conhecido do catálogo inclusive para quem pode valorizar", async () => {
    const onSave=vi.fn().mockResolvedValue({revision:1});
    const {container}=render(<PdvPreorderDetail {...baseProps} detail={null} draftId="aba-catalogo" canValue onSave={onSave} inventory={[{id:"material-1",name:"Cobre",sku:"001",unit:"un",salePrice:25}]} />);
    fireEvent.click(container.querySelector('[data-pdv-product-id="material-1"]')!);
    expect(screen.getByLabelText("Preço unitário")).toHaveValue("25");
    fireEvent.click(screen.getByRole("button",{name:"Salvar orçamento"}));
    await waitFor(()=>expect(onSave).toHaveBeenCalledWith(expect.objectContaining({items:[expect.objectContaining({unit_price:25,quantity:1})]})));
  });

  it("valorização altera apenas preços e descontos, sem reabrir quantidade ou remover itens", () => {
    render(<PdvPreorderDetail {...baseProps} canValue />);
    expect(screen.getByTestId("pdv-cart-workspace")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Preço unitário")).toHaveLength(2);
    expect(screen.queryByRole("button",{name:"Remover item"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Editar quantidade"})).not.toBeInTheDocument();
  });

  it("orienta o destino ao enviar, sem chamar o servidor antes de escolher e salvar o caixa", async () => {
    const onForward=vi.fn();
    render(<PdvPreorderDetail {...baseProps} detail={{...detail,preorder:{...detail.preorder,status:"edicao"},items:detail.items.map(item=>({...item,unit_price:25}))}} canValue onForward={onForward} />);
    fireEvent.click(screen.getByRole("button",{name:"Enviar ao caixa"}));
    expect(await screen.findByText("Escolha o caixa de destino e salve o orçamento antes de enviar.")).toBeInTheDocument();
    await waitFor(()=>expect(screen.getByRole("combobox",{name:"Caixa de destino"})).toHaveFocus());
    expect(onForward).not.toHaveBeenCalled();
  });

  it("oferece o mesmo carrinho em drawer no celular sem duplicar editores", async () => {
    const previous=window.innerWidth;
    Object.defineProperty(window,"innerWidth",{value:390,configurable:true});
    try {
      const {container}=render(<PdvPreorderDetail {...baseProps} canValue />);
      expect(container.querySelectorAll('[data-testid="pdv-cart-workspace"]')).toHaveLength(0);
      fireEvent.click(screen.getByRole("button",{name:/2 itens Valor pendente/}));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getAllByTestId("pdv-cart-workspace")).toHaveLength(1);
      expect(screen.getAllByLabelText("Preço unitário")).toHaveLength(2);
    } finally {Object.defineProperty(window,"innerWidth",{value:previous,configurable:true});}
  });

  it("emite o mesmo total comercial usado pelo carrinho, junto da pendência de preços", async () => {
    const onEditorSnapshotChange=vi.fn();
    render(<PdvPreorderDetail {...baseProps} canValue onEditorSnapshotChange={onEditorSnapshotChange} />);
    await waitFor(()=>expect(onEditorSnapshotChange).toHaveBeenLastCalledWith(expect.any(Object),{total:0,hasMissingPrices:true}));
    fireEvent.change(screen.getAllByLabelText("Preço unitário")[0],{target:{value:"25"}});
    await waitFor(()=>expect(onEditorSnapshotChange).toHaveBeenLastCalledWith(expect.any(Object),{total:50,hasMissingPrices:false}));
  });

});

describe("projectPdvPreorderEditorSnapshot", () => {
  const snapshot: PdvPreorderEditorSnapshot = {customerId:"none",stockId:"stock-1",targetTerminalId:"none",notes:"rascunho",orderDiscount:"",lines:[{id:"linha-1",inventoryId:"material-1",itemType:"material",description:"Cobre",quantity:"",unitPrice:"25,",discountAmount:"0",unitFactor:1,sortOrder:0}],coupon:{id:"cupom-1",code:"LOJA",discountCents:100,baseSignature:"assinatura",eligible:true,message:"Aplicado"},dirty:true,sourceRevision:2};
  it("preserva campos em digitação e projeta somente o contrato conhecido sem reutilizar objetos", () => {
    const restored=projectPdvPreorderEditorSnapshot({...snapshot,extra:"ignorar"});
    expect(restored).toEqual(snapshot);
    expect(restored).not.toBe(snapshot);
    expect(restored?.lines[0]).not.toBe(snapshot.lines[0]);
    expect(restored?.coupon).not.toBe(snapshot.coupon);
    expect(projectPdvPreorderEditorSnapshot({...snapshot,coupon:null,sourceRevision:null})).toEqual({...snapshot,coupon:null,sourceRevision:null});
  });
  it.each([null,[],{}, {...snapshot,dirty:"true"},{...snapshot,sourceRevision:-1},{...snapshot,sourceRevision:1.5},{...snapshot,lines:[snapshot.lines[0],snapshot.lines[0]]},{...snapshot,lines:[{...snapshot.lines[0],unitFactor:Infinity}]},{...snapshot,lines:[{...snapshot.lines[0],itemType:"sale"}]},{...snapshot,lines:[{...snapshot.lines[0],sortOrder:"0"}]},{...snapshot,coupon:{...snapshot.coupon,discountCents:-1}},{...snapshot,coupon:{...snapshot.coupon,eligible:"true"}},{...snapshot,coupon:{...snapshot.coupon,message:3}}])("recusa estrutura não confiável %#", value => {
    expect(projectPdvPreorderEditorSnapshot(value)).toBeUndefined();
  });
});

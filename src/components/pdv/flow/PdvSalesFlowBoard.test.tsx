import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PdvSalesFlowBoard } from "./PdvSalesFlowBoard";
import type { PdvSalesFlowCardModel } from "@/hooks/usePdvSalesFlow";

const draft: PdvSalesFlowCardModel = {
  flowId: "preorder:1",
  preorderId: "pre-1",
  preorderNumber: 1,
  orderId: null,
  orderNumber: null,
  stage: "draft",
  customerName: null,
  stockName: "Loja",
  total: 10,
  itemCount: 1,
  remainingItems: 1,
  updatedAt: "2026-11-08T10:00:00Z",
  canSeeAmount: true,
  fulfillmentMode: "dispatch",
};

describe("PdvSalesFlowBoard", () => {
  it("mostra as três etapas do balcão quando a retirada é separada", () => {
    render(
      <PdvSalesFlowBoard
        cards={[]}
        fulfillmentMode="dispatch"
        onOpen={() => undefined}
        formatMoney={String}
      />,
    );
    expect(screen.queryByText("Entregue")).toBeNull();
    for (const label of ["Orçamentos", "No caixa", "Retirada"]) {
      expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
    }
  });

  it("remove retirada e parcial quando a entrega acontece no caixa", () => {
    render(
      <PdvSalesFlowBoard
        cards={[]}
        fulfillmentMode="cashier"
        onOpen={() => undefined}
        formatMoney={String}
      />,
    );
    expect(screen.getAllByText(/Orçamento/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No caixa/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Concluído/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Aguardando retirada/)).toBeNull();
    expect(screen.queryByText(/Retirada parcial/)).toBeNull();
  });

  it("renderiza o card sem oferecer arrastar", () => {
    render(
      <PdvSalesFlowBoard
        cards={[draft]}
        fulfillmentMode="dispatch"
        onOpen={() => undefined}
        formatMoney={(value) => String(value)}
      />,
    );
    const board = screen.getByRole("region", { name: "Fluxo do balcão" });
    expect(within(board).getAllByText("Orçamento #1").length).toBeGreaterThan(0);
    expect(board.querySelector("[draggable='true']")).toBeNull();
  });
  it("mantém a retirada parcial na coluna de retirada sem criar outra etapa", () => {
    render(<PdvSalesFlowBoard cards={[{...draft, flowId: 'order:7', preorderId: null, preorderNumber: null, orderId: 'order-7', orderNumber: 7, stage: 'partial'}]} fulfillmentMode="dispatch" onOpen={() => undefined} formatMoney={String} />);
    expect(screen.getByText('Pedido #7')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Retirada parcial' })).toBeNull();
  });

  it('com pesquisa mostra apenas colunas com resultados e limpar restaura as vazias', () => {
    render(<PdvSalesFlowBoard cards={[draft, { ...draft, flowId:'cash:2', stage:'cash', preorderNumber:2, customerName:'João Ferreira' }]} fulfillmentMode="dispatch" onOpen={() => undefined} formatMoney={String} />);
    const search = screen.getByRole('searchbox', {name:'Buscar no fluxo do balcão'});
    fireEvent.change(search, {target:{value:'joao'}});
    expect(screen.getAllByText('Orçamento #2').length).toBeGreaterThan(0);
    expect(screen.queryByText('Orçamento #1')).not.toBeInTheDocument();
    const columns = document.querySelectorAll('[data-pdv-flow-column]');
    expect(columns.length).toBeGreaterThan(0);
    expect([...columns].every(column => column.getAttribute('data-pdv-flow-column') === 'cash')).toBe(true);
    fireEvent.click(screen.getByRole('button',{name:'Limpar busca do fluxo'}));
    expect(new Set([...document.querySelectorAll('[data-pdv-flow-column]')].map(column=>column.getAttribute('data-pdv-flow-column')))).toEqual(new Set(['draft','cash','pickup']));
    expect(screen.getAllByText('Nenhum pedido aguardando retirada.').length).toBeGreaterThan(0);
  });

  it('sem resultados usa EmptyState e não deixa cabeçalhos vazios', () => {
    render(<PdvSalesFlowBoard cards={[draft]} fulfillmentMode="dispatch" onOpen={() => undefined} formatMoney={String} />);
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'cliente inexistente'}});
    expect(screen.getByText('Nenhum atendimento encontrado')).toBeInTheDocument();
    expect(document.querySelector('[data-kanban-column-header]')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Limpar busca'}));
    expect(screen.getAllByText('Orçamento #1').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-pdv-flow-column="cash"]')).not.toBeNull();
  });

  it('busca código, nome e estoque sem alterar objeto aberto nem liberar valores protegidos', () => {
    const onOpen=vi.fn(); const card={...draft, customerName:'Clínica São Luís', stockName:'Depósito', canSeeAmount:false, total:987654321.99};
    render(<PdvSalesFlowBoard cards={[card]} fulfillmentMode="dispatch" onOpen={onOpen} formatMoney={value=>`SEGREDO ${value}`} />);
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'sao #1 deposito'}});
    fireEvent.click(screen.getAllByRole('button',{name:'Abrir Orçamento #1'})[0]);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(card);
    expect(screen.queryByText(/SEGREDO/)).not.toBeInTheDocument();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
  });

  it('mantém retirada parcial na coluna canônica ao buscar e preserva valores completos', () => {
    const amount='R$ 9.876.543.210,99';
    render(<PdvSalesFlowBoard cards={[{...draft, flowId:'partial:7', stage:'partial', preorderNumber:null, orderNumber:7, orderId:'order-7', customerName:'Retirada QA'}]} fulfillmentMode="dispatch" onOpen={()=>undefined} formatMoney={()=>amount} />);
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'pedido #7'}});
    expect([...document.querySelectorAll('[data-pdv-flow-column]')].every(column=>column.getAttribute('data-pdv-flow-column')==='pickup')).toBe(true);
    expect(screen.getAllByText(amount).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading',{name:'Retirada parcial'})).not.toBeInTheDocument();
  });

});

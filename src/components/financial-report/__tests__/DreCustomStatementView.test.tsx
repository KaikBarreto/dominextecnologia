import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DreCustomStatementView } from "../DreCustomStatementView";
import type { DreCustomStatement } from "@/lib/dreCustomLayout";

const renderMoney = (value: number) => `${value < 0 ? "-" : ""}R$ ${Math.abs(value).toFixed(2)}`;

const statement: DreCustomStatement = {
  layoutId: "layout",
  layoutName: "Gerencial",
  integrity: { sourceEntryCount: 3, displayedEntryCount: 3, unclassifiedCount: 1, outsideDreCount: 1, reconciled: true },
  currencies: [{
    currency: "BRL",
    revenueBase: 1000,
    finalResult: 900,
    sourceSignedTotal: 850,
    displayedSignedTotal: 850,
    sourceEntryCount: 3,
    displayedEntryCount: 3,
    unclassifiedCount: 1,
    outsideDreCount: 1,
    reconciled: true,
    rows: [
      {
        id: "revenue", kind: "macro_group", label: "Receitas", value: 1000,
        impactPercent: 100, affectsResult: true, lines: [],
        groups: [{ id: "sales", label: "Vendas", value: 1000, lines: [{ entryId: "1", categoryId: null, sourceKey: "sales", label: "Vendas", value: 1000, impactPercent: 100 }] }],
      },
      {
        id: "unclassified", kind: "unclassified", label: "Sem classificação", value: -100,
        impactPercent: -10, affectsResult: true, groups: [],
        lines: [{ entryId: "2", categoryId: "new", sourceKey: null, label: "Despesa nova", value: -100, impactPercent: -10, reason: "missing_assignment" }],
      },
      {
        id: "final", kind: "final_result", label: "Resultado", value: 900,
        impactPercent: 90, affectsResult: false, groups: [], lines: [],
      },
      {
        id: "outside", kind: "outside_dre", label: "Fora do DRE", value: -50,
        impactPercent: -5, affectsResult: false, groups: [],
        lines: [{ entryId: "3", categoryId: "distribution", sourceKey: null, label: "Distribuição", value: -50, impactPercent: -5 }],
      },
    ],
  }],
};

describe("DreCustomStatementView", () => {
  it("mantém pendências visíveis, mostra fora do DRE e prova reconciliação", () => {
    render(<DreCustomStatementView statement={statement} isLoading={false} renderValue={renderMoney} />);

    expect(screen.getByText("Sem classificação")).toBeInTheDocument();
    expect(screen.getByText("Despesa nova")).toBeInTheDocument();
    expect(screen.getByText("Visível e incluído provisoriamente no resultado até ser classificado.")).toBeInTheDocument();
    expect(screen.getByText("Fora do DRE")).toBeInTheDocument();
    expect(screen.getByText("3 de 3 itens conferidos nesta moeda.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Fora do DRE"));
    expect(screen.getByText("Distribuição")).toBeInTheDocument();
  });

  it("falha fechado em vez de mostrar cálculo parcial", () => {
    render(<DreCustomStatementView isLoading={false} error={new Error("integridade")} renderValue={renderMoney} />);
    expect(screen.getByText(/não pôde ser calculada com segurança/i)).toBeInTheDocument();
  });

  it("compara períodos na mesma estrutura e abre centro de custo sem esconder o total", () => {
    const withCenters = structuredClone(statement);
    withCenters.currencies[0].rows[0].groups[0].lines[0].costCenters = [
      { id: "yard", name: "Pátio", value: 600 },
      { id: "office", name: "Escritório", value: 400 },
    ];
    const previous = structuredClone(statement);
    previous.currencies[0].rows[0].value = 800;
    previous.currencies[0].rows[0].groups[0].value = 800;
    previous.currencies[0].rows[0].groups[0].lines[0].value = 800;
    render(
      <DreCustomStatementView
        statement={withCenters}
        comparisonStatements={[previous]}
        currentPeriodLabel="Outubro"
        comparisonPeriodLabels={["Setembro"]}
        isLoading={false}
        renderValue={renderMoney}
      />,
    );

    expect(screen.getByText("Setembro")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Receitas"));
    const salesLine = screen.getAllByText("Vendas").find((element) => element.closest("button"));
    fireEvent.click(salesLine!.closest("button")!);
    expect(screen.getByText("Pátio")).toBeInTheDocument();
    expect(screen.getByText("Escritório")).toBeInTheDocument();
    expect(screen.getAllByText("R$ 800.00").length).toBeGreaterThan(0);
  });
});

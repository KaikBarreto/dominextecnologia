import { describe, expect, it } from "vitest";
import {
  buildCustomDreStatement,
  DreCustomIntegrityError,
  type DreCustomLayoutModel,
  type DreNormalizedEntry,
} from "./dreCustomLayout";

const baseLayout = (): DreCustomLayoutModel => ({
  id: "layout-gerencial",
  name: "Gerencial",
  nodes: [
    { id: "revenue", nodeType: "macro_group", label: "Receitas", sortOrder: 10, showWhenZero: true, isPercentageBase: true, entryKind: "income", affectsResult: true, calculationKind: null },
    { id: "net", nodeType: "subtotal", label: "Receita líquida", sortOrder: 20, showWhenZero: true, isPercentageBase: false, entryKind: null, affectsResult: null, calculationKind: "running_total" },
    { id: "cost", nodeType: "macro_group", label: "Custos", sortOrder: 30, showWhenZero: true, isPercentageBase: false, entryKind: "expense", affectsResult: true, calculationKind: null },
    { id: "opex", nodeType: "macro_group", label: "Despesas", sortOrder: 40, showWhenZero: true, isPercentageBase: false, entryKind: "expense", affectsResult: true, calculationKind: null },
    { id: "info", nodeType: "macro_group", label: "Indicadores", sortOrder: 50, showWhenZero: true, isPercentageBase: false, entryKind: "mixed", affectsResult: false, calculationKind: null },
    { id: "selected", nodeType: "subtotal", label: "Margem de contribuição", sortOrder: 60, showWhenZero: true, isPercentageBase: false, entryKind: null, affectsResult: null, calculationKind: "selected_macros" },
    { id: "final", nodeType: "final_result", label: "Resultado", sortOrder: 70, showWhenZero: true, isPercentageBase: false, entryKind: null, affectsResult: null, calculationKind: null },
  ],
  groups: [
    { id: "sales-group", macroNodeId: "revenue", name: "Vendas", sortOrder: 10 },
    { id: "other-income-group", macroNodeId: "revenue", name: "Outras receitas", sortOrder: 20 },
    { id: "cost-group", macroNodeId: "cost", name: "CMV", sortOrder: 10 },
    { id: "opex-group", macroNodeId: "opex", name: "Operacionais", sortOrder: 10 },
    { id: "info-group", macroNodeId: "info", name: "Informativos", sortOrder: 10 },
  ],
  categoryAssignments: [
    { categoryId: "rent", groupId: "opex-group", classification: "group", categoryNameSnapshot: "Aluguel", categoryTypeSnapshot: "expense" },
    { categoryId: "bonus", groupId: "other-income-group", classification: "group", categoryNameSnapshot: "Bonificação", categoryTypeSnapshot: "income" },
    { categoryId: "depreciation", groupId: "info-group", classification: "group", categoryNameSnapshot: "Depreciação", categoryTypeSnapshot: "expense" },
  ],
  sourceAssignments: [
    { sourceKey: "sales", groupId: "sales-group", classification: "group" },
    { sourceKey: "material_cost", groupId: "cost-group", classification: "group" },
  ],
  calculationSources: [
    { calculationNodeId: "selected", macroNodeId: "revenue" },
    { calculationNodeId: "selected", macroNodeId: "cost" },
  ],
});

const entries = (): DreNormalizedEntry[] => [
  { entryId: "sales:BRL", sourceKind: "structural", sourceKey: "sales", categoryId: null, label: "Vendas", entryKind: "income", currency: "BRL", amount: 1_000 },
  { entryId: "cost:BRL", sourceKind: "structural", sourceKey: "material_cost", categoryId: null, label: "CMV", entryKind: "expense", currency: "BRL", amount: 400 },
  { entryId: "rent:BRL", sourceKind: "category", sourceKey: null, categoryId: "rent", label: "Aluguel", entryKind: "expense", currency: "BRL", amount: 200 },
  { entryId: "bonus:BRL", sourceKind: "category", sourceKey: null, categoryId: "bonus", label: "Bonificação", entryKind: "income", currency: "BRL", amount: 50 },
  { entryId: "depreciation:BRL", sourceKind: "category", sourceKey: null, categoryId: "depreciation", label: "Depreciação", entryKind: "expense", currency: "BRL", amount: 25 },
];

const row = (layout: DreCustomLayoutModel, kind: string, input = entries()) =>
  buildCustomDreStatement(layout, input).currencies[0].rows.find((item) => item.kind === kind)!;

describe("buildCustomDreStatement — integridade financeira", () => {
  it("reconcilia todas as entradas exatamente uma vez e preserva sinais", () => {
    const result = buildCustomDreStatement(baseLayout(), entries());
    const brl = result.currencies[0];
    expect(result.integrity).toEqual({
      sourceEntryCount: 5,
      displayedEntryCount: 5,
      unclassifiedCount: 0,
      outsideDreCount: 0,
      reconciled: true,
    });
    expect(brl.sourceSignedTotal).toBe(425);
    expect(brl.displayedSignedTotal).toBe(425);
    // Depreciação aparece, mas o macrogrupo informativo não afeta o resultado.
    expect(brl.finalResult).toBe(450);
  });

  it("categoria nova sem atribuição nunca some e entra no resultado natural", () => {
    const input = [...entries(), {
      entryId: "new:BRL", sourceKind: "category" as const, sourceKey: null,
      categoryId: "new-category", label: "Despesa nova", entryKind: "expense" as const,
      currency: "BRL", amount: 30,
    }];
    const result = buildCustomDreStatement(baseLayout(), input);
    const brl = result.currencies[0];
    const unclassified = brl.rows.find((item) => item.kind === "unclassified")!;
    expect(unclassified.lines.map((line) => line.label)).toEqual(["Despesa nova"]);
    expect(unclassified.lines[0].reason).toBe("missing_assignment");
    expect(brl.finalResult).toBe(420);
    expect(result.integrity.unclassifiedCount).toBe(1);
    expect(result.integrity.reconciled).toBe(true);
  });

  it("lançamento sem category_id fica visível em Sem classificação", () => {
    const input: DreNormalizedEntry[] = [{
      entryId: "orphan:BRL", sourceKind: "category", sourceKey: null, categoryId: null,
      label: "Sem categoria", entryKind: "expense", currency: "BRL", amount: 99,
    }, ...entries()];
    const unclassified = row(baseLayout(), "unclassified", input);
    expect(unclassified.value).toBe(-99);
    expect(unclassified.lines[0].reason).toBe("missing_category");
  });

  it("categoria explicitamente fora do DRE continua visível e não altera o resultado", () => {
    const layout = baseLayout();
    layout.categoryAssignments = layout.categoryAssignments.map((assignment) =>
      assignment.categoryId === "rent"
        ? { ...assignment, classification: "outside_dre", groupId: null }
        : assignment,
    );
    const result = buildCustomDreStatement(layout, entries());
    const brl = result.currencies[0];
    expect(brl.rows.find((item) => item.kind === "outside_dre")?.lines[0].label).toBe("Aluguel");
    expect(brl.finalResult).toBe(650);
    expect(result.integrity.outsideDreCount).toBe(1);
    expect(brl.sourceSignedTotal).toBe(425);
    expect(brl.displayedSignedTotal).toBe(425);
  });

  it("macrogrupo fora do resultado aparece sem contaminar subtotal ou resultado final", () => {
    const layout = baseLayout();
    const info = row(layout, "macro_group").label;
    const result = buildCustomDreStatement(layout, entries()).currencies[0];
    expect(info).toBe("Receitas");
    expect(result.rows.find((item) => item.id === "info")?.value).toBe(-25);
    expect(result.rows.find((item) => item.id === "info")?.affectsResult).toBe(false);
    expect(result.finalResult).toBe(450);
  });

  it("subtotal selecionado soma só os macrogrupos escolhidos", () => {
    const selected = buildCustomDreStatement(baseLayout(), entries()).currencies[0].rows
      .find((item) => item.id === "selected")!;
    expect(selected.value).toBe(650); // receitas 1050 + custos -400; sem OPEX
  });

  it("não soma moedas diferentes e reconcilia cada moeda isoladamente", () => {
    const usd = entries().map((entry) => ({ ...entry, entryId: `${entry.entryId}:USD`, currency: "USD", amount: entry.amount * 2 }));
    const result = buildCustomDreStatement(baseLayout(), [...entries(), ...usd]);
    expect(result.currencies.map((item) => item.currency)).toEqual(["BRL", "USD"]);
    expect(result.currencies[0].finalResult).toBe(450);
    expect(result.currencies[1].finalResult).toBe(900);
    expect(result.currencies.every((item) => item.reconciled)).toBe(true);
  });

  it("mantém a estrutura visível no período sem lançamentos", () => {
    const result = buildCustomDreStatement(baseLayout(), [], ["BRL"]);

    expect(result.currencies).toHaveLength(1);
    expect(result.currencies[0].currency).toBe("BRL");
    expect(result.currencies[0].finalResult).toBe(0);
    expect(result.currencies[0].rows.some((row) => row.kind === "final_result")).toBe(true);
    expect(result.integrity.reconciled).toBe(true);
  });

  it("agrega a categoria sem perder a abertura por centro de custo", () => {
    const input = entries().filter((entry) => entry.categoryId !== "rent");
    input.push(
      { entryId: "rent:BRL:yard", sourceKind: "category", sourceKey: null, categoryId: "rent", label: "Aluguel", entryKind: "expense", currency: "BRL", amount: 120, costCenterId: "yard", costCenterName: "Pátio" },
      { entryId: "rent:BRL:office", sourceKind: "category", sourceKey: null, categoryId: "rent", label: "Aluguel", entryKind: "expense", currency: "BRL", amount: 80, costCenterId: "office", costCenterName: "Escritório" },
    );
    const result = buildCustomDreStatement(baseLayout(), input).currencies[0];
    const rent = result.rows.find((item) => item.id === "opex")?.groups[0].lines[0];
    expect(rent?.value).toBe(-200);
    expect(rent?.costCenters).toEqual([
      { id: "office", name: "Escritório", value: -80 },
      { id: "yard", name: "Pátio", value: -120 },
    ]);
    expect(result.sourceEntryCount).toBe(6);
    expect(result.displayedEntryCount).toBe(6);
    expect(result.reconciled).toBe(true);
  });

  it("duas configurações usam as mesmas entradas sem alterar a origem", () => {
    const gerencial = baseLayout();
    const ebitda = baseLayout();
    ebitda.id = "layout-ebitda";
    ebitda.name = "EBITDA";
    ebitda.nodes = ebitda.nodes.map((node) => node.id === "info" ? { ...node, affectsResult: true } : node);
    const original = entries();
    const snapshot = structuredClone(original);
    const a = buildCustomDreStatement(gerencial, original);
    const b = buildCustomDreStatement(ebitda, original);
    expect(a.currencies[0].sourceSignedTotal).toBe(b.currencies[0].sourceSignedTotal);
    expect(a.currencies[0].finalResult).toBe(450);
    expect(b.currencies[0].finalResult).toBe(425);
    expect(original).toEqual(snapshot);
  });

  it("mudança de tipo após publicação não troca sinal nem entra no grupo errado", () => {
    const input = entries().map((entry) => entry.categoryId === "rent"
      ? { ...entry, entryKind: "income" as const, amount: 200 }
      : entry);
    const result = buildCustomDreStatement(baseLayout(), input).currencies[0];
    const unclassified = result.rows.find((item) => item.kind === "unclassified")!;
    expect(unclassified.lines[0]).toMatchObject({ label: "Aluguel", value: 200, reason: "incompatible_assignment" });
    expect(result.finalResult).toBe(850);
  });

  it("percentual usa somente o macrogrupo escolhido como base", () => {
    const result = buildCustomDreStatement(baseLayout(), entries()).currencies[0];
    expect(result.revenueBase).toBe(1050);
    expect(result.rows.find((item) => item.id === "cost")?.impactPercent).toBeCloseTo(-38.095238, 5);
    expect(result.rows.find((item) => item.kind === "final_result")?.impactPercent).toBeCloseTo(42.857142, 5);
  });

  it("base zerada produz percentual zero, nunca Infinity ou NaN", () => {
    const input = entries().filter((entry) => entry.entryKind !== "income");
    const result = buildCustomDreStatement(baseLayout(), input).currencies[0];
    expect(result.revenueBase).toBe(0);
    result.rows.forEach((item) => expect(Number.isFinite(item.impactPercent)).toBe(true));
  });

  it("falha fechado com entrada duplicada, valor inválido ou moeda ausente", () => {
    expect(() => buildCustomDreStatement(baseLayout(), [...entries(), entries()[0]]))
      .toThrow(DreCustomIntegrityError);
    expect(() => buildCustomDreStatement(baseLayout(), [{ ...entries()[0], amount: Number.NaN }]))
      .toThrow("valor inválido");
    expect(() => buildCustomDreStatement(baseLayout(), [{ ...entries()[0], currency: "" }]))
      .toThrow("não possui moeda");
  });

  it("falha fechado com layout sem resultado ou base percentual", () => {
    const noFinal = baseLayout();
    noFinal.nodes = noFinal.nodes.filter((node) => node.nodeType !== "final_result");
    expect(() => buildCustomDreStatement(noFinal, entries())).toThrow("exatamente um resultado final");
    const noBase = baseLayout();
    noBase.nodes = noBase.nodes.map((node) => ({ ...node, isPercentageBase: false }));
    expect(() => buildCustomDreStatement(noBase, entries())).toThrow("exatamente uma base percentual");
  });
});

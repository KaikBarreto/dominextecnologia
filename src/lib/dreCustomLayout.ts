export type DreEntryKind = "income" | "expense";
export type DreMacroEntryKind = DreEntryKind | "mixed";
export type DreAssignmentClassification = "group" | "outside_dre" | "unclassified";

export interface DreCustomNode {
  id: string;
  nodeType: "macro_group" | "subtotal" | "final_result";
  label: string;
  sortOrder: number;
  showWhenZero: boolean;
  isPercentageBase: boolean;
  entryKind: DreMacroEntryKind | null;
  affectsResult: boolean | null;
  calculationKind: "running_total" | "selected_macros" | null;
}

export interface DreCustomGroup {
  id: string;
  macroNodeId: string;
  name: string;
  sortOrder: number;
}

export interface DreCustomCategoryAssignment {
  categoryId: string | null;
  groupId: string | null;
  classification: DreAssignmentClassification;
  categoryNameSnapshot: string;
  categoryTypeSnapshot: DreMacroEntryKind;
}

export interface DreCustomSourceAssignment {
  sourceKey: "sales" | "material_cost";
  groupId: string | null;
  classification: DreAssignmentClassification;
}

export interface DreCustomCalculationSource {
  calculationNodeId: string;
  macroNodeId: string;
}

export interface DreCustomLayoutModel {
  id: string;
  name: string;
  nodes: DreCustomNode[];
  groups: DreCustomGroup[];
  categoryAssignments: DreCustomCategoryAssignment[];
  sourceAssignments: DreCustomSourceAssignment[];
  calculationSources: DreCustomCalculationSource[];
}

export interface DreNormalizedEntry {
  entryId: string;
  sourceKind: "category" | "structural";
  sourceKey: "sales" | "material_cost" | null;
  categoryId: string | null;
  label: string;
  color?: string | null;
  costCenterId?: string | null;
  costCenterName?: string | null;
  entryKind: DreEntryKind;
  currency: string;
  amount: number;
}

export interface DreCustomLine {
  entryId: string;
  categoryId: string | null;
  sourceKey: DreNormalizedEntry["sourceKey"];
  label: string;
  color?: string | null;
  entryKind?: DreEntryKind;
  value: number;
  impactPercent: number;
  costCenters?: Array<{ id: string | null; name: string; value: number }>;
  reason?: "missing_category" | "missing_assignment" | "explicit_unclassified" | "incompatible_assignment";
}

export interface DreCustomGroupResult {
  id: string;
  label: string;
  value: number;
  lines: DreCustomLine[];
}

export interface DreCustomRow {
  id: string;
  kind: "macro_group" | "subtotal" | "final_result" | "unclassified" | "outside_dre";
  label: string;
  value: number;
  impactPercent: number;
  affectsResult: boolean;
  groups: DreCustomGroupResult[];
  lines: DreCustomLine[];
}

export interface DreCurrencyStatement {
  currency: string;
  rows: DreCustomRow[];
  revenueBase: number;
  finalResult: number;
  sourceSignedTotal: number;
  displayedSignedTotal: number;
  sourceEntryCount: number;
  displayedEntryCount: number;
  unclassifiedCount: number;
  outsideDreCount: number;
  reconciled: boolean;
}

export interface DreCustomStatement {
  layoutId: string;
  layoutName: string;
  currencies: DreCurrencyStatement[];
  integrity: {
    sourceEntryCount: number;
    displayedEntryCount: number;
    unclassifiedCount: number;
    outsideDreCount: number;
    reconciled: boolean;
  };
}

export class DreCustomIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DreCustomIntegrityError";
  }
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const closeEnough = (a: number, b: number) => Math.abs(a - b) <= 1e-7;
const signedValue = (entry: DreNormalizedEntry) =>
  entry.entryKind === "income" ? Math.abs(entry.amount) : -Math.abs(entry.amount);
const impactPercent = (value: number, revenueBase: number) =>
  revenueBase === 0 ? 0 : (value / Math.abs(revenueBase)) * 100;

function assertUniqueIds(values: Array<{ id: string }>, label: string) {
  const ids = new Set<string>();
  values.forEach(({ id }) => {
    if (!id || ids.has(id)) throw new DreCustomIntegrityError(`${label} possui identificador duplicado ou vazio`);
    ids.add(id);
  });
}

function validateLayout(layout: DreCustomLayoutModel) {
  assertUniqueIds(layout.nodes, "A estrutura");
  assertUniqueIds(layout.groups, "Os grupos");
  if (layout.nodes.filter((node) => node.nodeType === "final_result").length !== 1) {
    throw new DreCustomIntegrityError("A estrutura precisa ter exatamente um resultado final");
  }
  if (layout.nodes.filter((node) => node.isPercentageBase).length !== 1) {
    throw new DreCustomIntegrityError("A estrutura precisa ter exatamente uma base percentual");
  }
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  layout.groups.forEach((group) => {
    if (nodesById.get(group.macroNodeId)?.nodeType !== "macro_group") {
      throw new DreCustomIntegrityError(`O grupo ${group.name} aponta para um macrogrupo inválido`);
    }
  });
  const groupsById = new Map(layout.groups.map((group) => [group.id, group]));
  const assignedCategories = new Set<string>();
  layout.categoryAssignments.forEach((assignment) => {
    if (assignment.categoryId) {
      if (assignedCategories.has(assignment.categoryId)) {
        throw new DreCustomIntegrityError("Uma categoria foi vinculada mais de uma vez na mesma configuração");
      }
      assignedCategories.add(assignment.categoryId);
    }
    if (assignment.classification === "group" && !groupsById.has(assignment.groupId ?? "")) {
      throw new DreCustomIntegrityError(`A categoria ${assignment.categoryNameSnapshot} aponta para um grupo inexistente`);
    }
  });
  const assignedSources = new Set<string>();
  layout.sourceAssignments.forEach((assignment) => {
    if (assignedSources.has(assignment.sourceKey)) {
      throw new DreCustomIntegrityError("Uma fonte estrutural foi vinculada mais de uma vez");
    }
    assignedSources.add(assignment.sourceKey);
    if (assignment.classification === "group" && !groupsById.has(assignment.groupId ?? "")) {
      throw new DreCustomIntegrityError(`A fonte ${assignment.sourceKey} aponta para um grupo inexistente`);
    }
  });
  layout.calculationSources.forEach((source) => {
    const calculation = nodesById.get(source.calculationNodeId);
    const macro = nodesById.get(source.macroNodeId);
    if (calculation?.nodeType !== "subtotal" || calculation.calculationKind !== "selected_macros") {
      throw new DreCustomIntegrityError("Fonte de cálculo aponta para uma linha que não aceita seleção");
    }
    if (macro?.nodeType !== "macro_group" || !macro.affectsResult) {
      throw new DreCustomIntegrityError("Subtotal aponta para macrogrupo inválido ou fora do resultado");
    }
  });
}

type RoutedEntry = {
  entry: DreNormalizedEntry;
  value: number;
  destination: "group" | "unclassified" | "outside_dre";
  groupId?: string;
  reason?: DreCustomLine["reason"];
};

function linesFrom(items: RoutedEntry[], revenueBase: number): DreCustomLine[] {
  const buckets = new Map<string, RoutedEntry[]>();
  items.forEach((item) => {
    const key = [
      item.entry.sourceKind,
      item.entry.sourceKey ?? "",
      item.entry.categoryId ?? "",
      item.entry.entryKind,
      item.entry.label,
      item.reason ?? "",
    ].join(":");
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  });
  return [...buckets.values()].map((bucket) => {
    const first = bucket[0];
    const value = sum(bucket.map((item) => item.value));
    const centers = new Map<string, { id: string | null; name: string; value: number }>();
    bucket.forEach((item) => {
      const id = item.entry.costCenterId ?? null;
      const name = item.entry.costCenterName?.trim() || "Sem centro de custo";
      const key = id ?? `name:${name}`;
      const current = centers.get(key) ?? { id, name, value: 0 };
      current.value += item.value;
      centers.set(key, current);
    });
    return {
      entryId: bucket.length === 1 ? first.entry.entryId : `aggregated:${first.entry.sourceKey ?? first.entry.categoryId ?? first.entry.label}:${first.entry.entryKind}`,
      categoryId: first.entry.categoryId,
      sourceKey: first.entry.sourceKey,
      label: first.entry.label,
      color: first.entry.color,
      entryKind: first.entry.entryKind,
      value,
      impactPercent: impactPercent(value, revenueBase),
      costCenters: [...centers.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      reason: first.reason,
    };
  });
}

function routeEntries(layout: DreCustomLayoutModel, entries: DreNormalizedEntry[]): RoutedEntry[] {
  const groupsById = new Map(layout.groups.map((group) => [group.id, group]));
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]));
  const categoryAssignments = new Map(
    layout.categoryAssignments
      .filter((assignment) => assignment.categoryId)
      .map((assignment) => [assignment.categoryId!, assignment]),
  );
  const sourceAssignments = new Map(
    layout.sourceAssignments.map((assignment) => [assignment.sourceKey, assignment]),
  );

  return entries.map((entry): RoutedEntry => {
    const value = signedValue(entry);
    const assignment = entry.sourceKind === "category"
      ? entry.categoryId ? categoryAssignments.get(entry.categoryId) : undefined
      : entry.sourceKey ? sourceAssignments.get(entry.sourceKey) : undefined;

    if (entry.sourceKind === "category" && !entry.categoryId) {
      return { entry, value, destination: "unclassified", reason: "missing_category" };
    }
    if (!assignment) {
      return { entry, value, destination: "unclassified", reason: "missing_assignment" };
    }
    if (assignment.classification === "outside_dre") {
      return { entry, value, destination: "outside_dre" };
    }
    if (assignment.classification === "unclassified") {
      return { entry, value, destination: "unclassified", reason: "explicit_unclassified" };
    }
    const groupId = assignment.groupId;
    const macro = groupId ? nodesById.get(groupsById.get(groupId)?.macroNodeId ?? "") : undefined;
    const compatible = macro?.nodeType === "macro_group"
      && (macro.entryKind === "mixed" || macro.entryKind === entry.entryKind);
    if (!compatible) {
      return { entry, value, destination: "unclassified", reason: "incompatible_assignment" };
    }
    return { entry, value, destination: "group", groupId };
  });
}

function buildCurrencyStatement(
  layout: DreCustomLayoutModel,
  currency: string,
  entries: DreNormalizedEntry[],
): DreCurrencyStatement {
  const routed = routeEntries(layout, entries);
  const nodes = [...layout.nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const groupsByMacro = new Map<string, DreCustomGroup[]>();
  layout.groups.forEach((group) => {
    const siblings = groupsByMacro.get(group.macroNodeId) ?? [];
    siblings.push(group);
    groupsByMacro.set(group.macroNodeId, siblings);
  });
  groupsByMacro.forEach((groups) => groups.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")));

  const macroValues = new Map<string, number>();
  nodes.filter((node) => node.nodeType === "macro_group").forEach((node) => {
    const groupIds = new Set((groupsByMacro.get(node.id) ?? []).map((group) => group.id));
    macroValues.set(node.id, sum(routed.filter((item) => item.destination === "group" && groupIds.has(item.groupId ?? "")).map((item) => item.value)));
  });
  const percentageNode = nodes.find((node) => node.isPercentageBase)!;
  const revenueBase = macroValues.get(percentageNode.id) ?? 0;
  const rows: DreCustomRow[] = [];
  const runningMacroIds: string[] = [];
  const calculationSources = new Map<string, string[]>();
  layout.calculationSources.forEach((source) => {
    const ids = calculationSources.get(source.calculationNodeId) ?? [];
    ids.push(source.macroNodeId);
    calculationSources.set(source.calculationNodeId, ids);
  });

  nodes.forEach((node) => {
    if (node.nodeType === "macro_group") {
      runningMacroIds.push(node.id);
      const groups = (groupsByMacro.get(node.id) ?? []).map((group): DreCustomGroupResult => {
        const lines = linesFrom(
          routed.filter((item) => item.destination === "group" && item.groupId === group.id),
          revenueBase,
        );
        return { id: group.id, label: group.name, value: sum(lines.map((line) => line.value)), lines };
      });
      const value = macroValues.get(node.id) ?? 0;
      if (node.showWhenZero || value !== 0 || groups.some((group) => group.lines.length > 0)) {
        rows.push({
          id: node.id,
          kind: "macro_group",
          label: node.label,
          value,
          impactPercent: impactPercent(value, revenueBase),
          affectsResult: Boolean(node.affectsResult),
          groups,
          lines: [],
        });
      }
      return;
    }
    if (node.nodeType === "subtotal") {
      const sourceIds = node.calculationKind === "running_total"
        ? runningMacroIds
        : (calculationSources.get(node.id) ?? []);
      const value = sum(sourceIds.map((id) => {
        const macro = layout.nodes.find((candidate) => candidate.id === id);
        return macro?.affectsResult ? (macroValues.get(id) ?? 0) : 0;
      }));
      if (node.showWhenZero || value !== 0) {
        rows.push({
          id: node.id,
          kind: "subtotal",
          label: node.label,
          value,
          impactPercent: impactPercent(value, revenueBase),
          affectsResult: false,
          groups: [],
          lines: [],
        });
      }
      return;
    }
    const unclassified = routed.filter((item) => item.destination === "unclassified");
    if (unclassified.length > 0) {
      const lines = linesFrom(unclassified, revenueBase);
      rows.push({
        id: `unclassified:${currency}`,
        kind: "unclassified",
        label: "Sem classificação",
        value: sum(lines.map((line) => line.value)),
        impactPercent: impactPercent(sum(lines.map((line) => line.value)), revenueBase),
        affectsResult: true,
        groups: [],
        lines,
      });
    }
    const finalResult = sum(
      layout.nodes
        .filter((candidate) => candidate.nodeType === "macro_group" && candidate.affectsResult)
        .map((candidate) => macroValues.get(candidate.id) ?? 0),
    ) + sum(unclassified.map((item) => item.value));
    rows.push({
      id: node.id,
      kind: "final_result",
      label: node.label,
      value: finalResult,
      impactPercent: impactPercent(finalResult, revenueBase),
      affectsResult: false,
      groups: [],
      lines: [],
    });
  });

  const outside = routed.filter((item) => item.destination === "outside_dre");
  if (outside.length > 0) {
    const lines = linesFrom(outside, revenueBase);
    rows.push({
      id: `outside:${currency}`,
      kind: "outside_dre",
      label: "Fora do DRE",
      value: sum(lines.map((line) => line.value)),
      impactPercent: impactPercent(sum(lines.map((line) => line.value)), revenueBase),
      affectsResult: false,
      groups: [],
      lines,
    });
  }

  const sourceSignedTotal = sum(routed.map((item) => item.value));
  const displayedSignedTotal = sum(
    routed.filter((item) => item.destination === "group" || item.destination === "unclassified" || item.destination === "outside_dre")
      .map((item) => item.value),
  );
  const displayedEntryCount = routed.length;
  const reconciled = displayedEntryCount === entries.length && closeEnough(sourceSignedTotal, displayedSignedTotal);
  if (!reconciled) {
    throw new DreCustomIntegrityError(`A visão ${layout.name} não reconciliou todas as entradas em ${currency}`);
  }

  return {
    currency,
    rows,
    revenueBase,
    finalResult: rows.find((row) => row.kind === "final_result")?.value ?? 0,
    sourceSignedTotal,
    displayedSignedTotal,
    sourceEntryCount: entries.length,
    displayedEntryCount,
    unclassifiedCount: routed.filter((item) => item.destination === "unclassified").length,
    outsideDreCount: outside.length,
    reconciled,
  };
}

export function buildCustomDreStatement(
  layout: DreCustomLayoutModel,
  entries: DreNormalizedEntry[],
  fallbackCurrencies: string[] = [],
): DreCustomStatement {
  validateLayout(layout);
  const entryIds = new Set<string>();
  entries.forEach((entry) => {
    if (!entry.entryId || entryIds.has(entry.entryId)) {
      throw new DreCustomIntegrityError("O motor recebeu uma entrada duplicada ou sem identificador");
    }
    entryIds.add(entry.entryId);
    if (!entry.currency?.trim()) throw new DreCustomIntegrityError(`A entrada ${entry.entryId} não possui moeda`);
    if (!Number.isFinite(entry.amount)) throw new DreCustomIntegrityError(`A entrada ${entry.entryId} possui valor inválido`);
  });
  const currencies = [...new Set([
    ...entries.map((entry) => entry.currency),
    ...fallbackCurrencies
      .filter((currency): currency is string => typeof currency === "string")
      .map((currency) => currency.trim())
      .filter(Boolean),
  ])].sort();
  const statements = currencies.map((currency) =>
    buildCurrencyStatement(layout, currency, entries.filter((entry) => entry.currency === currency)),
  );
  return {
    layoutId: layout.id,
    layoutName: layout.name,
    currencies: statements,
    integrity: {
      sourceEntryCount: entries.length,
      displayedEntryCount: sum(statements.map((statement) => statement.displayedEntryCount)),
      unclassifiedCount: sum(statements.map((statement) => statement.unclassifiedCount)),
      outsideDreCount: sum(statements.map((statement) => statement.outsideDreCount)),
      reconciled: statements.every((statement) => statement.reconciled)
        && sum(statements.map((statement) => statement.displayedEntryCount)) === entries.length,
    },
  };
}

import { describe, expect, it } from "vitest";
import { mapDreLayoutBundle, type DreLayoutBundle } from "./useDreLayoutProfiles";

describe("mapDreLayoutBundle", () => {
  it("mapeia snake_case sem perder IDs, sinais lógicos ou classificações", () => {
    const bundle: DreLayoutBundle = {
      layout: {
        id: "layout-1",
        profile_id: "profile-1",
        version: 2,
        name: "EBITDA",
        status: "active",
        published_at: "2026-10-29T00:00:00Z",
        created_at: "2026-10-29T00:00:00Z",
      },
      nodes: [{
        id: "macro-1", node_type: "macro_group", label: "Receitas", sort_order: "10",
        show_when_zero: true, is_percentage_base: true, entry_kind: "income",
        affects_result: true, calculation_kind: null,
      }],
      groups: [{ id: "group-1", macro_node_id: "macro-1", name: "Vendas", sort_order: "10" }],
      categoryAssignments: [{
        category_id: "category-1", group_id: "group-1", classification: "group",
        category_name_snapshot: "Serviços", category_type_snapshot: "income",
      }],
      sourceAssignments: [{ source_key: "sales", group_id: "group-1", classification: "group" }],
      calculationSources: [],
    };

    expect(mapDreLayoutBundle(bundle)).toEqual({
      id: "layout-1",
      name: "EBITDA",
      nodes: [{
        id: "macro-1", nodeType: "macro_group", label: "Receitas", sortOrder: 10,
        showWhenZero: true, isPercentageBase: true, entryKind: "income",
        affectsResult: true, calculationKind: null,
      }],
      groups: [{ id: "group-1", macroNodeId: "macro-1", name: "Vendas", sortOrder: 10 }],
      categoryAssignments: [{
        categoryId: "category-1", groupId: "group-1", classification: "group",
        categoryNameSnapshot: "Serviços", categoryTypeSnapshot: "income",
      }],
      sourceAssignments: [{ sourceKey: "sales", groupId: "group-1", classification: "group" }],
      calculationSources: [],
    });
  });
});

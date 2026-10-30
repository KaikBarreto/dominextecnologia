import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  DreCustomCategoryAssignment,
  DreCustomCalculationSource,
  DreCustomGroup,
  DreCustomLayoutModel,
  DreCustomNode,
  DreCustomSourceAssignment,
  DreNormalizedEntry,
} from "@/lib/dreCustomLayout";

export interface DreLayoutRecord {
  id: string;
  profile_id: string;
  version: number;
  name: string;
  status: "draft" | "active" | "archived";
  published_at: string | null;
  created_at: string;
}

export interface DreLayoutBundle {
  layout: DreLayoutRecord;
  nodes: Array<Record<string, any>>;
  groups: Array<Record<string, any>>;
  categoryAssignments: Array<Record<string, any>>;
  sourceAssignments: Array<Record<string, any>>;
  calculationSources: Array<Record<string, any>>;
}

export interface DreLayoutProfileBundle {
  profile: {
    id: string;
    company_id: string;
    name: string;
    description: string | null;
    active_layout_id: string | null;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
  };
  active: DreLayoutBundle | null;
  draft: DreLayoutBundle | null;
}

export interface DreLayoutConfiguration {
  settings: {
    company_id: string;
    mode: "legacy" | "custom";
    default_profile_id: string | null;
  };
  profiles: DreLayoutProfileBundle[];
}

export interface DreLayoutValidationItem {
  code: string;
  message: string;
  count: number;
}

export interface DreLayoutValidation {
  valid: boolean;
  blockers: DreLayoutValidationItem[];
  warnings: DreLayoutValidationItem[];
  counts?: Record<string, number>;
}

const configurationKey = (companyId?: string) => ["dre-layout-profiles", companyId] as const;

async function callDreRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // As RPCs são introduzidas pela migration desta entrega e ainda não existem
  // no arquivo de tipos gerado. O cast fica isolado aqui até a regeneração.
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function mapDreLayoutBundle(bundle: DreLayoutBundle): DreCustomLayoutModel {
  const nodes: DreCustomNode[] = bundle.nodes.map((node) => ({
    id: node.id,
    nodeType: node.node_type,
    label: node.label,
    sortOrder: Number(node.sort_order),
    showWhenZero: Boolean(node.show_when_zero),
    isPercentageBase: Boolean(node.is_percentage_base),
    entryKind: node.entry_kind,
    affectsResult: node.affects_result,
    calculationKind: node.calculation_kind,
  }));
  const groups: DreCustomGroup[] = bundle.groups.map((group) => ({
    id: group.id,
    macroNodeId: group.macro_node_id,
    name: group.name,
    sortOrder: Number(group.sort_order),
  }));
  const categoryAssignments: DreCustomCategoryAssignment[] = bundle.categoryAssignments.map((assignment) => ({
    categoryId: assignment.category_id,
    groupId: assignment.group_id,
    classification: assignment.classification,
    categoryNameSnapshot: assignment.category_name_snapshot,
    categoryTypeSnapshot: assignment.category_type_snapshot,
  }));
  const sourceAssignments: DreCustomSourceAssignment[] = bundle.sourceAssignments.map((assignment) => ({
    sourceKey: assignment.source_key,
    groupId: assignment.group_id,
    classification: assignment.classification,
  }));
  const calculationSources: DreCustomCalculationSource[] = bundle.calculationSources.map((source) => ({
    calculationNodeId: source.calculation_node_id,
    macroNodeId: source.macro_node_id,
  }));
  return {
    id: bundle.layout.id,
    name: bundle.layout.name,
    nodes,
    groups,
    categoryAssignments,
    sourceAssignments,
    calculationSources,
  };
}

export function useDreLayoutProfiles(companyId?: string, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: configurationKey(companyId),
    enabled: enabled && !!companyId,
    queryFn: async () => callDreRpc<DreLayoutConfiguration>("get_company_dre_configuration", {
      p_company_id: companyId,
    }),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: configurationKey(companyId) });

  const createDraft = useMutation({
    mutationFn: ({ profileId, name }: { profileId?: string; name: string }) => {
      if (!companyId) throw new Error("Empresa não identificada");
      return callDreRpc<string>("create_dre_layout_draft", {
        p_company_id: companyId,
        p_profile_id: profileId ?? null,
        p_name: name,
      });
    },
    onSuccess: invalidate,
  });
  const renameProfile = useMutation({
    mutationFn: ({ profileId, name, description }: { profileId: string; name: string; description?: string }) =>
      callDreRpc("update_dre_layout_profile", {
        p_profile_id: profileId,
        p_name: name,
        p_description: description ?? null,
      }),
    onSuccess: invalidate,
  });
  const validateLayout = (layoutId: string) =>
    callDreRpc<DreLayoutValidation>("validate_dre_layout", { p_layout_id: layoutId });
  const publishLayout = useMutation({
    mutationFn: (layoutId: string) => callDreRpc("publish_dre_layout", { p_layout_id: layoutId }),
    onSuccess: invalidate,
  });
  const setDefault = useMutation({
    mutationFn: (profileId: string) => {
      if (!companyId) throw new Error("Empresa não identificada");
      return callDreRpc("set_default_dre_layout_profile", {
        p_company_id: companyId,
        p_profile_id: profileId,
      });
    },
    onSuccess: invalidate,
  });
  const restoreLegacy = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error("Empresa não identificada");
      return callDreRpc("restore_legacy_dre", { p_company_id: companyId });
    },
    onSuccess: invalidate,
  });
  const archiveProfile = useMutation({
    mutationFn: (profileId: string) => callDreRpc("archive_dre_layout_profile", { p_profile_id: profileId }),
    onSuccess: invalidate,
  });
  const updateDraftNode = useMutation({
    mutationFn: async ({
      nodeId,
      label,
      entryKind,
      affectsResult,
      showWhenZero,
    }: {
      nodeId: string;
      label: string;
      entryKind: "income" | "expense" | "mixed";
      affectsResult: boolean;
      showWhenZero: boolean;
    }) => {
      const { error } = await (supabase as any)
        .from("dre_layout_nodes")
        .update({
          label: label.trim(),
          entry_kind: entryKind,
          affects_result: affectsResult,
          show_when_zero: showWhenZero,
        })
        .eq("id", nodeId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const createDraftNode = useMutation({
    mutationFn: async ({
      layoutId,
      label,
      entryKind,
    }: {
      layoutId: string;
      label: string;
      entryKind: "income" | "expense" | "mixed";
    }) => {
      return callDreRpc<string>("create_dre_layout_node", {
        p_layout_id: layoutId,
        p_node_type: "macro_group",
        p_label: label.trim(),
        p_entry_kind: entryKind,
        p_calculation_kind: null,
      });
    },
    onSuccess: invalidate,
  });
  const createDraftSubtotal = useMutation({
    mutationFn: ({ layoutId, label, calculationKind }: {
      layoutId: string;
      label: string;
      calculationKind: "running_total" | "selected_macros";
    }) => callDreRpc<string>("create_dre_layout_node", {
      p_layout_id: layoutId,
      p_node_type: "subtotal",
      p_label: label.trim(),
      p_entry_kind: null,
      p_calculation_kind: calculationKind,
    }),
    onSuccess: invalidate,
  });
  const setDraftCalculationSources = useMutation({
    mutationFn: ({ calculationNodeId, macroNodeIds }: { calculationNodeId: string; macroNodeIds: string[] }) =>
      callDreRpc("set_dre_layout_calculation_sources", {
        p_calculation_node_id: calculationNodeId,
        p_macro_node_ids: macroNodeIds,
      }),
    onSuccess: invalidate,
  });
  const reorderDraftNodes = useMutation({
    mutationFn: ({ layoutId, nodeIds }: { layoutId: string; nodeIds: string[] }) =>
      callDreRpc("reorder_dre_layout_nodes", {
        p_layout_id: layoutId,
        p_node_ids: nodeIds,
      }),
    onSuccess: invalidate,
  });
  const reorderDraftGroups = useMutation({
    mutationFn: ({ macroNodeId, groupIds }: { macroNodeId: string; groupIds: string[] }) =>
      callDreRpc("reorder_dre_layout_groups", {
        p_macro_node_id: macroNodeId,
        p_group_ids: groupIds,
      }),
    onSuccess: invalidate,
  });
  const deleteDraftNode = useMutation({
    mutationFn: async (nodeId: string) => {
      const { error } = await (supabase as any).from("dre_layout_nodes").delete().eq("id", nodeId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const createDraftGroup = useMutation({
    mutationFn: async ({ layoutId, macroNodeId, name }: { layoutId: string; macroNodeId: string; name: string }) => {
      if (!companyId) throw new Error("Empresa não identificada");
      const configuration = query.data;
      const draft = configuration?.profiles.flatMap((profile) => profile.draft ? [profile.draft] : [])
        .find((item) => item.layout.id === layoutId);
      const siblings = draft?.groups.filter((group) => group.macro_node_id === macroNodeId) ?? [];
      const sortOrder = Math.max(0, ...siblings.map((group) => Number(group.sort_order))) + 10;
      const { error } = await (supabase as any).from("dre_layout_groups").insert({
        layout_id: layoutId,
        company_id: companyId,
        macro_node_id: macroNodeId,
        name: name.trim(),
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const updateDraftGroup = useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      const { error } = await (supabase as any).from("dre_layout_groups")
        .update({ name: name.trim() }).eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const deleteDraftGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await (supabase as any).from("dre_layout_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const setDraftCategoryAssignment = useMutation({
    mutationFn: async ({ assignmentId, classification, groupId }: {
      assignmentId: string;
      classification: "group" | "outside_dre" | "unclassified";
      groupId?: string | null;
    }) => {
      const { error } = await (supabase as any).from("dre_layout_category_assignments")
        .update({ classification, group_id: classification === "group" ? groupId : null })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const setDraftSourceAssignment = useMutation({
    mutationFn: async ({ assignmentId, classification, groupId }: {
      assignmentId: string;
      classification: "group" | "outside_dre" | "unclassified";
      groupId?: string | null;
    }) => {
      const { error } = await (supabase as any).from("dre_layout_source_assignments")
        .update({ classification, group_id: classification === "group" ? groupId : null })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    configuration: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createDraft,
    renameProfile,
    validateLayout,
    publishLayout,
    setDefault,
    restoreLegacy,
    archiveProfile,
    updateDraftNode,
    createDraftNode,
    createDraftSubtotal,
    setDraftCalculationSources,
    reorderDraftNodes,
    reorderDraftGroups,
    deleteDraftNode,
    createDraftGroup,
    updateDraftGroup,
    deleteDraftGroup,
    setDraftCategoryAssignment,
    setDraftSourceAssignment,
  };
}

export interface DreNormalizedEntriesPayload {
  mode: "legacy" | "custom";
  profileId: string | null;
  layoutId: string | null;
  regime: "caixa" | "competencia";
  scopeCurrency: string;
  mixedCurrency: boolean;
  entries: DreNormalizedEntry[];
  entryCount: number;
  integrity: {
    unidentifiedCategoryEntries: number;
    entriesAreCurrencyScoped: boolean;
    canonicalFiltersReused: boolean;
  };
}

export function useDreNormalizedEntries({
  companyId,
  startDate,
  endDate,
  regime,
  profileId,
  enabled,
}: {
  companyId?: string;
  startDate?: Date;
  endDate?: Date;
  regime: "caixa" | "competencia";
  profileId?: string | null;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["dre-normalized-entries", companyId, startDate?.toISOString(), endDate?.toISOString(), regime, profileId],
    enabled: enabled && !!companyId && !!startDate && !!endDate,
    queryFn: () => callDreRpc<DreNormalizedEntriesPayload>("get_dre_normalized_entries", {
      p_company_id: companyId,
      p_start_date: startDate!.toISOString(),
      p_end_date: endDate!.toISOString(),
      p_regime: regime,
      p_profile_id: profileId ?? null,
    }),
    select: (payload) => ({
      ...payload,
      entries: payload.entries.map((entry) => ({ ...entry, amount: Number(entry.amount) })),
      entryCount: Number(payload.entryCount),
    }),
  });
}

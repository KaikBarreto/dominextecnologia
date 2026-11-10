import type { EditOsScopeItem } from '@/hooks/useEditOsScope';

export const STANDALONE_SCOPE_KEY = 'standalone';

export interface ScopeChecklist {
  instanceId: string;
  templateId: string;
  templateName: string;
  /** undefined = item novo, ainda sem vínculo persistido para mover. */
  originalEquipmentId: string | null | undefined;
  answered: boolean;
}

export interface ScopeGroup {
  key: string;
  equipmentId: string;
  equipmentName: string;
  checklists: ScopeChecklist[];
}

export interface EditOsScopeState {
  equipmentGroups: ScopeGroup[];
  standaloneChecklists: ScopeChecklist[];
}

export interface ScopeSeedItem {
  id?: string;
  equipment_id: string | null;
  form_template_id: string | null;
  equipment: { id: string; name: string } | null;
  form_template: { id: string; name: string } | null;
}

export interface ScopeAnsweredKey {
  equipmentId: string | null;
  templateId: string;
}

const pairKey = (equipmentId: string | null, templateId: string) =>
  `${equipmentId ?? STANDALONE_SCOPE_KEY}::${templateId}`;

export function hydrateEditOsScopeState(
  seedItems: ScopeSeedItem[],
  answeredKeys: ScopeAnsweredKey[],
): EditOsScopeState {
  const answeredPairs = new Set(
    answeredKeys.map(({ equipmentId, templateId }) => pairKey(equipmentId, templateId)),
  );
  const equipmentGroups = new Map<string, ScopeGroup>();
  const standaloneChecklists: ScopeChecklist[] = [];

  seedItems.forEach((item, index) => {
    if (item.equipment_id && !equipmentGroups.has(item.equipment_id)) {
      equipmentGroups.set(item.equipment_id, {
        key: item.equipment_id,
        equipmentId: item.equipment_id,
        equipmentName: item.equipment?.name ?? item.equipment_id,
        checklists: [],
      });
    }

    if (!item.form_template_id) return;
    const checklist: ScopeChecklist = {
      instanceId: item.id ?? `${item.equipment_id ?? STANDALONE_SCOPE_KEY}:${item.form_template_id}:${index}`,
      templateId: item.form_template_id,
      templateName: item.form_template?.name ?? item.form_template_id,
      originalEquipmentId: item.equipment_id,
      answered: answeredPairs.has(pairKey(item.equipment_id, item.form_template_id)),
    };

    if (item.equipment_id) {
      equipmentGroups.get(item.equipment_id)!.checklists.push(checklist);
    } else {
      standaloneChecklists.push(checklist);
    }
  });

  return { equipmentGroups: Array.from(equipmentGroups.values()), standaloneChecklists };
}

export function checklistLocation(
  state: EditOsScopeState,
  instanceId: string,
): { groupKey: string; checklist: ScopeChecklist } | null {
  const standalone = state.standaloneChecklists.find((item) => item.instanceId === instanceId);
  if (standalone) return { groupKey: STANDALONE_SCOPE_KEY, checklist: standalone };

  for (const group of state.equipmentGroups) {
    const checklist = group.checklists.find((item) => item.instanceId === instanceId);
    if (checklist) return { groupKey: group.key, checklist };
  }
  return null;
}

export function moveScopeChecklist(
  state: EditOsScopeState,
  instanceId: string,
  targetGroupKey: string,
  targetIndex?: number,
): { state: EditOsScopeState; moved: boolean; reason?: 'same-target' | 'duplicate' | 'not-found' } {
  const located = checklistLocation(state, instanceId);
  if (!located) return { state, moved: false, reason: 'not-found' };

  if (located.groupKey === targetGroupKey) {
    const current = targetGroupKey === STANDALONE_SCOPE_KEY
      ? state.standaloneChecklists
      : state.equipmentGroups.find((group) => group.key === targetGroupKey)?.checklists;
    if (!current) return { state, moved: false, reason: 'not-found' };
    const from = current.findIndex((item) => item.instanceId === instanceId);
    const to = targetIndex ?? from;
    if (from < 0 || from === to) return { state, moved: false, reason: 'same-target' };
    const reordered = [...current];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(Math.max(0, Math.min(to, reordered.length)), 0, moved);
    if (targetGroupKey === STANDALONE_SCOPE_KEY) {
      return { moved: true, state: { ...state, standaloneChecklists: reordered } };
    }
    return {
      moved: true,
      state: {
        ...state,
        equipmentGroups: state.equipmentGroups.map((group) => group.key === targetGroupKey
          ? { ...group, checklists: reordered }
          : group),
      },
    };
  }

  const targetChecklists = targetGroupKey === STANDALONE_SCOPE_KEY
    ? state.standaloneChecklists
    : state.equipmentGroups.find((group) => group.key === targetGroupKey)?.checklists;
  if (!targetChecklists) return { state, moved: false, reason: 'not-found' };
  if (targetChecklists.some((item) => item.templateId === located.checklist.templateId)) {
    return { state, moved: false, reason: 'duplicate' };
  }

  const withoutMoved: EditOsScopeState = {
    equipmentGroups: state.equipmentGroups.map((group) => ({
      ...group,
      checklists: group.checklists.filter((item) => item.instanceId !== instanceId),
    })),
    standaloneChecklists: state.standaloneChecklists.filter((item) => item.instanceId !== instanceId),
  };

  if (targetGroupKey === STANDALONE_SCOPE_KEY) {
    const standaloneChecklists = [...withoutMoved.standaloneChecklists];
    standaloneChecklists.splice(
      targetIndex === undefined ? standaloneChecklists.length : Math.max(0, Math.min(targetIndex, standaloneChecklists.length)),
      0,
      located.checklist,
    );
    return {
      moved: true,
      state: {
        ...withoutMoved,
        standaloneChecklists,
      },
    };
  }

  return {
    moved: true,
    state: {
      ...withoutMoved,
      equipmentGroups: withoutMoved.equipmentGroups.map((group) => {
        if (group.key !== targetGroupKey) return group;
        const checklists = [...group.checklists];
        checklists.splice(
          targetIndex === undefined ? checklists.length : Math.max(0, Math.min(targetIndex, checklists.length)),
          0,
          located.checklist,
        );
        return { ...group, checklists };
      }),
    },
  };
}

export function reorderScopeEquipment(
  state: EditOsScopeState,
  activeKey: string,
  overKey: string,
): EditOsScopeState {
  const from = state.equipmentGroups.findIndex((group) => group.key === activeKey);
  const to = state.equipmentGroups.findIndex((group) => group.key === overKey);
  if (from < 0 || to < 0 || from === to) return state;
  const equipmentGroups = [...state.equipmentGroups];
  const [moved] = equipmentGroups.splice(from, 1);
  equipmentGroups.splice(to, 0, moved);
  return { ...state, equipmentGroups };
}

export function removeScopeEquipment(
  state: EditOsScopeState,
  groupKey: string,
): EditOsScopeState {
  return {
    ...state,
    equipmentGroups: state.equipmentGroups.filter((group) => group.key !== groupKey),
  };
}

export function removeScopeChecklist(
  state: EditOsScopeState,
  instanceId: string,
): EditOsScopeState {
  return {
    equipmentGroups: state.equipmentGroups.map((group) => ({
      ...group,
      checklists: group.checklists.filter((item) => item.instanceId !== instanceId),
    })),
    standaloneChecklists: state.standaloneChecklists.filter((item) => item.instanceId !== instanceId),
  };
}

export function hasAnsweredScopeRemoval(
  initialState: EditOsScopeState,
  currentState: EditOsScopeState,
): boolean {
  const remainingIds = new Set([
    ...currentState.standaloneChecklists.map((item) => item.instanceId),
    ...currentState.equipmentGroups.flatMap((group) => group.checklists.map((item) => item.instanceId)),
  ]);
  const initialAnswered = [
    ...initialState.standaloneChecklists,
    ...initialState.equipmentGroups.flatMap((group) => group.checklists),
  ].filter((item) => item.answered);
  return initialAnswered.some((item) => !remainingIds.has(item.instanceId));
}

export function buildEditOsScopeItems(state: EditOsScopeState): EditOsScopeItem[] {
  const itemFor = (equipmentId: string | null, checklists: ScopeChecklist[]): EditOsScopeItem => ({
    equipment_id: equipmentId,
    form_template_ids: checklists.map((item) => item.templateId),
    moves: checklists
      .filter((item) => item.originalEquipmentId !== undefined && item.originalEquipmentId !== equipmentId)
      .map((item) => ({
        form_template_id: item.templateId,
        from_equipment_id: item.originalEquipmentId!,
      })),
  });

  const items = state.equipmentGroups.map((group) => itemFor(group.equipmentId, group.checklists));
  if (state.standaloneChecklists.length > 0) {
    items.push(itemFor(null, state.standaloneChecklists));
  }
  return items;
}

export function isScopeStateDirty(initialState: EditOsScopeState, currentState: EditOsScopeState): boolean {
  return JSON.stringify(buildEditOsScopeItems(initialState)) !== JSON.stringify(buildEditOsScopeItems(currentState));
}

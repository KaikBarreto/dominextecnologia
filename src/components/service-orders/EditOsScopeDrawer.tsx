import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  CalendarClock, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList,
  GripVertical, ListTree, Loader2, MoreVertical, MoveRight, Plus, Search, Trash2,
  Wrench, X,
} from 'lucide-react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { EmptyState } from '@/components/mobile/EmptyState';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { ScheduleConflictDialog } from '@/components/schedule/ScheduleConflictDialog';
import { ServiceOrderSchedulePlanner } from '@/components/service-orders/ServiceOrderSchedulePlanner';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useEquipment } from '@/hooks/useEquipment';
import type { EquipmentInput } from '@/hooks/useEquipment';
import { useEditOsScope } from '@/hooks/useEditOsScope';
import { useToast } from '@/hooks/use-toast';
import { useIsCompact } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { isScheduleConflictError, type ScheduleConflictItem } from '@/lib/scheduleBooking';
import { normalizeServiceOrderSchedulePlan } from '@/lib/serviceOrderSchedule';
import type { ServiceOrderScheduleSlot } from '@/types/database';
import type { Customer, FormTemplate } from '@/types/database';
import type { EquipmentFormData } from '@/lib/equipmentFormValidation';
import { cn, fuzzyIncludes } from '@/lib/utils';
import {
  STANDALONE_SCOPE_KEY, buildEditOsScopeItems, hasAnsweredScopeRemoval,
  hydrateEditOsScopeState, isScopeStateDirty, moveScopeChecklist,
  removeScopeChecklist, removeScopeEquipment, reorderScopeEquipment,
  type EditOsScopeState, type ScopeChecklist, type ScopeGroup,
} from './editOsScopeState';

export interface EditOsScopeSeedItem {
  id?: string;
  equipment_id: string | null;
  form_template_id: string | null;
  equipment: { id: string; name: string } | null;
  form_template: { id: string; name: string } | null;
}

export interface AnsweredKey {
  equipmentId: string | null;
  templateId: string;
}

export interface EditOsScheduleSeed {
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  duration_minutes?: number | null;
  schedule_plan?: ServiceOrderScheduleSlot[] | null;
  technician_id?: string | null;
  team_id?: string | null;
}

interface EditOsScopeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
  customerId: string;
  customer?: { id: string; name: string } | null;
  seedItems: EditOsScopeSeedItem[];
  answeredKeys: AnsweredKey[];
  schedule?: EditOsScheduleSeed;
  canEditSchedule?: boolean;
  canOverrideScheduleConflict?: boolean;
  onSaved: () => void;
}

type TFlow = typeof MESSAGES['pt-br']['app']['os']['technicianFlow'];
type ActiveDrag =
  | { kind: 'equipment'; id: string; label: string }
  | { kind: 'checklist'; id: string; label: string };

const EMPTY_SCOPE: EditOsScopeState = { equipmentGroups: [], standaloneChecklists: [] };

export function EditOsScopeDrawer({
  open, onOpenChange, serviceOrderId, customerId, customer, seedItems, answeredKeys,
  schedule, canEditSchedule = false, canOverrideScheduleConflict = false, onSaved,
}: EditOsScopeDrawerProps) {
  const { locale: appLocale } = useAppLocaleContext();
  const isCompact = useIsCompact();
  const flow: TFlow =
    (MESSAGES[appLocale as keyof typeof MESSAGES]?.app?.os?.technicianFlow as TFlow) ??
    MESSAGES['pt-br'].app.os.technicianFlow;
  const t = flow.editScope;
  const { toast } = useToast();
  const { templates } = useFormTemplates();
  const { createEquipment } = useEquipment(customerId);
  const { editScope, reschedule } = useEditOsScope();

  const [tab, setTab] = useState<'scope' | 'schedule'>('scope');
  const [initialScope, setInitialScope] = useState<EditOsScopeState>(EMPTY_SCOPE);
  const [scopeState, setScopeState] = useState<EditOsScopeState>(EMPTY_SCOPE);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [overGroupKey, setOverGroupKey] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [confirmLossOpen, setConfirmLossOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [schedulePlan, setSchedulePlan] = useState<ServiceOrderScheduleSlot[]>([]);
  const [savedScheduleSignature, setSavedScheduleSignature] = useState('');
  const [scheduleConflict, setScheduleConflict] = useState<{
    conflicts: ScheduleConflictItem[];
    requestId: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeTemplates = useMemo(
    () => (templates ?? []).filter((template) => template.is_active !== false),
    [templates],
  );

  useEffect(() => { setPickerSearch(''); }, [pickerFor]);
  useEffect(() => {
    if (!open) return;
    const hydrated = hydrateEditOsScopeState(seedItems, answeredKeys);
    const normalizedPlan = normalizeServiceOrderSchedulePlan({
      scheduled_date: schedule?.scheduled_date ?? undefined,
      scheduled_time: schedule?.scheduled_time ?? undefined,
      duration_minutes: schedule?.duration_minutes ?? undefined,
      schedule_plan: schedule?.schedule_plan ?? undefined,
    });
    setInitialScope(hydrated);
    setScopeState(hydrated);
    setExpandedGroups(new Set([
      STANDALONE_SCOPE_KEY,
      ...hydrated.equipmentGroups.map((group) => group.key),
    ]));
    setSchedulePlan(normalizedPlan);
    setSavedScheduleSignature(JSON.stringify(normalizedPlan));
    setTab('scope');
    setPickerFor(null);
    setScheduleConflict(null);
  }, [
    open,
    seedItems,
    answeredKeys,
    schedule?.scheduled_date,
    schedule?.scheduled_time,
    schedule?.duration_minutes,
    schedule?.schedule_plan,
    schedule?.technician_id,
    schedule?.team_id,
  ]);

  const scopeDirty = isScopeStateDirty(initialScope, scopeState);
  const scheduleDirty = JSON.stringify(schedulePlan) !== savedScheduleSignature;
  const saving = editScope.isPending || reschedule.isPending;

  const toggleExpanded = (groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const moveChecklist = (instanceId: string, targetGroupKey: string, targetIndex?: number) => {
    setScopeState((current) => {
      const result = moveScopeChecklist(current, instanceId, targetGroupKey, targetIndex);
      if (result.reason === 'duplicate') {
        toast({ title: t.moveDuplicateTitle, description: t.moveDuplicateDesc });
      }
      return result.state;
    });
    setExpandedGroups((current) => new Set(current).add(targetGroupKey));
  };

  const addTemplateTo = (groupKey: string, templateId: string) => {
    const templateName = (templates ?? []).find((template) => template.id === templateId)?.name ?? templateId;
    const instanceId = globalThis.crypto?.randomUUID?.() ?? `new-${Date.now()}-${templateId}`;
    setScopeState((current) => {
      const target = groupKey === STANDALONE_SCOPE_KEY
        ? current.standaloneChecklists
        : current.equipmentGroups.find((group) => group.key === groupKey)?.checklists;
      if (!target || target.some((item) => item.templateId === templateId)) return current;
      const checklist: ScopeChecklist = {
        instanceId,
        templateId,
        templateName,
        originalEquipmentId: undefined,
        answered: false,
      };
      if (groupKey === STANDALONE_SCOPE_KEY) {
        return { ...current, standaloneChecklists: [...current.standaloneChecklists, checklist] };
      }
      return {
        ...current,
        equipmentGroups: current.equipmentGroups.map((group) => group.key === groupKey
          ? { ...group, checklists: [...group.checklists, checklist] }
          : group),
      };
    });
  };

  const toggleTemplateInPicker = (groupKey: string, templateId: string) => {
    const target = groupKey === STANDALONE_SCOPE_KEY
      ? scopeState.standaloneChecklists
      : scopeState.equipmentGroups.find((group) => group.key === groupKey)?.checklists ?? [];
    const selected = target.find((item) => item.templateId === templateId);
    if (selected) setScopeState((current) => removeScopeChecklist(current, selected.instanceId));
    else addTemplateTo(groupKey, templateId);
  };

  const handleQuickCreate = async (data: EquipmentFormData) => {
    const created = await createEquipment.mutateAsync({ ...data, customer_id: customerId } as EquipmentInput);
    if (created) {
      const equipment = created;
      setScopeState((current) => current.equipmentGroups.some((group) => group.equipmentId === equipment.id)
        ? current
        : {
            ...current,
            equipmentGroups: [
              ...current.equipmentGroups,
              { key: equipment.id, equipmentId: equipment.id, equipmentName: equipment.name, checklists: [] },
            ],
          });
      setExpandedGroups((current) => new Set(current).add(equipment.id));
    }
    return created as { id?: string } | undefined;
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current as { kind?: string; groupKey?: string; label?: string; instanceId?: string } | undefined;
    if (data?.kind === 'equipment' && data.groupKey) {
      setActiveDrag({ kind: 'equipment', id: data.groupKey, label: data.label ?? t.equipmentFallback });
    } else if (data?.kind === 'checklist' && data.instanceId) {
      setActiveDrag({ kind: 'checklist', id: data.instanceId, label: data.label ?? t.checklistFallback });
    }
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    const data = over?.data.current as { groupKey?: string } | undefined;
    setOverGroupKey(data?.groupKey ?? null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const activeData = active.data.current as { kind?: string; groupKey?: string; instanceId?: string } | undefined;
    const overData = over?.data.current as { kind?: string; groupKey?: string; index?: number } | undefined;
    if (activeData?.kind === 'equipment' && activeData.groupKey && overData?.groupKey) {
      setScopeState((current) => reorderScopeEquipment(current, activeData.groupKey!, overData.groupKey!));
    } else if (activeData?.kind === 'checklist' && activeData.instanceId && overData?.groupKey) {
      moveChecklist(activeData.instanceId, overData.groupKey, overData.kind === 'checklist' ? overData.index : undefined);
    }
    setActiveDrag(null);
    setOverGroupKey(null);
  };

  const rebaseSavedScope = (state: EditOsScopeState): EditOsScopeState => ({
    equipmentGroups: state.equipmentGroups.map((group) => ({
      ...group,
      checklists: group.checklists.map((item) => ({ ...item, originalEquipmentId: group.equipmentId })),
    })),
    standaloneChecklists: state.standaloneChecklists.map((item) => ({ ...item, originalEquipmentId: null })),
  });

  const saveScope = async () => {
    setConfirmLossOpen(false);
    if (!scopeDirty) {
      toast({ title: t.toastNoChanges });
      return;
    }
    try {
      const result = await editScope.mutateAsync({ serviceOrderId, items: buildEditOsScopeItems(scopeState) });
      const rebased = rebaseSavedScope(scopeState);
      setInitialScope(rebased);
      setScopeState(rebased);
      toast({
        title: t.toastSaved,
        description: result.responses_moved ? t.toastAnswersMoved.replace('{n}', String(result.responses_moved)) : undefined,
      });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ variant: 'destructive', title: t.errGeneric, description: mapRpcError(message, t) });
    }
  };

  const handleSaveScope = () => {
    if (hasAnsweredScopeRemoval(initialScope, scopeState)) setConfirmLossOpen(true);
    else void saveScope();
  };

  const runScheduleSave = async (requestId: string, overrideReason?: string) => {
    const first = schedulePlan[0];
    const resourceId = schedule?.team_id || schedule?.technician_id;
    if (!first || !resourceId) {
      toast({ variant: 'destructive', title: t.scheduleCannotSave, description: t.scheduleNeedsResponsible });
      return;
    }
    try {
      await reschedule.mutateAsync({
        service_order_id: serviceOrderId,
        resource_type: schedule?.team_id ? 'team' : 'technician',
        resource_id: resourceId,
        scheduled_date: first.date,
        scheduled_time: first.time,
        duration_minutes: first.duration_minutes,
        schedule_plan: schedulePlan,
        schedule_request_id: requestId,
        schedule_override: !!overrideReason,
        schedule_override_reason: overrideReason,
      });
      setSavedScheduleSignature(JSON.stringify(schedulePlan));
      setScheduleConflict(null);
      toast({ title: t.toastScheduleSaved });
      onSaved();
    } catch (error) {
      if (isScheduleConflictError(error)) {
        setScheduleConflict({ conflicts: error.conflicts, requestId });
        return;
      }
      toast({ variant: 'destructive', title: t.scheduleCannotSave, description: t.errGeneric });
    }
  };

  const saveSchedule = () => {
    if (!scheduleDirty) {
      toast({ title: t.toastNoChanges });
      return;
    }
    void runScheduleSave(globalThis.crypto?.randomUUID?.() ?? `schedule-${Date.now()}`);
  };

  const tabs = [
    { value: 'scope', label: t.tabScope, icon: <ListTree className="h-3.5 w-3.5" /> },
    ...(canEditSchedule
      ? [{ value: 'schedule', label: t.tabSchedule, icon: <CalendarClock className="h-3.5 w-3.5" /> }]
      : []),
  ];
  const footer = tab === 'scope' ? (
    <Button className={cn('w-full bg-foreground text-background hover:bg-foreground/90', isCompact && 'h-12 rounded-xl text-[15px] font-semibold')} size="lg" onClick={handleSaveScope} disabled={saving || !scopeDirty}>
      {editScope.isPending
        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.btnSaving}</>
        : <><Check className="mr-2 h-4 w-4" />{t.btnSaveScope}</>}
    </Button>
  ) : (
    <Button className={cn('w-full bg-foreground text-background hover:bg-foreground/90', isCompact && 'h-12 rounded-xl text-[15px] font-semibold')} size="lg" onClick={saveSchedule} disabled={saving || !scheduleDirty}>
      {reschedule.isPending
        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.btnSaving}</>
        : <><CalendarClock className="mr-2 h-4 w-4" />{t.btnSaveSchedule}</>}
    </Button>
  );
  const scopeDestinations = [
    { key: STANDALONE_SCOPE_KEY, label: t.standaloneSectionTitle },
    ...scopeState.equipmentGroups.map((group) => ({ key: group.key, label: group.equipmentName })),
  ];

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={t.title}
        footer={footer}
        className={isCompact ? 'bg-[#f2f2f7] pb-2 dark:bg-background' : undefined}
        drawerClassName="max-h-[96dvh] rounded-t-[20px] bg-[#f2f2f7] outline-none focus:outline-none focus-visible:outline-none dark:bg-background"
        density="compact"
      >
        <div className={cn(
          'sticky top-0 z-20 pb-3 pt-2',
          isCompact ? '-mx-4 bg-[#f2f2f7] px-4 dark:bg-background' : 'bg-background',
        )}>
          {isCompact ? (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label={t.title}>
              {tabs.map((item) => {
                const active = item.value === tab;
                const compactLabel = item.value === 'scope' ? t.tabEquipments : item.label;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(item.value as 'scope' | 'schedule')}
                    className={cn(
                      'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-all active:scale-[0.98]',
                      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                    )}
                  >
                    {item.icon}
                    <span className="truncate">{compactLabel}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <MobilePillTabs
              variant="underline"
              tabs={tabs}
              activeTab={tab}
              onTabChange={(value) => setTab(value as 'scope' | 'schedule')}
              className="[&_button[aria-selected=true]]:!border-foreground [&_button[aria-selected=true]]:!text-foreground"
            />
          )}
        </div>

        {tab === 'scope' && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={() => { setActiveDrag(null); setOverGroupKey(null); }}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-4 pb-2 pt-2">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{t.scopeHeading}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.scopeDragHint}</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" onClick={() => setQuickCreateOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t.addEquipment}
                </Button>
              </div>

              {scopeState.equipmentGroups.length === 0 ? (
                <EmptyState size="compact" icon={<Wrench className="h-full w-full" />} title={t.emptyEquipmentsTitle} description={t.emptyEquipmentsDesc} />
              ) : (
                <SortableContext items={scopeState.equipmentGroups.map((group) => `equipment:${group.key}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {scopeState.equipmentGroups.map((group) => (
                      <EquipmentScopeCard
                        key={group.key}
                        group={group}
                        expanded={expandedGroups.has(group.key)}
                        activeChecklistDrag={activeDrag?.kind === 'checklist'}
                        highlighted={overGroupKey === group.key}
                        destinations={scopeDestinations}
                        labels={t}
                        onToggle={() => toggleExpanded(group.key)}
                        onRemoveEquipment={() => setScopeState((current) => removeScopeEquipment(current, group.key))}
                        onRemoveChecklist={(instanceId) => setScopeState((current) => removeScopeChecklist(current, instanceId))}
                        onMoveChecklist={moveChecklist}
                        onAddChecklists={() => setPickerFor(group.key)}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}

              <StandaloneScopeCard
                checklists={scopeState.standaloneChecklists}
                expanded={expandedGroups.has(STANDALONE_SCOPE_KEY)}
                activeChecklistDrag={activeDrag?.kind === 'checklist'}
                highlighted={overGroupKey === STANDALONE_SCOPE_KEY}
                destinations={scopeDestinations}
                labels={t}
                onToggle={() => toggleExpanded(STANDALONE_SCOPE_KEY)}
                onRemoveChecklist={(instanceId) => setScopeState((current) => removeScopeChecklist(current, instanceId))}
                onMoveChecklist={moveChecklist}
                onAddChecklists={() => setPickerFor(STANDALONE_SCOPE_KEY)}
              />
            </div>

            <DragOverlay dropAnimation={null}>
              {activeDrag ? (
                <div className="flex max-w-[320px] items-center gap-2 rounded-lg border border-foreground bg-foreground px-3 py-2 text-sm font-medium text-background shadow-xl">
                  {activeDrag.kind === 'equipment' ? <Wrench className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
                  <span className="truncate">{activeDrag.label}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {tab === 'schedule' && canEditSchedule && (
          <div className="pb-2 pt-4">
            {schedulePlan.length === 0 ? (
              <EmptyState size="compact" icon={<CalendarClock className="h-full w-full" />} title={t.scheduleEmptyTitle} description={t.scheduleEmptyDesc} />
            ) : (
              <ServiceOrderSchedulePlanner
                plan={schedulePlan}
                onChange={setSchedulePlan}
                locale={appLocale as 'pt-br' | 'en' | 'es' | 'fr'}
                labels={{
                  period: t.schedulePeriod,
                  startDate: t.scheduleStartDate,
                  endDate: t.scheduleEndDate,
                  dailyPlan: t.scheduleDailyPlan,
                  dailyPlanHelp: t.scheduleDailyPlanHelp,
                  applyFirstToAll: t.scheduleApplyFirstToAll,
                  scheduledDaySingular: t.scheduleDaySingular,
                  scheduledDayPlural: t.scheduleDayPlural,
                  startTime: t.scheduleStartTime,
                  endTime: t.scheduleEndTime,
                  invalidTimeRange: t.scheduleInvalidTimeRange,
                }}
              />
            )}
          </div>
        )}
      </ResponsiveModal>

      <ResponsiveModal
        open={pickerFor !== null}
        onOpenChange={(nextOpen) => { if (!nextOpen) setPickerFor(null); }}
        title={t.selectorTitle}
        footer={<Button className="w-full bg-foreground text-background hover:bg-foreground/90" onClick={() => setPickerFor(null)}>{t.selectorDone}</Button>}
      >
        <ChecklistPicker
          templates={activeTemplates}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          selectedTemplateIds={new Set((pickerFor === STANDALONE_SCOPE_KEY
            ? scopeState.standaloneChecklists
            : scopeState.equipmentGroups.find((group) => group.key === pickerFor)?.checklists ?? [])
            .map((item) => item.templateId))}
          labels={t}
          onToggle={(templateId) => { if (pickerFor) toggleTemplateInPicker(pickerFor, templateId); }}
        />
      </ResponsiveModal>

      <EquipmentFormDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        equipment={null}
        onSubmit={handleQuickCreate}
        customers={customer ? [customer as unknown as Customer] : []}
        isLoading={createEquipment.isPending}
      />

      <AlertDialog open={confirmLossOpen} onOpenChange={setConfirmLossOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />{t.confirmLossTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>{t.confirmLossDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmLossCancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void saveScope()}>
              {t.confirmLossConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScheduleConflictDialog
        open={!!scheduleConflict}
        conflicts={scheduleConflict?.conflicts ?? []}
        canOverride={canOverrideScheduleConflict}
        isLoading={reschedule.isPending}
        onCancel={() => setScheduleConflict(null)}
        onOverride={(reason) => { if (scheduleConflict) void runScheduleSave(scheduleConflict.requestId, reason); }}
      />
    </>
  );
}

function EquipmentScopeCard({
  group, expanded, activeChecklistDrag, highlighted, destinations, labels,
  onToggle, onRemoveEquipment, onRemoveChecklist, onMoveChecklist, onAddChecklists,
}: {
  group: ScopeGroup;
  expanded: boolean;
  activeChecklistDrag: boolean;
  highlighted: boolean;
  destinations: Array<{ key: string; label: string }>;
  labels: TFlow['editScope'];
  onToggle: () => void;
  onRemoveEquipment: () => void;
  onRemoveChecklist: (instanceId: string) => void;
  onMoveChecklist: (instanceId: string, targetGroupKey: string, targetIndex?: number) => void;
  onAddChecklists: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `equipment:${group.key}`,
    data: { kind: 'equipment', groupKey: group.key, label: group.equipmentName },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 30 : undefined,
  };
  return (
    <section ref={setNodeRef} style={style} className={cn(
      'rounded-xl border bg-card transition-colors',
      activeChecklistDrag && highlighted && 'border-foreground bg-card ring-2 ring-foreground/15 shadow-md',
    )}>
      <div className="flex items-center gap-1.5 p-2">
        <button
          type="button" {...attributes} {...listeners}
          className="flex h-10 w-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label={labels.dragEquipment.replace('{name}', group.equipmentName)} title={labels.dragToReorder}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onToggle}>
          <Wrench className="h-4 w-4 shrink-0 text-foreground" />
          <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug">{group.equipmentName}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.checklists.length}</span>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Button type="button" variant="destructive-ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onRemoveEquipment} aria-label={labels.removeEquipment}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2">
          {activeChecklistDrag && highlighted && <DropHint>{labels.dropHere}</DropHint>}
          <ChecklistList groupKey={group.key} checklists={group.checklists} destinations={destinations} labels={labels} onRemove={onRemoveChecklist} onMove={onMoveChecklist} />
          <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 text-foreground hover:bg-muted hover:text-foreground" onClick={onAddChecklists}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />{labels.selectChecklists}
          </Button>
        </div>
      )}
    </section>
  );
}

function StandaloneScopeCard({
  checklists, expanded, activeChecklistDrag, highlighted, destinations, labels,
  onToggle, onRemoveChecklist, onMoveChecklist, onAddChecklists,
}: {
  checklists: ScopeChecklist[];
  expanded: boolean;
  activeChecklistDrag: boolean;
  highlighted: boolean;
  destinations: Array<{ key: string; label: string }>;
  labels: TFlow['editScope'];
  onToggle: () => void;
  onRemoveChecklist: (instanceId: string) => void;
  onMoveChecklist: (instanceId: string, targetGroupKey: string, targetIndex?: number) => void;
  onAddChecklists: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `group:${STANDALONE_SCOPE_KEY}`,
    data: { kind: 'group', groupKey: STANDALONE_SCOPE_KEY },
  });
  return (
    <section ref={setNodeRef} className={cn(
      'rounded-xl border border-dashed bg-muted/20 transition-colors',
      activeChecklistDrag && highlighted && 'border-foreground bg-card ring-2 ring-foreground/15 shadow-md',
    )}>
      <button type="button" className="flex w-full items-center gap-2 p-3 text-left" onClick={onToggle}>
        <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{labels.standaloneSectionTitle}</span>
          <span className="block text-xs text-muted-foreground">{labels.standaloneHint}</span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{checklists.length}</span>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="border-t border-dashed px-3 pb-3 pt-2">
          {activeChecklistDrag && highlighted && <DropHint>{labels.dropHere}</DropHint>}
          <ChecklistList groupKey={STANDALONE_SCOPE_KEY} checklists={checklists} destinations={destinations} labels={labels} onRemove={onRemoveChecklist} onMove={onMoveChecklist} />
          <Button type="button" variant="ghost" size="sm" className="mt-2 h-8 text-foreground hover:bg-muted hover:text-foreground" onClick={onAddChecklists}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />{labels.addStandalone}
          </Button>
        </div>
      )}
    </section>
  );
}

function ChecklistList({ groupKey, checklists, destinations, labels, onRemove, onMove }: {
  groupKey: string;
  checklists: ScopeChecklist[];
  destinations: Array<{ key: string; label: string }>;
  labels: TFlow['editScope'];
  onRemove: (instanceId: string) => void;
  onMove: (instanceId: string, targetGroupKey: string, targetIndex?: number) => void;
}) {
  if (checklists.length === 0) return <p className="py-2 text-xs text-muted-foreground">{labels.dropEmptyHint}</p>;
  return (
    <SortableContext items={checklists.map((item) => `checklist:${item.instanceId}`)} strategy={verticalListSortingStrategy}>
      <div className="space-y-1.5">
        {checklists.map((checklist, index) => (
          <SortableChecklistRow
            key={checklist.instanceId}
            checklist={checklist}
            groupKey={groupKey}
            index={index}
            destinations={destinations}
            labels={labels}
            onRemove={() => onRemove(checklist.instanceId)}
            onMove={(targetGroupKey) => onMove(checklist.instanceId, targetGroupKey)}
          />
        ))}
      </div>
    </SortableContext>
  );
}

function SortableChecklistRow({ checklist, groupKey, index, destinations, labels, onRemove, onMove }: {
  checklist: ScopeChecklist;
  groupKey: string;
  index: number;
  destinations: Array<{ key: string; label: string }>;
  labels: TFlow['editScope'];
  onRemove: () => void;
  onMove: (targetGroupKey: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `checklist:${checklist.instanceId}`,
    data: { kind: 'checklist', instanceId: checklist.instanceId, groupKey, index, label: checklist.templateName },
  });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex min-h-11 items-center gap-1 rounded-lg border bg-background px-1.5 py-1.5 shadow-sm">
      <button
        type="button" {...attributes} {...listeners}
        className="flex h-10 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={labels.dragChecklist.replace('{name}', checklist.templateName)} title={labels.dragChecklistTitle}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 break-words py-1 text-sm leading-snug">{checklist.templateName}</span>
      {checklist.answered && (
        <Badge className="h-6 shrink-0 border-0 bg-emerald-600 px-1.5 text-white sm:px-2.5">
          <CheckCircle2 className="h-3 w-3 sm:mr-1" />
          <span className="sr-only sm:not-sr-only">{labels.answeredBadge}</span>
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={labels.checklistActions}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>{labels.moveTo}</DropdownMenuLabel>
          {destinations.map((destination) => (
            <DropdownMenuItem key={destination.key} disabled={destination.key === groupKey} onSelect={() => onMove(destination.key)}>
              <MoveRight className="mr-2 h-4 w-4" /><span className="truncate">{destination.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onRemove}>
            <X className="mr-2 h-4 w-4" />{labels.removeChecklist}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DropHint({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-center rounded-lg border border-foreground bg-foreground px-3 py-2 text-xs font-semibold text-background shadow-sm">
      <MoveRight className="mr-1.5 h-3.5 w-3.5" />{children}
    </div>
  );
}

function ChecklistPicker({ templates, search, onSearchChange, selectedTemplateIds, labels, onToggle }: {
  templates: Array<Pick<FormTemplate, 'id' | 'name'>>;
  search: string;
  onSearchChange: (value: string) => void;
  selectedTemplateIds: Set<string>;
  labels: TFlow['editScope'];
  onToggle: (templateId: string) => void;
}) {
  const filteredTemplates = search.trim() ? templates.filter((template) => fuzzyIncludes(template.name, search)) : templates;
  return (
    <div className="space-y-3 pt-2">
      {templates.length > 5 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={labels.selectorSearchPlaceholder} className="pl-9" />
        </div>
      )}
      {templates.length === 0 ? (
        <EmptyState size="compact" icon={<ClipboardList className="h-full w-full" />} title={labels.selectorEmpty} />
      ) : filteredTemplates.length === 0 ? (
        <EmptyState size="compact" icon={<Search className="h-full w-full" />} title={labels.selectorSearchEmpty} />
      ) : (
        <div className="space-y-1">
          {filteredTemplates.map((template) => {
            const checked = selectedTemplateIds.has(template.id);
            return (
              <label key={template.id} className={cn(
                'flex cursor-pointer select-none items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                checked ? 'border-foreground bg-muted/60' : 'hover:bg-muted/50',
              )}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(template.id)}
                  className="border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
                />
                <span className="min-w-0 flex-1 break-words text-sm leading-snug">{template.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function mapRpcError(message: string, t: TFlow['editScope']): string {
  if (message.includes('Não autenticado')) return t.errNotAuthenticated;
  if (message.includes('não encontrada')) return t.errOrderNotFound;
  if (message.includes('Sem acesso')) return t.errNoAccess;
  if (message.includes('Sem permissão')) return t.errNoPermission;
  if (message.includes('PMOC')) return t.errPmoc;
  if (message.includes('já existe no destino')) return t.errMoveDuplicate;
  return t.errGeneric;
}

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckSquare, Plus, Trash2 } from 'lucide-react';
import { fuzzyIncludesAny } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { ScreenActions } from '@/components/ui/ScreenActions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import { useTaskTypes, type TaskType } from '@/hooks/useTaskTypes';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobileListToolbar } from '@/components/mobile/MobileListToolbar';
import { ListDetailLayout, type ListDetailItem } from '@/components/ui/ListDetailLayout';

interface TaskTypeForm {
  name: string;
  color: string;
  description: string;
  is_active: boolean;
}

const defaultForm: TaskTypeForm = {
  name: '',
  color: '#8b5cf6',
  description: '',
  is_active: true,
};

function formFromTaskType(taskType: TaskType): TaskTypeForm {
  return {
    name: taskType.name,
    color: taskType.color,
    description: taskType.description || '',
    is_active: taskType.is_active,
  };
}

interface TaskTypeFieldsProps {
  form: TaskTypeForm;
  onChange: (form: TaskTypeForm) => void;
  t: typeof MESSAGES['pt-br']['app']['os']['taskTypes'];
}

function TaskTypeFields({ form, onChange, t }: TaskTypeFieldsProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>{t.labelName}</Label>
        <Input
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder={t.placeholderName}
        />
      </div>
      <div className="space-y-2">
        <Label>{t.labelColor}</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={form.color}
            onChange={(event) => onChange({ ...form, color: event.target.value })}
            className="h-10 w-10 cursor-pointer rounded border-0"
          />
          <Input
            value={form.color}
            onChange={(event) => onChange({ ...form, color: event.target.value })}
            className="flex-1"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t.labelDescription}</Label>
        <Textarea
          value={form.description}
          onChange={(event) => onChange({ ...form, description: event.target.value })}
          placeholder={t.placeholderDescription}
        />
      </div>
      <div className="flex items-center gap-2 border-t pt-4">
        <Switch
          checked={form.is_active}
          onCheckedChange={(checked) => onChange({ ...form, is_active: checked })}
        />
        <Label>{t.labelActive}</Label>
      </div>
    </div>
  );
}

export function TaskTypesPanel() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.taskTypes;
  const { taskTypes, isLoading, createTaskType, updateTaskType, deleteTaskType } = useTaskTypes();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailForm, setDetailForm] = useState<TaskTypeForm>(defaultForm);
  const [createForm, setCreateForm] = useState<TaskTypeForm>(defaultForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  const selectedTaskType = taskTypes.find((taskType) => taskType.id === selectedId);
  const mobileTypes = useMemo(
    () => taskTypes
      .filter((taskType) => fuzzyIncludesAny([taskType.name, taskType.description], searchQuery))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' })),
    [locale, searchQuery, taskTypes],
  );
  const listItems = useMemo<ListDetailItem[]>(
    () => taskTypes.map((taskType) => ({
      id: taskType.id,
      title: taskType.name,
      subtitle: taskType.description || (taskType.is_active ? t.badgeActive : t.badgeInactive),
      searchText: taskType.description || '',
      leading: (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: taskType.color }}>
          <CheckSquare className="h-4 w-4 text-white" />
        </span>
      ),
      trailing: !taskType.is_active ? <Badge variant="secondary" className="text-[10px]">{t.badgeInactive}</Badge> : undefined,
    })),
    [t.badgeActive, t.badgeInactive, taskTypes],
  );

  useEffect(() => {
    if (isMobile) return;
    if (selectedId && taskTypes.some((taskType) => taskType.id === selectedId)) return;
    setSelectedId(taskTypes[0]?.id ?? null);
  }, [isMobile, selectedId, taskTypes]);

  useEffect(() => {
    if (selectedTaskType) setDetailForm(formFromTaskType(selectedTaskType));
  }, [selectedTaskType]);

  const openCreate = () => {
    setCreateForm(defaultForm);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    await createTaskType.mutateAsync(createForm);
    setCreateOpen(false);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    await updateTaskType.mutateAsync({ id: selectedId, ...detailForm });
  };

  const handleDelete = async () => {
    if (!toDeleteId) return;
    await deleteTaskType.mutateAsync(toDeleteId);
    if (selectedId === toDeleteId) setSelectedId(null);
    setToDeleteId(null);
    setDeleteDialogOpen(false);
  };

  const requestDelete = (id: string) => {
    setToDeleteId(id);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const detail = selectedTaskType ? (
    <section className="min-w-0">
      {isMobile && (
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => setSelectedId(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar aos tipos de tarefa
        </Button>
      )}
      <div className="mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ficha do tipo de tarefa</p>
          <h3 className="mt-1 truncate text-xl font-semibold">{selectedTaskType.name}</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 text-destructive hover:text-destructive"
          onClick={() => requestDelete(selectedTaskType.id)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t.actionDelete}
        </Button>
      </div>
      <TaskTypeFields form={detailForm} onChange={setDetailForm} t={t} />
      <div className="mt-6 flex justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={!detailForm.name.trim() || updateTaskType.isPending}>
          {t.btnSave}
        </Button>
      </div>
    </section>
  ) : (
    <div className="flex min-h-72 items-center justify-center text-center text-sm text-muted-foreground">
      Selecione um tipo de tarefa para consultar e editar a ficha.
    </div>
  );

  return (
    <div className="space-y-4">
      {/* No computador a ação sobe pra MESMA linha das abas da tela. */}
      {!isMobile && (
        <ScreenActions>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t.btnNew}
          </Button>
        </ScreenActions>
      )}

      {taskTypes.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-12 w-12" />}
          title={t.emptyTitle}
          description={isMobile ? t.emptyDescriptionMobile : t.emptyDescriptionDesktop}
        />
      ) : isMobile && selectedTaskType ? detail : isMobile ? (
        <>
          <MobileListToolbar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Buscar tipo de tarefa"
          />
          {mobileTypes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum tipo de tarefa encontrado.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              {mobileTypes.map((taskType) => {
                const actions: ItemAction[] = [{
                  key: 'delete',
                  label: t.actionDelete,
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive',
                  onClick: () => requestDelete(taskType.id),
                }];
                return (
                  <MobileListItem
                    key={taskType.id}
                    onClick={() => setSelectedId(taskType.id)}
                    actions={actions}
                    className={!taskType.is_active ? 'opacity-60' : ''}
                    leading={(
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: taskType.color }}>
                        <CheckSquare className="h-5 w-5 text-white" />
                      </div>
                    )}
                    title={taskType.name}
                    subtitle={taskType.description || (taskType.is_active ? t.badgeActive : t.badgeInactive)}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={selectedId ?? undefined}
          listTitle={t.title}
          listDescription={`${taskTypes.length} ${taskTypes.length === 1 ? 'tipo cadastrado' : 'tipos cadastrados'}`}
          searchPlaceholder="Buscar tipo de tarefa"
          emptyLabel="Nenhum tipo de tarefa encontrado."
          storageKey="service-task-types-list"
          onSelect={setSelectedId}
        >
          {detail}
        </ListDetailLayout>
      )}

      {isMobile && (
        <FABButton icon={<Plus className="h-5 w-5" />} label={t.fabLabel} onClick={openCreate} />
      )}

      <ResponsiveModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t.modalTitleCreate}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t.btnCancel}</Button>
            <Button onClick={handleCreate} disabled={!createForm.name.trim() || createTaskType.isPending}>{t.btnCreate}</Button>
          </div>
        )}
      >
        <TaskTypeFields form={createForm} onChange={setCreateForm} t={t} />
      </ResponsiveModal>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.btnCancelDelete}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.btnDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

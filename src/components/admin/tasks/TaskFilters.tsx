import { FilterCheckboxGroup, type FilterCheckboxOption } from '@/components/mobile/FilterCheckboxGroup';
import {
  TaskFilters as TaskFiltersType,
  AdminTaskType,
  AdminTaskStatus,
  AdminTaskPriority,
  TASK_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
  TASK_TYPE_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
} from '@/hooks/useAdminTasks';
import type { TaskAdminOption } from './TaskCreateDialog';

interface TaskFiltersFormProps {
  filters: TaskFiltersType;
  onChange: (filters: TaskFiltersType) => void;
  admins: TaskAdminOption[];
}

/**
 * Form de filtros da aba Tarefas (multi-select). Reaproveitado mobile (FilterSheet)
 * e desktop (Sheet lateral). Semântica: array vazio = sem filtro (mostra tudo).
 */
export function TaskFiltersForm({ filters, onChange, admins }: TaskFiltersFormProps) {
  return (
    <div className="space-y-4">
      <FilterCheckboxGroup
        label="Tipo"
        options={TASK_TYPE_OPTIONS.map<FilterCheckboxOption>(t => ({
          value: t,
          label: TASK_TYPE_CONFIG[t].label,
        }))}
        selected={filters.type ?? []}
        onChange={(v) => onChange({ ...filters, type: v as AdminTaskType[] })}
        emptyLabel="Todos"
      />

      <FilterCheckboxGroup
        label="Status"
        options={TASK_STATUS_OPTIONS.map<FilterCheckboxOption>(s => ({
          value: s,
          label: TASK_STATUS_CONFIG[s].label,
        }))}
        selected={filters.status ?? []}
        onChange={(v) => onChange({ ...filters, status: v as AdminTaskStatus[] })}
        emptyLabel="Todos"
      />

      <FilterCheckboxGroup
        label="Prioridade"
        options={TASK_PRIORITY_OPTIONS.map<FilterCheckboxOption>(p => ({
          value: p,
          label: TASK_PRIORITY_CONFIG[p].label,
        }))}
        selected={filters.priority ?? []}
        onChange={(v) => onChange({ ...filters, priority: v as AdminTaskPriority[] })}
        emptyLabel="Todas"
      />

      <FilterCheckboxGroup
        label="Responsável"
        options={admins.map<FilterCheckboxOption>(a => ({
          value: a.user_id,
          label: a.full_name,
        }))}
        selected={filters.assigned_to ?? []}
        onChange={(v) => onChange({ ...filters, assigned_to: v })}
        emptyLabel="Todos"
      />
    </div>
  );
}
